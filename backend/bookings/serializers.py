"""Booking / offer / slot serializers.

`ProjectBookingSerializer` exposes the raw state-machine status plus a
normalised `status_key`/`status_label` pair and the permission flags the UI
needs (`can_cancel`, `chat_available`), so screens never have to re-implement
business rules.
"""
from datetime import datetime

from django.utils import timezone
from rest_framework import serializers

from accounts.models import FreelancerProfile
from catalog.models import Service

from .models import (
    AvailabilitySlot,
    BookingAttachment,
    CounterOffer,
    Deliverable,
    Milestone,
    ProjectBooking,
    RevisionRequest,
)

# Semantic, lowercase status keys shared with the frontend.
STATUS_KEYS = {
    ProjectBooking.Status.DRAFT: "draft",
    ProjectBooking.Status.PENDING_PROVIDER_RESPONSE: "pending",
    ProjectBooking.Status.COUNTER_OFFERED: "offers",
    ProjectBooking.Status.AGREEMENT_REACHED: "agreed",
    ProjectBooking.Status.PAYMENT_PENDING: "payment_pending",
    ProjectBooking.Status.PAYMENT_FAILED: "payment_failed",
    ProjectBooking.Status.CONFIRMED: "confirmed",
    ProjectBooking.Status.IN_PROGRESS: "in_progress",
    ProjectBooking.Status.DELIVERABLE_SUBMITTED: "deliverable_submitted",
    ProjectBooking.Status.CLIENT_REVIEWING: "client_reviewing",
    ProjectBooking.Status.REVISION_REQUESTED: "revision_requested",
    ProjectBooking.Status.COMPLETED: "completed",
    ProjectBooking.Status.REVIEWED: "reviewed",
    ProjectBooking.Status.REJECTED: "rejected",
    ProjectBooking.Status.CANCELLED: "cancelled",
    ProjectBooking.Status.EXPIRED: "expired",
    ProjectBooking.Status.DISPUTED: "disputed",
}

STATUS_LABELS = {
    ProjectBooking.Status.DRAFT: "Draft",
    ProjectBooking.Status.PENDING_PROVIDER_RESPONSE: "Awaiting provider",
    ProjectBooking.Status.COUNTER_OFFERED: "Offer received",
    ProjectBooking.Status.AGREEMENT_REACHED: "Agreed — payment required",
    ProjectBooking.Status.PAYMENT_PENDING: "Payment pending",
    ProjectBooking.Status.PAYMENT_FAILED: "Payment failed",
    ProjectBooking.Status.CONFIRMED: "Confirmed",
    ProjectBooking.Status.IN_PROGRESS: "In progress",
    ProjectBooking.Status.DELIVERABLE_SUBMITTED: "Work submitted",
    ProjectBooking.Status.CLIENT_REVIEWING: "Awaiting your approval",
    ProjectBooking.Status.REVISION_REQUESTED: "Revision requested",
    ProjectBooking.Status.COMPLETED: "Completed",
    ProjectBooking.Status.REVIEWED: "Reviewed",
    ProjectBooking.Status.REJECTED: "Rejected",
    ProjectBooking.Status.CANCELLED: "Cancelled",
    ProjectBooking.Status.EXPIRED: "Expired",
    ProjectBooking.Status.DISPUTED: "Disputed",
}


def status_key(status: str) -> str:
    return STATUS_KEYS.get(status, (status or "").lower())


class BookingAttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = BookingAttachment
        fields = "__all__"
        read_only_fields = ("booking", "uploaded_by", "uploaded_at")

    def get_file_url(self, obj):
        if not obj.file:
            return ""
        request = self.context.get("request")
        try:
            return request.build_absolute_uri(obj.file.url) if request else obj.file.url
        except ValueError:
            return ""

    def validate_file(self, value):
        from platformcore.uploads import validate_upload

        validate_upload(value, allow_documents=True)
        return value


