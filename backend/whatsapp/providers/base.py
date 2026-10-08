"""The WhatsApp provider interface.

The OTP service (and therefore the whole authentication system) depends on
this abstraction only.  Swapping Meta's Cloud API for a different WhatsApp
provider (a local gateway, a third-party aggregator, …) means writing one new
class that implements :meth:`WhatsAppProvider.send_otp` — no authentication
code changes.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass(frozen=True)
class DeliveryResult:
    """Outcome of a single OTP delivery attempt.

    ``delivered`` is ``True`` only when a real WhatsApp API accepted the
    message.  ``simulated`` marks the development provider so the UI/API can
    state clearly that no real WhatsApp message was sent.
    """

    delivered: bool
    simulated: bool = False
    provider: str = ""
    # Internal reference (provider message id).  Never exposed to clients.
    provider_message_id: str = field(default="", repr=False)


class WhatsAppProvider(ABC):
    """Interface every WhatsApp delivery provider must implement."""

    #: Short provider name surfaced in logs and (non-sensitive) API payloads.
    name: str = "whatsapp"

    @property
    @abstractmethod
    def is_configured(self) -> bool:
        """``True`` when the provider has everything it needs to deliver."""

    @abstractmethod
    def send_otp(self, phone_number: str, otp: str) -> DeliveryResult:
        """Deliver ``otp`` to ``phone_number`` (E.164, e.g. +9779843677123).

        Raises a :class:`~whatsapp.exceptions.WhatsAppError` subclass on
        failure — never a raw provider error.
        """
