from django.db.models import Q
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from kyc.models import ProviderProfile
from users.roles import is_freelancer
from .geo import CITY_COORDS, haversine_km
from .models import Service
from .serializers import ServiceSerializer


class ServiceViewSet(viewsets.ModelViewSet):
    queryset = Service.objects.select_related("provider").prefetch_related("images").all()
    serializer_class = ServiceSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    def perform_create(self, serializer):
        user = self.request.user
        if not is_freelancer(user):
            raise PermissionDenied("Only freelancers can publish services.")

        profile = getattr(user, "provider_profile", None)
        if not profile:
            raise ValidationError(
                {
                    "error": "KYC pending",
                    "message": "Complete KYC verification before listing services.",
                    "kyc_status": ProviderProfile.KYC_PENDING,
                }
            )

        if not profile.is_verified or profile.kyc_status != ProviderProfile.KYC_APPROVED:
            raise ValidationError(
                {
                    "error": "KYC pending",
                    "message": "Your KYC must be verified before you can publish services.",
                    "kyc_status": profile.kyc_status,
                }
            )

        image_urls = self.request.data.get("image_urls") or []
        if not image_urls:
            raise ValidationError(
                {"error": "Photos required", "message": "Upload at least one service photo."}
            )

        serializer.save(provider=user)

    def list(self, request, *args, **kwargs):
        qs = (
            self.get_queryset()
            .filter(images__isnull=False)
            .distinct()
            .order_by("-created_at")
        )
        search = (request.query_params.get("search") or "").strip()
        city = (request.query_params.get("city") or "").strip().lower()
        lat = request.query_params.get("lat")
        lng = request.query_params.get("lng")
        max_km = request.query_params.get("max_km")

        if search:
            qs = qs.filter(
                Q(title__icontains=search)
                | Q(description__icontains=search)
                | Q(location__icontains=search)
                | Q(provider__username__icontains=search)
            )

        serializer = self.get_serializer(qs, many=True)
        data = list(serializer.data)

        user_lat = user_lng = None
        if lat and lng:
            try:
                user_lat, user_lng = float(lat), float(lng)
            except (TypeError, ValueError):
                pass
        elif city and city in CITY_COORDS:
            user_lat, user_lng = CITY_COORDS[city]

        if user_lat is not None and user_lng is not None:
            max_distance = float(max_km) if max_km else None
            enriched = []
            for item in data:
                slat, slng = item.get("latitude"), item.get("longitude")
                if slat is not None and slng is not None:
                    dist = round(haversine_km(user_lat, user_lng, slat, slng), 1)
                    item["distance_km"] = dist
                    if max_distance is not None and dist > max_distance:
                        continue
                else:
                    item["distance_km"] = None
                enriched.append(item)
            enriched.sort(
                key=lambda x: (
                    x.get("distance_km") is None,
                    x.get("distance_km") if x.get("distance_km") is not None else 9999,
                )
            )
            data = enriched
        elif city:
            data.sort(
                key=lambda x: (city not in (x.get("location") or "").lower(), x.get("title", ""))
            )

        return Response(data)
