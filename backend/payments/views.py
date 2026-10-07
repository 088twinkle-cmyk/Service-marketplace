from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from accounts.models import User
from accounts.permissions import IsOTPVerified
from bookings.models import ProjectBooking
from .models import LedgerTransaction, Payment
from .services import create_payment, esewa_form_fields, verify_esewa
class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = "__all__"
        read_only_fields = (
            "payer",
            "amount",
            "status",
            "transaction_uuid",
            "gateway_ref",
            "signature",
            "raw_payload",
            "idempotency_key",
            "verified_at",
        )
class LedgerSerializer(serializers.ModelSerializer):
    class Meta:
        model = LedgerTransaction
        fields = "__all__"
class PaymentViewSet(viewsets.ReadOnlyModelViewSet):
    """Payment history and eSewa initiation/verification.

    Payment success is only ever decided by the server: the client can ask for
    verification, but the gateway (or the sandbox verifier in DEBUG) decides.
    """

    serializer_class = PaymentSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified]
    filterset_fields = ["status", "gateway", "booking"]
    ordering_fields = ["created_at"]

    def get_queryset(self):
        qs = Payment.objects.select_related("booking", "payer", "booking__service")
        user = self.request.user
        if user.role == User.Role.ADMIN or user.is_staff:
            return qs
        return qs.filter(payer=user) | qs.filter(booking__freelancer__user=user)

    @action(detail=False, methods=["post"])
    def initiate(self, request):
        booking_id = request.data.get("booking")
        booking = ProjectBooking.objects.select_related("client").filter(pk=booking_id).first()
        if not booking:
            return Response({"error": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)
        if (
            booking.client.user_id != request.user.id
            and request.user.role != User.Role.ADMIN
            and not request.user.is_staff
        ):
            # 404 (not 403) so payment IDs cannot be used to probe for
            # other people's bookings.
            return Response(
                {"error": "Booking not found."}, status=status.HTTP_404_NOT_FOUND
            )
        try:
            payment = create_payment(booking, request.user)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response(
            {
                "payment": PaymentSerializer(payment).data,
                "esewa": esewa_form_fields(payment),
            }
        )

    @action(detail=True, methods=["post"], permission_classes=[permissions.AllowAny])
    def verify(self, request, pk=None):
        """Called by the client after the gateway redirect. Server verifies."""
        payment = Payment.objects.filter(pk=pk).first()
        if not payment:
            return Response({"error": "Payment not found."}, status=404)
        payload = request.data if isinstance(request.data, dict) else {}
        payment = verify_esewa(
            payment, gateway_ref=payload.get("ref_id", ""), payload=payload
        )
        return Response(PaymentSerializer(payment).data)

    @action(detail=False, methods=["post"], permission_classes=[permissions.AllowAny])
    def callback(self, request):
        """Server-to-server / redirect callback from the gateway."""
        txn = request.data.get("transaction_uuid") or request.query_params.get(
            "transaction_uuid"
        )
        payment = Payment.objects.filter(transaction_uuid=txn).first()
        if not payment:
            return Response({"error": "Unknown transaction."}, status=404)
        payment = verify_esewa(
            payment, gateway_ref=request.data.get("ref_id", ""), payload=request.data
        )
        return Response(PaymentSerializer(payment).data)

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        """Authoritative earnings for the provider dashboard."""
        user = request.user
        from django.db.models import Sum

        qs = Payment.objects.filter(status=Payment.Status.SUCCESS)
        if not (user.role == User.Role.ADMIN or user.is_staff):
            qs = qs.filter(booking__freelancer__user=user)

        paid = qs.aggregate(total=Sum("amount"))["total"] or 0
        settled = qs.filter(
            booking__transactions__kind="SETTLEMENT"
        ).aggregate(total=Sum("amount"))["total"] or 0

        return Response(
            {
                "total_earned": str(paid),
                "settled": str(settled),
                "pending": str(paid - settled),
                "jobs_paid": qs.count(),
            }
        )
class LedgerViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = LedgerSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified]
    def get_queryset(self):
        qs = LedgerTransaction.objects.select_related("payment", "booking")
        user = self.request.user
        if user.role == User.Role.ADMIN or user.is_staff:
            return qs
        return qs.filter(booking__client__user=user) | qs.filter(booking__freelancer__user=user)
    