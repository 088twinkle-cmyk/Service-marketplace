"""Shared OTP lifecycle service for the accounts app.

One service powers BOTH verification flows:

* **Registration** — OTPs attached to a :class:`accounts.models.PendingRegistration`
  (the permanent account is only created after the phone number is verified).
* **Login / re-verification** — OTPs attached to an existing user through the
  existing :class:`accounts.models.OTPCode` model.

The service owns the whole OTP lifecycle: cryptographically secure
generation, hashed storage, expiration, attempt limits, resend cooldowns,
request limits, single-use semantics and delivery through the
provider-agnostic :class:`whatsapp.WhatsAppOTPService`.

Views/serializers never talk to a WhatsApp provider directly.
"""
import hashlib
import hmac
import secrets

from dataclasses import dataclass

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.db import IntegrityError, transaction
from django.utils import timezone

from datetime import timedelta

from whatsapp import (
    DeliveryResult,
    WhatsAppError,
    WhatsAppNotConfiguredError,
    get_whatsapp_otp_service,
    phone_e164,
)

from .models import OTPCode, PendingRegistration, User
from .roles import normalize_role


# ============================================================
# Errors — every one maps to a specific, user-safe API state.
# ============================================================

class OTPServiceError(Exception):
    """Base error carrying an HTTP status and a machine-readable code."""

    status_code = 400
    code = "otp_error"
    message = "Verification failed."

    def __init__(self, message: str | None = None, **extra):
        self.extra = extra
        if message:
            self.message = message
        super().__init__(self.message)


class OTPCooldownError(OTPServiceError):
    """Resend cooldown still active."""

    status_code = 429
    code = "otp_cooldown"
    message = "Please wait before requesting another code."

    def __init__(self, retry_after_seconds: int, message: str | None = None):
        self.retry_after_seconds = max(1, int(retry_after_seconds))
        super().__init__(message or self.message)
        self.extra = {"retry_after": self.retry_after_seconds}


class OTPRequestLimitError(OTPServiceError):
    """Too many OTP requests for this registration/account."""

    status_code = 429
    code = "otp_rate_limited"
    message = "Too many code requests. Please try again later."


class OTPAttemptsExceededError(OTPServiceError):
    status_code = 400
    code = "otp_attempts_exceeded"
    message = "Too many incorrect attempts. Please request a new code."


class OTPInvalidError(OTPServiceError):
    status_code = 400
    code = "otp_invalid"
    message = "That code is incorrect. Please check and try again."


class OTPExpiredError(OTPServiceError):
    status_code = 400
    code = "otp_expired"
    message = "That code has expired. Please request a new one."


class RegistrationExpiredError(OTPServiceError):
    status_code = 400
    code = "registration_expired"
    message = "Your verification session has expired. Please register again."


class WhatsAppNotConfiguredServiceError(OTPServiceError):
    """WhatsApp delivery is disabled or Meta credentials are missing.

    Deliberately distinct from ``whatsapp_unavailable`` (provider outage):
    this error means the server is missing the Meta configuration
    (``WHATSAPP_*`` values in ``backend/.env``) and no OTP can be delivered
    until an administrator fills them in.
    """

    status_code = 503
    code = "whatsapp_not_configured"
    message = (
        "WhatsApp verification is not configured on this server yet. "
        "Set the WHATSAPP_* environment variables to enable it."
    )


class WhatsAppUnavailableError(OTPServiceError):
    """WhatsApp delivery is configured but currently failing (provider side)."""

    status_code = 503
    code = "whatsapp_unavailable"
    message = "WhatsApp verification is unavailable right now. Please try again later."


# ============================================================
# Primitives
# ============================================================

def generate_otp() -> str:
    """Cryptographically secure 6-digit OTP (``000000``–``999999``)."""
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(code: str) -> str:
    """Keyed SHA-256 hash — a stored OTP can never be read back out."""
    return hmac.new(
        settings.SECRET_KEY.encode(),
        str(code).encode(),
        hashlib.sha256,
    ).hexdigest()


def _matches(stored_hash: str, code: str) -> bool:
    return bool(stored_hash) and hmac.compare_digest(stored_hash, hash_otp(code))


@dataclass(frozen=True)
class OTPPolicy:
    expiry_minutes: int
    resend_cooldown_seconds: int
    max_attempts: int
    max_requests: int


