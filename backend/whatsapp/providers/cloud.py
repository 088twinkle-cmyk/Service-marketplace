"""WhatsApp Business (Meta Cloud API) provider.

This is the ONLY place in the codebase that knows about:

* WhatsApp API endpoints (``{base}/{version}/{phone_number_id}/messages``)
* the access token / bearer authentication
* the Phone Number ID and WhatsApp Business Account ID
* message templates and template languages
* provider-specific HTTP requests and error responses

Everything else talks to :class:`~whatsapp.providers.base.WhatsAppProvider`.
No secret configured here is ever sent to a frontend client.
"""
import logging

import requests

from ..exceptions import WhatsAppDeliveryError, WhatsAppNotConfiguredError
from .base import DeliveryResult, WhatsAppProvider

logger = logging.getLogger("marketplace")

_DEFAULT_TIMEOUT_SECONDS = 10


class WhatsAppCloudProvider(WhatsAppProvider):
    """Sends OTPs through the WhatsApp Business Cloud API (template messages)."""

    name = "cloud"

    def __init__(
        self,
        *,
        base_url: str,
        access_token: str,
        phone_number_id: str,
        template_name: str,
        template_language: str = "en_US",
        business_account_id: str = "",
        api_version: str = "v21.0",
        timeout_seconds: int = _DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self._base_url = (base_url or "https://graph.facebook.com").rstrip("/")
        self._api_version = (api_version or "v21.0").strip("/")
        self._access_token = (access_token or "").strip()
        self._phone_number_id = (phone_number_id or "").strip()
        self._business_account_id = (business_account_id or "").strip()
        self._template_name = (template_name or "").strip()
        self._template_language = (template_language or "en_US").strip()
        self._timeout_seconds = timeout_seconds

    @property
    def is_configured(self) -> bool:
        # A registered OTP template plus credentials are required for the
        # Cloud API to accept a template message.
        return bool(
            self._access_token
            and self._phone_number_id
            and self._template_name
            and self._base_url
        )

    def _messages_url(self) -> str:
        return (
            f"{self._base_url}/{self._api_version}/{self._phone_number_id}/messages"
        )

    def _build_payload(self, phone_number: str, otp: str) -> dict:
        """The WhatsApp template-message payload.

        The OTP is passed as a template body parameter, matching a template
        such as: "Your Service Marketplace code is {{1}}. It expires in 10
        minutes." The template itself is created/approved in the WhatsApp
        Business Manager — never inline here.
        """
        return {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone_number,
            "type": "template",
            "template": {
                "name": self._template_name,
                "language": {"code": self._template_language},
                "components": [
                    {
                        "type": "body",
                        "parameters": [
                            {"type": "text", "text": otp},
                        ],
                    }
                ],
            },
        }

    def send_otp(self, phone_number: str, otp: str) -> DeliveryResult:
        if not self.is_configured:
            raise WhatsAppNotConfiguredError()

        try:
            response = requests.post(
                self._messages_url(),
                json=self._build_payload(phone_number, otp),
                headers={
                    "Authorization": f"Bearer {self._access_token}",
                    "Content-Type": "application/json",
                },
                timeout=self._timeout_seconds,
            )
        except requests.RequestException:
            # Network/DNS/timeout failure — details stay in the log.
            logger.exception(
                "WhatsApp Cloud API request failed for recipient=%s",
                phone_number,
            )
            raise WhatsAppDeliveryError() from None

        body = {}
        try:
            body = response.json()
        except ValueError:
            body = {}

        if response.status_code // 100 == 2 and bool(body.get("messages")):
            message_id = ""
            messages = body.get("messages") or []
            if messages and isinstance(messages[0], dict):
                message_id = str(messages[0].get("id", ""))
            logger.info(
                "WhatsApp OTP delivered via Cloud API (message=%s)",
                message_id or "unknown",
            )
            return DeliveryResult(
                delivered=True,
                simulated=False,
                provider=self.name,
                provider_message_id=message_id,
            )

        # Provider rejected the message. Log the raw provider payload for
        # operators (it never leaves the server), raise a sanitised error.
        error = body.get("error", {}) if isinstance(body, dict) else {}
        logger.error(
            "WhatsApp Cloud API rejected OTP message (http=%s provider_error=%s)",
            response.status_code,
            error,
        )
        raise WhatsAppDeliveryError()
