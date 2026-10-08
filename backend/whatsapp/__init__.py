"""Provider-agnostic WhatsApp OTP delivery layer.

Architecture (see the project docs):

    Django Auth API  →  OTP Service  →  WhatsApp Provider Interface
                                         →  WhatsApp Business/Cloud API
                                         →  User's WhatsApp

The authentication system depends ONLY on :class:`WhatsAppOTPService` and the
:class:`~whatsapp.providers.base.WhatsAppProvider` interface.  Everything
Meta/WhatsApp specific (endpoints, access tokens, phone number IDs, templates,
provider error payloads) lives inside a single provider implementation
(``providers/cloud.py``) and never leaks into views, serializers or models.
"""

from .exceptions import (
    WhatsAppDeliveryError,
    WhatsAppError,
    WhatsAppNotConfiguredError,
)
from .phone import (
    InvalidPhoneNumberError,
    mask_phone_number,
    normalize_phone_number,
    phone_e164,
)
from .providers.base import DeliveryResult, WhatsAppProvider
from .service import WhatsAppOTPService, get_whatsapp_otp_service

__all__ = [
    "DeliveryResult",
    "InvalidPhoneNumberError",
    "WhatsAppDeliveryError",
    "WhatsAppError",
    "WhatsAppNotConfiguredError",
    "WhatsAppOTPService",
    "WhatsAppProvider",
    "get_whatsapp_otp_service",
    "mask_phone_number",
    "normalize_phone_number",
    "phone_e164",
]
