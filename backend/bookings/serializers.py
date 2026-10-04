from rest_framework import serializers
from .models import BookingAttachment, CounterOffer, Deliverable, Milestone, ProjectBooking
class BookingAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = BookingAttachment
        fields = "__all__"
        read_only_fields = ("booking", "uploaded_by", "uploaded_at")
class CounterOfferSerializer(serializers.ModelSerializer):
    created_by_email = serializers.EmailField(source="created_by.email", read_only=True)
    class Meta:
        model = CounterOffer
        fields = "__all__"
        read_only_fields = ("booking", "created_by", "status", "created_at")
class MilestoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = Milestone
        fields = "__all__"
        read_only_fields = ("booking",)
class DeliverableSerializer(serializers.ModelSerializer):
    class Meta:
        model = Deliverable
        fields = "__all__"
        read_only_fields = ("booking", "uploaded_by", "created_at")
class ProjectBookingSerializer(serializers.ModelSerializer):
    attachments = BookingAttachmentSerializer(many=True, read_only=True)
    counter_offers = CounterOfferSerializer(many=True, read_only=True)
    milestones = MilestoneSerializer(many=True, read_only=True)
    deliverables = DeliverableSerializer(many=True, read_only=True)
    client_name = serializers.CharField(source="client.user.email", read_only=True)
    freelancer_name = serializers.CharField(source="freelancer.user.email", read_only=True)
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
        )
class BookingCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectBooking
        fields = (
            "service",
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
        )
    def validate(self, attrs):
        booking_type = attrs.get("booking_type")
        mode = attrs.get("service_mode")
        if booking_type in (
            ProjectBooking.BookingType.LOCAL_APPOINTMENT,
        ) or mode == "LOCAL":
            if not attrs.get("appointment_start") and not attrs.get("location_address"):
                raise serializers.ValidationError(
                    "Local bookings require appointment time and/or location."
                )
        if attrs.get("service") and not attrs.get("freelancer"):
            attrs["freelancer"] = attrs["service"].freelancer
        if not attrs.get("freelancer") and not attrs.get("open_to_all"):
            raise serializers.ValidationError("Select a freelancer or allow open responses.")
        return attrs
class DecisionSerializer(serializers.Serializer):
    message = serializers.CharField(required=False, allow_blank=True)
class CounterCreateSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    message = serializers.CharField(required=False, allow_blank=True)
class RevisionSerializer(serializers.Serializer):
    message = serializers.CharField()