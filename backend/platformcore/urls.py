from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import AuditLogViewSet, PlatformSettingViewSet, dashboard_stats, users_admin
router = DefaultRouter()
router.register("audit-logs", AuditLogViewSet)
router.register("settings", PlatformSettingViewSet)
urlpatterns = [
    path("stats/", dashboard_stats),
    path("users/", users_admin),
    path("", include(router.urls)),
]