"""Safe WhatsApp configuration checks.

These helpers answer ONE question — "is real WhatsApp delivery ready?" —
without ever exposing configuration VALUES:

* API responses, logs, the Django system-check framework and the
  ``manage.py whatsapp_status`` command may print the NAMES of settings and
  whether they are set, but never the values themselves.
* The access token in particular must never appear in any output.

Required for real Cloud API delivery (a message cannot be sent without
these — see `providers/cloud.py`):

* ``WHATSAPP_ACCESS_TOKEN``
* ``WHATSAPP_PHONE_NUMBER_ID``
* ``WHATSAPP_OTP_TEMPLATE_NAME`` (the approved template)

The remaining settings have safe defaults (base URL, template language,
verification number) or are only needed for management APIs
(``WHATSAPP_BUSINESS_ACCOUNT_ID``) — they are reported but do not block
sending.
"""
from django.conf import settings

# Settings that must be present for real Cloud API delivery.
REQUIRED_SETTINGS: tuple[str, ...] = (
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_OTP_TEMPLATE_NAME",
)

# Settings with safe defaults — reported for completeness, never blocking.
DEFAULTED_SETTINGS: tuple[str, ...] = (
    "WHATSAPP_API_BASE_URL",
    "WHATSAPP_API_VERSION",
    "WHATSAPP_OTP_TEMPLATE_LANGUAGE",
    "WHATSAPP_VERIFICATION_NUMBER",
)

# Optional: only needed for Meta management APIs, not for sending messages.
OPTIONAL_SETTINGS: tuple[str, ...] = (
    "WHATSAPP_BUSINESS_ACCOUNT_ID",
)


def _is_set(name: str) -> bool:
    """True when the setting exists and is non-empty (value not returned)."""
    return bool(str(getattr(settings, name, "") or "").strip())


def missing_whatsapp_settings() -> list[str]:
    """NAMES of the required settings that are missing.

    Safe to log or return in an API response — only names, never values.
    """
    return [name for name in REQUIRED_SETTINGS if not _is_set(name)]


def whatsapp_configuration_status() -> dict:
    """A serialisable, value-free readiness report.

    Keys:
      enabled      — WHATSAPP_OTP_ENABLED (the operator asked for real delivery)
      provider     — provider that would be used right now
      configured   — real Cloud API delivery possible
      missing      — names of missing REQUIRED settings
      optional     — {setting name: is it set?} for the optional settings
    """
    from .service import build_whatsapp_provider

    provider = build_whatsapp_provider()

    return {
        "enabled": bool(getattr(settings, "WHATSAPP_OTP_ENABLED", False)),
        "provider": provider.name if provider is not None else "none",
        "configured": bool(provider is not None and provider.is_configured),
        "missing": missing_whatsapp_settings(),
        "optional": {name: _is_set(name) for name in OPTIONAL_SETTINGS},
    }
