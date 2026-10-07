"""Status helpers for the booking state machine.

This module previously referenced models that no longer exist
(``Booking``, ``CounterOffer.PENDING``), which made it dead, un-importable
code. It now delegates to the real implementation in ``state_machine`` and
``services`` so there is a single source of truth for the workflow.
"""
from .models import CounterOffer, ProjectBooking
from .state_machine import ALLOWED_TRANSITIONS, LOCKED_AFTER_PAYMENT, transition

# Statuses in which a booking is still open for changes.
OPEN_STATUSES = {
    ProjectBooking.Status.DRAFT,
    ProjectBooking.Status.PENDING_PROVIDER_RESPONSE,
    ProjectBooking.Status.COUNTER_OFFERED,
    ProjectBooking.Status.AGREEMENT_REACHED,
    ProjectBooking.Status.PAYMENT_PENDING,
    ProjectBooking.Status.PAYMENT_FAILED,
}


def normalize_status(value: str) -> str:
    """Map a legacy/lowercase status onto the canonical enum value."""
    if not value:
        return ""
    upper = value.strip().upper()
    if upper in ProjectBooking.Status.values:
        return upper
    # A few historical aliases that may still be present in stored data.
    aliases = {
        "PENDING": ProjectBooking.Status.PENDING_PROVIDER_RESPONSE,
        "ACCEPTED": ProjectBooking.Status.AGREEMENT_REACHED,
        "COMPLETE": ProjectBooking.Status.COMPLETED,
        "CANCELED": ProjectBooking.Status.CANCELLED,
    }
    return aliases.get(upper, upper)


def active_counter_offer(booking: ProjectBooking):
    return booking.counter_offers.filter(status=CounterOffer.Status.ACTIVE).first()


def can_transition(booking: ProjectBooking, new_status: str) -> bool:
    return new_status in ALLOWED_TRANSITIONS.get(booking.status, set())


def is_locked_after_payment(booking: ProjectBooking) -> bool:
    return booking.status in LOCKED_AFTER_PAYMENT


__all__ = [
    "ALLOWED_TRANSITIONS",
    "LOCKED_AFTER_PAYMENT",
    "OPEN_STATUSES",
    "transition",
    "normalize_status",
    "active_counter_offer",
    "can_transition",
    "is_locked_after_payment",
]
