"""WhatsApp OTP verification — the shared customer/provider registration flow.

Every delivery in here goes through the clearly-separated development
provider (or a mocked Cloud provider), so **no test ever contacts the real
WhatsApp/Meta API**.
"""
from datetime import timedelta
from unittest import mock

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.models import OTPCode, PendingRegistration, User
from whatsapp import (
    InvalidPhoneNumberError,
    normalize_phone_number,
)
from whatsapp.phone import mask_phone_number
from whatsapp.providers.cloud import WhatsAppCloudProvider
from whatsapp.providers.development import DevelopmentWhatsAppProvider
from whatsapp.service import build_whatsapp_provider, get_whatsapp_otp_service

from .factories import PASSWORD, api_client, auth_client, make_user

DEV = override_settings(WHATSAPP_PROVIDER="development")


# ============================================================
# Phone normalisation
# ============================================================

class PhoneNormalizationTests(TestCase):
    def test_nepal_numbers_normalise_to_e164(self):
        self.assertEqual(normalize_phone_number("9843677123"), "+9779843677123")
        self.assertEqual(normalize_phone_number("98-4367-7123"), "+9779843677123")
        self.assertEqual(normalize_phone_number("+977 9843677123"), "+9779843677123")
        self.assertEqual(normalize_phone_number("009779843677123"), "+9779843677123")
        self.assertEqual(normalize_phone_number("9779843677123"), "+9779843677123")

    def test_international_numbers_are_kept(self):
        self.assertEqual(normalize_phone_number("+14155552671"), "+14155552671")

    def test_invalid_numbers_are_rejected(self):
        for bad in ["", "12345", "not-a-phone", "12345678901234567890"]:
            with self.assertRaises(InvalidPhoneNumberError):
                normalize_phone_number(bad)

    def test_mask_hides_most_digits(self):
        masked = mask_phone_number("+9779843677123")
        self.assertNotIn("984367", masked)
        self.assertTrue(masked.endswith("123"))


# ============================================================
# Provider layer (mocked — no real HTTP)
# ============================================================

def make_cloud_provider(**overrides):
    params = dict(
        base_url="https://graph.facebook.com",
        access_token="test-token",
        phone_number_id="123456789",
        template_name="otp_verification",
        template_language="en_US",
        business_account_id="WBA-1",
        api_version="v21.0",
    )
    params.update(overrides)
    return WhatsAppCloudProvider(**params)


class WhatsAppCloudProviderTests(TestCase):
    def test_provider_requires_credentials(self):
        provider = make_cloud_provider(access_token="", template_name="")
        self.assertFalse(provider.is_configured)

    def test_send_otp_builds_the_template_message_request(self):
        provider = make_cloud_provider()

        with mock.patch("whatsapp.providers.cloud.requests.post") as post:
            post.return_value.status_code = 200
            post.return_value.json.return_value = {
                "messages": [{"id": "wamid.TEST"}]
            }

            result = provider.send_otp("+9779843677123", "482731")

        self.assertTrue(result.delivered)
        self.assertFalse(result.simulated)
        self.assertEqual(result.provider, "cloud")
        self.assertEqual(result.provider_message_id, "wamid.TEST")

        # The request must target the Cloud API messages endpoint with the
        # configured template — and nothing else.
        args, kwargs = post.call_args
        self.assertEqual(
            args[0],
            "https://graph.facebook.com/v21.0/123456789/messages",
        )
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer test-token")
        body = kwargs["json"]
        self.assertEqual(body["to"], "+9779843677123")
        self.assertEqual(body["type"], "template")
        self.assertEqual(body["template"]["name"], "otp_verification")
        self.assertEqual(body["template"]["language"]["code"], "en_US")
        self.assertEqual(
            body["template"]["components"][0]["parameters"][0]["text"], "482731"
        )

    def test_send_otp_raises_sanitised_error_on_provider_failure(self):
        provider = make_cloud_provider()

        with mock.patch("whatsapp.providers.cloud.requests.post") as post:
            post.return_value.status_code = 400
            post.return_value.json.return_value = {
                "error": {"message": "Invalid phone number id", "code": 100}
            }

            from whatsapp import WhatsAppDeliveryError

            with self.assertRaises(WhatsAppDeliveryError) as ctx:
                provider.send_otp("+9779843677123", "482731")

        # The raw provider error never crosses the boundary.
        self.assertNotIn("Invalid phone number id", str(ctx.exception))

    def test_send_otp_raises_sanitised_error_on_network_failure(self):
        import requests

        provider = make_cloud_provider()

        with mock.patch(
            "whatsapp.providers.cloud.requests.post",
            side_effect=requests.ConnectionError("boom"),
        ):
            from whatsapp import WhatsAppDeliveryError

            with self.assertRaises(WhatsAppDeliveryError):
                provider.send_otp("+9779843677123", "482731")

    def test_unconfigured_provider_refuses_to_send(self):
        from whatsapp import WhatsAppNotConfiguredError

        provider = make_cloud_provider(access_token="")
        with self.assertRaises(WhatsAppNotConfiguredError):
            provider.send_otp("+9779843677123", "482731")