class CounterOfferSerializer(serializers.ModelSerializer):
    created_by_email = serializers.EmailField(source="created_by.email", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    status_key = serializers.SerializerMethodField()

    class Meta:
        model = CounterOffer
        fields = "__all__"
        read_only_fields = ("booking", "created_by", "status", "created_at")

    def get_created_by_name(self, obj):
        user = obj.created_by
        return user.get_full_name() or user.username or user.email

    def get_status_key(self, obj):
        return obj.status.lower()


class MilestoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = Milestone
        fields = "__all__"
        read_only_fields = ("booking",)


class DeliverableSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Deliverable
        fields = "__all__"
        read_only_fields = ("booking", "uploaded_by", "created_at")

    def get_file_url(self, obj):
        if not obj.file:
            return ""
        request = self.context.get("request")
        try:
            return request.build_absolute_uri(obj.file.url) if request else obj.file.url
        except ValueError:
            return ""

    def validate_file(self, value):
        from platformcore.uploads import validate_upload

        validate_upload(value, allow_documents=True)
        return value


class RevisionRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = RevisionRequest
        fields = "__all__"
        read_only_fields = ("booking", "requested_by", "status", "created_at", "resolved_at")


class ProjectBookingSerializer(serializers.ModelSerializer):
    attachments = BookingAttachmentSerializer(many=True, read_only=True)
    counter_offers = CounterOfferSerializer(many=True, read_only=True)
    milestones = MilestoneSerializer(many=True, read_only=True)
    deliverables = DeliverableSerializer(many=True, read_only=True)
    revision_requests = RevisionRequestSerializer(many=True, read_only=True)

    client_name = serializers.SerializerMethodField()
    client_email = serializers.CharField(source="client.user.email", read_only=True)
    freelancer_name = serializers.SerializerMethodField()
    provider = serializers.IntegerField(source="freelancer_id", read_only=True)
    provider_name = serializers.SerializerMethodField()

    service_title = serializers.CharField(source="service.title", read_only=True, default="")
    service_id = serializers.IntegerField(read_only=True)

    status_key = serializers.SerializerMethodField()
    status_label = serializers.SerializerMethodField()
    booking_time = serializers.DateTimeField(source="appointment_start", read_only=True)
    can_cancel = serializers.SerializerMethodField()
    chat_available = serializers.SerializerMethodField()
    active_counter_offer = serializers.SerializerMethodField()
    my_role = serializers.SerializerMethodField()
    has_review = serializers.SerializerMethodField()
    slot_id = serializers.SerializerMethodField()

    class Meta:
        model = ProjectBooking
        fields = "__all__"
        read_only_fields = (
            "client",
            "agreed_price",
            "status",
            "paid_at",
            "completed_at",
            "revisions_used",
            "created_at",
            "updated_at",
        )

    # -- helpers ---------------------------------------------------------
    def _display(self, user):
        if not user:
            return ""
        return user.get_full_name() or user.username or user.email

    def get_client_name(self, obj):
        return self._display(getattr(getattr(obj, "client", None), "user", None))

    def get_freelancer_name(self, obj):
        freelancer = obj.freelancer
        if not freelancer:
            return ""
        return self._display(freelancer.user) or freelancer.professional_title

    def get_provider_name(self, obj):
        return self.get_freelancer_name(obj)

    def get_status_key(self, obj):
        return status_key(obj.status)

    def get_status_label(self, obj):
        return STATUS_LABELS.get(obj.status, obj.status.replace("_", " ").title())

    def get_can_cancel(self, obj):
        from .services import booking_can_cancel

        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        return booking_can_cancel(obj, user)

    def get_chat_available(self, obj):
        from .services import booking_can_chat

        return booking_can_chat(obj)

    def get_active_counter_offer(self, obj):
        offer = obj.counter_offers.filter(status=CounterOffer.Status.ACTIVE).first()
        if not offer:
            return None
        return CounterOfferSerializer(offer, context=self.context).data

    def get_my_role(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return None
        if obj.client and obj.client.user_id == user.id:
            return "customer"
        if obj.freelancer and obj.freelancer.user_id == user.id:
            return "provider"
        if user.is_staff or getattr(user, "role", "") == "ADMIN":
            return "admin"
        return None

    def get_has_review(self, obj):
        return hasattr(obj, "review")

    def get_slot_id(self, obj):
        slot = getattr(obj, "slot", None)
        return slot.id if slot else None


class AvailabilitySlotSerializer(serializers.ModelSerializer):
    """Contract used by the booking calendar.

    `status` is lowercase (available|booked|blocked) for the UI;
    `status_raw` keeps the exact stored value.
    """

    status = serializers.SerializerMethodField()
    status_raw = serializers.CharField(source="status", read_only=True)
    provider = serializers.IntegerField(source="freelancer_id", read_only=True)
    provider_name = serializers.SerializerMethodField()
    is_past = serializers.BooleanField(read_only=True)
    booking_id = serializers.SerializerMethodField()

    class Meta:
        model = AvailabilitySlot
        fields = (
            "id",
            "provider",
            "provider_name",
            "service",
            "date",
            "start_time",
            "end_time",
            "status",
            "status_raw",
            "note",
            "is_past",
            "booking_id",
            "created_at",
        )
        read_only_fields = ("status", "booking_id")

    def get_status(self, obj):
        return obj.status.lower()

    def get_provider_name(self, obj):
        freelancer = obj.freelancer
        if not freelancer:
            return ""
        return (
            freelancer.user.get_full_name()
            or freelancer.professional_title
            or freelancer.user.username
        )

    def get_booking_id(self, obj):
        return obj.booking_id


class SlotCreateSerializer(serializers.Serializer):
    """Provider adds a slot: service + date + start/end time."""

    service = serializers.PrimaryKeyRelatedField(
        queryset=Service.objects.all(), required=False, allow_null=True
    )
    date = serializers.DateField()
    start_time = serializers.TimeField()
    end_time = serializers.TimeField()
    note = serializers.CharField(required=False, allow_blank=True, max_length=160)


class BookingCreateSerializer(serializers.ModelSerializer):
    """Customer creates a service request (with an offer price)."""

    slot_id = serializers.IntegerField(required=False, allow_null=True, write_only=True)

    class Meta:
        model = ProjectBooking
        fields = (
            "service",
            "service_id",
            "freelancer",
            "category",
            "booking_type",
            "service_mode",
            "title",
            "requirements",
            "proposed_price",
            "deadline",
            "appointment_start",
            "appointment_end",
            "location_address",
            "location_city",
            "latitude",
            "longitude",
            "revision_limit",
            "open_to_all",
            "expires_at",
            "slot_id",
        )

    def validate_proposed_price(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError("Offer price must be greater than zero.")
        return value

    def validate(self, attrs):
        slot_id = attrs.get("slot_id")
        service = attrs.get("service")

        # A slot carries the service, the provider and the appointment time.
        if slot_id:
            slot = AvailabilitySlot.objects.filter(pk=slot_id).select_related(
                "freelancer", "service"
            ).first()
            if not slot:
                raise serializers.ValidationError(
                    {"slot_id": "Select an available time slot."}
                )
            if slot.status != AvailabilitySlot.Status.AVAILABLE:
                raise serializers.ValidationError(
                    {"slot_id": "That slot has already been booked."}
                )
            if slot.date < timezone.localdate():
                raise serializers.ValidationError(
                    {"slot_id": "That slot is in the past."}
                )

            attrs.setdefault("freelancer", slot.freelancer)
            if not service and slot.service:
                attrs["service"] = slot.service
                service = slot.service
            if slot.service:
                attrs.setdefault("category", slot.service.category)

            # The chosen slot *is* the appointment time; without this the
            # LOCAL-mode validation below would reject a perfectly valid
            # slot booking.
            if not attrs.get("appointment_start"):
                attrs["appointment_start"] = timezone.make_aware(
                    datetime.combine(slot.date, slot.start_time),
                    timezone.get_current_timezone(),
                )
            if not attrs.get("appointment_end"):
                attrs["appointment_end"] = timezone.make_aware(
                    datetime.combine(slot.date, slot.end_time),
                    timezone.get_current_timezone(),
                )

        if service and not attrs.get("freelancer"):
            attrs["freelancer"] = service.freelancer

        if not attrs.get("freelancer") and not attrs.get("open_to_all"):
            raise serializers.ValidationError(
                {"freelancer": "Select a provider or allow open responses."}
            )

        # Local appointments need a time (from the slot) or an address.
        mode = attrs.get("service_mode") or (
            service.service_mode if service else None
        )
        if mode == "LOCAL" and not (
            attrs.get("appointment_start") or attrs.get("location_address")
        ):
            raise serializers.ValidationError(
                "Local bookings need a time slot or a service address."
            )

        # Defaults so a provider always has something actionable to respond to.
        if not attrs.get("title"):
            attrs["title"] = service.title if service else "Service request"
        if not attrs.get("proposed_price"):
            if service:
                attrs["proposed_price"] = service.starting_price
            else:
                raise serializers.ValidationError(
                    {"proposed_price": "Enter the price you want to pay."}
                )
        if not attrs.get("location_city"):
            attrs["location_city"] = (
                (service.location if service else "")
                or (attrs.get("freelancer").location if attrs.get("freelancer") else "")
            )
        if service and not attrs.get("category"):
            attrs["category"] = service.category
        return attrs


class DecisionSerializer(serializers.Serializer):
    message = serializers.CharField(required=False, allow_blank=True)


class CounterCreateSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    message = serializers.CharField(required=False, allow_blank=True)

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Offer amount must be greater than zero.")
        return value


class RevisionSerializer(serializers.Serializer):
    message = serializers.CharField()
