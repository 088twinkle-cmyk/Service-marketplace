from rest_framework import mixins, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import IsOTPVerified

from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """A user only ever sees their own notifications."""

    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified]

    filterset_fields = ["is_read", "event_type"]
    ordering_fields = ["created_at"]

    def get_queryset(self):
        user = self.request.user
        qs = Notification.objects.filter(user=user)
        if self.request.query_params.get("unread") in ("1", "true", "True"):
            qs = qs.filter(is_read=False)
        return qs

    @action(detail=True, methods=["post"], url_path="read")
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        if not notification.is_read:
            notification.is_read = True
            notification.save(update_fields=["is_read"])
        return Response(NotificationSerializer(notification).data)

    @action(detail=False, methods=["post"], url_path="read-all")
    def mark_all_read(self, request):
        updated = self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({"updated": updated})

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        return Response(
            {"unread": Notification.objects.filter(user=request.user, is_read=False).count()}
        )
