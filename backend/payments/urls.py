"""Payment routes.

Flat REST surface (``/api/payments/``) plus the original nested paths kept
for backwards compatibility.
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import LedgerViewSet, PaymentViewSet

router = DefaultRouter()
router.register("payments", PaymentViewSet, basename="payment")
router.register("transactions", LedgerViewSet, basename="transaction")

flat_payments = PaymentViewSet.as_view(
    {
        "get": "list",
    }
)
flat_payment_detail = PaymentViewSet.as_view({"get": "retrieve"})

urlpatterns = [
    # Contracts used by the marketplace UI
    path("initiate/", PaymentViewSet.as_view({"post": "initiate"}), name="payment-initiate"),
    path("callback/", PaymentViewSet.as_view({"post": "callback"}), name="payment-callback"),
    path("summary/", PaymentViewSet.as_view({"get": "summary"}), name="payment-summary"),
    path(
        "transactions/",
        LedgerViewSet.as_view({"get": "list"}),
        name="ledger-list",
    ),
    path(
        "transactions/<int:pk>/",
        LedgerViewSet.as_view({"get": "retrieve"}),
        name="ledger-detail",
    ),
    path("<int:pk>/verify/", PaymentViewSet.as_view({"post": "verify"}), name="payment-verify"),
    path("<int:pk>/", flat_payment_detail, name="payment-detail"),
    path("", flat_payments, name="payment-list"),
    # Backwards compatible nested paths
    path("", include(router.urls)),
]
