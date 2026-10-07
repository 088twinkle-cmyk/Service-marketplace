"""Authentication, JWT and role-based access control."""
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import OTPCode, User

from .factories import PASSWORD, api_client, auth_client, make_provider, make_user


class RegistrationTests(TestCase):
    def setUp(self):
        self.client = api_client()
        self.payload = {
            "username": "newcustomer",
            "email": "newcustomer@example.com",
            "password": PASSWORD,
            "role": "CLIENT",
            "phone": "9800000001",
        }

    def test_register_creates_user_with_hashed_password(self):
        response = self.client.post("/api/auth/register/", self.payload, format="json")
        self.assertEqual(response.status_code, 201, response.content)

        user = User.objects.get(username="newcustomer")
        self.assertNotEqual(user.password, PASSWORD)
        self.assertTrue(user.check_password(PASSWORD))
        self.assertFalse(user.is_otp_verified)
        self.assertIn("access", response.json())
        self.assertIn("refresh", response.json())
        self.assertEqual(response.json()["user"]["role_key"], "customer")

    def test_cannot_register_as_admin(self):
        payload = dict(self.payload, username="hacker", email="h@example.com", role="ADMIN")
        response = self.client.post("/api/auth/register/", payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(username="hacker").exists())

    def test_duplicate_email_and_username_rejected(self):
        make_user("taken", email="taken@example.com")

        response = self.client.post(
            "/api/auth/register/",
            dict(self.payload, username="taken", email="other@example.com"),
            format="json",
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.post(
            "/api/auth/register/",
            dict(self.payload, email="taken@example.com"),
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_weak_password_rejected(self):
        response = self.client.post(
            "/api/auth/register/", dict(self.payload, password="12345678"), format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_provider_registration_creates_provider_profile(self):
        response = self.client.post(
            "/api/auth/register/",
            dict(self.payload, username="newprovider", email="np@example.com", role="PROVIDER"),
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(username="newprovider")
        self.assertEqual(user.role, User.Role.FREELANCER)
        self.assertEqual(response.json()["user"]["role_key"], "provider")
        self.assertTrue(hasattr(user, "freelancer_profile"))


class LoginTests(TestCase):
    def setUp(self):
        self.client = api_client()
        self.user = make_user("loginuser", email="login@example.com")

    def test_login_with_email_returns_tokens_and_user(self):
        response = self.client.post(
            "/api/auth/login/", {"email": "login@example.com", "password": PASSWORD}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertIn("access", body)
        self.assertIn("refresh", body)
        self.assertEqual(body["user"]["email"], "login@example.com")
        self.assertEqual(body["user"]["role_key"], "customer")

    def test_login_with_wrong_password_returns_400(self):
        response = self.client.post(
            "/api/auth/login/", {"email": "login@example.com", "password": "wrong"}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.json())

    def test_suspended_account_cannot_log_in(self):
        self.user.is_active_account = False
        self.user.save(update_fields=["is_active_account"])
        response = self.client.post(
            "/api/auth/login/", {"email": "login@example.com", "password": PASSWORD}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_unverified_user_is_told_otp_is_required(self):
        self.user.is_otp_verified = False
        self.user.save(update_fields=["is_otp_verified"])
        response = self.client.post(
            "/api/auth/login/", {"email": "login@example.com", "password": PASSWORD}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["otp_required"])
        self.assertEqual(OTPCode.objects.filter(user=self.user).count(), 1)


class TokenTests(TestCase):
    def setUp(self):
        self.client = api_client()
        self.user = make_user("tokenuser")

    def test_refresh_rotates_token(self):
        login = self.client.post(
            "/api/auth/login/",
            {"email": self.user.email, "password": PASSWORD},
            format="json",
        ).json()

        refreshed = self.client.post(
            "/api/auth/token/refresh/", {"refresh": login["refresh"]}, format="json"
        )
        self.assertEqual(refreshed.status_code, 200, refreshed.content)
        self.assertIn("access", refreshed.json())

    def test_me_requires_authentication(self):
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 401)

    def test_me_returns_profile_for_authenticated_user(self):
        response = auth_client(self.user).get("/api/auth/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["username"], "tokenuser")

    def test_invalid_token_is_rejected(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Bearer not-a-real-token")
        self.assertEqual(client.get("/api/auth/me/").status_code, 401)


class OTPTests(TestCase):
    def test_otp_verify_activates_account(self):
        user = make_user("otpuser", verified_otp=False)
        client = auth_client(user)

        request_otp = client.post("/api/auth/otp/request/", {}, format="json")
        self.assertEqual(request_otp.status_code, 200, request_otp.content)
        code = request_otp.json().get("debug_otp")
        self.assertIsNotNone(code, "DEBUG builds must return the OTP for development")

        verified = client.post("/api/auth/otp/verify/", {"code": code}, format="json")
        self.assertEqual(verified.status_code, 200, verified.content)
        user.refresh_from_db()
        self.assertTrue(user.is_otp_verified)
        self.assertIn("access", verified.json())

    def test_wrong_otp_is_rejected(self):
        user = make_user("otpuser2", verified_otp=False)
        client = auth_client(user)
        client.post("/api/auth/otp/request/", {}, format="json")

        response = client.post("/api/auth/otp/verify/", {"code": "000000"}, format="json")
        self.assertEqual(response.status_code, 400)
        user.refresh_from_db()
        self.assertFalse(user.is_otp_verified)


class RoleAccessControlTests(TestCase):
    """The backend — not the UI — enforces who may call what."""

    def setUp(self):
        self.customer = make_user("cust", role=User.Role.CLIENT)
        self.provider = make_provider("prov")
        self.other_provider = make_provider("prov2")

    def test_customer_cannot_create_a_service(self):
        client = auth_client(self.customer)
        response = client.post(
            "/api/catalog/services/",
            {"title": "Sneaky", "description": "x", "starting_price": "10", "category": 1},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_provider_cannot_create_customer_booking(self):
        client = auth_client(self.provider.user)
        response = client.post(
            "/api/bookings/projects/", {"title": "x", "proposed_price": "10"}, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_customer_cannot_list_platform_users(self):
        client = auth_client(self.customer)
        self.assertEqual(client.get("/api/admin/users/").status_code, 403)

    def test_provider_cannot_review_platform_audit_logs(self):
        client = auth_client(self.provider.user)
        self.assertEqual(client.get("/api/admin/audit-logs/").status_code, 403)

    def test_admin_role_can_read_platform_stats(self):
        admin = make_user("admin1", role=User.Role.ADMIN)
        admin.is_staff = True
        admin.save(update_fields=["is_staff"])

        response = auth_client(admin).get("/api/admin/stats/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertIn("users", response.json())

    def test_user_without_verified_otp_is_blocked_from_business_endpoints(self):
        user = make_user("unverified", verified_otp=False)
        response = auth_client(user).get("/api/bookings/projects/")
        self.assertEqual(response.status_code, 403)


class PasswordResetTests(TestCase):
    def setUp(self):
        # Throttle counters live in the shared cache; start each test clean so
        # one test cannot 429 the next one.
        cache.clear()
        self.client = api_client()
        self.user = make_user("resetuser", email="reset@example.com")

    def test_forgot_password_sends_token_and_reset_works(self):
        response = self.client.post(
            "/api/auth/password/forgot/", {"email": "reset@example.com"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertIn("message", body)
        # DEBUG builds expose the values so local development does not depend
        # on an SMTP server; production leaves them out.
        self.assertIn("uid", body)
        self.assertIn("debug_token", body)

        reset = self.client.post(
            "/api/auth/password/reset/",
            {
                "email": "reset@example.com",
                "uid": body["uid"],
                "token": body["debug_token"],
                "new_password": "BrandNew!2024",
            },
            format="json",
        )
        self.assertEqual(reset.status_code, 200, reset.content)

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("BrandNew!2024"))

        login = self.client.post(
            "/api/auth/login/",
            {"email": "reset@example.com", "password": "BrandNew!2024"},
            format="json",
        )
        self.assertEqual(login.status_code, 200, login.content)

    def test_forgot_password_hides_unknown_emails(self):
        response = self.client.post(
            "/api/auth/password/forgot/", {"email": "nobody@example.com"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["message"],
            "If that email is registered, a reset link and token have been sent.",
        )
        self.assertNotIn("uid", response.json())

    def test_reset_rejects_a_bad_token(self):
        response = self.client.post(
            "/api/auth/password/reset/",
            {"uid": "MQ", "token": "not-a-real-token", "new_password": "BrandNew!2024"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.json())

    def test_reset_enforces_password_strength(self):
        self.client.post(
            "/api/auth/password/forgot/", {"email": "reset@example.com"}, format="json"
        )
        body = self.client.post(
            "/api/auth/password/forgot/", {"email": "reset@example.com"}, format="json"
        ).json()

        response = self.client.post(
            "/api/auth/password/reset/",
            {"uid": body["uid"], "token": body["debug_token"], "new_password": "12345678"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)


class UsernameAvailabilityTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_reports_taken_and_free_usernames(self):
        make_user("takenname")
        client = api_client()

        taken = client.post(
            "/api/auth/username-available/", {"username": "takenname"}, format="json"
        )
        free = client.post(
            "/api/auth/username-available/", {"username": "freename"}, format="json"
        )

        self.assertFalse(taken.json()["available"])
        self.assertTrue(free.json()["available"])
