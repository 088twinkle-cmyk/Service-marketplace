from rest_framework import permissions, viewsets
from rest_framework.parsers import FormParser, MultiPartParser

from accounts.models import FreelancerProfile, User
from accounts.permissions import (
    IsAdminRole,
    IsFreelancer,
    IsOTPVerified,
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


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = (
        Category.objects
        .filter(is_active=True)
        .prefetch_related("subcategories")
    )
    serializer_class = CategorySerializer
    permission_classes = [permissions.AllowAny]
    search_fields = ["name", "description"]

    def get_permissions(self):
        if self.action in (
            "create",
            "update",
            "partial_update",
            "destroy",
        ):
            return [IsAdminRole()]

        return [permissions.AllowAny()]


class SubCategoryViewSet(viewsets.ModelViewSet):
    queryset = SubCategory.objects.select_related("category")
    serializer_class = SubCategorySerializer
    filterset_fields = ["category", "is_active"]

    def get_permissions(self):
        if self.action in (
            "create",
            "update",
            "partial_update",
            "destroy",
        ):
            return [IsAdminRole()]

        return [permissions.AllowAny()]


class SkillViewSet(viewsets.ModelViewSet):
    queryset = Skill.objects.all()
    serializer_class = SkillSerializer
    search_fields = ["name"]

    def get_permissions(self):
        if self.action in (
            "create",
            "update",
            "partial_update",
            "destroy",
        ):
            return [IsAdminRole()]

        return [permissions.AllowAny()]


class ServiceViewSet(viewsets.ModelViewSet):
    serializer_class = ServiceSerializer
    parser_classes = [MultiPartParser, FormParser]

    filterset_fields = [
        "category",
        "subcategory",
        "service_mode",
        "is_active",
        "freelancer",
    ]

    search_fields = [
        "title",
        "description",
        "tags",
        "location",
    ]

    ordering_fields = [
        "starting_price",
        "created_at",
    ]

    def get_queryset(self):
        qs = (
            Service.objects
            .select_related(
                "freelancer__user",
                "category",
                "subcategory",
            )
            .prefetch_related(
                "images",
                "skills",
            )
        )

        user = self.request.user

        if self.action in ("list", "retrieve"):
            if (
                not user.is_authenticated
                or user.role == User.Role.CLIENT
            ):
                return qs.filter(is_active=True)

        if (
            user.is_authenticated
            and user.role == User.Role.FREELANCER
        ):
            if self.request.query_params.get("mine") == "1":
                return qs.filter(
                    freelancer__user=user
                )

        return qs.filter(is_active=True)

    def get_permissions(self):
        if self.action in (
            "create",
            "update",
            "partial_update",
            "destroy",
        ):
            return [
                permissions.IsAuthenticated(),
                IsOTPVerified(),
                IsFreelancer(),
            ]

        return [permissions.AllowAny()]

    def perform_create(self, serializer):
        profile, _ = FreelancerProfile.objects.get_or_create(
            user=self.request.user
        )

        serializer.save(
            freelancer=profile
        )

    def perform_update(self, serializer):
        serializer.save()


class ServiceImageViewSet(viewsets.ModelViewSet):
    serializer_class = ServiceImageSerializer
    permission_classes = [
        permissions.IsAuthenticated,
        IsOTPVerified,
        IsFreelancer,
    ]
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        return ServiceImage.objects.filter(
            service__freelancer__user=self.request.user
        )

    def perform_create(self, serializer):
        service = Service.objects.get(
            pk=self.request.data.get("service"),
            freelancer__user=self.request.user,
        )

        serializer.save(
            service=service
        )


class PortfolioViewSet(viewsets.ModelViewSet):
    serializer_class = PortfolioItemSerializer
    parser_classes = [MultiPartParser, FormParser]

    filterset_fields = [
        "freelancer",
        "is_visible",
    ]

    def get_queryset(self):
        qs = PortfolioItem.objects.select_related(
            "freelancer"
        )

        user = self.request.user

        if (
            user.is_authenticated
            and user.role == User.Role.FREELANCER
            and self.request.query_params.get("mine") == "1"
        ):
            return qs.filter(
                freelancer__user=user
            )

        return qs.filter(
            is_visible=True
        )

    def get_permissions(self):
        if self.action in (
            "create",
            "update",
            "partial_update",
            "destroy",
        ):
            return [
                permissions.IsAuthenticated(),
                IsOTPVerified(),
                IsFreelancer(),
            ]

        return [permissions.AllowAny()]

    def perform_create(self, serializer):
        profile, _ = FreelancerProfile.objects.get_or_create(
            user=self.request.user
        )

        serializer.save(
            freelancer=profile
        )


class AvailabilityViewSet(viewsets.ModelViewSet):
    serializer_class = AvailabilitySerializer
    permission_classes = [
        permissions.IsAuthenticated,
        IsOTPVerified,
    ]

    def get_queryset(self):
        qs = Availability.objects.select_related(
            "freelancer"
        )

        freelancer_id = self.request.query_params.get(
            "freelancer"
        )

        if freelancer_id:
            return qs.filter(
                freelancer_id=freelancer_id
            )

        if self.request.user.role == User.Role.FREELANCER:
            return qs.filter(
                freelancer__user=self.request.user
            )

        return qs.none()

    def get_permissions(self):
        if self.action in (
            "create",
            "update",
            "partial_update",
            "destroy",
        ):
            return [
                permissions.IsAuthenticated(),
                IsOTPVerified(),
                IsFreelancer(),
            ]

        return [
            permissions.IsAuthenticated(),
            IsOTPVerified(),
        ]

    def perform_create(self, serializer):
        profile, _ = FreelancerProfile.objects.get_or_create(
            user=self.request.user
        )

        serializer.save(
            freelancer=profile
        )


class ServiceAreaViewSet(viewsets.ModelViewSet):
    serializer_class = ServiceAreaSerializer

    filterset_fields = [
        "freelancer",
        "city",
    ]

    search_fields = [
        "city",
        "area_name",
    ]

    def get_queryset(self):
        qs = ServiceArea.objects.select_related(
            "freelancer"
        )

        freelancer_id = self.request.query_params.get(
            "freelancer"
        )

        if freelancer_id:
            return qs.filter(
                freelancer_id=freelancer_id
            )

        if self.request.user.is_authenticated:
            if (
                self.request.user.role
                == User.Role.FREELANCER
            ):
                return qs.filter(
                    freelancer__user=self.request.user
                )

            return qs

        return qs.none()

    def get_permissions(self):
        if self.action in (
            "create",
            "update",
            "partial_update",
            "destroy",
        ):
            return [
                permissions.IsAuthenticated(),
                IsOTPVerified(),
                IsFreelancer(),
            ]

        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        profile, _ = FreelancerProfile.objects.get_or_create(
            user=self.request.user
        )

        serializer.save(
            freelancer=profile
        )

    def perform_update(self, serializer):
        serializer.save()