from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import LedgerViewSet, PaymentViewSet
router = DefaultRouter()
router.register("payments", PaymentViewSet, basename="payment")
router.register("transactions", LedgerViewSet, basename="transaction")
urlpatterns = [path("", include(router.urls))]