class ProviderSelectionTests(TestCase):
    def test_disabled_and_not_debug_means_no_provider(self):
        with override_settings(
            WHATSAPP_OTP_ENABLED=False, WHATSAPP_PROVIDER="auto", DEBUG=False
        ):
            self.assertIsNone(build_whatsapp_provider())

    def test_auto_with_credentials_uses_cloud(self):
        with override_settings(
            WHATSAPP_OTP_ENABLED=True,
            WHATSAPP_PROVIDER="auto",
            DEBUG=False,
            WHATSAPP_ACCESS_TOKEN="tok",
            WHATSAPP_PHONE_NUMBER_ID="pid",
            WHATSAPP_OTP_TEMPLATE_NAME="otp",
        ):
            provider = build_whatsapp_provider()
            self.assertIsInstance(provider, WhatsAppCloudProvider)
            self.assertTrue(provider.is_configured)

    def test_auto_enabled_without_credentials_is_not_configured_in_production(self):
        with override_settings(
            WHATSAPP_OTP_ENABLED=True,
            WHATSAPP_PROVIDER="auto",
            DEBUG=False,
            WHATSAPP_ACCESS_TOKEN="",
            WHATSAPP_PHONE_NUMBER_ID="",
            WHATSAPP_OTP_TEMPLATE_NAME="",
        ):
            self.assertIsNone(build_whatsapp_provider())

    def test_forced_cloud_provider_stays_unconfigured_without_credentials(self):
        with override_settings(
            WHATSAPP_PROVIDER="cloud",
            WHATSAPP_ACCESS_TOKEN="",
            WHATSAPP_PHONE_NUMBER_ID="",
            WHATSAPP_OTP_TEMPLATE_NAME="",
        ):
            service = get_whatsapp_otp_service()
            self.assertFalse(service.is_configured)

    def test_development_provider_is_always_simulated(self):
        with override_settings(WHATSAPP_PROVIDER="development", DEBUG=False):
            service = get_whatsapp_otp_service()
            self.assertTrue(service.is_configured)
            result = service.send_otp("+9779843677123", "482731")
            self.assertFalse(result.delivered)
            self.assertTrue(result.simulated)


# ============================================================
# Shared registration flow
# ============================================================

