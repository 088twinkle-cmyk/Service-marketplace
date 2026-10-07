"""End-to-end marketplace workflow.

Covers the full happy path and the rules the platform promises to enforce:
reverse-bidding history, the booking state machine, payment gating, chat
gating, revision limits, reviews and provider earnings.
"""
from decimal import Decimal
from unittest import mock
from datetime import timedelta

import requests
from django.test import TestCase, override_settings
from rest_framework.exceptions import ValidationError
from django.utils import timezone

from accounts.models import FreelancerProfile, User
from bookings.models import AvailabilitySlot, CounterOffer, ProjectBooking, RevisionRequest
from bookings.services import reserve_slot
from chats.models import Conversation, Message
from notifications.models import Notification
from payments.models import LedgerTransaction, Payment
from reviews.models import Review

from .factories import (
    api_client,
    auth_client,
    make_category,
    make_provider,
    make_service,
    make_slot,
    make_user,
)


class WorkflowTestCase(TestCase):
    """Shared fixture: one customer, one provider, one service, one slot."""

    def setUp(self):
        self.category = make_category()
        self.customer = make_user("wf_customer", role=User.Role.CLIENT)
        self.provider = make_provider("wf_provider")
        self.service = make_service(
            self.provider, title="Bridal hair styling", price="3000.00", category=self.category
        )
        self.slot = make_slot(self.provider, self.service)

        self.cust = auth_client(self.customer)
        self.prov = auth_client(self.provider.user)
        self.admin = auth_client(self._make_admin())

    @staticmethod
    def _make_admin():
        admin = make_user("wf_admin", role=User.Role.ADMIN)
        admin.is_staff = True
        admin.save(update_fields=["is_staff"])
        return admin

    # -- helpers -------------------------------------------------------
    def create_request(self, **overrides):
        payload = {
            "service": self.service.pk,
            "title": "Bridal hair styling at home",
            "requirements": "Morning appointment, please.",
            "proposed_price": "2500.00",
            "appointment_start": (timezone.now() + timedelta(days=3)).isoformat(),
            "location_city": "Kathmandu",
        }
        payload.update(overrides)
        response = self.cust.post("/api/bookings/projects/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return ProjectBooking.objects.get(pk=response.json()["id"])

    def act(self, client, booking, action, payload=None):
        return client.post(
            f"/api/bookings/projects/{booking.pk}/{action}/", payload or {}, format="json"
        )


class HappyPathTests(WorkflowTestCase):
    def test_full_lifecycle_from_request_to_review_and_earnings(self):
        # 1. Customer posts a request with a proposed price.
        booking = self.create_request()
        self.assertEqual(booking.status, ProjectBooking.Status.PENDING_PROVIDER_RESPONSE)
        self.assertEqual(booking.client, self.customer.client_profile)
        self.assertEqual(booking.freelancer, self.provider)
        self.assertTrue(
            Notification.objects.filter(
                user=self.provider.user, event_type="booking_requested"
            ).exists()
        )

        # Chat is closed until a price is agreed.
        closed = self.cust.get(f"/api/bookings/projects/{booking.pk}/chat/")
        self.assertEqual(closed.status_code, 403)
        self.assertFalse(closed.json()["chat_available"])

        # 2. Provider counters; the original request stays visible (history).
        counter = self.act(self.prov, booking, "counter", {"amount": "2800.00", "message": "Fuel cost"})
        self.assertEqual(counter.status_code, 200, counter.content)
        booking.refresh_from_db()
        self.assertEqual(booking.status, ProjectBooking.Status.COUNTER_OFFERED)

        # 3. Customer accepts the counter-offer.
        accepted = self.act(self.cust, booking, "accept")
        self.assertEqual(accepted.status_code, 200, accepted.content)
        booking.refresh_from_db()
        self.assertEqual(booking.status, ProjectBooking.Status.AGREEMENT_REACHED)
        self.assertEqual(booking.agreed_price, Decimal("2800.00"))

        # Chat now opens automatically.
        chat = self.cust.get(f"/api/bookings/projects/{booking.pk}/chat/")
        self.assertEqual(chat.status_code, 200, chat.content)
        conversation = Conversation.objects.get(booking=booking)

        # 4. Customer pays (sandbox verifier decides success server-side).
        started = self.act(self.cust, booking, "start_payment")
        self.assertEqual(started.status_code, 200, started.content)

        with override_settings(DEBUG=True, ESEWA_TRUST_SANDBOX_SUCCESS=True), mock.patch(
            "payments.services.requests.get", side_effect=requests.RequestException("offline")
        ):
            initiated = self.cust.post(
                "/api/payments/initiate/", {"booking": booking.pk}, format="json"
            )
            self.assertEqual(initiated.status_code, 200, initiated.content)
            body = initiated.json()
            self.assertIn("esewa", body)
            self.assertTrue(body["esewa"]["signature"])
            payment_id = body["payment"]["id"]

            verified = self.cust.post(
                f"/api/payments/{payment_id}/verify/", {"force_success": True}, format="json"
            )
            self.assertEqual(verified.status_code, 200, verified.content)
            self.assertEqual(verified.json()["status"], "SUCCESS")

        booking.refresh_from_db()
        self.assertEqual(booking.status, ProjectBooking.Status.CONFIRMED)
        self.assertIsNotNone(booking.paid_at)

        # 5. Provider starts and completes the work.
        self.assertEqual(self.act(self.prov, booking, "start_work").status_code, 200)

        submitted = self.act(
            self.prov,
            booking,
            "submit_deliverable",
            {"title": "Final photos", "description": "Done", "url": "https://example.com/work"},
        )
        self.assertEqual(submitted.status_code, 200, submitted.content)
        booking.refresh_from_db()
        self.assertEqual(booking.status, ProjectBooking.Status.DELIVERABLE_SUBMITTED)

        # 6. Customer asks for one revision, provider resubmits.
        revision = self.act(
            self.cust, booking, "request_revision", {"message": "Please adjust the styling."}
        )
        self.assertEqual(revision.status_code, 200, revision.content)
        booking.refresh_from_db()
        self.assertEqual(booking.status, ProjectBooking.Status.REVISION_REQUESTED)
        self.assertEqual(booking.revisions_used, 1)
        self.assertEqual(RevisionRequest.objects.filter(booking=booking).count(), 1)

        # The revision limit is enforced by the backend.
        over_limit = self.act(
            self.cust, booking, "request_revision", {"message": "Again, please."}
        )
        self.assertEqual(over_limit.status_code, 400)
        self.assertIn("limit", over_limit.json()["error"].lower())

        resubmitted = self.act(
            self.prov, booking, "submit_deliverable", {"title": "Revision 1", "url": "https://example.com/v2"}
        )
        self.assertEqual(resubmitted.status_code, 200, resubmitted.content)

        # 7. Customer approves -> completed, funds settle, job count increments.
        approved = self.act(self.cust, booking, "approve")
        self.assertEqual(approved.status_code, 200, approved.content)
        booking.refresh_from_db()
        self.assertEqual(booking.status, ProjectBooking.Status.COMPLETED)
        self.assertIsNotNone(booking.completed_at)

        self.provider.refresh_from_db()
        self.assertEqual(self.provider.completed_jobs, 1)
        self.assertTrue(
            LedgerTransaction.objects.filter(
                booking=booking, kind=LedgerTransaction.Kind.SETTLEMENT
            ).exists()
        )

        # 8. Review is allowed exactly once, then the provider's rating updates.
        review_payload = {"booking": booking.pk, "rating": 5, "comment": "Lovely work!"}
        first = self.cust.post("/api/reviews/", review_payload, format="json")
        self.assertEqual(first.status_code, 201, first.content)

        duplicate = self.cust.post("/api/reviews/", review_payload, format="json")
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(Review.objects.filter(booking=booking).count(), 1)

        self.provider.refresh_from_db()
        self.assertEqual(self.provider.rating_count, 1)
        self.assertEqual(float(self.provider.rating_average), 5.0)

        # Public review feed exposes the review without private data.
        public = api_client().get(f"/api/reviews/?provider={self.provider.pk}")
        self.assertEqual(public.status_code, 200)
        self.assertEqual(public.json()["count"], 1)
        self.assertNotIn("document", str(public.json()))

    def test_provider_can_counter_repeatedly_and_history_is_kept(self):
        booking = self.create_request()

        for amount in ("2800.00", "2900.00", "2950.00"):
            response = self.act(self.prov, booking, "counter", {"amount": amount})
            self.assertEqual(response.status_code, 200, response.content)

        offers = booking.counter_offers.order_by("id")
        self.assertEqual(offers.count(), 3)
        self.assertEqual(
            [o.amount for o in offers],
            [Decimal("2800.00"), Decimal("2900.00"), Decimal("2950.00")],
        )
        # Only the newest offer is actionable; older ones are superseded, not deleted.
        self.assertEqual(offers.filter(status=CounterOffer.Status.SUPERSEDED).count(), 2)
        self.assertEqual(offers.filter(status=CounterOffer.Status.ACTIVE).count(), 1)

        booking.refresh_from_db()
        self.assertEqual(booking.agreed_price, None)

        accepted = self.act(self.cust, booking, "accept")
        self.assertEqual(accepted.status_code, 200, accepted.content)
        booking.refresh_from_db()
        self.assertEqual(booking.agreed_price, Decimal("2950.00"))


class StateMachineTests(WorkflowTestCase):
    def test_provider_cannot_submit_work_before_payment(self):
        booking = self.create_request()
        self.act(self.prov, booking, "counter", {"amount": "2600.00"})
        self.act(self.cust, booking, "accept")

        response = self.act(self.prov, booking, "start_work")
        self.assertEqual(response.status_code, 400)
        self.assertIn("not confirmed", response.json()["error"].lower())

    def test_customer_cannot_approve_a_pending_request(self):
        booking = self.create_request()
        response = self.act(self.cust, booking, "approve")
        self.assertEqual(response.status_code, 400)

    def test_payment_cannot_start_before_agreement(self):
        booking = self.create_request()
        response = self.act(self.cust, booking, "start_payment")
        self.assertEqual(response.status_code, 400)

    def test_paid_booking_cannot_be_cancelled_without_dispute(self):
        booking = self.create_request()
        self.act(self.prov, booking, "accept")
        self.act(self.cust, booking, "start_payment")
        self._pay(booking)

        response = self.act(self.cust, booking, "cancel")
        self.assertEqual(response.status_code, 400)
        self.assertIn("dispute", response.json()["error"].lower())

    def test_completed_booking_cannot_be_cancelled(self):
        booking = self._completed_booking()
        response = self.act(self.cust, booking, "cancel")
        self.assertEqual(response.status_code, 400)

    def test_accept_cannot_be_called_twice(self):
        booking = self.create_request()
        self.assertEqual(self.act(self.prov, booking, "accept").status_code, 200)
        second = self.act(self.prov, booking, "accept")
        self.assertEqual(second.status_code, 400)

    def test_unpaid_booking_cannot_be_started_even_after_accept(self):
        booking = self.create_request()
        self.act(self.prov, booking, "accept")
        booking.refresh_from_db()
        self.assertEqual(booking.status, ProjectBooking.Status.AGREEMENT_REACHED)
        self.assertEqual(self.act(self.prov, booking, "start_work").status_code, 400)

    # -- helpers -------------------------------------------------------
    def _pay(self, booking):
        with override_settings(DEBUG=True, ESEWA_TRUST_SANDBOX_SUCCESS=True), mock.patch(
            "payments.services.requests.get", side_effect=requests.RequestException("offline")
        ):
            initiated = self.cust.post(
                "/api/payments/initiate/", {"booking": booking.pk}, format="json"
            ).json()
            self.cust.post(
                f"/api/payments/{initiated['payment']['id']}/verify/",
                {"force_success": True},
                format="json",
            )
        booking.refresh_from_db()
        return booking

    def _completed_booking(self):
        booking = self.create_request()
        self.act(self.prov, booking, "accept")
        self.act(self.cust, booking, "start_payment")
        self._pay(booking)
        self.act(self.prov, booking, "start_work")
        self.act(self.prov, booking, "submit_deliverable", {"title": "Done"})
        self.act(self.cust, booking, "approve")
        booking.refresh_from_db()
        self.assertEqual(booking.status, ProjectBooking.Status.COMPLETED)
        return booking


class PermissionTests(WorkflowTestCase):
    def test_other_customer_cannot_read_someone_elses_booking(self):
        booking = self.create_request()
        intruder = auth_client(make_user("intruder", role=User.Role.CLIENT))

        self.assertEqual(intruder.get(f"/api/bookings/projects/{booking.pk}/").status_code, 404)
        self.assertEqual(intruder.get("/api/bookings/projects/").json()["count"], 0)
        self.assertEqual(self.act(intruder, booking, "accept").status_code, 404)

    def test_other_provider_cannot_act_on_the_request(self):
        booking = self.create_request()
        rival = make_provider("rival_provider")

        response = self.act(auth_client(rival.user), booking, "accept")
        self.assertIn(response.status_code, (403, 404))

        counter = self.act(auth_client(rival.user), booking, "counter", {"amount": "100.00"})
        self.assertIn(counter.status_code, (403, 404))

    def test_customer_cannot_start_payment_for_a_booking_they_do_not_own(self):
        booking = self.create_request()
        stranger = make_user("stranger", role=User.Role.CLIENT)

        response = auth_client(stranger).post(
            "/api/payments/initiate/", {"booking": booking.pk}, format="json"
        )
        self.assertEqual(response.status_code, 404)

    def test_chat_messages_are_participant_only(self):
        booking = self.create_request()
        self.act(self.prov, booking, "counter", {"amount": "2600.00"})
        self.act(self.cust, booking, "accept")
        conversation = Conversation.objects.get(booking=booking)

        sent = self.cust.post(
            f"/api/chat/conversations/{conversation.pk}/send/",
            {"text": "Hi, see you at 9am."},
            format="json",
        )
        self.assertIn(sent.status_code, (200, 201), sent.content)
        self.assertEqual(
            Message.objects.filter(conversation=conversation, sender=self.customer).count(), 1
        )

        outsider = auth_client(make_user("chat_crasher", role=User.Role.CLIENT))
        self.assertEqual(
            outsider.get(f"/api/chat/conversations/{conversation.pk}/").status_code, 404
        )
        self.assertEqual(
            outsider.post(
                f"/api/chat/conversations/{conversation.pk}/send/",
                {"text": "hello?"},
                format="json",
            ).status_code,
            404,
        )

    def test_provider_cannot_review_their_own_booking(self):
        booking = self.create_request()
        self.assertEqual(self.act(self.prov, booking, "accept").status_code, 200)

        response = self.prov.post(
            "/api/reviews/", {"booking": booking.pk, "rating": 5, "comment": "me"}, format="json"
        )
        self.assertEqual(response.status_code, 403)


class DoubleBookingTests(WorkflowTestCase):
    def test_a_slot_can_only_be_reserved_once(self):
        booking = self.create_request(slot_id=self.slot.pk)
        self.assertEqual(booking.freelancer, self.provider)

        self.slot.refresh_from_db()
        self.assertEqual(self.slot.status, AvailabilitySlot.Status.BOOKED)
        self.assertEqual(self.slot.booking_id, booking.pk)

        second_customer = auth_client(make_user("second_cust", role=User.Role.CLIENT))
        response = second_customer.post(
            "/api/bookings/projects/",
            {
                "service": self.service.pk,
                "title": "Same slot",
                "proposed_price": "2500.00",
                "slot_id": self.slot.pk,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("already been booked", str(response.json()))

    def test_reserve_slot_raises_when_slot_is_taken(self):
        first = self.create_request(slot_id=self.slot.pk)
        other = ProjectBooking.objects.create(
            client=make_user("other_cust", role=User.Role.CLIENT).client_profile,
            freelancer=self.provider,
            service=self.service,
            title="Direct",
            proposed_price=Decimal("1000.00"),
        )
        with self.assertRaises(ValidationError) as ctx:
            reserve_slot(self.slot.pk, other)
        self.assertIn("already been booked", str(ctx.exception.detail))

    def test_booking_inherits_the_slot_time(self):
        booking = self.create_request(slot_id=self.slot.pk)
        self.slot.refresh_from_db()

        self.assertIsNotNone(booking.appointment_start)
        self.assertIsNotNone(booking.appointment_end)
        self.assertEqual(
            timezone.localtime(booking.appointment_start).date(), self.slot.date
        )
        self.assertEqual(
            timezone.localtime(booking.appointment_start).time(), self.slot.start_time
        )
        self.assertEqual(
            timezone.localtime(booking.appointment_end).time(), self.slot.end_time
        )

        detail = self.cust.get(f"/api/bookings/projects/{booking.pk}/").json()
        self.assertIsNotNone(detail["booking_time"])
        self.assertEqual(detail["status_key"], "pending")

    def test_slot_listing_marks_booked_slots(self):
        self.create_request(slot_id=self.slot.pk)
        response = self.cust.get(f"/api/bookings/slots/?provider={self.provider.pk}")
        self.assertEqual(response.status_code, 200)
        booked = [s for s in response.json()["results"] if s["id"] == self.slot.pk]
        self.assertEqual(len(booked), 1)
        self.assertEqual(booked[0]["status"], "booked")


class PaymentIntegrityTests(WorkflowTestCase):
    def test_payment_requires_agreement(self):
        booking = self.create_request()
        response = self.cust.post("/api/payments/initiate/", {"booking": booking.pk}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_payment_is_not_marked_success_without_gateway_or_sandbox(self):
        booking = self.create_request()
        self.act(self.prov, booking, "accept")
        self.act(self.cust, booking, "start_payment")

        with override_settings(DEBUG=False, ESEWA_TRUST_SANDBOX_SUCCESS=False), mock.patch(
            "payments.services.requests.get", side_effect=requests.RequestException("offline")
        ):
            initiated = self.cust.post(
                "/api/payments/initiate/", {"booking": booking.pk}, format="json"
            ).json()
            verified = self.cust.post(
                f"/api/payments/{initiated['payment']['id']}/verify/",
                {"force_success": True},
                format="json",
            )

        self.assertEqual(verified.json()["status"], "FAILED")
        self.assertNotEqual(verified.json()["status"], "SUCCESS")

        booking.refresh_from_db()
        self.assertEqual(booking.status, ProjectBooking.Status.PAYMENT_FAILED)
        self.assertIsNone(booking.paid_at)

    def test_sandbox_override_is_disabled_once_real_credentials_exist(self):
        """
        With a real eSewa merchant code configured the DEBUG sandbox override
        must never fire, even with DEBUG on and `force_success` requested.
        """

        booking = self.create_request()
        self.act(self.prov, booking, "accept")
        self.act(self.cust, booking, "start_payment")

        with override_settings(
            DEBUG=True,
            ESEWA_TRUST_SANDBOX_SUCCESS=True,
            ESEWA_MERCHANT_CODE="REAL_MERCHANT",
        ), mock.patch(
            "payments.services.requests.get",
            side_effect=requests.RequestException("offline"),
        ):
            initiated = self.cust.post(
                "/api/payments/initiate/", {"booking": booking.pk}, format="json"
            ).json()
            verified = self.cust.post(
                f"/api/payments/{initiated['payment']['id']}/verify/",
                {"force_success": True},
                format="json",
            )

        self.assertEqual(verified.json()["status"], "FAILED")

        booking.refresh_from_db()
        self.assertEqual(booking.status, ProjectBooking.Status.PAYMENT_FAILED)

    def test_failed_payment_can_be_retried(self):
        booking = self.create_request()
        self.act(self.prov, booking, "accept")
        self.act(self.cust, booking, "start_payment")

        with override_settings(DEBUG=False, ESEWA_TRUST_SANDBOX_SUCCESS=False), mock.patch(
            "payments.services.requests.get", side_effect=requests.RequestException("offline")
        ):
            initiated = self.cust.post(
                "/api/payments/initiate/", {"booking": booking.pk}, format="json"
            ).json()
            self.cust.post(
                f"/api/payments/{initiated['payment']['id']}/verify/",
                {"force_success": True},
                format="json",
            )
        booking.refresh_from_db()
        self.assertEqual(booking.status, ProjectBooking.Status.PAYMENT_FAILED)

        with override_settings(DEBUG=True, ESEWA_TRUST_SANDBOX_SUCCESS=True), mock.patch(
            "payments.services.requests.get", side_effect=requests.RequestException("offline")
        ):
            retry = self.cust.post(
                "/api/payments/initiate/", {"booking": booking.pk}, format="json"
            )
            self.assertEqual(retry.status_code, 200, retry.content)
            self.cust.post(
                f"/api/payments/{retry.json()['payment']['id']}/verify/",
                {"force_success": True},
                format="json",
            )

        booking.refresh_from_db()
        self.assertEqual(booking.status, ProjectBooking.Status.CONFIRMED)

    def test_existing_pending_payment_is_reused_instead_of_double_charged(self):
        booking = self.create_request()
        self.act(self.prov, booking, "accept")
        self.act(self.cust, booking, "start_payment")

        first = self.cust.post("/api/payments/initiate/", {"booking": booking.pk}, format="json")
        second = self.cust.post("/api/payments/initiate/", {"booking": booking.pk}, format="json")

        self.assertEqual(first.json()["payment"]["id"], second.json()["payment"]["id"])
        self.assertEqual(Payment.objects.filter(booking=booking).count(), 1)

    def test_payment_list_hides_other_users_payments(self):
        booking = self.create_request()
        self.act(self.prov, booking, "accept")
        self.act(self.cust, booking, "start_payment")
        self.cust.post("/api/payments/initiate/", {"booking": booking.pk}, format="json")

        outsider = auth_client(make_user("payment_peeper", role=User.Role.CLIENT))
        response = outsider.get("/api/payments/payments/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 0)

        # The provider on the booking may see it; unrelated providers may not.
        self.assertEqual(self.prov.get("/api/payments/payments/").json()["count"], 1)

    def test_summary_reports_provider_earnings_server_side(self):
        booking = self.create_request()
        self.act(self.prov, booking, "accept")
        self.act(self.cust, booking, "start_payment")

        with override_settings(DEBUG=True, ESEWA_TRUST_SANDBOX_SUCCESS=True), mock.patch(
            "payments.services.requests.get", side_effect=requests.RequestException("offline")
        ):
            initiated = self.cust.post(
                "/api/payments/initiate/", {"booking": booking.pk}, format="json"
            ).json()
            self.cust.post(
                f"/api/payments/{initiated['payment']['id']}/verify/",
                {"force_success": True},
                format="json",
            )

        summary = self.prov.get("/api/payments/summary/")
        self.assertEqual(summary.status_code, 200, summary.content)
        body = summary.json()
        # The provider accepted the customer's offer of Rs 2500 (not the list price).
        self.assertEqual(float(body["total_earned"]), 2500.0)
        self.assertEqual(float(body["settled"]), 0.0)
        self.assertEqual(float(body["pending"]), 2500.0)

        self.act(self.prov, booking, "start_work")
        self.act(self.prov, booking, "submit_deliverable", {"title": "Done"})
        self.act(self.cust, booking, "approve")

        after = self.prov.get("/api/payments/summary/").json()
        self.assertEqual(float(after["total_earned"]), 2500.0)
        self.assertEqual(float(after["settled"]), 2500.0)
        self.assertEqual(float(after["pending"]), 0.0)
        self.assertEqual(after["jobs_paid"], 1)


class ReviewRuleTests(WorkflowTestCase):
    def test_review_requires_completed_booking(self):
        booking = self.create_request()
        response = self.cust.post(
            "/api/reviews/", {"booking": booking.pk, "rating": 4, "comment": "too early"}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("completed", response.json()["error"].lower())

    def test_rating_must_be_between_one_and_five(self):
        booking = self.create_request()
        response = self.cust.post(
            "/api/reviews/", {"booking": booking.pk, "rating": 9, "comment": "x"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_hidden_reviews_are_excluded_from_the_public_feed(self):
        booking = self.create_request()
        self.act(self.prov, booking, "accept")
        self.act(self.cust, booking, "start_payment")
        with override_settings(DEBUG=True, ESEWA_TRUST_SANDBOX_SUCCESS=True), mock.patch(
            "payments.services.requests.get", side_effect=requests.RequestException("offline")
        ):
            initiated = self.cust.post(
                "/api/payments/initiate/", {"booking": booking.pk}, format="json"
            ).json()
            self.cust.post(
                f"/api/payments/{initiated['payment']['id']}/verify/",
                {"force_success": True},
                format="json",
            )
        self.act(self.prov, booking, "start_work")
        self.act(self.prov, booking, "submit_deliverable", {"title": "Done"})
        self.act(self.cust, booking, "approve")

        created = self.cust.post(
            "/api/reviews/", {"booking": booking.pk, "rating": 1, "comment": "Abusive text"}, format="json"
        )
        self.assertEqual(created.status_code, 201, created.content)

        review = Review.objects.get(booking=booking)
        review.is_visible = False
        review.save(update_fields=["is_visible"])

        public = api_client().get(f"/api/reviews/?provider={self.provider.pk}")
        self.assertEqual(public.json()["count"], 0)
