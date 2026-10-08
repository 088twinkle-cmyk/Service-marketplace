"""Sanitised WhatsApp delivery errors.

Raw provider responses (HTTP bodies, Meta error codes, access token hints)
are NEVER put on these exceptions — they are logged for operators only and
API clients receive the generic ``message`` carried here.
"""


class WhatsAppError(Exception):
    """Base class for every WhatsApp delivery failure."""

    default_message = "WhatsApp verification is unavailable right now. Please try again shortly."

    def __init__(self, message: str | None = None, *, code: str = "whatsapp_error"):
        self.message = message or self.default_message
        self.code = code
        super().__init__(self.message)


class WhatsAppNotConfiguredError(WhatsAppError):
    """Raised when WhatsApp credentials/configuration have not been provided."""

    default_message = (
        "WhatsApp verification is not configured on this server. "
        "Set the WHATSAPP_* environment variables to enable it."
    )

    def __init__(self, message: str | None = None):
        super().__init__(message, code="whatsapp_not_configured")


class WhatsAppDeliveryError(WhatsAppError):
    """Raised when the configured provider failed to deliver the message."""

    default_message = (
        "We could not send the WhatsApp code right now. Please try again in a moment."
    )

    def __init__(self, message: str | None = None):
        super().__init__(message, code="whatsapp_delivery_failed")
