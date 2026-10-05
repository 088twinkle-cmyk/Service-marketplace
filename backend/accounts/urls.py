from django.urls import include, path

from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    ChangePasswordView,
    ClientProfileView,
    FreelancerProfileView,
    FreelancerPublicViewSet,
    KYCViewSet,
    LoginView,
    OTPRequestView,
    OTPVerifyView,
    ProfilePhotoDeleteView,
    ProfilePhotoView,
    ProfileUpdateView,
    RegisterView,
    me,
)


router = DefaultRouter()

router.register(
    "freelancers",
    FreelancerPublicViewSet,
    basename="freelancers",
)

router.register(
    "kyc",
    KYCViewSet,
    basename="kyc",
)


urlpatterns = [
    # Authentication
    path(
        "register/",
        RegisterView.as_view(),
        name="register",
    ),

    path(
        "login/",
        LoginView.as_view(),
        name="login",
    ),

    path(
        "otp/request/",
        OTPRequestView.as_view(),
        name="otp-request",
    ),

    path(
        "otp/verify/",
        OTPVerifyView.as_view(),
        name="otp-verify",
    ),

    path(
        "token/refresh/",
        TokenRefreshView.as_view(),
        name="token-refresh",
    ),

    # Current user
    path(
        "me/",
        me,
        name="me",
    ),

    # Profile
    path(
        "profile/",
        ProfileUpdateView.as_view(),
        name="profile",
    ),

    path(
        "profile/photo/",
        ProfilePhotoView.as_view(),
        name="profile-photo",
    ),

    path(
        "profile/photo/delete/",
        ProfilePhotoDeleteView.as_view(),
        name="profile-photo-delete",
    ),

    # Password
    path(
        "password/change/",
        ChangePasswordView.as_view(),
        name="password-change",
    ),

    # Role-specific profiles
    path(
        "client-profile/",
        ClientProfileView.as_view(),
        name="client-profile",
    ),

    path(
        "freelancer-profile/",
        FreelancerProfileView.as_view(),
        name="freelancer-profile",
    ),

    # Router endpoints
    path(
        "",
        include(router.urls),
    ),
]