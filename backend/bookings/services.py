"""Booking domain services.

All multi-step booking operations live here so that the same rules apply no
matter which entry point (API view, admin action, management command) triggers
them. The important guarantee is that a time slot can only ever be reserved by
one booking: the slot row is locked with ``select_for_update`` inside a
transaction before it is marked as booked.
"""
import logging
from datetime import date, datetime, time, timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from catalog.models import Availability

from .models import AvailabilitySlot, ProjectBooking

logger = logging.getLogger("marketplace")

# Statuses in which an appointment still occupies the provider's calendar.
ACTIVE_BOOKING_STATUSES = [
    ProjectBooking.Status.PENDING_PROVIDER_RESPONSE,
    ProjectBooking.Status.COUNTER_OFFERED,
    ProjectBooking.Status.AGREEMENT_REACHED,
    ProjectBooking.Status.PAYMENT_PENDING,
    ProjectBooking.Status.PAYMENT_FAILED,
    ProjectBooking.Status.CONFIRMED,
    ProjectBooking.Status.IN_PROGRESS,
    ProjectBooking.Status.DELIVERABLE_SUBMITTED,
    ProjectBooking.Status.CLIENT_REVIEWING,
    ProjectBooking.Status.REVISION_REQUESTED,
    ProjectBooking.Status.DISPUTED,
]

# Chat is only available once the two sides have agreed on a price.
CHAT_ALLOWED_STATUSES = [
    ProjectBooking.Status.AGREEMENT_REACHED,
    ProjectBooking.Status.PAYMENT_PENDING,
    ProjectBooking.Status.PAYMENT_FAILED,
    ProjectBooking.Status.CONFIRMED,
    ProjectBooking.Status.IN_PROGRESS,
    ProjectBooking.Status.DELIVERABLE_SUBMITTED,
    ProjectBooking.Status.CLIENT_REVIEWING,
    ProjectBooking.Status.REVISION_REQUESTED,
    ProjectBooking.Status.COMPLETED,
    ProjectBooking.Status.REVIEWED,
    ProjectBooking.Status.DISPUTED,
]


def ranges_overlap(start1: time, end1: time, start2: time, end2: time) -> bool:
    """True when [start1, end1) overlaps [start2, end2)."""
    return start1 < end2 and start2 < end1


def overlapping_bookings(freelancer, day: date, start: time, end: time, exclude_booking_id=None):
    """Bookings that already occupy [start, end) on ``day``."""
    if not freelancer or not day or not start or not end:
        return ProjectBooking.objects.none()

    qs = ProjectBooking.objects.filter(
        freelancer=freelancer,
        status__in=ACTIVE_BOOKING_STATUSES,
        appointment_start__date=day,
    )
    if exclude_booking_id:
        qs = qs.exclude(pk=exclude_booking_id)

    conflicts = []
    for booking in qs.only("id", "appointment_start", "appointment_end"):
        if not booking.appointment_start or not booking.appointment_end:
            continue
        b_start = timezone.localtime(booking.appointment_start).time()
        b_end = timezone.localtime(booking.appointment_end).time()
        if ranges_overlap(start, end, b_start, b_end):
            conflicts.append(booking)
    return conflicts


def generate_slots_from_rules(freelancer, month_start: date, month_end: date):
    """Materialise weekly availability rules into concrete slots for a month."""
    rules = Availability.objects.filter(freelancer=freelancer, is_blocked=False)
    if not rules.exists():
        return []

    by_weekday: dict[int, list] = {}
    dated: dict[date, list] = {}
    for rule in rules:
        if rule.specific_date:
            dated.setdefault(rule.specific_date, []).append(rule)
        elif rule.weekday is not None:
            by_weekday.setdefault(rule.weekday, []).append(rule)

    created = []
    day = month_start
    today = timezone.localdate()

    while day <= month_end:
        if day >= today:
            weekday = day.weekday()  # 0 = Monday, matching Availability.weekday
            for rule in list(by_weekday.get(weekday, [])) + dated.get(day, []):
                slot, was_created = AvailabilitySlot.objects.get_or_create(
                    freelancer=freelancer,
                    date=day,
                    start_time=rule.start_time,
                    defaults={
                        "end_time": rule.end_time,
                        "note": rule.note,
                    },
                )
                if was_created:
                    created.append(slot)
        day += timedelta(days=1)

    return created


def create_slot(freelancer, day: date, start: time, end: time, *, service=None, note=""):
    """Create one slot, rejecting overlapping or past windows."""
    if end <= start:
        raise ValidationError({"end_time": "End time must be after the start time."})
    if day < timezone.localdate():
        raise ValidationError({"date": "You cannot publish availability in the past."})

    existing = AvailabilitySlot.objects.filter(freelancer=freelancer, date=day)
    for slot in existing:
        if ranges_overlap(start, end, slot.start_time, slot.end_time):
            raise ValidationError(
                {"start_time": "This time overlaps an existing slot on that day."}
            )

    for booking in overlapping_bookings(freelancer, day, start, end):
        raise ValidationError(
            {"start_time": "You already have a booking in that time window."}
        )

    return AvailabilitySlot.objects.create(
        freelancer=freelancer,
        service=service,
        date=day,
        start_time=start,
        end_time=end,
        note=note or "",
    )


