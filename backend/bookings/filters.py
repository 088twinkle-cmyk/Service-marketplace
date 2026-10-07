"""FilterSets for the bookings API."""
import django_filters as filters

from .models import AvailabilitySlot


class AvailabilitySlotFilter(filters.FilterSet):
    """Slot filters.

    ``status`` is matched case-insensitively so the UI can keep using the
    lowercase contract (`available` / `booked` / `blocked`) while the database
    stores uppercase choice values.
    """

    status = filters.CharFilter(method="filter_status")

    class Meta:
        model = AvailabilitySlot
        fields = ["service"]

    def filter_status(self, queryset, name, value):
        if not value:
            return queryset
        return queryset.filter(status__iexact=value)
