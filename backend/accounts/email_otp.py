"""Email delivery for account-verification one-time codes."""
import logging
import smtplib
from dataclasses import dataclass

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger("marketplace")


class EmailNotConfiguredError(Exception):
    """Email delivery is not configured for this environment."""


class EmailDeliveryError(Exception):
    """The configured email backend could not accept the OTP message."""


@dataclass(frozen=True)
class EmailDeliveryResult:
    delivered: bool
    simulated: bool
    provider: str = "email"


def email_delivery_configured() -> bool:
    """Whether the selected email backend can deliver or simulate OTP mail."""
    backend = settings.EMAIL_BACKEND
    if backend == "django.core.mail.backends.console.EmailBackend":
        return bool(settings.DEBUG)
    if backend == "django.core.mail.backends.smtp.EmailBackend":
        return bool(
            settings.EMAIL_HOST
            and settings.DEFAULT_FROM_EMAIL
            and not (settings.EMAIL_USE_TLS and settings.EMAIL_USE_SSL)
        )
    return bool(backend)


def send_email_otp(email: str, code: str) -> EmailDeliveryResult:
    """Send an OTP using Django's configured email backend."""
    if not email_delivery_configured():
        raise EmailNotConfiguredError()

    simulated = (
        settings.EMAIL_BACKEND
        == "django.core.mail.backends.console.EmailBackend"
    )
    message = (
        f"Your Service Marketplace verification code is {code}.\n\n"
        f"It expires in {settings.OTP_EXPIRY_MINUTES} minutes. "
        "If you did not request this code, you can ignore this email."
    )
    try:
        sent = send_mail(
            subject="Your Service Marketplace verification code",
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )
    except (OSError, smtplib.SMTPException) as exc:
        logger.error("Email OTP delivery failed (%s)", type(exc).__name__)
        raise EmailDeliveryError() from None

    if sent != 1:
        logger.error("Email OTP backend did not accept the message")
        raise EmailDeliveryError()

    if simulated:
        logger.info("Email OTP simulated via console backend")
    return EmailDeliveryResult(delivered=not simulated, simulated=simulated)