@transaction.atomic
def reserve_slot(slot_id: int, booking: ProjectBooking) -> AvailabilitySlot:
    """Atomically claim a slot for a booking.

    Raises ``ValidationError`` when the slot is missing, in the past, blocked,
    already booked, or overlaps another confirmed appointment.
    """
    try:
        slot = AvailabilitySlot.objects.select_for_update().get(pk=slot_id)
    except AvailabilitySlot.DoesNotExist:
        raise ValidationError({"slot_id": "Select an available time slot."})

    if slot.status == AvailabilitySlot.Status.BOOKED:
        raise ValidationError({"slot_id": "That slot has already been booked."})
    if slot.status == AvailabilitySlot.Status.BLOCKED:
        raise ValidationError({"slot_id": "That time is blocked by the provider."})
    if slot.date < timezone.localdate():
        raise ValidationError({"slot_id": "That slot is in the past."})

    if slot.freelancer_id != booking.freelancer_id:
        raise ValidationError({"slot_id": "That slot belongs to a different provider."})

    conflicts = overlapping_bookings(
        slot.freelancer,
        slot.date,
        slot.start_time,
        slot.end_time,
        # The booking being created is itself stored against this time, so it
        # must not count as its own conflict.
        exclude_booking_id=booking.pk,
    )
    if conflicts:
        raise ValidationError({"slot_id": "That time is no longer available."})

    slot.status = AvailabilitySlot.Status.BOOKED
    slot.booking = booking
    slot.save(update_fields=["status", "booking", "updated_at"])

    start = timezone.make_aware(
        datetime.combine(slot.date, slot.start_time),
        timezone.get_current_timezone(),
    )
    end = timezone.make_aware(
        datetime.combine(slot.date, slot.end_time),
        timezone.get_current_timezone(),
    )
    booking.appointment_start = start
    booking.appointment_end = end
    if slot.service_id and not booking.service_id:
        booking.service = slot.service
    booking.save(
        update_fields=["appointment_start", "appointment_end", "service", "updated_at"]
    )

    logger.info(
        "Slot %s reserved for booking %s (provider=%s)",
        slot.id,
        booking.id,
        slot.freelancer_id,
    )
    return slot


def release_slot_for_booking(booking) -> None:
    """Free the slot held by a booking (used when a booking is cancelled)."""
    slot = AvailabilitySlot.objects.filter(booking=booking).first()
    if not slot:
        return

    slot.status = AvailabilitySlot.Status.AVAILABLE
    slot.booking = None
    slot.save(update_fields=["status", "booking", "updated_at"])
    logger.info("Slot %s released from booking %s", slot.id, booking.id)


def booking_can_chat(booking) -> bool:
    return (
        booking.status in CHAT_ALLOWED_STATUSES
        and booking.freelancer is not None
        and booking.client is not None
    )


def booking_can_cancel(booking, user) -> bool:
    """Cancellation policy: not after payment, and 24h+ before the appointment."""
    from accounts.models import User

    if booking.status in (
        ProjectBooking.Status.CANCELLED,
        ProjectBooking.Status.REJECTED,
        ProjectBooking.Status.EXPIRED,
        ProjectBooking.Status.COMPLETED,
        ProjectBooking.Status.REVIEWED,
    ):
        return False

    is_admin = getattr(user, "is_staff", False) or getattr(user, "role", "") == User.Role.ADMIN
    if booking.status in (
        ProjectBooking.Status.CONFIRMED,
        ProjectBooking.Status.IN_PROGRESS,
        ProjectBooking.Status.DELIVERABLE_SUBMITTED,
        ProjectBooking.Status.CLIENT_REVIEWING,
        ProjectBooking.Status.REVISION_REQUESTED,
        ProjectBooking.Status.DISPUTED,
    ) and not is_admin:
        # Paid work needs a controlled refund/dispute flow.
        return False

    if booking.appointment_start:
        cutoff = timezone.now() + timedelta(
            hours=int(getattr(settings, "BOOKING_CANCEL_CUTOFF_HOURS", 24))
        )
        if booking.appointment_start < cutoff and not is_admin:
            return False

    return True


def expire_stale_requests() -> int:
    """Expire unanswered service requests. Safe to run repeatedly."""
    now = timezone.now()
    stale = ProjectBooking.objects.filter(
        status=ProjectBooking.Status.PENDING_PROVIDER_RESPONSE,
        expires_at__isnull=False,
        expires_at__lt=now,
    )
    count = 0
    for booking in stale:
        booking.status = ProjectBooking.Status.EXPIRED
        booking.save(update_fields=["status", "updated_at"])
        count += 1
    if count:
        logger.info("Expired %s stale service requests", count)
    return count
