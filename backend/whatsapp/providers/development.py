"""Development WhatsApp provider — a clearly separated mock.

Used ONLY for local development and automated tests, where real WhatsApp
credentials are not available.  It never contacts Meta, never sends a real
message and says so explicitly: the returned
:class:`~whatsapp.providers.base.DeliveryResult` is flagged ``simulated`` so
API responses can tell the frontend the truth about what happened.

It is intentionally boring: no fake HTTP calls, no fake delivery receipts.
"""
import logging

from ..phone import mask_phone_number
from .base import DeliveryResult, WhatsAppProvider

logger = logging.getLogger("marketplace")


class DevelopmentWhatsAppProvider(WhatsAppProvider):
    """Simulates WhatsApp OTP delivery for local development and tests."""

    name = "development"

    @property
    def is_configured(self) -> bool:
        return True

    def send_otp(self, phone_number: str, otp: str) -> DeliveryResult:
        # The OTP itself is never logged — only enough context to debug the
        # flow locally. (When DEBUG is on, `OTP_DEBUG_RETURN` already returns
        # the code to the developer through the API response.)
        logger.info(
            "[WhatsApp OTP] DEVELOPMENT PROVIDER: simulated delivery to %s — "
            "no real WhatsApp message was sent.",
            mask_phone_number(phone_number),
        )
        return DeliveryResult(
            delivered=False,
            simulated=True,
            provider=self.name,
        )
