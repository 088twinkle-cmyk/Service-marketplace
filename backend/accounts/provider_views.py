"""Provider-facing API: onboarding profile, KYC lifecycle, public directory.

Mounted at ``/api/providers/``.

    GET    /api/providers/profile/        onboarding + KYC status (owner)
    PATCH  /api/providers/profile/        save onboarding details (owner)
    POST   /api/providers/kyc/            submit / resubmit KYC (owner)
    GET    /api/providers/kyc/            current KYC status (owner)
    GET    /api/providers/                public provider directory
    GET    /api/providers/<id>/           public provider profile

Public responses never include identity-document data.
"""
from django.db.models import Avg, Count, Q
from django.utils import timezone

from rest_framework import generics, permissions, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import FreelancerProfile, KYCVerification, User
from .permissions import IsFreelancer, IsOTPVerified
from .serializers import (
    KYCSerializer,
    KYCSummarySerializer,
    ProviderOnboardingSerializer,
    ProviderPublicSerializer,
)


def _freelancer_for(user):
    profile, _ = FreelancerProfile.objects.get_or_create(user=user)
    return profile


class ProviderProfileView(generics.GenericAPIView):
    """Read/update the logged-in provider's onboarding profile."""

    serializer_class = ProviderOnboardingSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified, IsFreelancer]

    def get(self, request):
        profile = _freelancer_for(request.user)
        return Response(self.serializer_class(profile, context={"request": request}).data)

    def patch(self, request):
        profile = _freelancer_for(request.user)
        serializer = self.serializer_class(
            profile, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return Response(serializer.data)

    # The onboarding screen posts (not patches) the first version of the form.
    post = patch


class KYCView(APIView):
    """Submit (and resubmit) KYC documents.

    A rejected submission may be corrected and resubmitted; an approved
    submission is locked.
    """

    permission_classes = [permissions.IsAuthenticated, IsOTPVerified, IsFreelancer]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        profile = _freelancer_for(request.user)
        kyc = getattr(profile, "kyc", None)
        if not kyc:
            return Response({"kyc_status": "not_submitted", "is_verified": False})
        return Response(KYCSummarySerializer(kyc, context={"request": request}).data)

    def post(self, request):
        profile = _freelancer_for(request.user)
        kyc = getattr(profile, "kyc", None)
        first_submission = kyc is None

        if kyc and kyc.status == KYCVerification.Status.APPROVED:
            return Response(
                {"error": "Your KYC is already approved and cannot be changed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = KYCSerializer(
            kyc,
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)

        if kyc:
            # Resubmission: reuse the stored documents when no new file is sent.
            front = request.FILES.get("document_front") or kyc.document_front
            back = request.FILES.get("document_back") or kyc.document_back
            kyc = serializer.save(
                freelancer=profile,
                document_front=front,
                document_back=back,
                status=KYCVerification.Status.PENDING,
                rejection_reason="",
                reviewed_at=None,
                reviewed_by=None,
            )
            from .models import KYCVerification as _KYC  # noqa: F401
            kyc.submitted_at = timezone.now()
            kyc.save(update_fields=["submitted_at"])
        else:
            kyc = serializer.save(freelancer=profile, status=KYCVerification.Status.PENDING)

        from notifications.services import notify

        for admin_user in User.objects.filter(
            Q(role=User.Role.ADMIN) | Q(is_staff=True), is_active=True
        ).distinct():
            notify(
                admin_user,
                "New KYC submission",
                f"{request.user.email} submitted KYC documents for review.",
                "kyc_submitted",
            )

        return Response(
            KYCSummarySerializer(kyc, context={"request": request}).data,
            status=(
                status.HTTP_201_CREATED
                if first_submission
                else status.HTTP_200_OK
            ),
        )


class ProviderPublicViewSet(generics.ListAPIView):
    """Public, searchable provider directory (verified + available first)."""

    serializer_class = ProviderPublicSerializer
    permission_classes = [permissions.AllowAny]

    search_fields = [
        "professional_title",
        "bio",
        "location",
        "user__username",
        "skills__name",
        "services__title",
    ]
    ordering_fields = ["rating_average", "completed_jobs", "created_at"]
    filterset_fields = ["is_available", "location"]

    def get_queryset(self):
        qs = (
            FreelancerProfile.objects.select_related("user")
            .prefetch_related("skills", "services")
            .annotate(
                review_count=Count(
                    "reviews",
                    filter=Q(reviews__is_visible=True),
                    distinct=True,
                ),
                avg_rating=Avg(
                    "reviews__rating",
                    filter=Q(reviews__is_visible=True),
                ),
            )
        )

        params = self.request.query_params

        category = params.get("category")
        if category:
            matches = Q(services__category__slug=category)
            if str(category).isdigit():
                matches |= Q(services__category_id=int(category))
            qs = qs.filter(matches).distinct()

        city = params.get("city")
        if city:
            qs = qs.filter(location__icontains=city)

        query = params.get("q") or params.get("search")
        if query:
            qs = qs.filter(
                Q(professional_title__icontains=query)
                | Q(bio__icontains=query)
                | Q(location__icontains=query)
                | Q(user__username__icontains=query)
                | Q(skills__name__icontains=query)
                | Q(services__title__icontains=query)
            ).distinct()

        if params.get("verified") in ("1", "true", "True"):
            qs = qs.filter(kyc__status=KYCVerification.Status.APPROVED)

        if params.get("available") in ("1", "true", "True"):
            qs = qs.filter(is_available=True)

        min_rating = params.get("min_rating")
        if min_rating:
            try:
                qs = qs.filter(rating_average__gte=float(min_rating))
            except ValueError:
                pass

        return qs.order_by("-rating_average", "-completed_jobs")


class ProviderPublicDetailView(generics.RetrieveAPIView):
    serializer_class = ProviderPublicSerializer
    permission_classes = [permissions.AllowAny]
    queryset = (
        FreelancerProfile.objects.select_related("user")
        .prefetch_related(
            "skills",
            "services__images",
            "services__category",
            "portfolio",
            "availability",
            "service_areas",
        )
    )
