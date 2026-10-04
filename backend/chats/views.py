from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import User
from accounts.permissions import IsOTPVerified
from .models import Conversation, Message
from .serializers import ConversationSerializer, MessageSerializer


def _participant_qs(user):
    qs = Conversation.objects.select_related(
        "booking",
        "booking__client__user",
        "booking__freelancer__user",
    )

    if user.role == User.Role.ADMIN or user.is_staff:
        return qs

    return qs.filter(
        booking__client__user=user
    ) | qs.filter(
        booking__freelancer__user=user
    )


class ConversationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ConversationSerializer
    permission_classes = [
        permissions.IsAuthenticated,
        IsOTPVerified,
    ]

    def get_queryset(self):
        return _participant_qs(self.request.user).prefetch_related(
            "messages"
        )

    @action(detail=True, methods=["post"])
    def send(self, request, pk=None):
        conversation = self.get_object()
        booking = conversation.booking

        if booking.status in (
            "DRAFT",
            "PENDING_PROVIDER_RESPONSE",
            "COUNTER_OFFERED",
            "REJECTED",
            "CANCELLED",
            "EXPIRED",
        ):
            # Allow chat after agreement/payment;
            # still let participants message once assigned.
            if booking.status in (
                "REJECTED",
                "CANCELLED",
                "EXPIRED",
            ):
                return Response(
                    {"detail": "Chat is closed for this project."},
                    status=400,
                )

        serializer = MessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(
            conversation=conversation,
            sender=request.user,
        )

        return Response(serializer.data, status=201)