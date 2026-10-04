from decimal import Decimal
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from accounts.models import User
from catalog.models import Category, Service
class MarketplaceFlowTests(TestCase):
    def setUp(self):
        self.client_api = APIClient()
        self.category = Category.objects.create(name="Web Development", slug="web-development")
        self.client_user = User.objects.create_user(
            username="client1", email="client@test.com", password="Passw0rd!", role=User.Role.CLIENT
        )
        self.client_user.is_otp_verified = True
        self.client_user.save()
        self.freelancer_user = User.objects.create_user(
            username="free1", email="free@test.com", password="Passw0rd!", role=User.Role.FREELANCER
        )
        self.freelancer_user.is_otp_verified = True
        self.freelancer_user.save()
        from accounts.models import FreelancerProfile
        profile = FreelancerProfile.objects.get(user=self.freelancer_user)
        self.service = Service.objects.create(
            freelancer=profile,
            category=self.category,
            title="Landing page",
            description="Build a landing page",
            service_mode="REMOTE",
            starting_price=Decimal("100.00"),
            delivery_days=5,
        )
    def auth(self, user):
        self.client_api.force_authenticate(user=user)
    def test_reverse_bidding_and_payment(self):
        self.auth(self.client_user)
        response = self.client_api.post(
            "/api/bookings/projects/",
            {
                "service": self.service.id,
                "booking_type": "FIXED_SERVICE_BOOKING",
                "service_mode": "REMOTE",
                "title": "Need a landing page",
                "requirements": "Hero, pricing, contact form",
                "proposed_price": "80.00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        booking_id = response.data["id"]
        self.assertEqual(response.data["status"], "PENDING_PROVIDER_RESPONSE")
        self.assertEqual(response.data["proposed_price"], "80.00")
        self.assertIsNone(response.data["agreed_price"])
        self.auth(self.freelancer_user)
        counter = self.client_api.post(
            f"/api/bookings/projects/{booking_id}/counter/",
            {"amount": "95.00", "message": "Includes revisions"},
            format="json",
        )
        self.assertEqual(counter.status_code, 200, counter.content)
        self.assertEqual(counter.data["status"], "COUNTER_OFFERED")
        self.auth(self.client_user)
        accept = self.client_api.post(f"/api/bookings/projects/{booking_id}/accept/", {}, format="json")
        self.assertEqual(accept.status_code, 200, accept.content)
        self.assertEqual(accept.data["status"], "AGREEMENT_REACHED")
        self.assertEqual(accept.data["agreed_price"], "95.00")
        pay = self.client_api.post("/api/payments/payments/initiate/", {"booking": booking_id}, format="json")
        self.assertEqual(pay.status_code, 200, pay.content)
        payment_id = pay.data["payment"]["id"]
        self.assertEqual(pay.data["payment"]["amount"], "95.00")
        verify = self.client_api.post(
            f"/api/payments/payments/{payment_id}/verify/",
            {"force_success": True},
            format="json",
        )
        self.assertEqual(verify.status_code, 200, verify.content)
        self.assertEqual(verify.data["status"], "SUCCESS")
        booking = self.client_api.get(f"/api/bookings/projects/{booking_id}/")
        self.assertEqual(booking.data["status"], "CONFIRMED")