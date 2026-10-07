from django.db.models import Avg, Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import User
from accounts.permissions import IsAdminRole, IsOTPVerified
from bookings.models import ProjectBooking
from bookings.state_machine import transition

from .models import Dispute, Report, Review


class ReviewSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    provider = serializers.IntegerField(source="freelancer_id", read_only=True)
    provider_name = serializers.SerializerMethodField()
    service_title = serializers.SerializerMethodField()
    booking_title = serializers.CharField(source="booking.title", read_only=True)
    rating = serializers.IntegerField(min_value=1, max_value=5)

    class Meta:
        model = Review
        fields = "__all__"
        read_only_fields = (
            "reviewer",
            "freelancer",
            "is_visible",
            "moderated_by",
            "created_at",
            "updated_at",
        )

    def get_customer_name(self, obj):
        user = obj.reviewer
        if not user:
            return ""
        return user.get_full_name() or user.username or user.email

    def get_provider_name(self, obj):
        freelancer = obj.freelancer
        if not freelancer:
            return ""
        user = freelancer.user
        return (
            user.get_full_name()
            or freelancer.professional_title
            or user.username
        )

    def get_service_title(self, obj):
        booking = obj.booking
        if booking and booking.service:
            return booking.service.title
        return booking.title if booking else ""

    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError("Rating must be 1-5.")
        return value

    def validate(self, attrs):
        if self.instance is None and not (
            self.initial_data.get("booking")
        ):
            raise serializers.ValidationError(
                {"booking": "A review must reference the booking it belongs to."}
            )
        return attrs


class DisputeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Dispute
        fields = "__all__"
        read_only_fields = (
            "opened_by",
            "status",
            "resolution",
            "created_at",
            "resolved_at",
        )


class ReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = Report
        fields = "__all__"
        read_only_fields = (
            "reporter",
            "is_resolved",
            "created_at",
        )


def recalc_freelancer_rating(freelancer):
    agg = freelancer.reviews.filter(is_visible=True).aggregate(
        avg=Avg("rating"),
        count=Count("id"),
    )

    freelancer.rating_average = agg["avg"] or 0
    freelancer.rating_count = agg["count"] or 0

    freelancer.save(
        update_fields=["rating_average", "rating_count"]
    )


class ReviewViewSet(viewsets.ModelViewSet):
    serializer_class = ReviewSerializer
    permission_classes = [
        permissions.IsAuthenticated,
        IsOTPVerified,
    ]
    filterset_fields = [
        "freelancer",
        "rating",
        "is_visible",
    ]
    ordering_fields = ["created_at", "rating"]

    def get_queryset(self):
        qs = Review.objects.select_related(
            "booking",
            "booking__service",
            "freelancer__user",
            "reviewer",
        )

        user = self.request.user
        params = self.request.query_params

        if user.is_authenticated and (
            user.is_staff or user.role == User.Role.ADMIN
        ):
            pass
        else:
            qs = qs.filter(is_visible=True)

        provider = params.get("provider") or params.get("freelancer")
        if provider:
            qs = qs.filter(freelancer_id=provider)

        service = params.get("service")
        if service:
            qs = qs.filter(booking__service_id=service)

        return qs.order_by("-created_at")

    def get_permissions(self):
        # Reviews are public information: anyone browsing a provider can read them.
        if self.action in ("list", "retrieve"):
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated(), IsOTPVerified()]

    def create(self, request, *args, **kwargs):
        booking = get_object_or_404(
            ProjectBooking.objects.select_related(
                "client",
                "freelancer",
            ),
            pk=request.data.get("booking"),
        )

        if booking.client.user_id != request.user.id:
            return Response(
                {"error": "Only the client can review."},
                status=403,
            )

        if booking.status != ProjectBooking.Status.COMPLETED:
            return Response(
                {"error": "Only completed projects can be reviewed."},
                status=400,
            )

        if hasattr(booking, "review"):
            return Response(
                {"error": "Review already exists."},
                status=400,
            )

        if not booking.freelancer:
            return Response(
                {"error": "No freelancer on this booking."},
                status=400,
            )

        serializer = self.get_serializer(
            data=request.data
        )
        serializer.is_valid(raise_exception=True)

        review = serializer.save(
            reviewer=request.user,
            freelancer=booking.freelancer,
        )

        transition(
            booking,
            ProjectBooking.Status.REVIEWED,
        )

        booking.save(
            update_fields=["status"]
        )

        recalc_freelancer_rating(
            booking.freelancer
        )

        from notifications.services import EVENT_REVIEW, notify

        notify(
            booking.freelancer.user,
            "New review received",
            f"You received a {review.rating}-star review for “{booking.title}”.",
            EVENT_REVIEW,
        )

        return Response(
            ReviewSerializer(review, context={"request": request}).data,
            status=201,
        )

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[IsAdminRole],
    )
    def moderate(self, request, pk=None):
        review = self.get_object()

        review.is_visible = bool(
            request.data.get(
                "is_visible",
                True,
            )
        )

        review.moderated_by = request.user

        review.save(
            update_fields=[
                "is_visible",
                "moderated_by",
            ]
        )

        recalc_freelancer_rating(
            review.freelancer
        )

        return Response(
            ReviewSerializer(review).data
        )


