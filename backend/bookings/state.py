from django.db import transaction
from rest_framework.exceptions import ValidationError

from .models import Booking, CounterOffer


PENDING_SET = {
    Booking.PENDING_PROVIDER_RESPONSE,
    "pending",
}

PAYABLE_SET = {
    Booking.AGREEMENT_REACHED,
    Booking.PAYMENT_PENDING,
    Booking.PAYMENT_FAILED,
}

CONFIRMED_SET = {
    Booking.CONFIRMED,
    "confirmed",
    Booking.IN_PROGRESS,
    Booking.DELIVERABLE_SUBMITTED,
    Booking.CLIENT_REVIEWING,
    Booking.REVISION_REQUESTED,
}


def normalize_status(status: str) -> str:
    return Booking.LEGACY_STATUS_MAP.get(status, status)


def active_counter(booking: Booking):
    return booking.counter_offers.filter(status=CounterOffer.PENDING).first()


def set_status(booking: Booking, new_status: str, extra_fields=None):
    booking.status = new_status
    fields = ["status", "updated_at"]
    if extra_fields:
        fields.extend(extra_fields)
    booking.save(update_fields=fields)
    return booking


@transaction.atomic
def lock_booking(booking_id: int) -> Booking:
    try:
        return Booking.objects.select_for_update().get(pk=booking_id)
    except Booking.DoesNotExist:
        raise ValidationError("Project not found.")
