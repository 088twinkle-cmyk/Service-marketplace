from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AvailabilitySlotViewSet,
    BookingAttachmentViewSet,
    DeliverableViewSet,
    MilestoneViewSet,
    ProjectBookingViewSet,
    RevisionRequestViewSet,
)

router = DefaultRouter()
router.register("projects", ProjectBookingViewSet, basename="project")
router.register("slots", AvailabilitySlotViewSet, basename="slot")
router.register("attachments", BookingAttachmentViewSet, basename="attachment")
router.register("milestones", MilestoneViewSet, basename="milestone")
router.register("deliverables", DeliverableViewSet, basename="deliverable")
router.register("revisions", RevisionRequestViewSet, basename="revision")

urlpatterns = [path("", include(router.urls))]