def otp_policy() -> OTPPolicy:
    return OTPPolicy(
        expiry_minutes=int(settings.OTP_EXPIRY_MINUTES),
        resend_cooldown_seconds=int(settings.OTP_RESEND_COOLDOWN_SECONDS),
        max_attempts=int(settings.OTP_MAX_ATTEMPTS),
        max_requests=int(settings.OTP_MAX_REQUESTS),
    )


def pending_registration_ttl() -> timedelta:
    return timedelta(minutes=int(settings.PENDING_REGISTRATION_TTL_MINUTES))


NOT_CONFIGURED_MESSAGE = (
    "WhatsApp verification is not configured on this server yet. "
    "Set the WHATSAPP_* environment variables to enable it."
)


def _deliver(phone_number: str, code: str) -> DeliveryResult:
    """Send the OTP over WhatsApp, mapping provider errors to API states."""
    try:
        return get_whatsapp_otp_service().send_otp(phone_number, code)
    except WhatsAppNotConfiguredError as exc:
        raise WhatsAppNotConfiguredServiceError(NOT_CONFIGURED_MESSAGE) from exc
    except WhatsAppError as exc:
        # Sanitised provider failures only — raw details stay server-side.
        raise WhatsAppUnavailableError() from exc


def ensure_whatsapp_available() -> None:
    """Raise when WhatsApp delivery cannot work at all (not configured).

    Views call this BEFORE creating any state, so a server without the Meta
    configuration never leaves half-finished registrations behind.  Raises
    :class:`WhatsAppNotConfiguredServiceError` (HTTP 503
    ``whatsapp_not_configured``) — the honest answer, never a fake delivery.
    """
    if not get_whatsapp_otp_service().is_configured:
        raise WhatsAppNotConfiguredServiceError(NOT_CONFIGURED_MESSAGE)


def delivery_channel(result: DeliveryResult) -> str:
    """"whatsapp" for real delivery, "simulated" for the development provider."""
    return "simulated" if result.simulated else "whatsapp"


@dataclass(frozen=True)
class IssuedOTP:
    """The outcome of issuing an OTP.

    ``code`` stays server-side; views may expose it through the API only when
    ``OTP_DEBUG_RETURN`` (DEBUG builds) is on — never in production.
    """

    code: str
    delivery: DeliveryResult


def phone_number_taken(phone_number: str) -> bool:
    """True when an existing user already owns ``phone_number`` (E.164).

    Stored numbers may predate normalisation (local formats), so candidates
    are normalised before comparing.
    """
    for raw in User.objects.exclude(phone="").values_list("phone", flat=True):
        if phone_e164(raw) == phone_number:
            return True
    return False


# ============================================================
# Registration flow (PendingRegistration)
# ============================================================

@transaction.atomic
def create_pending_registration(
    *,
    username: str,
    email: str,
    phone_number: str,
    role: str,
    password: str,
) -> tuple[PendingRegistration, bool]:
    """Create (or safely refresh) the pending registration for one email.

    Re-submitting the registration form with the same email reuses the
    existing pending row instead of stacking duplicates.  The token is
    rotated (older verification screens/links become invalid) but the OTP
    budget/cooldown state is deliberately KEPT so a form re-submission can
    never be used to bypass the resend cooldown or request limits.

    Returns ``(pending, created)``.  No ``User`` row exists until the OTP is
    verified.
    """
    normalized_role = normalize_role(role)

    pending = (
        PendingRegistration.objects.select_for_update()
        .filter(
            status=PendingRegistration.Status.PENDING,
            expires_at__gt=timezone.now(),
            email__iexact=email,
        )
        .order_by("-created_at")
        .first()
    )

    created = pending is None
    if created:
        pending = PendingRegistration(
            username=username,
            email=email,
            phone_number=phone_number,
            role=normalized_role,
            password_hash=make_password(password),
            otp_request_count=0,
            otp_attempts=0,
        )
    else:
        pending.username = username
        pending.phone_number = phone_number
        pending.role = normalized_role
        # Django password hashing — the plaintext never touches the database.
        pending.password_hash = make_password(password)

    pending.registration_token = secrets.token_urlsafe(32)
    pending.status = PendingRegistration.Status.PENDING
    pending.expires_at = timezone.now() + pending_registration_ttl()
    pending.save()

    return pending, created