class DisputeViewSet(viewsets.ModelViewSet):
    serializer_class = DisputeSerializer
    permission_classes = [
        permissions.IsAuthenticated,
        IsOTPVerified,
    ]

    def get_queryset(self):
        qs = Dispute.objects.select_related(
            "booking",
            "opened_by",
        )

        user = self.request.user

        if (
            user.role == User.Role.ADMIN
            or user.is_staff
        ):
            return qs

        return (
            qs.filter(opened_by=user)
            | qs.filter(booking__client__user=user)
            | qs.filter(
                booking__freelancer__user=user
            )
        )

    def perform_create(self, serializer):
        booking = serializer.validated_data["booking"]

        if booking.status in (
            ProjectBooking.Status.CONFIRMED,
            ProjectBooking.Status.IN_PROGRESS,
            ProjectBooking.Status.DELIVERABLE_SUBMITTED,
            ProjectBooking.Status.CLIENT_REVIEWING,
            ProjectBooking.Status.REVISION_REQUESTED,
            ProjectBooking.Status.COMPLETED,
        ):
            try:
                transition(
                    booking,
                    ProjectBooking.Status.DISPUTED,
                )

                booking.save(
                    update_fields=["status"]
                )
            except Exception:
                pass

        serializer.save(
            opened_by=self.request.user
        )

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[IsAdminRole],
    )
    def resolve(self, request, pk=None):
        dispute = self.get_object()

        dispute.status = request.data.get(
            "status",
            Dispute.Status.RESOLVED,
        )

        dispute.resolution = request.data.get(
            "resolution",
            "",
        )

        dispute.resolved_at = timezone.now()

        dispute.save()

        next_status = request.data.get(
            "booking_status"
        )

        if next_status:
            booking = dispute.booking

            try:
                transition(
                    booking,
                    next_status,
                )

                booking.save(
                    update_fields=["status"]
                )

            except Exception as exc:
                return Response(
                    {"error": str(exc)},
                    status=400,
                )

        return Response(
            DisputeSerializer(dispute).data
        )


class ReportViewSet(viewsets.ModelViewSet):
    serializer_class = ReportSerializer
    permission_classes = [
        permissions.IsAuthenticated,
        IsOTPVerified,
    ]

    def get_queryset(self):
        qs = Report.objects.all()

        if (
            self.request.user.role == User.Role.ADMIN
            or self.request.user.is_staff
        ):
            return qs

        return qs.filter(
            reporter=self.request.user
        )

    def perform_create(self, serializer):
        serializer.save(
            reporter=self.request.user
        )