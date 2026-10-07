from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import DisputeViewSet, ReportViewSet, ReviewViewSet

router = DefaultRouter()
router.register("reviews", ReviewViewSet, basename="review")
router.register("disputes", DisputeViewSet, basename="dispute")
router.register("reports", ReportViewSet, basename="report")

urlpatterns = [
    # Flat contract: /api/reviews/ and /api/reviews/<pk>/
    path(
        "",
        ReviewViewSet.as_view({"get": "list", "post": "create"}),
        name="review-list",
    ),
    path(
        "<int:pk>/",
        ReviewViewSet.as_view(
            {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
        ),
        name="review-detail",
    ),
    # Nested paths are kept for backwards compatibility:
    # /api/reviews/reviews/, /api/reviews/disputes/, /api/reviews/reports/
    path("", include(router.urls)),
]
