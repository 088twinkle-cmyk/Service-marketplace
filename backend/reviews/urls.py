from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import DisputeViewSet, ReportViewSet, ReviewViewSet
router = DefaultRouter()
router.register("reviews", ReviewViewSet, basename="review")
router.register("disputes", DisputeViewSet, basename="dispute")
router.register("reports", ReportViewSet, basename="report")
urlpatterns = [path("", include(router.urls))]
