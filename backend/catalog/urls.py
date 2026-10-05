from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AvailabilityViewSet,
    CategoryViewSet,
    PortfolioViewSet,
    ServiceAreaViewSet,
    ServiceImageViewSet,
    ServiceViewSet,
    SkillViewSet,
    SubCategoryViewSet,
)


router = DefaultRouter()

router.register(
    "categories",
    CategoryViewSet,
    basename="category",
)

router.register(
    "subcategories",
    SubCategoryViewSet,
    basename="subcategory",
)

router.register(
    "skills",
    SkillViewSet,
    basename="skill",
)

router.register(
    "services",
    ServiceViewSet,
    basename="service",
)

router.register(
    "service-images",
    ServiceImageViewSet,
    basename="service-image",
)

router.register(
    "portfolio",
    PortfolioViewSet,
    basename="portfolio",
)

router.register(
    "availability",
    AvailabilityViewSet,
    basename="availability",
)

router.register(
    "service-areas",
    ServiceAreaViewSet,
    basename="service-area",
)


urlpatterns = [
    path(
        "",
        include(router.urls),
    ),
]