from django.contrib.auth import get_user_model
from rest_framework import permissions, serializers, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from accounts.models import KYCVerification
from accounts.permissions import IsAdminRole
from bookings.models import CounterOffer, ProjectBooking
from catalog.models import Category, Service
from payments.models import Payment
from reviews.models import Dispute, Review
from .models import AuditLog, PlatformSetting
User = get_user_model()
class AuditLogSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(source="actor.email", read_only=True)
    class Meta:
        model = AuditLog
        fields = "__all__"
class PlatformSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlatformSetting
        fields = "__all__"
class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related("actor")
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdminRole]
    filterset_fields = ["method", "status_code"]
    search_fields = ["path", "action"]
class PlatformSettingViewSet(viewsets.ModelViewSet):
    queryset = PlatformSetting.objects.all()
    serializer_class = PlatformSettingSerializer
    permission_classes = [IsAdminRole]
@api_view(["GET"])
@permission_classes([IsAdminRole])
def dashboard_stats(request):
    return Response(
        {
            "users": User.objects.count(),
            "clients": User.objects.filter(role=User.Role.CLIENT).count(),
            "freelancers": User.objects.filter(role=User.Role.FREELANCER).count(),
            "kyc_pending": KYCVerification.objects.filter(status=KYCVerification.Status.PENDING).count(),
            "categories": Category.objects.count(),
            "services": Service.objects.count(),
            "projects": ProjectBooking.objects.count(),
            "open_projects": ProjectBooking.objects.exclude(
                status__in=["COMPLETED", "REVIEWED", "CANCELLED", "REJECTED", "EXPIRED"]
            ).count(),
            "counter_offers": CounterOffer.objects.count(),
            "successful_payments": Payment.objects.filter(status="SUCCESS").count(),
            "reviews": Review.objects.count(),
            "open_disputes": Dispute.objects.exclude(status="RESOLVED").count(),
        }
    )
@api_view(["GET"])
@permission_classes([IsAdminRole])
def users_admin(request):
    role = request.GET.get("role")
    qs = User.objects.all().order_by("-date_joined")
    if role:
        qs = qs.filter(role=role)
    data = [
        {
            "id": u.id,
            "email": u.email,
            "username": u.username,
            "role": u.role,
            "is_otp_verified": u.is_otp_verified,
            "is_active_account": u.is_active_account,
            "date_joined": u.date_joined,
        }
        for u in qs[:200]
    ]
    return Response(data)