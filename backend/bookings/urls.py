from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import AttachmentViewSet, MilestoneViewSet, ProjectBookingViewSet
router = DefaultRouter()
router.register("projects", ProjectBookingViewSet, basename="project")
router.register("attachments", AttachmentViewSet, basename="attachment")
router.register("milestones", MilestoneViewSet, basename="milestone")
urlpatterns = [path("", include(router.urls))]