def _check_registration_cooldown(pending: PendingRegistration) -> int:
    """Return remaining cooldown seconds (0 when a new OTP may be sent)."""
    policy = otp_policy()
    if pending.otp_sent_at is None:
        return 0
    elapsed = (timezone.now() - pending.otp_sent_at).total_seconds()
    remaining = policy.resend_cooldown_seconds - elapsed
    return max(0, int(remaining))


def issue_registration_otp(pending: PendingRegistration) -> IssuedOTP:
    """Generate + deliver a fresh OTP for a pending registration.

    * Enforces the resend cooldown and the per-registration request limit.
    * Invalidates the previous OTP (new hash/expiry) and resets attempts.
    * Persists OTP state only when delivery succeeded.
    """
    policy = otp_policy()

    remaining_cooldown = _check_registration_cooldown(pending)
    if remaining_cooldown > 0:
        raise OTPCooldownError(
            remaining_cooldown,
            f"Please wait {remaining_cooldown}s before requesting another code.",
        )

    if pending.otp_request_count >= policy.max_requests:
        raise OTPRequestLimitError()

    code = generate_otp()
    result = _deliver(pending.phone_number, code)

    pending.otp_code_hash = hash_otp(code)
    pending.otp_expires_at = timezone.now() + timedelta(minutes=policy.expiry_minutes)
    pending.otp_attempts = 0
    pending.otp_sent_at = timezone.now()
    pending.otp_request_count += 1
    pending.save(
        update_fields=[
            "otp_code_hash",
            "otp_expires_at",
            "otp_attempts",
            "otp_sent_at",
            "otp_request_count",
            "updated_at",
        ]
    )
    return IssuedOTP(code=code, delivery=result)


def registration_cooldown_remaining(pending: PendingRegistration) -> int:
    """Remaining resend cooldown (seconds) — 0 when a new code can be sent."""
    return _check_registration_cooldown(pending)


def _verify_registration_otp(pending: PendingRegistration, code: str) -> None:
    policy = otp_policy()

    if not pending.otp_code_hash or pending.otp_expires_at is None:
        raise OTPExpiredError()

    if timezone.now() > pending.otp_expires_at:
        raise OTPExpiredError()

    if pending.otp_attempts >= policy.max_attempts:
        raise OTPAttemptsExceededError()

    if not _matches(pending.otp_code_hash, str(code).strip()):
        pending.otp_attempts += 1
        pending.save(update_fields=["otp_attempts", "updated_at"])
        remaining_attempts = max(0, policy.max_attempts - pending.otp_attempts)
        raise OTPInvalidError(
            f"That code is incorrect. {remaining_attempts} attempt"
            f"{'s' if remaining_attempts != 1 else ''} left."
        )


def complete_registration(pending: PendingRegistration, code: str) -> User:
    """Verify the OTP and create the permanent account.

    The role always comes from the pending registration — the verify request
    can never change it.  Uniqueness is re-checked at creation time so two
    pending registrations can never produce the same account, and the OTP is
    invalidated immediately after success (single-use).
    """
    # Phase 1 — OTP validation.  Deliberately NOT inside a transaction: the
    # failed-attempt counter must survive the error path (brute-force
    # tracking would silently roll back otherwise).
    _verify_registration_otp(pending, code)

    # Phase 2 — create the account atomically.
    with transaction.atomic():
        # Re-check for accounts created meanwhile (race safety).
        if User.objects.filter(email__iexact=pending.email).exists():
            raise OTPServiceError(
                "An account with this email already exists.", code="email_taken"
            )
        if User.objects.filter(username__iexact=pending.username).exists():
            raise OTPServiceError(
                "This username is already taken.", code="username_taken"
            )
        if phone_number_taken(pending.phone_number):
            raise OTPServiceError(
                "An account with this WhatsApp number already exists.",
                code="phone_taken",
            )

        user = User(
            username=pending.username,
            email=pending.email,
            role=pending.role,
            phone=pending.phone_number,
            is_otp_verified=True,
        )
        # Already a proper Django password hash — do not re-hash.
        user.password = pending.password_hash

        try:
            user.save()
        except IntegrityError:
            raise OTPServiceError(
                "An account with this email or username already exists.",
                code="account_exists",
            ) from None

        # Invalidate the OTP immediately (single-use) and close the
        # registration.
        pending.otp_code_hash = ""
        pending.otp_expires_at = timezone.now()
        pending.phone_verified_at = timezone.now()
        pending.status = PendingRegistration.Status.CONSUMED
        pending.save(
            update_fields=[
                "otp_code_hash",
                "otp_expires_at",
                "phone_verified_at",
                "status",
                "updated_at",
            ]
        )
        return user


