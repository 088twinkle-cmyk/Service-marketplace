"""Django system checks for account email OTP delivery."""
from django.conf import settings
from django.core.checks import Warning as CheckWarning  # noqa: N812

from .email_otp import email_delivery_configured
from whatsapp.config import missing_whatsapp_settings


def check_email_otp_configuration(app_configs=None, **kwargs):
    if email_delivery_configured():
        return []

    missing = []
    if not settings.EMAIL_HOST:
        missing.append("EMAIL_HOST")
    if not settings.DEFAULT_FROM_EMAIL:
        missing.append("DEFAULT_FROM_EMAIL")

    return [
        CheckWarning(
            "Email OTP delivery is not configured. "
            "Registration and login verification cannot send real emails.",
            hint=(
                "Set EMAIL_BACKEND to Django's SMTP backend and configure "
                + ", ".join(missing or ["SMTP settings"])
                + " in backend/.env. Do not commit email credentials."
            ),
            id="accounts.W001",
        )
    ]


def check_whatsapp_otp_configuration(app_configs=None, **kwargs):
    """Keep the legacy WhatsApp readiness check available to operators."""
    if not getattr(settings, "WHATSAPP_OTP_ENABLED", False):
        return []

    provider = str(getattr(settings, "WHATSAPP_PROVIDER", "auto") or "auto")
    if provider.strip().lower() == "development":
        return []

    missing = missing_whatsapp_settings()
    if not missing:
        return []

    return [
        CheckWarning(
            "WhatsApp OTP delivery is enabled (WHATSAPP_OTP_ENABLED=true) but "
            "required settings are missing: " + ", ".join(missing) + ". "
            "Every OTP request will answer HTTP 503 whatsapp_not_configured "
            "until they are set in backend/.env.",
            hint=(
                "Only missing setting names are shown; configuration values "
                "are never printed."
            ),
            id="accounts.W002",
        )
    ]
