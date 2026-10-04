from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import ClientProfile, FreelancerProfile, User
from accounts.permissions import IsOTPVerified
from chats.models import Conversation, Message
from .models import BookingAttachment, CounterOffer, Deliverable, Milestone, ProjectBooking
from .serializers import (
    BookingAttachmentSerializer,
    BookingCreateSerializer,
    CounterCreateSerializer,
    CounterOfferSerializer,
    DecisionSerializer,
    DeliverableSerializer,
    MilestoneSerializer,
    ProjectBookingSerializer,
    RevisionSerializer,
)
from .state_machine import LOCKED_AFTER_PAYMENT, transition


def _is_client(user, booking):
    return booking.client.user_id == user.id


def _is_freelancer(user, booking):
    return bool(booking.freelancer and booking.freelancer.user_id == user.id)


def _ensure_conversation(booking):
    if booking.freelancer:
        Conversation.objects.get_or_create(booking=booking)


class ProjectBookingViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectBookingSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified]
    filterset_fields = ["status", "booking_type", "service_mode", "category"]
    search_fields = ["title", "requirements"]

    def get_queryset(self):
        qs = (
            ProjectBooking.objects.select_related(
                "client__user",
                "freelancer__user",
                "service",
                "category",
            )
            .prefetch_related(
                "attachments",
                "counter_offers",
                "milestones",
                "deliverables",
            )
        )
        user = self.request.user
        if user.role == User.Role.ADMIN or user.is_staff:
            return qs
        if user.role == User.Role.CLIENT:
            return qs.filter(client__user=user)
        if user.role == User.Role.FREELANCER:
            return qs.filter(freelancer__user=user) | qs.filter(
                open_to_all=True, freelancer__isnull=True
            )
        return qs.none()

    def get_serializer_class(self):
        if self.action == "create":
            return BookingCreateSerializer
        return ProjectBookingSerializer

    def perform_create(self, serializer):
        profile, _ = ClientProfile.objects.get_or_create(user=self.request.user)
        booking = serializer.save(
            client=profile,
            status=ProjectBooking.Status.PENDING_PROVIDER_RESPONSE,
        )
        _ensure_conversation(booking)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        booking = serializer.instance
        return Response(
            ProjectBookingSerializer(booking).data,
            status=status.HTTP_201_CREATED,
        )

    def _transition(self, booking, new_status):
        try:
            transition(booking, new_status)
        except ValidationError as exc:
            return Response(
                {
                    "detail": (
                        exc.messages[0]
                        if hasattr(exc, "messages")
                        else str(exc)
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        booking.save()
        return Response(ProjectBookingSerializer(booking).data)

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        booking = self.get_object()
        if booking.status == ProjectBooking.Status.PENDING_PROVIDER_RESPONSE:
            if not _is_freelancer(request.user, booking):
                return Response(
                    {"detail": "Only the assigned freelancer can accept."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            booking.agreed_price = booking.proposed_price
            booking.save(update_fields=["agreed_price"])
            _ensure_conversation(booking)
            return self._transition(
                booking, ProjectBooking.Status.AGREEMENT_REACHED
            )

        if booking.status == ProjectBooking.Status.COUNTER_OFFERED:
            if not _is_client(request.user, booking):
                return Response(
                    {"detail": "Only the client can accept a counter-offer."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            active = booking.counter_offers.filter(
                status=CounterOffer.Status.ACTIVE
            ).last()
            if not active:
                return Response(
                    {"detail": "No active counter-offer."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            with transaction.atomic():
                active.status = CounterOffer.Status.ACCEPTED
                active.save(update_fields=["status"])
                booking.agreed_price = active.amount
                booking.save(update_fields=["agreed_price"])
            return self._transition(
                booking, ProjectBooking.Status.AGREEMENT_REACHED
            )

        return Response(
            {"detail": "Nothing to accept in this state."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        booking = self.get_object()
        serializer = DecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if booking.status == ProjectBooking.Status.PENDING_PROVIDER_RESPONSE:
            if not _is_freelancer(request.user, booking):
                return Response(
                    {"detail": "Only the freelancer can reject."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            return self._transition(
                booking, ProjectBooking.Status.REJECTED
            )

        if booking.status == ProjectBooking.Status.COUNTER_OFFERED:
            if not _is_client(request.user, booking):
                return Response(
                    {"detail": "Only the client can reject a counter-offer."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            booking.counter_offers.filter(
                status=CounterOffer.Status.ACTIVE
            ).update(status=CounterOffer.Status.REJECTED)
            return self._transition(
                booking, ProjectBooking.Status.CANCELLED
            )

        return Response(
            {"detail": "Cannot reject in this state."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    @action(detail=True, methods=["post"])
    def counter(self, request, pk=None):
        booking = self.get_object()
        if booking.status not in (
            ProjectBooking.Status.PENDING_PROVIDER_RESPONSE,
            ProjectBooking.Status.COUNTER_OFFERED,
        ):
            return Response(
                {"detail": "Counter-offers are closed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not _is_freelancer(request.user, booking):
            return Response(
                {"detail": "Only the freelancer can create a counter-offer."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = CounterCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        booking.counter_offers.filter(
            status=CounterOffer.Status.ACTIVE
        ).update(status=CounterOffer.Status.SUPERSEDED)
        CounterOffer.objects.create(
            booking=booking,
            created_by=request.user,
            amount=serializer.validated_data["amount"],
            message=serializer.validated_data.get("message", ""),
        )
        if booking.status != ProjectBooking.Status.COUNTER_OFFERED:
            transition(booking, ProjectBooking.Status.COUNTER_OFFERED)
        booking.save(update_fields=["status"])
        return Response(ProjectBookingSerializer(booking).data)

    @action(detail=True, methods=["post"])
    def start_payment(self, request, pk=None):
        booking = self.get_object()
        if not _is_client(request.user, booking):
            return Response(
                {"detail": "Only the client can start payment."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if booking.status != ProjectBooking.Status.AGREEMENT_REACHED:
            return Response(
                {"detail": "Agreement required before payment."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not booking.agreed_price:
            return Response(
                {"detail": "Agreed price missing."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return self._transition(
            booking, ProjectBooking.Status.PAYMENT_PENDING
        )

    @action(detail=True, methods=["post"])
    def start_work(self, request, pk=None):
        booking = self.get_object()
        if not _is_freelancer(request.user, booking):
            return Response(
                {"detail": "Only the freelancer can start work."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if booking.status == ProjectBooking.Status.CONFIRMED:
            return self._transition(
                booking, ProjectBooking.Status.IN_PROGRESS
            )
        return Response(
            {"detail": "Project is not confirmed."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    @action(detail=True, methods=["post"])
    def submit_deliverable(self, request, pk=None):
        booking = self.get_object()
        if not _is_freelancer(request.user, booking):
            return Response(
                {"detail": "Only the freelancer can submit deliverables."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if booking.status not in (
            ProjectBooking.Status.IN_PROGRESS,
            ProjectBooking.Status.REVISION_REQUESTED,
        ):
            if booking.status == ProjectBooking.Status.CONFIRMED:
                transition(booking, ProjectBooking.Status.IN_PROGRESS)
                booking.save(update_fields=["status"])
            else:
                return Response(
                    {"detail": "Cannot submit in this state."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        serializer = DeliverableSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(booking=booking, uploaded_by=request.user)
        if booking.status == ProjectBooking.Status.REVISION_REQUESTED:
            transition(booking, ProjectBooking.Status.IN_PROGRESS)
            booking.save(update_fields=["status"])
        return self._transition(
            booking, ProjectBooking.Status.DELIVERABLE_SUBMITTED
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        booking = self.get_object()
        if not _is_client(request.user, booking):
            return Response(
                {"detail": "Only the client can approve."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if booking.status == ProjectBooking.Status.DELIVERABLE_SUBMITTED:
            transition(booking, ProjectBooking.Status.CLIENT_REVIEWING)
            booking.save(update_fields=["status"])
        if booking.status not in (
            ProjectBooking.Status.CLIENT_REVIEWING,
            ProjectBooking.Status.DELIVERABLE_SUBMITTED,
            ProjectBooking.Status.IN_PROGRESS,
        ):
            return Response(
                {"detail": "Cannot approve in this state."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        booking.completed_at = timezone.now()
        booking.save(update_fields=["completed_at"])
        if booking.freelancer:
            booking.freelancer.completed_jobs += 1
            booking.freelancer.save(update_fields=["completed_jobs"])
        from payments.services import settle_booking
        settle_booking(booking)
        return self._transition(
            booking, ProjectBooking.Status.COMPLETED
        )

    @action(detail=True, methods=["post"])
    def request_revision(self, request, pk=None):
        booking = self.get_object()
        if not _is_client(request.user, booking):
            return Response(
                {"detail": "Only the client can request a revision."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = RevisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if booking.revisions_used >= booking.revision_limit:
            return Response(
                {"detail": "Revision limit reached. Open a dispute if needed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if booking.status == ProjectBooking.Status.DELIVERABLE_SUBMITTED:
            transition(booking, ProjectBooking.Status.CLIENT_REVIEWING)
            booking.save(update_fields=["status"])
        booking.revisions_used += 1
        booking.save(update_fields=["revisions_used"])
        Deliverable.objects.create(
            booking=booking,
            uploaded_by=request.user,
            title="Revision requested",
            note=serializer.validated_data["message"],
        )
        return self._transition(
            booking, ProjectBooking.Status.REVISION_REQUESTED
        )

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        booking = self.get_object()
        if booking.status in LOCKED_AFTER_PAYMENT and not (
            request.user.role == User.Role.ADMIN or request.user.is_staff
        ):
            return Response(
                {"detail": "Paid projects require a controlled refund/dispute flow."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not (
            _is_client(request.user, booking)
            or _is_freelancer(request.user, booking)
            or request.user.role == User.Role.ADMIN
        ):
            return Response(
                {"detail": "Not allowed."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return self._transition(
            booking, ProjectBooking.Status.CANCELLED
        )

    @action(detail=True, methods=["post"])
    def expire(self, request, pk=None):
        if request.user.role != User.Role.ADMIN and not request.user.is_staff:
            return Response(
                {"detail": "Admin only."},
                status=status.HTTP_403_FORBIDDEN,
            )
        booking = self.get_object()
        return self._transition(
            booking, ProjectBooking.Status.EXPIRED
        )


class AttachmentViewSet(viewsets.ModelViewSet):
    serializer_class = BookingAttachmentSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified]

    def get_queryset(self):
        return BookingAttachment.objects.filter(
            booking__client__user=self.request.user
        ) | BookingAttachment.objects.filter(
            booking__freelancer__user=self.request.user
        )

    def perform_create(self, serializer):
        booking = ProjectBooking.objects.get(
            pk=self.request.data.get("booking")
        )
        serializer.save(
            booking=booking,
            uploaded_by=self.request.user,
            original_name=getattr(
                self.request.FILES.get("file"), "name", ""
            ),
        )


class MilestoneViewSet(viewsets.ModelViewSet):
    serializer_class = MilestoneSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified]

    def get_queryset(self):
        return Milestone.objects.filter(
            booking__client__user=self.request.user
        ) | Milestone.objects.filter(
            booking__freelancer__user=self.request.user
        )

    def perform_create(self, serializer):
        booking = ProjectBooking.objects.get(
            pk=self.request.data.get("booking")
        )
        serializer.save(booking=booking)