def find_pending_registration(registration_id: str) -> PendingRegistration | None:
    """Locate an active pending registration by its token (``None`` if gone)."""
    if not registration_id:
        return None
    pending = PendingRegistration.objects.filter(
        registration_token=registration_id,
        status=PendingRegistration.Status.PENDING,
    ).first()
    if pending is None:
        return None
    if pending.expires_at <= timezone.now():
        pending.status = PendingRegistration.Status.EXPIRED
        pending.save(update_fields=["status", "updated_at"])
        return None
    return pending


def find_pending_registration_by_phone(phone_number: str) -> PendingRegistration | None:
    """Newest active pending registration for a normalised phone number."""
    return (
        PendingRegistration.objects.filter(
            phone_number=phone_number,
            status=PendingRegistration.Status.PENDING,
            expires_at__gt=timezone.now(),
        )
        .order_by("-created_at")
        .first()
    )


# ============================================================
# Login / re-verification flow (existing OTPCode model)
# ============================================================

def issue_user_otp(user: User, purpose: str = "login") -> IssuedOTP:
    """Generate + deliver a WhatsApp OTP for an existing (unverified) user.

    Reuses the existing ``OTPCode`` model, now with WhatsApp delivery, a
    resend cooldown and attempt tracking.  Old unconsumed codes are
    invalidated so only one code is ever valid.
    """
    policy = otp_policy()
    now = timezone.now()

    if not user.phone:
        raise OTPServiceError(
            "Your account has no WhatsApp number on file. "
            "Please contact support to verify your account.",
            code="phone_missing",
        )

    from whatsapp import InvalidPhoneNumberError, normalize_phone_number

    try:
        phone_number = normalize_phone_number(user.phone)
    except InvalidPhoneNumberError:
        raise OTPServiceError(
            "The phone number on your account is not a valid WhatsApp number. "
            "Please contact support to verify your account.",
            code="phone_missing",
        ) from None

    latest = OTPCode.objects.filter(user=user).order_by("-created_at").first()
    if latest is not None:
        elapsed = (now - latest.created_at).total_seconds()
        remaining = policy.resend_cooldown_seconds - elapsed
        if remaining > 0:
            raise OTPCooldownError(
                int(remaining),
                f"Please wait {int(remaining)}s before requesting another code.",
            )

    code = generate_otp()
    result = _deliver(phone_number, code)

    # Single active code per user: retire everything older.
    OTPCode.objects.filter(user=user, consumed_at__isnull=True).update(consumed_at=now)

    OTPCode.objects.create(
        user=user,
        code_hash=hash_otp(code),
        expires_at=now + timedelta(minutes=policy.expiry_minutes),
        purpose=purpose,
        phone_number=phone_number,
    )
    return IssuedOTP(code=code, delivery=result)


def verify_user_otp(user: User, code: str) -> OTPCode:
    """Verify a login-flow OTP; marks the user verified on success.

    Enforces expiry + attempt limits and consumes the code (single-use).
    """
    policy = otp_policy()

    otp = (
        OTPCode.objects.filter(
            user=user,
            consumed_at__isnull=True,
            expires_at__gt=timezone.now(),
        )
        .order_by("-created_at")
        .first()
    )

    if otp is None:
        raise OTPExpiredError()

    if otp.attempts >= policy.max_attempts:
        raise OTPAttemptsExceededError()

    if not _matches(otp.code_hash, str(code).strip()):
        otp.attempts += 1
        otp.save(update_fields=["attempts"])
        remaining_attempts = max(0, policy.max_attempts - otp.attempts)
        raise OTPInvalidError(
            f"That code is incorrect. {remaining_attempts} attempt"
            f"{'s' if remaining_attempts != 1 else ''} left."
        )

    otp.consumed_at = timezone.now()
    otp.save(update_fields=["consumed_at"])

    user.is_otp_verified = True
    user.save(update_fields=["is_otp_verified"])
    return otp
