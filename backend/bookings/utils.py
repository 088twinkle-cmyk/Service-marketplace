"""Time helpers for availability and slot overlap checks.

Kept as a thin, importable façade over ``bookings.services`` so older imports
(``slot_overlaps``) keep working without duplicating the overlap logic.
"""
from datetime import date, time

from .services import overlapping_bookings, ranges_overlap
from .models import AvailabilitySlot


def time_ranges_overlap(start1: time, end1: time, start2: time, end2: time) -> bool:
    """True if [start1, end1) overlaps [start2, end2)."""
    return ranges_overlap(start1, end1, start2, end2)


def slot_overlaps(provider_id, slot_date: date, start: time, end: time, exclude_id=None) -> bool:
    """True when an existing slot for ``provider_id`` clashes with the window."""
    qs = AvailabilitySlot.objects.filter(freelancer_id=provider_id, date=slot_date)
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    for slot in qs.only("id", "start_time", "end_time"):
        if ranges_overlap(start, end, slot.start_time, slot.end_time):
            return True
    return False


def booking_overlaps(provider, slot_date: date, start: time, end: time) -> bool:
    """True when the provider already has a live booking in that window."""
    return bool(overlapping_bookings(provider, slot_date, start, end))


__all__ = ["time_ranges_overlap", "slot_overlaps", "booking_overlaps"]
