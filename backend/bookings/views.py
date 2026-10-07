"""Booking workflow API.

    /api/bookings/projects/                 service requests & bookings
    /api/bookings/slots/                    provider availability slots
    /api/bookings/attachments/              booking files
    /api/bookings/milestones/               payment milestones
    /api/bookings/deliverables/             completion proof

Every state change is validated against the state machine and notifies the
other party.
"""
import logging
from datetime import date, datetime

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.models import ClientProfile, FreelancerProfile, User
from accounts.permissions import IsFreelancer, IsOTPVerified
from catalog.models import Service
from chats.models import Conversation
from notifications.services import (
    EVENT_BOOKING_ACCEPTED,
    EVENT_BOOKING_CANCELLED,
    EVENT_BOOKING_REJECTED,
    EVENT_BOOKING_REQUESTED,
    EVENT_BOOKING_STATUS,
    EVENT_COUNTER_OFFER,
    EVENT_OFFER_ACCEPTED,
    EVENT_OFFER_REJECTED,
    notify_booking_event,
)
from platformcore.geo import coords_for_location

from .models import (
    AvailabilitySlot,
    BookingAttachment,
    CounterOffer,
    Deliverable,
    Milestone,
    ProjectBooking,
    RevisionRequest,
)
from .serializers import (
    AvailabilitySlotSerializer,
    BookingAttachmentSerializer,
    BookingCreateSerializer,
    CounterCreateSerializer,
    CounterOfferSerializer,
    DecisionSerializer,
    DeliverableSerializer,
    MilestoneSerializer,
    ProjectBookingSerializer,
    RevisionRequestSerializer,
    RevisionSerializer,
    SlotCreateSerializer,
)
from .filters import AvailabilitySlotFilter
from .services import (
    booking_can_cancel,
    booking_can_chat,
    create_slot,
    generate_slots_from_rules,
    overlapping_bookings,
    release_slot_for_booking,
    reserve_slot,
)
from .state_machine import LOCKED_AFTER_PAYMENT, transition

logger = logging.getLogger("marketplace")


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _is_client(user, booking):
    return bool(booking.client and booking.client.user_id == user.id)


def _is_freelancer(user, booking):
    return bool(booking.freelancer and booking.freelancer.user_id == user.id)


def _is_admin(user):
    return bool(
        getattr(user, "is_staff", False)
        or getattr(user, "role", "") == User.Role.ADMIN
    )


def _ensure_conversation(booking):
    if booking.freelancer_id and booking.client_id:
        Conversation.objects.get_or_create(booking=booking)


def _party_name(user):
    return user.get_full_name() or user.username or user.email


class ProjectBookingViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectBookingSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ["status", "booking_type", "service_mode", "category", "service"]
    search_fields = ["title", "requirements", "location_city"]
    ordering_fields = ["created_at", "appointment_start"]

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
                "counter_offers__created_by",
                "milestones",
                "deliverables",
                "revision_requests",
            )
        )
        user = self.request.user

        if _is_admin(user):
            return qs

        if getattr(user, "role", "") == User.Role.CLIENT:
            return qs.filter(client__user=user)

        if getattr(user, "role", "") == User.Role.FREELANCER:
            return qs.filter(freelancer__user=user) | qs.filter(
                open_to_all=True, freelancer__isnull=True
            )

        return qs.none()

    def get_serializer_class(self):
        if self.action == "create":
            return BookingCreateSerializer
        return ProjectBookingSerializer

    # -- create ---------------------------------------------------------
    def create(self, request, *args, **kwargs):
        if getattr(request.user, "role", "") == User.Role.FREELANCER:
            return Response(
                {"error": "Providers cannot create customer bookings."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        slot_id = serializer.validated_data.pop("slot_id", None)
        profile, _ = ClientProfile.objects.get_or_create(user=request.user)

        with transaction.atomic():
            booking = serializer.save(
                client=profile,
                status=ProjectBooking.Status.PENDING_PROVIDER_RESPONSE,
            )
            if slot_id:
                reserve_slot(slot_id, booking)

        updates = []
        if not booking.location_city and booking.location_address:
            booking.location_city = booking.location_address
            updates.append("location_city")

        if booking.latitude is None:
            lat, lng = coords_for_location(booking.location_city or "")
            if lat is not None:
                booking.latitude = lat
                booking.longitude = lng
                updates += ["latitude", "longitude"]

        if updates:
            booking.save(update_fields=updates)

        notify_booking_event(
            booking,
            EVENT_BOOKING_REQUESTED,
            title="New service request",
            body=(
                f"{_party_name(request.user)} requested “{booking.title}” for "
                f"Rs {booking.proposed_price}."
            ),
            audience="provider",
        )

        return Response(
            ProjectBookingSerializer(booking, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    # -- transitions ----------------------------------------------------
    def _transition(self, booking, new_status, *, notify=None):
        try:
            transition(booking, new_status)
        except DjangoValidationError as exc:
            message = exc.messages[0] if hasattr(exc, "messages") else str(exc)
            return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)

        booking.save(update_fields=["status", "updated_at"])

        if notify:
            notify_booking_event(
                booking,
                notify["event"],
                title=notify["title"],
                body=notify["body"],
                audience=notify["audience"],
            )

        logger.info(
            "Booking %s moved to %s by user=%s", booking.id, new_status, self.request.user.id
        )
        return Response(
            ProjectBookingSerializer(booking, context=self.get_serializer_context()).data
        )

    def _release_slot(self, booking):
        release_slot_for_booking(booking)

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        booking = self.get_object()

        if booking.status == ProjectBooking.Status.PENDING_PROVIDER_RESPONSE:
            if not _is_freelancer(request.user, booking):
                return Response(
                    {"error": "Only the assigned provider can accept this request."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            booking.agreed_price = booking.proposed_price
            booking.save(update_fields=["agreed_price"])
            _ensure_conversation(booking)
            return self._transition(
                booking,
                ProjectBooking.Status.AGREEMENT_REACHED,
                notify={
                    "event": EVENT_BOOKING_ACCEPTED,
                    "title": "Request accepted",
                    "body": f"{_party_name(request.user)} accepted your request. Payment is now required.",
                    "audience": "client",
                },
            )

        if booking.status == ProjectBooking.Status.COUNTER_OFFERED:
            if not _is_client(request.user, booking):
                return Response(
                    {"error": "Only the customer can accept a counter-offer."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            active = booking.counter_offers.filter(
                status=CounterOffer.Status.ACTIVE
            ).last()
            if not active:
                return Response(
                    {"error": "There is no active counter-offer to accept."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            with transaction.atomic():
                active.status = CounterOffer.Status.ACCEPTED
                active.save(update_fields=["status"])
                booking.counter_offers.filter(
                    status=CounterOffer.Status.ACTIVE
                ).exclude(pk=active.pk).update(status=CounterOffer.Status.SUPERSEDED)
                booking.agreed_price = active.amount
                booking.save(update_fields=["agreed_price"])
            _ensure_conversation(booking)
            return self._transition(
                booking,
                ProjectBooking.Status.AGREEMENT_REACHED,
                notify={
                    "event": EVENT_OFFER_ACCEPTED,
                    "title": "Offer accepted",
                    "body": f"{_party_name(request.user)} accepted your offer of Rs {active.amount}.",
                    "audience": "provider",
                },
            )

        return Response(
            {"error": "There is nothing to accept in this state."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        booking = self.get_object()
        serializer = DecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data.get("message", "")

        if booking.status == ProjectBooking.Status.PENDING_PROVIDER_RESPONSE:
            if not _is_freelancer(request.user, booking):
                return Response(
                    {"error": "Only the assigned provider can reject this request."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            self._release_slot(booking)
            return self._transition(
                booking,
                ProjectBooking.Status.REJECTED,
                notify={
                    "event": EVENT_BOOKING_REJECTED,
                    "title": "Request declined",
                    "body": reason
                    or f"{_party_name(request.user)} declined your request. You can try another provider.",
                    "audience": "client",
                },
            )

        if booking.status == ProjectBooking.Status.COUNTER_OFFERED:
            if not _is_client(request.user, booking):
                return Response(
                    {"error": "Only the customer can decline a counter-offer."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            booking.counter_offers.filter(status=CounterOffer.Status.ACTIVE).update(
                status=CounterOffer.Status.REJECTED
            )
            self._release_slot(booking)
            return self._transition(
                booking,
                ProjectBooking.Status.CANCELLED,
                notify={
                    "event": EVENT_OFFER_REJECTED,
                    "title": "Offer declined",
                    "body": reason
                    or f"{_party_name(request.user)} declined your counter-offer.",
                    "audience": "provider",
                },
            )

        return Response(
            {"error": "This booking cannot be rejected in its current state."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    @action(detail=True, methods=["post"])
    def counter(self, request, pk=None):
        """Provider sends a counter-offer. Offer history is never overwritten."""
        booking = self.get_object()

        if booking.status not in (
            ProjectBooking.Status.PENDING_PROVIDER_RESPONSE,
            ProjectBooking.Status.COUNTER_OFFERED,
        ):
            return Response(
                {"error": "Counter-offers are closed for this request."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not _is_freelancer(request.user, booking):
            return Response(
                {"error": "Only the assigned provider can send a counter-offer."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = CounterCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            booking.counter_offers.filter(status=CounterOffer.Status.ACTIVE).update(
                status=CounterOffer.Status.SUPERSEDED
            )
            CounterOffer.objects.create(
                booking=booking,
                created_by=request.user,
                amount=serializer.validated_data["amount"],
                message=serializer.validated_data.get("message", ""),
            )
            if booking.status != ProjectBooking.Status.COUNTER_OFFERED:
                transition(booking, ProjectBooking.Status.COUNTER_OFFERED)
                booking.save(update_fields=["status", "updated_at"])

        notify_booking_event(
            booking,
            EVENT_COUNTER_OFFER,
            title="New offer from provider",
            body=(
                f"{_party_name(request.user)} offered Rs "
                f"{serializer.validated_data['amount']} for “{booking.title}”."
            ),
            audience="client",
        )

        booking.refresh_from_db()
        return Response(
            ProjectBookingSerializer(booking, context=self.get_serializer_context()).data
        )

    @action(detail=True, methods=["post"])
    def start_payment(self, request, pk=None):
        booking = self.get_object()
        if not _is_client(request.user, booking):
            return Response(
                {"error": "Only the customer can start payment."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if booking.status != ProjectBooking.Status.AGREEMENT_REACHED:
            return Response(
                {"error": "Agreement is required before payment."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not booking.agreed_price:
            return Response(
                {"error": "The agreed price is missing."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return self._transition(booking, ProjectBooking.Status.PAYMENT_PENDING)

    @action(detail=True, methods=["post"])
    def start_work(self, request, pk=None):
        booking = self.get_object()
        if not _is_freelancer(request.user, booking):
            return Response(
                {"error": "Only the provider can start the work."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if booking.status != ProjectBooking.Status.CONFIRMED:
            return Response(
                {"error": "The booking is not confirmed yet."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return self._transition(
            booking,
            ProjectBooking.Status.IN_PROGRESS,
            notify={
                "event": EVENT_BOOKING_STATUS,
                "title": "Service started",
                "body": f"{_party_name(request.user)} started working on “{booking.title}”.",
                "audience": "client",
            },
        )

    @action(detail=True, methods=["post"])
    def submit_deliverable(self, request, pk=None):
        booking = self.get_object()
        if not _is_freelancer(request.user, booking):
            return Response(
                {"error": "Only the provider can submit the work."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if booking.status == ProjectBooking.Status.CONFIRMED:
            transition(booking, ProjectBooking.Status.IN_PROGRESS)
            booking.save(update_fields=["status", "updated_at"])

        if booking.status not in (
            ProjectBooking.Status.IN_PROGRESS,
            ProjectBooking.Status.REVISION_REQUESTED,
        ):
            return Response(
                {"error": "Work cannot be submitted in this state."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if booking.status == ProjectBooking.Status.REVISION_REQUESTED:
            transition(booking, ProjectBooking.Status.IN_PROGRESS)
            booking.save(update_fields=["status", "updated_at"])

        serializer = DeliverableSerializer(
            data=request.data, context=self.get_serializer_context()
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(booking=booking, uploaded_by=request.user)

        return self._transition(
            booking,
            ProjectBooking.Status.DELIVERABLE_SUBMITTED,
            notify={
                "event": EVENT_BOOKING_STATUS,
                "title": "Work submitted for approval",
                "body": f"{_party_name(request.user)} submitted the work for “{booking.title}”. Please review it.",
                "audience": "client",
            },
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Customer confirms completion -> booking completed + funds released."""
        booking = self.get_object()
        if not _is_client(request.user, booking):
            return Response(
                {"error": "Only the customer can confirm completion."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if booking.status == ProjectBooking.Status.DELIVERABLE_SUBMITTED:
            transition(booking, ProjectBooking.Status.CLIENT_REVIEWING)
            booking.save(update_fields=["status", "updated_at"])

        if booking.status not in (
            ProjectBooking.Status.CLIENT_REVIEWING,
            ProjectBooking.Status.IN_PROGRESS,
            ProjectBooking.Status.CONFIRMED,
        ):
            return Response(
                {"error": "This booking cannot be completed in its current state."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            booking.completed_at = timezone.now()
            booking.save(update_fields=["completed_at", "updated_at"])

            if booking.freelancer:
                freelancer = FreelancerProfile.objects.select_for_update().get(
                    pk=booking.freelancer_id
                )
                freelancer.completed_jobs = freelancer.completed_jobs + 1
                freelancer.save(update_fields=["completed_jobs"])

            from payments.services import settle_booking

            settle_booking(booking)

        return self._transition(
            booking,
            ProjectBooking.Status.COMPLETED,
            notify={
                "event": EVENT_BOOKING_STATUS,
                "title": "Service completed",
                "body": f"{_party_name(request.user)} confirmed completion of “{booking.title}”.",
                "audience": "provider",
            },
        )

    @action(detail=True, methods=["post"])
    def request_revision(self, request, pk=None):
        booking = self.get_object()
        if not _is_client(request.user, booking):
            return Response(
                {"error": "Only the customer can request a revision."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = RevisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if booking.revisions_used >= booking.revision_limit:
            return Response(
                {"error": "Revision limit reached. You can open a dispute instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if booking.status not in (
            ProjectBooking.Status.DELIVERABLE_SUBMITTED,
            ProjectBooking.Status.CLIENT_REVIEWING,
            ProjectBooking.Status.IN_PROGRESS,
        ):
            return Response(
                {"error": "A revision cannot be requested in this state."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if booking.status == ProjectBooking.Status.DELIVERABLE_SUBMITTED:
            transition(booking, ProjectBooking.Status.CLIENT_REVIEWING)
            booking.save(update_fields=["status", "updated_at"])

        with transaction.atomic():
            booking.revisions_used += 1
            booking.save(update_fields=["revisions_used", "updated_at"])
            RevisionRequest.objects.create(
                booking=booking,
                requested_by=request.user,
                message=serializer.validated_data["message"],
            )

        return self._transition(
            booking,
            ProjectBooking.Status.REVISION_REQUESTED,
            notify={
                "event": EVENT_BOOKING_STATUS,
                "title": "Revision requested",
                "body": f"{_party_name(request.user)} asked for changes to “{booking.title}”.",
                "audience": "provider",
            },
        )

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        booking = self.get_object()

        if not (
            _is_client(request.user, booking)
            or _is_freelancer(request.user, booking)
            or _is_admin(request.user)
        ):
            return Response({"error": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)

        if not booking_can_cancel(booking, request.user):
            if booking.status in LOCKED_AFTER_PAYMENT:
                return Response(
                    {
                        "error": "Paid bookings need a refund or dispute flow. Please open a dispute."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                {
                    "error": (
                        "This booking can no longer be cancelled online — bookings "
                        f"must be cancelled at least {settings.BOOKING_CANCEL_CUTOFF_HOURS} "
                        "hours before the appointment. Please contact the provider."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        self._release_slot(booking)
        return self._transition(
            booking,
            ProjectBooking.Status.CANCELLED,
            notify={
                "event": EVENT_BOOKING_CANCELLED,
                "title": "Booking cancelled",
                "body": f"{_party_name(request.user)} cancelled “{booking.title}”.",
                "audience": "both",
            },
        )

    @action(detail=True, methods=["post"])
    def expire(self, request, pk=None):
        if not _is_admin(request.user):
            return Response({"error": "Admin only."}, status=status.HTTP_403_FORBIDDEN)
        booking = self.get_object()
        self._release_slot(booking)
        return self._transition(booking, ProjectBooking.Status.EXPIRED)

    @action(detail=True, methods=["get"], url_path="chat")
    def chat(self, request, pk=None):
        """Conversation for this booking, or a clear reason why chat is closed."""
        booking = self.get_object()
        if not booking_can_chat(booking):
            return Response(
                {
                    "error": "Chat opens once the provider and customer agree on a price.",
                    "chat_available": False,
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        _ensure_conversation(booking)
        conversation = Conversation.objects.get(booking=booking)
        from chats.serializers import ConversationSerializer

        return Response(
            ConversationSerializer(conversation, context={"request": request}).data
        )


class AvailabilitySlotViewSet(viewsets.ModelViewSet):
    """`/api/bookings/slots/` — the provider's bookable calendar."""

    serializer_class = AvailabilitySlotSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified]
    filterset_class = AvailabilitySlotFilter
    ordering_fields = ["date", "start_time"]

    def get_queryset(self):
        qs = AvailabilitySlot.objects.select_related(
            "freelancer__user", "service", "booking"
        )
        user = self.request.user
        params = self.request.query_params

        provider_id = params.get("provider") or params.get("freelancer")
        if provider_id:
            qs = qs.filter(freelancer_id=provider_id)
        elif getattr(user, "role", "") == User.Role.FREELANCER:
            qs = qs.filter(freelancer__user=user)
        elif _is_admin(user):
            pass
        else:
            return qs.none()

        month = params.get("month")
        if month:
            try:
                year, mon = month.split("-")[:2]
                qs = qs.filter(date__year=int(year), date__month=int(mon))
            except (ValueError, AttributeError):
                pass

        date_from = params.get("from")
        if date_from:
            qs = qs.filter(date__gte=date_from)

        date_to = params.get("to")
        if date_to:
            qs = qs.filter(date__lte=date_to)

        return qs.order_by("date", "start_time")

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy", "toggle_block", "generate"):
            return [permissions.IsAuthenticated(), IsOTPVerified(), IsFreelancer()]
        return [permissions.IsAuthenticated(), IsOTPVerified()]

    def create(self, request, *args, **kwargs):
        serializer = SlotCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        profile, _ = FreelancerProfile.objects.get_or_create(user=request.user)
        service = serializer.validated_data.get("service")

        if service and service.freelancer_id != profile.id:
            return Response(
                {"error": "You can only add availability for your own services."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            slot = create_slot(
                profile,
                serializer.validated_data["date"],
                serializer.validated_data["start_time"],
                serializer.validated_data["end_time"],
                service=service,
                note=serializer.validated_data.get("note", ""),
            )
        except DjangoValidationError as exc:
            message = exc.messages[0] if hasattr(exc, "messages") else str(exc)
            return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            AvailabilitySlotSerializer(slot, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        slot = self.get_object()
        if slot.freelancer.user_id != request.user.id:
            return Response({"error": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        if slot.status == AvailabilitySlot.Status.BOOKED:
            return Response(
                {"error": "Booked slots cannot be edited. Cancel the booking first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        slot = self.get_object()
        if slot.freelancer.user_id != request.user.id:
            return Response({"error": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        if slot.status == AvailabilitySlot.Status.BOOKED:
            return Response(
                {"error": "Booked slots cannot be deleted. Cancel the booking first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        slot.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="toggle-block")
    def toggle_block(self, request, pk=None):
        slot = self.get_object()

        if slot.freelancer.user_id != request.user.id:
            return Response(
                {"error": "You can only change your own availability."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if slot.status == AvailabilitySlot.Status.BOOKED:
            return Response(
                {"error": "This slot is booked. Cancel the booking to release it."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        slot.status = (
            AvailabilitySlot.Status.AVAILABLE
            if slot.status == AvailabilitySlot.Status.BLOCKED
            else AvailabilitySlot.Status.BLOCKED
        )
        slot.save(update_fields=["status", "updated_at"])
        return Response(
            AvailabilitySlotSerializer(slot, context=self.get_serializer_context()).data
        )

    @action(detail=False, methods=["post"])
    def generate(self, request):
        """Materialise weekly availability rules into slots for a month."""
        month = request.data.get("month") or request.query_params.get("month")
        profile, _ = FreelancerProfile.objects.get_or_create(user=request.user)

        try:
            if month:
                year, mon = (int(part) for part in str(month).split("-")[:2])
            else:
                today = timezone.localdate()
                year, mon = today.year, today.month
            start = date(year, mon, 1)
            end = date(year + (mon // 12), (mon % 12) + 1, 1) - timezone.timedelta(days=1)
        except (ValueError, TypeError):
            return Response(
                {"error": "Send month as YYYY-MM."}, status=status.HTTP_400_BAD_REQUEST
            )

        created = generate_slots_from_rules(profile, start, end)
        return Response({"created": len(created), "month": f"{year}-{mon:02d}"})


class BookingAttachmentViewSet(viewsets.ModelViewSet):
    serializer_class = BookingAttachmentSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified]
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        user = self.request.user
        qs = BookingAttachment.objects.select_related("booking", "uploaded_by")
        if _is_admin(user):
            return qs
        return qs.filter(
            models_q_for_booking_user(user)
        )

    def create(self, request, *args, **kwargs):
        booking = self._resolve_booking(raise_on_missing=True)
        if isinstance(booking, Response):
            return booking
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(
            booking=booking,
            uploaded_by=request.user,
            original_name=getattr(request.FILES.get("file"), "name", ""),
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def _resolve_booking(self, raise_on_missing=False):
        """Only the customer or provider of a booking may attach files to it."""
        booking_id = self.request.data.get("booking")
        booking = (
            ProjectBooking.objects.filter(pk=booking_id)
            .select_related("client__user", "freelancer__user")
            .first()
        )
        if not booking:
            return Response(
                {"error": "Booking not found."}, status=status.HTTP_404_NOT_FOUND
            )
        user = self.request.user
        if not (
            _is_client(user, booking) or _is_freelancer(user, booking) or _is_admin(user)
        ):
            return Response(
                {"error": "You are not a participant in this booking."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return booking


class MilestoneViewSet(viewsets.ModelViewSet):
    serializer_class = MilestoneSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified]

    def get_queryset(self):
        user = self.request.user
        qs = Milestone.objects.select_related("booking")
        if _is_admin(user):
            return qs
        return qs.filter(models_q_for_booking_user(user))

    def create(self, request, *args, **kwargs):
        booking = (
            ProjectBooking.objects.filter(pk=request.data.get("booking"))
            .select_related("client__user", "freelancer__user")
            .first()
        )
        if not booking:
            return Response(
                {"error": "Booking not found."}, status=status.HTTP_404_NOT_FOUND
            )
        if not (
            _is_client(request.user, booking)
            or _is_freelancer(request.user, booking)
            or _is_admin(request.user)
        ):
            return Response(
                {"error": "You are not a participant in this booking."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(booking=booking)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class DeliverableViewSet(viewsets.ModelViewSet):
    serializer_class = DeliverableSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        user = self.request.user
        qs = Deliverable.objects.select_related("booking", "uploaded_by")
        if _is_admin(user):
            return qs
        return qs.filter(models_q_for_booking_user(user))


class RevisionRequestViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = RevisionRequestSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified]

    def get_queryset(self):
        user = self.request.user
        qs = RevisionRequest.objects.select_related("booking", "requested_by")
        if _is_admin(user):
            return qs
        return qs.filter(models_q_for_booking_user(user))


def models_q_for_booking_user(user):
    """A Q object matching rows whose booking belongs to `user`."""
    from django.db.models import Q

    return Q(booking__client__user=user) | Q(booking__freelancer__user=user)
