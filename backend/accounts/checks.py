"""Django system checks for WhatsApp OTP configuration.

Warns — never errors — when the operator enabled real WhatsApp delivery but
the required Meta settings are missing.  Only setting NAMES are reported;
values (especially the access token) never appear in check output.
"""
from django.conf import settings
from django.core.checks import Warning as CheckWarning  # noqa: N812

from whatsapp.config import missing_whatsapp_settings


def check_whatsapp_otp_configuration(app_configs=None, **kwargs):
    if not getattr(settings, "WHATSAPP_OTP_ENABLED", False):
        # Delivery disabled (default): local DEBUG development uses the
        # clearly-labelled simulated provider; nothing to warn about.
        return []

    provider = str(getattr(settings, "WHATSAPP_PROVIDER", "auto") or "auto")
    if provider.strip().lower() == "development":
        # Explicitly forced mock — the operator knows what they are doing.
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
                "Obtain the values from the Meta developer dashboard "
                "(see WHATSAPP-OTP.md, 'Required Meta credentials'). "
                "Only the missing setting names are shown here; values are "
                "never printed."
            ),
            id="accounts.W001",
        )
    ]