class WhatsAppRegistrationFlowTests(TestCase):
    """Customer and provider registration share ONE OTP flow."""

    def setUp(self):
        cache.clear()
        self.client = api_client()

    def register(self, **overrides):
        payload = {
            "username": "flowuser",
            "email": "flow@example.com",
            "password": PASSWORD,
            "role": "CUSTOMER",
            "phone": "9843677123",
        }
        payload.update(overrides)
        return self.client.post("/api/auth/register/", payload, format="json")

    def verify(self, registration_id, otp):
        return self.client.post(
            "/api/auth/whatsapp/verify-otp/",
            {"registration_id": registration_id, "otp": otp},
            format="json",
        )

    @DEV
    def test_customer_full_flow(self):
        response = self.register(role="CUSTOMER")
        self.assertEqual(response.status_code, 202, response.content)
        body = response.json()
        self.assertEqual(body["phone_number"], "+9779843677123")
        self.assertEqual(body["role_key"], "customer")

        verified = self.verify(body["registration_id"], body["debug_otp"])
        self.assertEqual(verified.status_code, 200, verified.content)

        user = User.objects.get(email="flow@example.com")
        self.assertEqual(user.role, User.Role.CLIENT)
        self.assertTrue(user.is_otp_verified)
        # Authenticated session (JWT) straight after verification.
        self.assertIn("access", verified.json())

        # Login works with the chosen password.
        login = self.client.post(
            "/api/auth/login/",
            {"email": "flow@example.com", "password": PASSWORD},
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        self.assertFalse(login.json().get("otp_required", False))

    @DEV
    def test_provider_full_flow(self):
        response = self.register(
            role="PROVIDER", username="flowprovider", email="flowp@example.com"
        )
        self.assertEqual(response.status_code, 202, response.content)
        body = response.json()
        self.assertEqual(body["role_key"], "provider")

        verified = self.verify(body["registration_id"], body["debug_otp"])
        self.assertEqual(verified.status_code, 200, verified.content)

        user = User.objects.get(email="flowp@example.com")
        self.assertEqual(user.role, User.Role.FREELANCER)
        self.assertTrue(hasattr(user, "freelancer_profile"))
        # Phone verification does NOT replace KYC.
        self.assertFalse(hasattr(user.freelancer_profile, "kyc"))

    @DEV
    def test_role_lowercase_aliases_accepted_and_preserved(self):
        response = self.register(role="provider")
        self.assertEqual(response.status_code, 202)
        body = response.json()
        self.assertEqual(body["role"], User.Role.FREELANCER)

        # The verify request cannot change the role.
        tampered = self.client.post(
            "/api/auth/whatsapp/verify-otp/",
            {
                "registration_id": body["registration_id"],
                "otp": body["debug_otp"],
                "role": "ADMIN",
            },
            format="json",
        )
        self.assertEqual(tampered.status_code, 200, tampered.content)
        user = User.objects.get(email="flow@example.com")
        self.assertEqual(user.role, User.Role.FREELANCER)

    @DEV
    def test_no_duplicate_account_from_repeated_submissions(self):
        first = self.register()
        self.assertEqual(first.status_code, 202)
        registration_id = first.json()["registration_id"]

        # Submit the same form again (double click / refresh + resubmit).
        second = self.register()
        self.assertEqual(second.status_code, 202, second.content)

        # Exactly ONE pending registration, and a NEW registration_id — the
        # old one is invalidated.
        self.assertEqual(PendingRegistration.objects.count(), 1)
        self.assertNotEqual(registration_id, second.json()["registration_id"])

        # Resubmitting inside the cooldown keeps the earlier code valid.
        self.assertTrue(second.json().get("otp_already_sent"))

        # Verifying with the first (rotated-out) id must fail…
        stale = self.verify(registration_id, "123456")
        self.assertEqual(stale.status_code, 400)
        # …and with the current one succeeds. Still one account.
        good = self.verify(
            second.json()["registration_id"], second.json().get("debug_otp")
            or first.json()["debug_otp"]
        )
        self.assertEqual(good.status_code, 200, good.content)
        self.assertEqual(User.objects.filter(email="flow@example.com").count(), 1)

    @DEV
    def test_register_during_cooldown_keeps_previous_code_valid(self):
        first = self.register()
        code = first.json()["debug_otp"]
        second = self.register(username="flowuser2")
        self.assertEqual(second.status_code, 202)
        self.assertTrue(second.json()["otp_already_sent"])

        verified = self.verify(second.json()["registration_id"], code)
        self.assertEqual(verified.status_code, 200, verified.content)
        user = User.objects.get(email="flow@example.com")
        self.assertEqual(user.username, "flowuser2")

    @DEV
    def test_two_pendings_sharing_a_phone_cannot_both_become_accounts(self):
        first = self.register(username="firstuser", email="first@example.com")
        second = self.register(
            username="seconduser",
            email="second@example.com",
            phone="9843677123",  # same WhatsApp number, different email
        )
        self.assertEqual(first.status_code, 202)
        self.assertEqual(second.status_code, 202)

        # The first verification claims the phone number…
        verified = self.verify(
            second.json()["registration_id"], second.json()["debug_otp"]
        )
        self.assertEqual(verified.status_code, 200, verified.content)

        # …so the second pending can no longer create an account.
        blocked = self.verify(
            first.json()["registration_id"], first.json()["debug_otp"]
        )
        self.assertEqual(blocked.status_code, 400, blocked.content)
        self.assertEqual(blocked.json()["code"], "phone_taken")
        self.assertEqual(
            User.objects.filter(phone="+9779843677123").count(), 1
        )

    @DEV
    def test_refresh_recovery_via_send_otp_by_phone(self):
        response = self.register()
        registration_id = response.json()["registration_id"]

        # The browser was refreshed and lost the registration id: the user
        # re-enters their WhatsApp number.
        resumed = self.client.post(
            "/api/auth/whatsapp/send-otp/",
            {"phone_number": "+977 9843677123"},
            format="json",
        )
        # Cooldown is active → 429 with retry_after, not a silent success.
        self.assertEqual(resumed.status_code, 429)
        self.assertEqual(resumed.json()["code"], "otp_cooldown")

        # After the cooldown the same call resumes the flow.
        pending = PendingRegistration.objects.get(
            registration_token=registration_id
        )
        pending.otp_sent_at -= timedelta(seconds=60)
        pending.save(update_fields=["otp_sent_at"])

        resumed = self.client.post(
            "/api/auth/whatsapp/send-otp/",
            {"phone_number": "9843677123"},
            format="json",
        )
        self.assertEqual(resumed.status_code, 202, resumed.content)
        body = resumed.json()
        self.assertEqual(body["registration_id"], registration_id)
        self.assertEqual(body["phone_number"], "+9779843677123")

        verified = self.verify(registration_id, body["debug_otp"])
        self.assertEqual(verified.status_code, 200, verified.content)

    @DEV
    def test_send_otp_is_enumeration_safe(self):
        response = self.client.post(
            "/api/auth/whatsapp/send-otp/",
            {"phone_number": "+9779800999999"},
            format="json",
        )
        self.assertEqual(response.status_code, 202)
        body = response.json()
        self.assertNotIn("registration_id", body)
        self.assertIn("If a WhatsApp verification is pending", body["message"])


# ============================================================
# OTP security: expiry, attempts, single use, cooldown, limits
# ============================================================

class OTPSecurityTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = api_client()
        with DEV:
            response = self.client.post(
                "/api/auth/register/",
                {
                    "username": "secureuser",
                    "email": "secure@example.com",
                    "password": PASSWORD,
                    "role": "CUSTOMER",
                    "phone": "9843677124",
                },
                format="json",
            )
        self.assertEqual(response.status_code, 202, response.content)
        self.body = response.json()
        self.registration_id = self.body["registration_id"]
        self.pending = PendingRegistration.objects.get(
            registration_token=self.registration_id
        )

    def verify(self, otp, registration_id=None):
        return self.client.post(
            "/api/auth/whatsapp/verify-otp/",
            {
                "registration_id": registration_id or self.registration_id,
                "otp": otp,
            },
            format="json",
        )

    def resend(self):
        return self.client.post(
            "/api/auth/otp/resend/",
            {"registration_id": self.registration_id},
            format="json",
        )

    def test_incorrect_otp_counts_attempts_then_locks(self):
        # OTP_MAX_ATTEMPTS wrong guesses are reported individually…
        for i in range(5):
            response = self.verify("000000")
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json()["code"], "otp_invalid")
            self.pending.refresh_from_db()
            self.assertEqual(self.pending.otp_attempts, i + 1)

        # …after which even the CORRECT code is rejected.
        response = self.verify(self.body["debug_otp"])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "otp_attempts_exceeded")
        self.assertFalse(User.objects.filter(email="secure@example.com").exists())

    @DEV
    def test_resend_resets_attempts_and_invalidates_previous_code(self):
        old_code = self.body["debug_otp"]

        for _ in range(4):
            self.verify("000000")

        # Cooldown blocks an immediate resend.
        blocked = self.resend()
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.json()["code"], "otp_cooldown")

        self.pending.otp_sent_at -= timedelta(seconds=60)
        self.pending.save(update_fields=["otp_sent_at"])

        resent = self.resend()
        self.assertEqual(resent.status_code, 202, resent.content)
        new_code = resent.json()["debug_otp"]

        # The previous OTP is invalidated by the resend.
        stale = self.verify(old_code)
        self.assertEqual(stale.status_code, 400)
        # …and the attempt counter was reset for the new OTP.
        good = self.verify(new_code)
        self.assertEqual(good.status_code, 200, good.content)
        self.assertTrue(User.objects.filter(email="secure@example.com").exists())

    def test_expired_otp_is_rejected(self):
        self.pending.otp_expires_at = timezone.now() - timedelta(seconds=1)
        self.pending.save(update_fields=["otp_expires_at"])

        response = self.verify(self.body["debug_otp"])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "otp_expired")

    def test_used_otp_cannot_verify_twice(self):
        first = self.verify(self.body["debug_otp"])
        self.assertEqual(first.status_code, 200, first.content)

        again = self.verify(self.body["debug_otp"])
        self.assertEqual(again.status_code, 400)
        self.assertIn("expired", again.json()["code"])

        # Still exactly one account.
        self.assertEqual(User.objects.filter(email="secure@example.com").count(), 1)

    def test_expired_registration_requires_new_registration(self):
        self.pending.expires_at = timezone.now() - timedelta(seconds=1)
        self.pending.save(update_fields=["expires_at"])

        response = self.verify(self.body["debug_otp"])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "registration_expired")

    @DEV
    def test_max_otp_requests_per_registration(self):
        # The registration already consumed one request.
        self.pending.otp_sent_at -= timedelta(seconds=300)
        self.pending.save(update_fields=["otp_sent_at"])

        # Requests 2..5 are allowed.  Each request comes from a different IP
        # so the per-IP scope throttle does not interfere — this tests the
        # per-registration OTP budget.
        for expected_count in range(2, 6):
            response = self.client.post(
                "/api/auth/otp/resend/",
                {"registration_id": self.registration_id},
                format="json",
                REMOTE_ADDR=f"10.9.0.{expected_count}",
            )
            self.assertEqual(response.status_code, 202, response.content)
            self.pending.refresh_from_db()
            self.assertEqual(self.pending.otp_request_count, expected_count)
            self.pending.otp_sent_at -= timedelta(seconds=300)
            self.pending.save(update_fields=["otp_sent_at"])

        # …the sixth is blocked.
        blocked = self.client.post(
            "/api/auth/otp/resend/",
            {"registration_id": self.registration_id},
            format="json",
            REMOTE_ADDR="10.9.0.99",
        )
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.json()["code"], "otp_rate_limited")

    def test_otp_hash_never_stored_in_plaintext(self):
        self.pending.refresh_from_db()
        self.assertNotEqual(self.pending.otp_code_hash, self.body["debug_otp"])
        self.assertEqual(len(self.pending.otp_code_hash), 64)  # sha256 hex
        self.assertNotIn(self.body["debug_otp"], str(self.pending.otp_code_hash))


