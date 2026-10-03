from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response

from analytics.models import audit
from marketplace.models import Service
from notifications.services import notify
from users.roles import is_admin, is_client, is_freelancer
from .models import (
    AvailabilitySlot,
    Booking,
    CounterOffer,
    Deliverable,
    Dispute,
    Payment,
    RevisionRequest,
    Transaction,
)
from .serializers import AvailabilitySlotSerializer, BookingSerializer, PaymentSerializer
from .state import PENDING_SET, PAYABLE_SET, lock_booking, normalize_status
from .utils import time_ranges_overlap


class AvailabilitySlotViewSet(viewsets.ModelViewSet):
    serializer_class = AvailabilitySlotSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        return super().get_permissions()

    def get_queryset(self):
        qs = AvailabilitySlot.objects.select_related("service", "provider")
        provider = self.request.query_params.get("provider")
        service = self.request.query_params.get("service")
        month = self.request.query_params.get("month")

        user = self.request.user
        if user.is_authenticated and is_freelancer(user) and not provider:
            qs = qs.filter(provider=user)
        elif provider:
            qs = qs.filter(provider_id=provider)
        if service:
            qs = qs.filter(service_id=service)
        if month:
            try:
                start = datetime.strptime(month, "%Y-%m").date()
                if start.month == 12:
                    end = start.replace(year=start.year + 1, month=1, day=1)
                else:
                    end = start.replace(month=start.month + 1, day=1)
                qs = qs.filter(date__gte=start, date__lt=end)
            except ValueError:
                pass
        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx

    def perform_create(self, serializer):
        if not is_freelancer(self.request.user):
            raise PermissionDenied("Only freelancers can add availability.")
        serializer.save(provider=self.request.user, status=AvailabilitySlot.STATUS_AVAILABLE)

    def perform_update(self, serializer):
        slot = self.get_object()
        if slot.provider != self.request.user:
            raise PermissionDenied("Not your slot.")
        if slot.status == AvailabilitySlot.STATUS_BOOKED:
            raise ValidationError("Cannot edit a booked slot. Cancel booking first.")
        new_status = serializer.validated_data.get("status", slot.status)
        if new_status not in (
            AvailabilitySlot.STATUS_AVAILABLE,
            AvailabilitySlot.STATUS_BLOCKED,
        ):
            raise ValidationError("Invalid status for manual update.")
        serializer.save()

    @action(detail=True, methods=["post"])
    def toggle_block(self, request, pk=None):
        slot = self.get_object()
        if slot.provider != request.user:
            return Response({"error": "Not allowed"}, status=403)
        if slot.status == AvailabilitySlot.STATUS_BOOKED:
            return Response({"error": "Slot is booked"}, status=400)
        slot.status = (
            AvailabilitySlot.STATUS_BLOCKED
            if slot.status == AvailabilitySlot.STATUS_AVAILABLE
            else AvailabilitySlot.STATUS_AVAILABLE
        )
        slot.save(update_fields=["status"])
        return Response(AvailabilitySlotSerializer(slot).data)


