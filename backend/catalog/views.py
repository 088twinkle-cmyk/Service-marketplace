"""Catalog views: categories, services, portfolio, availability rules, areas.

Every public list endpoint is searchable, filterable and paginated server
side — the browser never downloads the whole catalog.
"""
from decimal import Decimal, InvalidOperation

from django.db.models import Avg, Count, Q

from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.models import FreelancerProfile, User
from accounts.permissions import IsAdminRole, IsFreelancer, IsOTPVerified
from platformcore.geo import (
    bounding_box,
    coords_for_location,
    default_radius_km,
    haversine_km,
)

from .models import (
    Availability,
    Category,
    PortfolioItem,
    Service,
    ServiceArea,
    ServiceImage,
    Skill,
    SubCategory,
)
from .serializers import (
    AvailabilitySerializer,
    CategorySerializer,
    PortfolioItemSerializer,
    ServiceAreaSerializer,
    ServiceImageSerializer,
    ServiceSerializer,
    SkillSerializer,
    SubCategorySerializer,
)

WRITE_ACTIONS = ("create", "update", "partial_update", "destroy")


def _decimal(value, default=None):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return default


class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    search_fields = ["name", "description"]
    ordering_fields = ["sort_order", "name"]

    def get_queryset(self):
        qs = Category.objects.prefetch_related("subcategories").annotate(
            service_count=Count("services", filter=Q(services__is_active=True))
        )
        if self.action in WRITE_ACTIONS and (
            self.request.user.is_staff or getattr(self.request.user, "role", "") == User.Role.ADMIN
        ):
            return qs
        return qs.filter(is_active=True)

    def get_permissions(self):
        if self.action in WRITE_ACTIONS:
            return [permissions.IsAuthenticated(), IsAdminRole()]
        return [permissions.AllowAny()]


class SubCategoryViewSet(viewsets.ModelViewSet):
    queryset = SubCategory.objects.select_related("category")
    serializer_class = SubCategorySerializer
    filterset_fields = ["category", "is_active"]
    search_fields = ["name"]

    def get_permissions(self):
        if self.action in WRITE_ACTIONS:
            return [permissions.IsAuthenticated(), IsAdminRole()]
        return [permissions.AllowAny()]


class SkillViewSet(viewsets.ModelViewSet):
    queryset = Skill.objects.all()
    serializer_class = SkillSerializer
    search_fields = ["name"]

    def get_permissions(self):
        if self.action in WRITE_ACTIONS:
            return [permissions.IsAuthenticated(), IsAdminRole()]
        return [permissions.AllowAny()]