class OTPNotExposedInProductionTests(TestCase):
    @DEV
    @override_settings(OTP_DEBUG_RETURN=False)
    def test_debug_otp_absent_when_not_debug(self):
        response = api_client().post(
            "/api/auth/register/",
            {
                "username": "nodebug",
                "email": "nodebug@example.com",
                "password": PASSWORD,
                "role": "CUSTOMER",
                "phone": "9843677125",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 202, response.content)
        self.assertNotIn("debug_otp", response.json())


# ============================================================
# Provider availability states
# ============================================================

class WhatsAppConfigurationStatesTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = api_client()
        self.payload = {
            "username": "configuser",
            "email": "config@example.com",
            "password": PASSWORD,
            "role": "CUSTOMER",
            "phone": "9843677126",
        }

    def test_whatsapp_not_configured_is_reported_clearly(self):
        # Default settings: WHATSAPP_OTP_ENABLED=false and not DEBUG at test
        # runtime → no provider. The API must say so instead of pretending.
        response = self.client.post("/api/auth/register/", self.payload, format="json")
        self.assertEqual(response.status_code, 503, response.content)
        body = response.json()
        self.assertEqual(body["code"], "whatsapp_unavailable")
        self.assertIn("not configured", body["error"])
        # Nothing was persisted — no half-finished registration.
        self.assertEqual(PendingRegistration.objects.count(), 0)

    @override_settings(
        WHATSAPP_OTP_ENABLED=True,
        WHATSAPP_PROVIDER="cloud",
        WHATSAPP_ACCESS_TOKEN="tok",
        WHATSAPP_PHONE_NUMBER_ID="pid",
        WHATSAPP_OTP_TEMPLATE_NAME="otp",
    )
    def test_provider_failure_maps_to_sanitised_503(self):
        with mock.patch(
            "whatsapp.providers.cloud.requests.post",
            side_effect=RuntimeError("socket exploded"),
        ) as post:
            # requests.RequestException is what the provider catches; raise
            # one to simulate a transport failure.
            import requests

            post.side_effect = requests.ConnectionError("socket exploded")
            response = self.client.post(
                "/api/auth/register/", self.payload, format="json"
            )

        self.assertEqual(response.status_code, 503, response.content)
        body = response.json()
        self.assertEqual(body["code"], "whatsapp_unavailable")
        # No raw provider error text leaks to the client.
        self.assertNotIn("socket exploded", str(body))

        # The pending registration survives (retryable) but no OTP was
        # issued and no account exists.
        pending = PendingRegistration.objects.get(email="config@example.com")
        self.assertEqual(pending.otp_code_hash, "")
        self.assertFalse(User.objects.filter(email="config@example.com").exists())


# ============================================================
# Login-flow OTP (existing unverified users)
# ============================================================

class LoginOTPFlowTests(TestCase):
    def setUp(self):
        cache.clear()

    @DEV
    def test_only_one_active_code_per_user(self):
        user = make_user("logotp", verified_otp=False)
        client = auth_client(user)

        first = client.post("/api/auth/otp/request/", {}, format="json")
        self.assertEqual(first.status_code, 200)
        user.refresh_from_db()

        # After the cooldown, a second request retires the first code.
        otp = OTPCode.objects.get(user=user)
        otp.created_at = timezone.now() - timedelta(seconds=60)
        otp.save(update_fields=["created_at"])

        second = client.post("/api/auth/otp/request/", {}, format="json")
        self.assertEqual(second.status_code, 200)

        first_code = first.json()["debug_otp"]
        stale = client.post(
            "/api/auth/otp/verify/", {"code": first_code}, format="json"
        )
        self.assertEqual(stale.status_code, 400)

        fresh = client.post(
            "/api/auth/otp/verify/",
            {"code": second.json()["debug_otp"]},
            format="json",
        )
        self.assertEqual(fresh.status_code, 200, fresh.content)

    @DEV
    def test_too_many_attempts_locks_login_otp(self):
        user = make_user("logotp2", verified_otp=False)
        client = auth_client(user)
        client.post("/api/auth/otp/request/", {}, format="json")

        for _ in range(5):
            response = client.post(
                "/api/auth/otp/verify/", {"code": "000000"}, format="json"
            )
            self.assertEqual(response.status_code, 400)

        response = client.post(
            "/api/auth/otp/verify/", {"code": "000000"}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "otp_attempts_exceeded")


# ============================================================
# Throttling
# ============================================================

class OTPThrottleTests(TestCase):
    def setUp(self):
        cache.clear()

    @DEV
    def test_resend_endpoint_is_rate_limited(self):
        client = api_client()
        response = client.post(
            "/api/auth/register/",
            {
                "username": "throttleuser",
                "email": "throttle@example.com",
                "password": PASSWORD,
                "role": "CUSTOMER",
                "phone": "9843677127",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 202, response.content)
        registration_id = response.json()["registration_id"]

        pending = PendingRegistration.objects.get(registration_token=registration_id)
        pending.otp_sent_at -= timedelta(seconds=300)
        pending.save(update_fields=["otp_sent_at"])

        # The "otp" scope allows 5/min; the register call already used one.
        for _ in range(4):
            resent = client.post(
                "/api/auth/otp/resend/",
                {"registration_id": registration_id},
                format="json",
            )
            self.assertEqual(resent.status_code, 202, resent.content)
            pending.refresh_from_db()
            pending.otp_sent_at -= timedelta(seconds=300)
            pending.save(update_fields=["otp_sent_at"])

        limited = client.post(
            "/api/auth/otp/resend/",
            {"registration_id": registration_id},
            format="json",
        )
        self.assertEqual(limited.status_code, 429, limited.content)


# ============================================================
# Development provider sanity
# ============================================================

class DevelopmentProviderTests(TestCase):
    def test_development_provider_is_simulated_and_configured(self):
        provider = DevelopmentWhatsAppProvider()
        self.assertTrue(provider.is_configured)
        result = provider.send_otp("+9779843677123", "123456")
        self.assertTrue(result.simulated)
        self.assertFalse(result.delivered)
