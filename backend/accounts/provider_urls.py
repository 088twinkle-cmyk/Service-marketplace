from django.urls import path

from .provider_views import (
    KYCView,
    ProviderProfileView,
    ProviderPublicDetailView,
    ProviderPublicViewSet,
)

urlpatterns = [
    # Owner endpoints (must come before the <pk> pattern)
    path("profile/", ProviderProfileView.as_view(), name="provider-profile"),
    path("kyc/", KYCView.as_view(), name="provider-kyc"),

    # Public directory
    path("", ProviderPublicViewSet.as_view(), name="provider-list"),
    path("<int:pk>/", ProviderPublicDetailView.as_view(), name="provider-detail"),
]