class ServiceViewSet(viewsets.ModelViewSet):
    """`/api/catalog/services/`

    Public read (active services only). Providers manage their own services.
    Supports: ?category=<id|slug>&q=&city=&min_price=&max_price=&lat=&lng=
    &max_km=&min_rating=&verified=1&available=1&mine=1&ordering=price|-created_at
    """

    serializer_class = ServiceSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    filterset_fields = ["category", "subcategory", "service_mode", "is_active", "freelancer"]
    search_fields = ["title", "description", "tags", "location"]
    ordering_fields = ["starting_price", "created_at", "title"]

    def get_queryset(self):
        qs = (
            Service.objects.select_related(
                "freelancer__user",
                "freelancer__kyc",
                "category",
                "subcategory",
            )
            .prefetch_related("images", "skills")
            .annotate(
                avg_rating=Avg("freelancer__reviews__rating"),
                review_count=Count("freelancer__reviews", distinct=True),
            )
        )

        user = self.request.user
        params = self.request.query_params

        # Providers can see and manage their own inactive services.
        mine = params.get("mine") in ("1", "true", "True")
        if user.is_authenticated and getattr(user, "role", "") == User.Role.FREELANCER and mine:
            qs = qs.filter(freelancer__user=user)
            if self.action not in WRITE_ACTIONS:
                pass
        elif user.is_authenticated and getattr(user, "role", "") == User.Role.ADMIN:
            pass  # admins see everything
        else:
            qs = qs.filter(is_active=True)

        return self._apply_filters(qs)

    # ------------------------------------------------------------------
    def _apply_filters(self, qs):
        params = self.request.query_params

        category = params.get("category")
        if category:
            if str(category).isdigit():
                qs = qs.filter(category_id=category)
            else:
                qs = qs.filter(category__slug=category)

        subcategory = params.get("subcategory")
        if subcategory and str(subcategory).isdigit():
            qs = qs.filter(subcategory_id=subcategory)

        query = params.get("q") or params.get("search")
        if query:
            qs = qs.filter(
                Q(title__icontains=query)
                | Q(description__icontains=query)
                | Q(tags__icontains=query)
                | Q(location__icontains=query)
                | Q(category__name__icontains=query)
                | Q(subcategory__name__icontains=query)
                | Q(freelancer__professional_title__icontains=query)
                | Q(freelancer__user__username__icontains=query)
                | Q(skills__name__icontains=query)
            ).distinct()

        city = params.get("city")
        if city:
            qs = qs.filter(
                Q(location__icontains=city)
                | Q(freelancer__location__icontains=city)
                | Q(freelancer__service_areas__city__icontains=city)
            ).distinct()

        min_price = _decimal(params.get("min_price"))
        if min_price is not None:
            qs = qs.filter(starting_price__gte=min_price)

        max_price = _decimal(params.get("max_price") or params.get("budget"))
        if max_price is not None:
            qs = qs.filter(starting_price__lte=max_price)

        min_rating = _decimal(params.get("min_rating"))
        if min_rating is not None:
            qs = qs.filter(freelancer__rating_average__gte=min_rating)

        if params.get("verified") in ("1", "true", "True"):
            qs = qs.filter(freelancer__kyc__status="APPROVED")

        if params.get("available") in ("1", "true", "True"):
            qs = qs.filter(freelancer__is_available=True)

        service_mode = params.get("service_mode")
        if service_mode:
            qs = qs.filter(service_mode__iexact=service_mode)

        # Geo: bounding box in SQL, exact distance computed per row afterwards.
        lat = _decimal(params.get("lat"))
        lng = _decimal(params.get("lng"))
        max_km = _decimal(params.get("max_km") or params.get("radius_km"))

        if lat is not None and lng is not None:
            radius = float(max_km) if max_km else default_radius_km()
            self._geo = (float(lat), float(lng), radius)
            min_lat, max_lat, min_lng, max_lng = bounding_box(
                float(lat), float(lng), radius
            )
            qs = qs.filter(
                latitude__isnull=False,
                longitude__isnull=False,
                latitude__gte=min_lat,
                latitude__lte=max_lat,
                longitude__gte=min_lng,
                longitude__lte=max_lng,
            )
        else:
            self._geo = None

        return qs

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        geo = getattr(self, "_geo", None)
        ordering = self.request.query_params.get("ordering")

        if geo:
            lat, lng, radius = geo
            matched = [
                service
                for service in queryset
                if haversine_km(lat, lng, service.latitude, service.longitude) <= radius
            ]
            for service in matched:
                service.distance_km = haversine_km(
                    lat, lng, service.latitude, service.longitude
                )
            if ordering == "distance":
                matched.sort(key=lambda s: s.distance_km)
            return matched

        return queryset

    # ------------------------------------------------------------------
    def get_permissions(self):
        if self.action in WRITE_ACTIONS:
            return [
                permissions.IsAuthenticated(),
                IsOTPVerified(),
                IsFreelancer(),
            ]
        return [permissions.AllowAny()]

    def perform_create(self, serializer):
        profile, _ = FreelancerProfile.objects.get_or_create(user=self.request.user)
        extra = {}
        if not serializer.validated_data.get("latitude"):
            lat, lng = coords_for_location(
                serializer.validated_data.get("location") or profile.location
            )
            if lat is not None:
                extra = {"latitude": lat, "longitude": lng}
        serializer.save(freelancer=profile, **extra)

    def perform_update(self, serializer):
        instance = self.get_object()
        extra = {}
        location = (
            serializer.validated_data.get("location", instance.location)
        )
        if not serializer.validated_data.get("latitude") and not instance.latitude:
            lat, lng = coords_for_location(location)
            if lat is not None:
                extra = {"latitude": lat, "longitude": lng}
        serializer.save(**extra)

    @action(detail=False, methods=["get"], url_path="mine")
    def my_services(self, request):
        """Provider's own services, including inactive ones."""
        if not request.user.is_authenticated:
            return Response({"error": "Authentication required."}, status=401)
        qs = (
            Service.objects.filter(freelancer__user=request.user)
            .select_related("category")
            .prefetch_related("images")
            .annotate(
                avg_rating=Avg("freelancer__reviews__rating"),
                review_count=Count("freelancer__reviews", distinct=True),
            )
            .order_by("-created_at")
        )
        page = self.paginate_queryset(qs)
        serializer = self.get_serializer(page if page is not None else qs, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def toggle_active(self, request, pk=None):
        service = self.get_object()
        if service.freelancer.user_id != request.user.id and not (
            request.user.is_staff or request.user.role == User.Role.ADMIN
        ):
            return Response({"error": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        service.is_active = not service.is_active
        service.save(update_fields=["is_active", "updated_at"])
        return Response(ServiceSerializer(service, context={"request": request}).data)


class ServiceImageViewSet(viewsets.ModelViewSet):
    serializer_class = ServiceImageSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified, IsFreelancer]
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        return ServiceImage.objects.filter(service__freelancer__user=self.request.user)

    def perform_create(self, serializer):
        service = Service.objects.get(
            pk=self.request.data.get("service"), freelancer__user=self.request.user
        )
        serializer.save(service=service)


class PortfolioViewSet(viewsets.ModelViewSet):
    """`/api/catalog/portfolio/` — public items are read-only, owners edit."""

    serializer_class = PortfolioItemSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ["freelancer", "is_visible"]
    ordering_fields = ["created_at"]

    def get_queryset(self):
        qs = PortfolioItem.objects.select_related("freelancer__user")
        user = self.request.user
        params = self.request.query_params

        if user.is_authenticated and params.get("mine") in ("1", "true", "True"):
            return qs.filter(freelancer__user=user)
        return qs.filter(is_visible=True)

    def get_permissions(self):
        if self.action in WRITE_ACTIONS:
            return [permissions.IsAuthenticated(), IsOTPVerified(), IsFreelancer()]
        return [permissions.AllowAny()]

    def perform_create(self, serializer):
        profile, _ = FreelancerProfile.objects.get_or_create(user=self.request.user)
        serializer.save(freelancer=profile)

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        if self.action in WRITE_ACTIONS and obj.freelancer.user_id != request.user.id:
            if not (request.user.is_staff or request.user.role == User.Role.ADMIN):
                self.permission_denied(
                    request, message="You can only manage your own portfolio."
                )


class AvailabilityViewSet(viewsets.ModelViewSet):
    """Weekly / date-specific availability *rules*.

    Concrete bookable slots are served by `/api/bookings/slots/`.
    """

    serializer_class = AvailabilitySerializer
    ordering_fields = ["weekday", "specific_date", "start_time"]

    def get_queryset(self):
        qs = Availability.objects.select_related("freelancer__user")
        user = self.request.user
        params = self.request.query_params

        freelancer_id = params.get("freelancer") or params.get("provider")
        if freelancer_id:
            # Availability of a provider is public information (it powers the
            # booking calendar), so a customer can read it too.
            return qs.filter(freelancer_id=freelancer_id)

        if user.is_authenticated and getattr(user, "role", "") == User.Role.FREELANCER:
            return qs.filter(freelancer__user=user)

        if user.is_authenticated and (user.is_staff or getattr(user, "role", "") == User.Role.ADMIN):
            return qs

        return qs.none()

    def get_permissions(self):
        if self.action in WRITE_ACTIONS:
            return [permissions.IsAuthenticated(), IsOTPVerified(), IsFreelancer()]
        # Reading someone's published availability requires being signed in,
        # which keeps the booking calendar usable without exposing it publicly.
        return [permissions.IsAuthenticated(), IsOTPVerified()]

    def perform_create(self, serializer):
        profile, _ = FreelancerProfile.objects.get_or_create(user=self.request.user)
        serializer.save(freelancer=profile)


class ServiceAreaViewSet(viewsets.ModelViewSet):
    serializer_class = ServiceAreaSerializer
    filterset_fields = ["freelancer", "city"]
    search_fields = ["city", "area_name"]

    def get_queryset(self):
        qs = ServiceArea.objects.select_related("freelancer__user")
        user = self.request.user
        params = self.request.query_params

        freelancer_id = params.get("freelancer") or params.get("provider")
        if freelancer_id:
            return qs.filter(freelancer_id=freelancer_id)

        if user.is_authenticated and getattr(user, "role", "") == User.Role.FREELANCER:
            return qs.filter(freelancer__user=user)

        return qs

    def get_permissions(self):
        if self.action in WRITE_ACTIONS:
            return [permissions.IsAuthenticated(), IsOTPVerified(), IsFreelancer()]
        return [permissions.AllowAny()]

    def perform_create(self, serializer):
        profile, _ = FreelancerProfile.objects.get_or_create(user=self.request.user)
        city = serializer.validated_data.get("city", "")
        lat, lng = coords_for_location(city)
        serializer.save(
            freelancer=profile,
            latitude=serializer.validated_data.get("latitude") or lat,
            longitude=serializer.validated_data.get("longitude") or lng,
        )
