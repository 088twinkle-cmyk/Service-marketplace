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

    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError("Rating must be 1-5.")
        return value


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

    def get_queryset(self):
        qs = Review.objects.select_related(
            "booking",
            "freelancer",
            "reviewer",
        )

        if (
            self.request.user.role == User.Role.ADMIN
            or self.request.user.is_staff
        ):
            return qs

        return qs.filter(is_visible=True)

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
                {"detail": "Only the client can review."},
                status=403,
            )

        if booking.status != ProjectBooking.Status.COMPLETED:
            return Response(
                {"detail": "Only completed projects can be reviewed."},
                status=400,
            )

        if hasattr(booking, "review"):
            return Response(
                {"detail": "Review already exists."},
                status=400,
            )

        if not booking.freelancer:
            return Response(
                {"detail": "No freelancer on this booking."},
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

        return Response(
            ReviewSerializer(review).data,
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
                    {"detail": str(exc)},
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