class BookingViewSet(viewsets.ModelViewSet):
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Booking.objects.select_related("service", "customer", "provider").prefetch_related(
            "counter_offers", "payments"
        )
        if is_admin(user):
            return qs
        if is_freelancer(user):
            return qs.filter(provider=user)
        return qs.filter(customer=user)

    def _ensure_party(self, booking, user):
        if user not in (booking.customer, booking.provider) and not is_admin(user):
            raise PermissionDenied("Not allowed")

    def perform_create(self, serializer):
        data = self.request.data
        user = self.request.user
        if is_freelancer(user) and not data.get("booking_type") == Booking.TYPE_CUSTOM:
            service = serializer.validated_data.get("service")
            if service and service.provider_id == user.id:
                raise PermissionDenied("You cannot book your own service listing.")

        booking_type = serializer.validated_data.get("booking_type") or data.get(
            "booking_type", Booking.TYPE_FIXED
        )
        service = serializer.validated_data.get("service")
        proposed = serializer.validated_data.get("proposed_price")
        if proposed is None:
            raw = data.get("proposed_price")
            if raw not in (None, ""):
                try:
                    proposed = Decimal(str(raw))
                except (InvalidOperation, TypeError):
                    raise ValidationError({"proposed_price": "Invalid amount."})
        if proposed is None and service is not None:
            proposed = service.price

        if booking_type == Booking.TYPE_CUSTOM:
            provider = serializer.validated_data.get("provider")
            if not serializer.validated_data.get("title") and not data.get("title"):
                raise ValidationError({"title": "Describe the custom job."})
            if proposed is None:
                raise ValidationError({"proposed_price": "Proposed budget is required."})
            booking = serializer.save(
                customer=user,
                provider=provider,
                status=Booking.PENDING_PROVIDER_RESPONSE,
                booking_type=Booking.TYPE_CUSTOM,
                proposed_price=proposed,
                service_mode=serializer.validated_data.get("service_mode")
                or data.get("service_mode", "REMOTE"),
            )
            if booking.provider:
                notify(
                    booking.provider,
                    "New custom job",
                    f"{user.username} proposed Rs {proposed} for {booking.display_title}",
                    "new_request",
                )
            audit(user, "project.create", "Booking", booking.id)
            return

        slot_id = data.get("slot_id")
        if not service:
            raise ValidationError({"service": "Select a service listing or create a custom job."})
        if is_freelancer(user) and service.provider_id == user.id:
            raise PermissionDenied("You cannot book your own service listing.")

        mode = service.service_mode
        needs_slot = mode in (Service.MODE_LOCAL, Service.MODE_BOTH) or booking_type in (
            Booking.TYPE_FIXED,
            Booking.TYPE_LOCAL,
        )
        if mode == Service.MODE_REMOTE:
            needs_slot = False

        slot = None
        booking_time = None
        with transaction.atomic():
            if needs_slot:
                if not slot_id:
                    raise ValidationError({"slot_id": "Select an available time slot."})
                try:
                    slot = AvailabilitySlot.objects.select_for_update().get(
                        id=slot_id,
                        service=service,
                        status=AvailabilitySlot.STATUS_AVAILABLE,
                    )
                except AvailabilitySlot.DoesNotExist:
                    raise ValidationError("Selected slot is not available.")

                booked_on_day = AvailabilitySlot.objects.filter(
                    provider=service.provider,
                    date=slot.date,
                    status=AvailabilitySlot.STATUS_BOOKED,
                ).exclude(pk=slot.pk)
                for other in booked_on_day:
                    if time_ranges_overlap(
                        slot.start_time, slot.end_time, other.start_time, other.end_time
                    ):
                        raise ValidationError(
                            "This time overlaps with an existing booking. Choose another slot."
                        )
                booking_time = timezone.make_aware(
                    datetime.combine(slot.date, slot.start_time)
                )

            booking = serializer.save(
                customer=user,
                provider=service.provider,
                status=Booking.PENDING_PROVIDER_RESPONSE,
                booking_type=Booking.TYPE_FIXED if needs_slot else Booking.TYPE_REMOTE,
                service_mode=mode,
                proposed_price=proposed,
                booking_time=booking_time,
                title=service.title,
            )
            if slot:
                slot.status = AvailabilitySlot.STATUS_BOOKED
                slot.booking = booking
                slot.save(update_fields=["status", "booking"])

        notify(
            booking.provider,
            "New request",
            f"{user.username} proposed Rs {proposed} for {booking.display_title}",
            "new_request",
        )
        audit(user, "project.create", "Booking", booking.id)

    def _send_status_email(self, booking: Booking, status_label: str):
        customer = booking.customer
        if not customer or not customer.email:
            return
        when = (
            booking.booking_time.astimezone(timezone.get_current_timezone()).strftime(
                "%Y-%m-%d %I:%M %p"
            )
            if booking.booking_time
            else "scheduled time"
        )
        subject = f"Project {status_label.lower()} — Service Marketplace"
        message = (
            f"Hello {customer.username},\n\n"
            f"Your request for '{booking.display_title}' is now {status_label.lower()}.\n"
            f"Time: {when}\n\n"
            "Open the app to view details, counter-offers, or payment.\n"
        )
        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[customer.email],
                fail_silently=False,
            )
        except Exception:
            pass

    def _open_chat(self, booking: Booking):
        from chats.models import ChatRoom

        if booking.canonical_status() not in Booking.CHAT_STATUSES:
            return None
        if not booking.customer_id or not booking.provider_id:
            return None
        room, _ = ChatRoom.objects.get_or_create(
            booking=booking,
            defaults={"customer": booking.customer, "provider": booking.provider},
        )
        return room

    @action(detail=False, methods=["get"])
    def open(self, request):
        if not is_freelancer(request.user):
            return Response({"error": "Only freelancers can browse open jobs."}, status=403)
        qs = Booking.objects.filter(
            provider__isnull=True,
            status=Booking.PENDING_PROVIDER_RESPONSE,
            booking_type=Booking.TYPE_CUSTOM,
        ).order_by("-created_at")
        return Response(BookingSerializer(qs, many=True, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        with transaction.atomic():
            booking = lock_booking(pk)
            user = request.user
            if booking.provider is None:
                if not is_freelancer(user):
                    return Response({"error": "Not allowed"}, status=403)
                booking.provider = user
                booking.save(update_fields=["provider", "updated_at"])
            elif booking.provider != user and not is_admin(user):
                return Response({"error": "Not allowed"}, status=403)
            if normalize_status(booking.status) not in PENDING_SET:
                return Response(
                    {"error": "Only pending requests can be accepted at the listed price."},
                    status=400,
                )
            booking.agreed_price = booking.proposed_price
            booking.status = Booking.AGREEMENT_REACHED
            booking.save(update_fields=["agreed_price", "status", "updated_at"])

        self._send_status_email(booking, "agreement reached")
        notify(
            booking.customer,
            "Request accepted",
            f"Pay the agreed amount of Rs {booking.agreed_price} to confirm the project.",
            "accepted_request",
        )
        audit(user, "project.accept", "Booking", booking.id)
        return Response(BookingSerializer(booking, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        with transaction.atomic():
            booking = lock_booking(pk)
            user = request.user
            if booking.provider != user and not is_admin(user):
                return Response({"error": "Not allowed"}, status=403)
            if normalize_status(booking.status) not in PENDING_SET | {Booking.COUNTER_OFFERED}:
                return Response(
                    {"error": "This request can no longer be rejected."}, status=400
                )
            booking.status = Booking.REJECTED
            booking.save(update_fields=["status", "updated_at"])
            slot = getattr(booking, "availability_slot", None)
            if slot:
                slot.status = AvailabilitySlot.STATUS_AVAILABLE
                slot.booking = None
                slot.save(update_fields=["status", "booking"])
            booking.counter_offers.filter(status=CounterOffer.PENDING).update(
                status=CounterOffer.REJECTED
            )

        self._send_status_email(booking, "rejected")
        notify(booking.customer, "Request rejected", booking.display_title, "rejected_request")
        audit(user, "project.reject", "Booking", booking.id)
        return Response(BookingSerializer(booking, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="counter-offer")
    def counter_offer(self, request, pk=None):
        amount = request.data.get("amount")
        message = (request.data.get("message") or "").strip()
        try:
            amount = Decimal(str(amount))
        except (InvalidOperation, TypeError):
            return Response({"error": "A valid counter-offer amount is required."}, status=400)
        if amount <= 0:
            return Response({"error": "Amount must be greater than zero."}, status=400)

        with transaction.atomic():
            booking = lock_booking(pk)
            user = request.user
            if booking.provider is None and is_freelancer(user):
                booking.provider = user
            self._ensure_party(booking, user)
            status_now = normalize_status(booking.status)
            if status_now not in PENDING_SET | {Booking.COUNTER_OFFERED}:
                return Response({"error": "Counter-offer is not allowed in this state."}, status=400)
            if booking.price_locked:
                return Response({"error": "Price is locked after payment."}, status=400)

            pending = booking.counter_offers.filter(status=CounterOffer.PENDING)
            last = pending.first()
            if last:
                responder = (
                    booking.customer if last.creator_id == booking.provider_id else booking.provider
                )
                if user != responder and not is_admin(user):
                    return Response(
                        {"error": "Wait for the other party to respond to the active counter-offer."},
                        status=403,
                    )
                pending.update(status=CounterOffer.SUPERSEDED)

            offer = CounterOffer.objects.create(
                booking=booking, creator=user, amount=amount, message=message
            )
            booking.status = Booking.COUNTER_OFFERED
            booking.save(update_fields=["provider", "status", "updated_at"])

        other = booking.customer if user == booking.provider else booking.provider
        notify(
            other,
            "Counter-offer",
            f"{user.username} offered Rs {amount}: {message[:120]}",
            "counter_offer",
        )
        audit(user, "project.counter", "Booking", booking.id, {"amount": str(amount)})
        return Response(
            BookingSerializer(booking, context={"request": request}).data,
            status=201,
        )

    @action(detail=True, methods=["post"], url_path="accept-counter")
    def accept_counter(self, request, pk=None):
        with transaction.atomic():
            booking = lock_booking(pk)
            user = request.user
            offer = booking.counter_offers.filter(status=CounterOffer.PENDING).first()
            if not offer:
                return Response({"error": "No active counter-offer."}, status=400)
            responder = (
                booking.customer if offer.creator_id == booking.provider_id else booking.provider
            )
            if user != responder and not is_admin(user):
                return Response({"error": "Only the other party can accept this counter-offer."}, status=403)
            offer.status = CounterOffer.ACCEPTED
            offer.save(update_fields=["status"])
            booking.agreed_price = offer.amount
            booking.status = Booking.AGREEMENT_REACHED
            booking.save(update_fields=["agreed_price", "status", "updated_at"])

        notify(
            offer.creator,
            "Counter-offer accepted",
            f"Agreed price is Rs {booking.agreed_price}. Payment can proceed.",
            "counter_offer_response",
        )
        audit(user, "project.accept_counter", "Booking", booking.id)
        return Response(BookingSerializer(booking, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="reject-counter")
    def reject_counter(self, request, pk=None):
        with transaction.atomic():
            booking = lock_booking(pk)
            user = request.user
            offer = booking.counter_offers.filter(status=CounterOffer.PENDING).first()
            if not offer:
                return Response({"error": "No active counter-offer."}, status=400)
            responder = (
                booking.customer if offer.creator_id == booking.provider_id else booking.provider
            )
            if user != responder and not is_admin(user):
                return Response({"error": "Only the other party can reject this counter-offer."}, status=403)
            offer.status = CounterOffer.REJECTED
            offer.save(update_fields=["status"])
            booking.status = Booking.CANCELLED
            booking.save(update_fields=["status", "updated_at"])
            slot = getattr(booking, "availability_slot", None)
            if slot:
                slot.status = AvailabilitySlot.STATUS_AVAILABLE
                slot.booking = None
                slot.save(update_fields=["status", "booking"])

        notify(offer.creator, "Counter-offer rejected", booking.display_title, "counter_offer_response")
        audit(user, "project.reject_counter", "Booking", booking.id)
        return Response(BookingSerializer(booking, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="create-payment")
    def create_payment(self, request, pk=None):
        booking = self.get_object()
        if request.user != booking.customer and not is_admin(request.user):
            return Response({"error": "Only the client can pay."}, status=403)
        status_now = normalize_status(booking.status)
        if status_now in (Booking.CANCELLED, Booking.EXPIRED, Booking.REJECTED):
            return Response({"error": "Cannot pay for a cancelled or expired project."}, status=400)
        if status_now not in PAYABLE_SET:
            return Response({"error": "Agreement must be reached before payment."}, status=400)
        if not booking.agreed_price:
            return Response({"error": "No agreed price to charge."}, status=400)
        if booking.payments.filter(status=Payment.SUCCESS).exists():
            return Response({"error": "This project is already paid."}, status=400)

        existing = booking.payments.filter(status=Payment.INITIATED).first()
        if existing:
            booking.status = Booking.PAYMENT_PENDING
            booking.save(update_fields=["status", "updated_at"])
            return Response(PaymentSerializer(existing).data)

        pid = f"SM-{booking.id}-{uuid4().hex[:10]}"
        payment = Payment.objects.create(
            booking=booking,
            amount=booking.agreed_price,
            merchant_pid=pid,
            idempotency_key=pid,
        )
        booking.status = Booking.PAYMENT_PENDING
        booking.save(update_fields=["status", "updated_at"])
        notify(booking.provider, "Payment pending", booking.display_title, "payment_result")
        return Response(
            {
                **PaymentSerializer(payment).data,
                "esewa_merchant": getattr(settings, "ESEWA_MERCHANT_CODE", "EPAYTEST"),
                "pay_amount": str(booking.agreed_price),
            },
            status=201,
        )

    @action(detail=True, methods=["post"], url_path="verify-payment")
    def verify_payment(self, request, pk=None):
        """Server-side eSewa/payment verification. Frontend success is ignored unless verified."""
        booking = self.get_object()
        success = str(request.data.get("status") or "").lower() in ("success", "complete", "ok")
        gateway_ref = (request.data.get("gateway_ref") or request.data.get("refId") or "").strip()
        pid = (request.data.get("merchant_pid") or request.data.get("pid") or "").strip()

        payment = None
        if pid:
            payment = booking.payments.filter(merchant_pid=pid).first()
        if payment is None:
            payment = booking.payments.order_by("-created_at").first()
        if payment is None:
            return Response({"error": "No payment to verify."}, status=400)

        if payment.status == Payment.SUCCESS:
            return Response(BookingSerializer(booking, context={"request": request}).data)

        if gateway_ref and Payment.objects.filter(gateway_ref=gateway_ref, status=Payment.SUCCESS).exists():
            return Response({"error": "Duplicate gateway reference."}, status=400)

        if not success:
            payment.status = Payment.FAILED
            payment.gateway_ref = gateway_ref
            payment.raw_callback = dict(request.data)
            payment.save(update_fields=["status", "gateway_ref", "raw_callback", "updated_at"])
            booking.status = Booking.PAYMENT_FAILED
            booking.save(update_fields=["status", "updated_at"])
            notify(booking.customer, "Payment failed", booking.display_title, "payment_result")
            return Response({"error": "Payment failed", "status": booking.status}, status=400)

        if Decimal(str(payment.amount)) != Decimal(str(booking.agreed_price)):
            return Response({"error": "Amount mismatch."}, status=400)

        with transaction.atomic():
            booking = lock_booking(pk)
            payment = Payment.objects.select_for_update().get(pk=payment.pk)
            if payment.status == Payment.SUCCESS:
                return Response(BookingSerializer(booking, context={"request": request}).data)
            payment.status = Payment.SUCCESS
            payment.gateway_ref = gateway_ref or payment.merchant_pid
            payment.raw_callback = dict(request.data)
            payment.save(update_fields=["status", "gateway_ref", "raw_callback", "updated_at"])
            Transaction.objects.create(
                payment=payment,
                user=booking.provider,
                amount=payment.amount,
                tx_type=Transaction.CREDIT,
                description=f"Earnings for {booking.display_title}",
            )
            booking.status = Booking.CONFIRMED
            booking.price_locked = True
            booking.save(update_fields=["status", "price_locked", "updated_at"])
            room = self._open_chat(booking)

        notify(booking.provider, "Project confirmed", "Payment verified. You can start work.", "confirmed_project")
        notify(booking.customer, "Payment verified", booking.display_title, "payment_result")
        audit(request.user, "payment.verify", "Payment", payment.id)
        data = BookingSerializer(booking, context={"request": request}).data
        data["chat_room_id"] = room.id if room else None
        return Response(data)

    @action(detail=True, methods=["post"], url_path="start")
    def start(self, request, pk=None):
        booking = self.get_object()
        if request.user != booking.provider:
            return Response({"error": "Not allowed"}, status=403)
        if normalize_status(booking.status) != Booking.CONFIRMED:
            return Response({"error": "Only confirmed projects can be started."}, status=400)
        booking.status = Booking.IN_PROGRESS
        booking.save(update_fields=["status", "updated_at"])
        notify(booking.customer, "Work started", booking.display_title, "confirmed_project")
        return Response(BookingSerializer(booking, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="deliverables")
    def submit_deliverable(self, request, pk=None):
        booking = self.get_object()
        if request.user != booking.provider:
            return Response({"error": "Not allowed"}, status=403)
        if normalize_status(booking.status) not in {
            Booking.CONFIRMED,
            Booking.IN_PROGRESS,
            Booking.REVISION_REQUESTED,
        }:
            return Response({"error": "Cannot submit deliverables in this state."}, status=400)
        file_url = (request.data.get("file_url") or "").strip()
        link_url = (request.data.get("link_url") or "").strip()
        notes = (request.data.get("notes") or "").strip()
        if not file_url and not link_url and not notes:
            return Response({"error": "Add a file, link, or notes."}, status=400)
        Deliverable.objects.create(
            booking=booking,
            uploaded_by=request.user,
            file_url=file_url,
            link_url=link_url,
            notes=notes,
        )
        booking.status = Booking.DELIVERABLE_SUBMITTED
        booking.save(update_fields=["status", "updated_at"])
        notify(booking.customer, "Deliverable submitted", booking.display_title, "deliverable")
        return Response(BookingSerializer(booking, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="request-revision")
    def request_revision(self, request, pk=None):
        booking = self.get_object()
        if request.user != booking.customer:
            return Response({"error": "Only the client can request a revision."}, status=403)
        if normalize_status(booking.status) not in {
            Booking.DELIVERABLE_SUBMITTED,
            Booking.CLIENT_REVIEWING,
        }:
            return Response({"error": "Revision is not allowed in this state."}, status=400)
        if booking.revision_count >= booking.revision_limit:
            return Response({"error": "No remaining revisions."}, status=400)
        message = (request.data.get("message") or "").strip()
        if not message:
            return Response({"error": "Describe the revision."}, status=400)
        RevisionRequest.objects.create(
            booking=booking, requested_by=request.user, message=message
        )
        booking.revision_count += 1
        booking.status = Booking.REVISION_REQUESTED
        booking.save(update_fields=["revision_count", "status", "updated_at"])
        notify(booking.provider, "Revision requested", message[:200], "revision_request")
        return Response(BookingSerializer(booking, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="complete")
    def complete(self, request, pk=None):
        booking = self.get_object()
        if request.user != booking.customer and not is_admin(request.user):
            return Response({"error": "Only the client can confirm completion."}, status=403)
        if normalize_status(booking.status) not in {
            Booking.DELIVERABLE_SUBMITTED,
            Booking.CLIENT_REVIEWING,
            Booking.IN_PROGRESS,
            Booking.CONFIRMED,
        }:
            return Response({"error": "Project cannot be completed from this state."}, status=400)
        booking.status = Booking.COMPLETED
        booking.save(update_fields=["status", "updated_at"])
        notify(booking.provider, "Project completed", "Earnings are recorded.", "completion")
        audit(request.user, "project.complete", "Booking", booking.id)
        return Response(BookingSerializer(booking, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def dispute(self, request, pk=None):
        booking = self.get_object()
        self._ensure_party(booking, request.user)
        if hasattr(booking, "dispute"):
            return Response({"error": "A dispute is already open."}, status=400)
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return Response({"error": "Reason is required."}, status=400)
        Dispute.objects.create(booking=booking, opened_by=request.user, reason=reason)
        booking.status = Booking.DISPUTED
        booking.save(update_fields=["status", "updated_at"])
        audit(request.user, "project.dispute", "Booking", booking.id)
        return Response(BookingSerializer(booking, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        booking = self.get_object()
        user = request.user
        if user not in (booking.customer, booking.provider) and not is_admin(user):
            return Response({"error": "Not allowed"}, status=403)
        status_now = normalize_status(booking.status)
        if status_now in (Booking.CANCELLED, Booking.REJECTED):
            return Response({"message": "Already cancelled"})
        if status_now in (Booking.COMPLETED, Booking.REVIEWED):
            return Response({"error": "Completed bookings cannot be cancelled."}, status=400)
        if status_now in Booking.CHAT_STATUSES and status_now not in {Booking.CONFIRMED}:
            return Response(
                {"error": "Open a dispute instead of cancelling an in-progress project."},
                status=400,
            )
        if booking.booking_time and booking.booking_time <= timezone.now() + timedelta(hours=24):
            return Response(
                {
                    "error": "Too late to cancel",
                    "message": "Cancellations must be at least 24 hours before the appointment.",
                },
                status=400,
            )
        booking.cancel_and_release_slot()
        return Response(BookingSerializer(booking, context={"request": request}).data)
