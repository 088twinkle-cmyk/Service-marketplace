from rest_framework import serializers

from .models import (
    AvailabilitySlot,
    Booking,
    BookingAttachment,
    CounterOffer,
    Deliverable,
    Dispute,
    Payment,
    RevisionRequest,
    Transaction,
)


class AvailabilitySlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = AvailabilitySlot
        fields = [
            "id",
            "provider",
            "service",
            "date",
            "start_time",
            "end_time",
            "status",
            "booking",
        ]
        read_only_fields = ["provider", "booking"]

    def validate(self, attrs):
        from rest_framework.exceptions import ValidationError
        from .utils import slot_overlaps, time_ranges_overlap

        start = attrs.get("start_time") or getattr(self.instance, "start_time", None)
        end = attrs.get("end_time") or getattr(self.instance, "end_time", None)
        date = attrs.get("date") or getattr(self.instance, "date", None)
        service = attrs.get("service") or getattr(self.instance, "service", None)

        if start and end and start >= end:
            raise ValidationError({"end_time": "End time must be after start time."})

        request = self.context.get("request")
        provider_id = None
        if request and request.user.is_authenticated:
            provider_id = request.user.id
        elif self.instance:
            provider_id = self.instance.provider_id

        if provider_id and date and start and end:
            exclude = self.instance.pk if self.instance else None
            if slot_overlaps(provider_id, date, start, end, exclude_id=exclude):
                raise ValidationError(
                    {"start_time": "This time overlaps with an existing slot on that date."}
                )

        if service and date and start and end:
            booked = AvailabilitySlot.objects.filter(
                service=service,
                date=date,
                status=AvailabilitySlot.STATUS_BOOKED,
            )
            if self.instance:
                booked = booked.exclude(pk=self.instance.pk)
            for other in booked:
                if time_ranges_overlap(start, end, other.start_time, other.end_time):
                    raise ValidationError(
                        {"start_time": "Time overlaps with an existing booking on this date."}
                    )
        return attrs


class CounterOfferSerializer(serializers.ModelSerializer):
    creator_name = serializers.CharField(source="creator.username", read_only=True)

    class Meta:
        model = CounterOffer
        fields = [
            "id",
            "creator",
            "creator_name",
            "amount",
            "message",
            "status",
            "created_at",
        ]
        read_only_fields = ["creator", "creator_name", "status", "created_at"]


class DeliverableSerializer(serializers.ModelSerializer):
    class Meta:
        model = Deliverable
        fields = ["id", "uploaded_by", "file_url", "link_url", "notes", "created_at"]
        read_only_fields = ["uploaded_by", "created_at"]


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = [
            "id",
            "amount",
            "currency",
            "status",
            "gateway",
            "merchant_pid",
            "gateway_ref",
            "created_at",
        ]
        read_only_fields = fields


class BookingSerializer(serializers.ModelSerializer):
    slot_id = serializers.IntegerField(write_only=True, required=False)
    service_title = serializers.SerializerMethodField()
    can_cancel = serializers.SerializerMethodField()
    counter_offers = CounterOfferSerializer(many=True, read_only=True)
    active_counter = serializers.SerializerMethodField()
    latest_payment = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            "id",
            "customer",
            "provider",
            "service",
            "service_title",
            "booking_type",
            "service_mode",
            "title",
            "requirements",
            "proposed_price",
            "agreed_price",
            "deadline",
            "location_text",
            "booking_time",
            "status",
            "notes",
            "revision_limit",
            "revision_count",
            "price_locked",
            "slot_id",
            "created_at",
            "can_cancel",
            "counter_offers",
            "active_counter",
            "latest_payment",
        ]
        read_only_fields = [
            "customer",
            "status",
            "created_at",
            "can_cancel",
            "price_locked",
            "agreed_price",
            "revision_count",
        ]

    def get_service_title(self, obj):
        return obj.display_title

    def get_can_cancel(self, obj):
        from datetime import timedelta
        from django.utils import timezone

        status = obj.canonical_status()
        if status in (
            Booking.CANCELLED,
            Booking.COMPLETED,
            Booking.REVIEWED,
            Booking.REJECTED,
        ):
            return False
        if not obj.booking_time:
            return True
        return obj.booking_time > timezone.now() + timedelta(hours=24)

    def get_active_counter(self, obj):
        offer = obj.counter_offers.filter(status=CounterOffer.PENDING).first()
        if not offer:
            return None
        return CounterOfferSerializer(offer).data

    def get_latest_payment(self, obj):
        payment = obj.payments.order_by("-created_at").first()
        if not payment:
            return None
        return PaymentSerializer(payment).data

    def create(self, validated_data):
        validated_data.pop("slot_id", None)
        return super().create(validated_data)
