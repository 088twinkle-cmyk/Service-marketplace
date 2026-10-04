from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    ClientProfileView,
    FreelancerProfileView,
    FreelancerPublicViewSet,
    KYCViewSet,
    LoginView,
    OTPRequestView,
    OTPVerifyView,
    RegisterView,
    me,
)
router = DefaultRouter()
router.register("freelancers", FreelancerPublicViewSet, basename="freelancer-public")
router.register("kyc", KYCViewSet, basename="kyc")
urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("otp/request/", OTPRequestView.as_view(), name="otp-request"),
    path("otp/verify/", OTPVerifyView.as_view(), name="otp-verify"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("me/", me, name="me"),
    path("client-profile/", ClientProfileView.as_view(), name="client-profile"),
    path("freelancer-profile/", FreelancerProfileView.as_view(), name="freelancer-profile"),
    path("", include(router.urls)),
]
