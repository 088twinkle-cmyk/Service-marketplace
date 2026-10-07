"""Provider onboarding, KYC lifecycle and the public provider directory."""
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone

from accounts.models import FreelancerProfile, KYCVerification, User
from notifications.models import Notification

from .factories import (
    api_client,
    auth_client,
    image_upload,
    make_category,
    make_provider,
    make_service,
    make_user,
    png_bytes,
)


class ProviderOnboardingTests(TestCase):
    def setUp(self):
        self.user = make_user("onboarder", role=User.Role.FREELANCER)
        self.client = auth_client(self.user)

    def test_profile_is_created_automatically(self):
        response = self.client.get("/api/providers/profile/")
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertFalse(body["profile_completed"])
        self.assertEqual(body["kyc_status"], "not_submitted")
        self.assertFalse(body["is_verified"])

    def test_onboarding_saves_details_and_marks_profile_complete(self):
        response = self.client.post(
            "/api/providers/profile/",
            {
                "service_type": "Hair stylist",
                "phone": "9812345678",
                "location": "Kathmandu",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["service_type"], "Hair stylist")
        self.assertTrue(body["profile_completed"])

        self.user.refresh_from_db()
        self.assertEqual(self.user.phone, "9812345678")

    def test_profile_endpoint_is_provider_only(self):
        customer = make_user("custxx", role=User.Role.CLIENT)
        response = auth_client(customer).get("/api/providers/profile/")
        self.assertEqual(response.status_code, 403)


class KYCTests(TestCase):
    def setUp(self):
        self.user = make_user("kycuser", role=User.Role.FREELANCER)
        self.client = auth_client(self.user)
        self.admin = make_user("kycadmin", role=User.Role.ADMIN)
        self.admin.is_staff = True
        self.admin.save(update_fields=["is_staff"])

    def _submit(self, **overrides):
        payload = {
            "legal_name": "Kyc User",
            "document_type": "citizenship",
            "document_number": "12-345-678",
            "document_front": image_upload("front.png"),
        }
        payload.update(overrides)
        payload = {k: v for k, v in payload.items() if v is not None}
        return self.client.post("/api/providers/kyc/", payload, format="multipart")

    def test_submission_creates_pending_kyc(self):
        response = self._submit()
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["kyc_status"], "pending")

        kyc = KYCVerification.objects.get()
        self.assertEqual(kyc.status, KYCVerification.Status.PENDING)

    def test_document_is_required(self):
        response = self._submit(document_front=None)
        self.assertEqual(response.status_code, 400)

    def test_executable_upload_is_rejected(self):
        bad = SimpleUploadedFile(
            "payload.exe", b"MZ\x90\x00binary", content_type="application/octet-stream"
        )
        response = self._submit(document_front=bad)
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.json())

    def test_admins_are_notified_of_a_new_submission(self):
        self._submit()
        self.assertTrue(
            Notification.objects.filter(user=self.admin, event_type="kyc_submitted").exists()
        )

    def test_admin_can_approve_and_provider_becomes_verified(self):
        self._submit()
        kyc = KYCVerification.objects.get()

        response = auth_client(self.admin).post(
            f"/api/auth/kyc/{kyc.pk}/review/", {"status": "APPROVED"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)

        kyc.refresh_from_db()
        self.assertEqual(kyc.status, KYCVerification.Status.APPROVED)
        self.assertEqual(kyc.reviewed_by, self.admin)

        profile = FreelancerProfile.objects.get(user=self.user)
        self.assertTrue(profile.is_verified)

    def test_admin_rejection_requires_and_stores_a_reason(self):
        self._submit()
        kyc = KYCVerification.objects.get()
        admin_client = auth_client(self.admin)

        missing_reason = admin_client.post(
            f"/api/auth/kyc/{kyc.pk}/review/", {"status": "REJECTED"}, format="json"
        )
        self.assertEqual(missing_reason.status_code, 400)

        rejected = admin_client.post(
            f"/api/auth/kyc/{kyc.pk}/review/",
            {"status": "REJECTED", "rejection_reason": "Photo is unreadable."},
            format="json",
        )
        self.assertEqual(rejected.status_code, 200, rejected.content)

        kyc.refresh_from_db()
        self.assertEqual(kyc.status, KYCVerification.Status.REJECTED)
        self.assertEqual(kyc.rejection_reason, "Photo is unreadable.")

    def test_rejected_provider_sees_reason_and_can_resubmit(self):
        self._submit()
        kyc = KYCVerification.objects.get()
        auth_client(self.admin).post(
            f"/api/auth/kyc/{kyc.pk}/review/",
            {"status": "REJECTED", "rejection_reason": "Blurry"},
            format="json",
        )

        status_response = self.client.get("/api/providers/kyc/")
        self.assertEqual(status_response.json()["kyc_status"], "rejected")
        self.assertEqual(status_response.json()["rejection_reason"], "Blurry")

        resubmit = self._submit(legal_name="Corrected Name")
        self.assertEqual(resubmit.status_code, 200, resubmit.content)
        self.assertEqual(resubmit.json()["kyc_status"], "pending")

        kyc.refresh_from_db()
        self.assertEqual(kyc.rejection_reason, "")
        self.assertEqual(kyc.legal_name, "Corrected Name")

    def test_approved_kyc_cannot_be_changed_by_provider(self):
        self._submit()
        kyc = KYCVerification.objects.get()
        auth_client(self.admin).post(
            f"/api/auth/kyc/{kyc.pk}/review/", {"status": "APPROVED"}, format="json"
        )
        response = self._submit(legal_name="Changed")
        self.assertEqual(response.status_code, 400)


class KYCPrivacyTests(TestCase):
    def test_public_provider_payload_never_exposes_documents(self):
        profile = make_provider("privacy_provider")
        make_service(profile)

        response = api_client().get(f"/api/providers/{profile.pk}/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        serialized = str(body)

        self.assertNotIn("document_number", serialized)
        self.assertNotIn("document_front", serialized)
        self.assertNotIn("legal_name", serialized)
        self.assertIn("is_verified", body)
        self.assertTrue(body["is_verified"])

    def test_unauthenticated_customer_cannot_read_another_kyc_record(self):
        profile = make_provider("kyc_owner")
        customer = make_user("nosy", role=User.Role.CLIENT)

        response = auth_client(customer).get("/api/auth/kyc/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 0)

        kyc = KYCVerification.objects.get(freelancer=profile)
        detail = auth_client(customer).get(f"/api/auth/kyc/{kyc.pk}/")
        self.assertEqual(detail.status_code, 404)


class ProviderDirectoryTests(TestCase):
    def setUp(self):
        self.category = make_category()
        self.kathmandu = make_provider("prov_ktm", city="Kathmandu")
        self.pokhara = make_provider("prov_pkr", city="Pokhara")
        make_service(
            self.kathmandu,
            title="Bridal hair styling",
            category=self.category,
            location="Kathmandu",
        )
        make_service(
            self.pokhara,
            title="Deep tissue massage",
            category=self.category,
            location="Pokhara",
            latitude="28.209600",
            longitude="83.985600",
        )
        self.client = api_client()

    def test_list_returns_only_verified_providers_when_filtered(self):
        unverified = make_provider("prov_new", approved=False)
        response = self.client.get("/api/providers/?verified=1")
        ids = [row["id"] for row in response.json()["results"]]
        self.assertIn(self.kathmandu.pk, ids)
        self.assertNotIn(unverified.pk, ids)

    def test_search_by_service_title(self):
        response = self.client.get("/api/providers/?q=bridal")
        ids = [row["id"] for row in response.json()["results"]]
        self.assertEqual(ids, [self.kathmandu.pk])

    def test_filter_by_city(self):
        response = self.client.get("/api/providers/?city=Pokhara")
        ids = [row["id"] for row in response.json()["results"]]
        self.assertEqual(ids, [self.pokhara.pk])

    def test_filter_by_category_slug(self):
        response = self.client.get(f"/api/providers/?category={self.category.slug}")
        ids = {row["id"] for row in response.json()["results"]}
        self.assertEqual(ids, {self.kathmandu.pk, self.pokhara.pk})

    def test_directory_is_paginated(self):
        response = self.client.get("/api/providers/")
        self.assertIn("count", response.json())
        self.assertIn("results", response.json())
