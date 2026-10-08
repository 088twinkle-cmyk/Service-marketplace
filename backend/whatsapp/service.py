"""The provider-agnostic WhatsApp OTP service.

``WhatsAppOTPService.send_otp(phone_number, otp)`` is the single delivery
entry point the authentication system is allowed to call.  It validates and
normalises the destination number, then delegates to whichever provider the
configuration selected.  Authentication code never imports a provider class
directly.
"""
import logging

from django.conf import settings

from .exceptions import WhatsAppNotConfiguredError
from .phone import normalize_phone_number
from .providers.base import DeliveryResult, WhatsAppProvider
from .providers.cloud import WhatsAppCloudProvider
from .providers.development import DevelopmentWhatsAppProvider

logger = logging.getLogger("marketplace")


class WhatsAppOTPService:
    """Delivers OTP codes over WhatsApp, independent of the provider used."""

    def __init__(self, provider: WhatsAppProvider | None):
        self._provider = provider

    @property
    def provider_name(self) -> str:
        return self._provider.name if self._provider is not None else "none"

    @property
    def is_configured(self) -> bool:
        return self._provider is not None and self._provider.is_configured

    @property
    def verification_number(self) -> str:
        """The configured WhatsApp business/verification number (E.164).

        This is the public number users receive messages from — it is display
        information, not a credential.
        """
        raw = str(getattr(settings, "WHATSAPP_VERIFICATION_NUMBER", "") or "")
        if not raw:
            return ""
        if raw.startswith("+"):
            return raw
        # Stored as a local number (e.g. "9843677123") — qualify it with the
        # default country code so the UI can show "+977 9843677123".
        try:
            return normalize_phone_number(raw)
        except Exception:
            return raw

    def send_otp(self, phone_number: str, otp: str) -> DeliveryResult:
        """Send ``otp`` to ``phone_number`` over WhatsApp.

        ``phone_number`` is normalised to E.164 first (Nepal numbers become
        ``+977…``).  Raises :class:`WhatsAppNotConfiguredError` when delivery
        is disabled/unconfigured — it never pretends delivery happened.
        """
        normalized = normalize_phone_number(phone_number)

        if self._provider is None or not self._provider.is_configured:
            raise WhatsAppNotConfiguredError()

        return self._provider.send_otp(normalized, otp)


def _build_cloud_provider_from_settings() -> WhatsAppCloudProvider:
    return WhatsAppCloudProvider(
        base_url=settings.WHATSAPP_API_BASE_URL,
        access_token=settings.WHATSAPP_ACCESS_TOKEN,
        phone_number_id=settings.WHATSAPP_PHONE_NUMBER_ID,
        business_account_id=settings.WHATSAPP_BUSINESS_ACCOUNT_ID,
        template_name=settings.WHATSAPP_OTP_TEMPLATE_NAME,
        template_language=settings.WHATSAPP_OTP_TEMPLATE_LANGUAGE,
        api_version=settings.WHATSAPP_API_VERSION,
    )


def build_whatsapp_provider() -> WhatsAppProvider | None:
    """Resolve the configured provider (or ``None`` when unavailable).

    Selection rules (``WHATSAPP_PROVIDER`` = auto | cloud | development):

    * ``cloud``        — always the real Cloud API provider.
    * ``development``  — always the simulated development provider (warns
                         when used outside DEBUG).
    * ``auto`` (default):
        - ``WHATSAPP_OTP_ENABLED=true``  → the Cloud API provider, AS IS.
          When credentials are incomplete the provider reports
          ``is_configured == False`` and every delivery attempt raises
          ``WhatsAppNotConfiguredError``, which the API surfaces as
          HTTP 503 ``whatsapp_not_configured``.  Enabling real delivery
          must NEVER silently downgrade to the simulated provider — the
          operator asked for WhatsApp messages, and the server says so.
        - ``WHATSAPP_OTP_ENABLED=false`` (default) → the development
          provider when ``DEBUG`` is on (local development without
          credentials, clearly labelled ``simulated``) and ``None`` in
          production (HTTP 503 ``whatsapp_not_configured``).
    """
    setting = (getattr(settings, "WHATSAPP_PROVIDER", "auto") or "auto").strip().lower()
    enabled = bool(getattr(settings, "WHATSAPP_OTP_ENABLED", False))
    debug = bool(getattr(settings, "DEBUG", False))

    if setting == "development":
        if not debug:
            logger.warning(
                "WhatsApp 'development' provider selected outside DEBUG — "
                "OTP delivery will be simulated. Set WHATSAPP_PROVIDER=cloud "
                "with real credentials for production delivery."
            )
        return DevelopmentWhatsAppProvider()

    if setting == "cloud":
        return _build_cloud_provider_from_settings()

    # auto
    if enabled:
        # Real delivery requested. If credentials are missing the provider
        # stays unconfigured and every send raises WhatsAppNotConfiguredError
        # → HTTP 503 whatsapp_not_configured. No simulation fallback here.
        return _build_cloud_provider_from_settings()

    # Disabled by default: keep local development usable, production honest.
    return DevelopmentWhatsAppProvider() if debug else None


def get_whatsapp_otp_service() -> WhatsAppOTPService:
    """Factory used by the OTP service layer (kept cheap; config is tiny)."""
    return WhatsAppOTPService(build_whatsapp_provider())
