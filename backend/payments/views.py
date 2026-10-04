from rest_framework import permissions, serializers, viewsets
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
    serializer_class = PaymentSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified]
    def get_queryset(self):
        qs = Payment.objects.select_related("booking", "payer")
        user = self.request.user
        if user.role == User.Role.ADMIN or user.is_staff:
            return qs
        return qs.filter(payer=user) | qs.filter(booking__freelancer__user=user)
    @action(detail=False, methods=["post"])
    def initiate(self, request):
        booking_id = request.data.get("booking")
        booking = ProjectBooking.objects.select_related("client").get(pk=booking_id)
        if booking.client.user_id != request.user.id and request.user.role != User.Role.ADMIN:
            return Response({"detail": "Only the client can pay."}, status=403)
        try:
            payment = create_payment(booking, request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response({"payment": PaymentSerializer(payment).data, "esewa": esewa_form_fields(payment)})
    @action(detail=True, methods=["post"], permission_classes=[permissions.AllowAny])
    def verify(self, request, pk=None):
        payment = Payment.objects.get(pk=pk)
        payload = request.data if isinstance(request.data, dict) else {}
        payment = verify_esewa(payment, gateway_ref=payload.get("ref_id", ""), payload=payload)
        return Response(PaymentSerializer(payment).data)
    @action(detail=False, methods=["post"], permission_classes=[permissions.AllowAny])
    def callback(self, request):
        txn = request.data.get("transaction_uuid") or request.query_params.get("transaction_uuid")
        payment = Payment.objects.filter(transaction_uuid=txn).first()
        if not payment:
            return Response({"detail": "Unknown transaction."}, status=404)
        payment = verify_esewa(payment, gateway_ref=request.data.get("ref_id", ""), payload=request.data)
        return Response(PaymentSerializer(payment).data)
class LedgerViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = LedgerSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified]
    def get_queryset(self):
        qs = LedgerTransaction.objects.select_related("payment", "booking")
        user = self.request.user
        if user.role == User.Role.ADMIN or user.is_staff:
            return qs
        return qs.filter(booking__client__user=user) | qs.filter(booking__freelancer__user=user)
    