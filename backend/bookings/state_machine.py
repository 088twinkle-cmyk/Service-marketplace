from django.core.exceptions import ValidationError
from .models import ProjectBooking as B
ALLOWED_TRANSITIONS = {
    B.Status.DRAFT: {B.Status.PENDING_PROVIDER_RESPONSE, B.Status.CANCELLED},
    B.Status.PENDING_PROVIDER_RESPONSE: {
        B.Status.COUNTER_OFFERED,
        B.Status.AGREEMENT_REACHED,
        B.Status.REJECTED,
        B.Status.EXPIRED,
        B.Status.CANCELLED,
    },
    B.Status.COUNTER_OFFERED: {
        B.Status.AGREEMENT_REACHED,
        B.Status.COUNTER_OFFERED,
        B.Status.CANCELLED,
        B.Status.REJECTED,
        B.Status.PENDING_PROVIDER_RESPONSE,
    },
    B.Status.AGREEMENT_REACHED: {B.Status.PAYMENT_PENDING, B.Status.CANCELLED},
    B.Status.PAYMENT_PENDING: {
        B.Status.CONFIRMED,
        B.Status.PAYMENT_FAILED,
        B.Status.CANCELLED,
    },
    B.Status.PAYMENT_FAILED: {B.Status.PAYMENT_PENDING, B.Status.CANCELLED},
    B.Status.CONFIRMED: {B.Status.IN_PROGRESS, B.Status.CANCELLED, B.Status.DISPUTED},
    B.Status.IN_PROGRESS: {
        B.Status.DELIVERABLE_SUBMITTED,
        B.Status.DISPUTED,
        B.Status.CANCELLED,
        B.Status.COMPLETED,
    },
    B.Status.DELIVERABLE_SUBMITTED: {
        B.Status.CLIENT_REVIEWING,
        B.Status.REVISION_REQUESTED,
        B.Status.COMPLETED,
        B.Status.DISPUTED,
    },
    B.Status.CLIENT_REVIEWING: {
        B.Status.COMPLETED,
        B.Status.REVISION_REQUESTED,
        B.Status.DISPUTED,
    },
    B.Status.REVISION_REQUESTED: {B.Status.IN_PROGRESS, B.Status.DISPUTED},
    B.Status.COMPLETED: {B.Status.REVIEWED, B.Status.DISPUTED},
    B.Status.REVIEWED: set(),
    B.Status.REJECTED: set(),
    B.Status.CANCELLED: set(),
    B.Status.EXPIRED: set(),
    B.Status.DISPUTED: {B.Status.IN_PROGRESS, B.Status.COMPLETED, B.Status.CANCELLED},
}
LOCKED_AFTER_PAYMENT = {
    B.Status.CONFIRMED,
    B.Status.IN_PROGRESS,
    B.Status.DELIVERABLE_SUBMITTED,
    B.Status.CLIENT_REVIEWING,
    B.Status.REVISION_REQUESTED,
    B.Status.COMPLETED,
    B.Status.REVIEWED,
}
def transition(booking, new_status):
    allowed = ALLOWED_TRANSITIONS.get(booking.status, set())
    if new_status not in allowed:
        raise ValidationError(f"Cannot move from {booking.status} to {new_status}.")
    booking.status = new_status
    return booking