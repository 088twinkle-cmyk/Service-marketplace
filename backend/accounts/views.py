from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from rest_framework import (
    generics,
    permissions,
    status,
    viewsets,
)
from rest_framework.views import APIView
from rest_framework.throttling import ScopedRateThrottle

from rest_framework.decorators import (
    action,
    api_view,
    permission_classes,
)

from rest_framework.response import Response

from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)

from whatsapp import (
    InvalidPhoneNumberError,
    normalize_phone_number,
)

import logging

logger = logging.getLogger("marketplace")

from .models import (
    ClientProfile,
    FreelancerProfile,
    KYCVerification,
    User,
)

from .otp import (
    OTPCooldownError,
    OTPServiceError,
    complete_registration,
    create_pending_registration,
    delivery_channel,
    ensure_whatsapp_available,
    find_pending_registration,
    find_pending_registration_by_phone,
    issue_registration_otp,
    issue_user_otp,
    verify_user_otp,
)

from .permissions import (
    IsAdminRole,
    IsOTPVerified,
)

from .serializers import (
    ChangePasswordSerializer,
    ClientProfileSerializer,
    FreelancerProfileSerializer,
    KYCReviewSerializer,
    KYCSerializer,
    KYCSummarySerializer,
    LoginSerializer,
    OTPRequestSerializer,
    OTPResendSerializer,
    OTPVerifySerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    UserSerializer,
    WhatsAppSendOTPSerializer,
    WhatsAppVerifyOTPSerializer,
)


# ============================================================
# OTP / WHATSAPP VERIFICATION
# ============================================================

def issue_tokens(user: User, request=None):
    refresh = RefreshToken.for_user(user)
    refresh["role"] = user.role

    return {
        "refresh": str(refresh),
        "access": str(refresh.access_token),
        "user": UserSerializer(user, context={"request": request}).data,
    }


def _otp_error_response(exc: OTPServiceError):
    """Turn a service error into a safe API response (no provider details)."""
    payload = {"error": exc.message, "code": exc.code}
    payload.update(exc.extra or {})
    return Response(payload, status=exc.status_code)


def _whatsapp_service_info() -> dict:
    """Non-sensitive display info for verification screens."""
    from whatsapp import get_whatsapp_otp_service

    service = get_whatsapp_otp_service()
    return {
        "whatsapp_number": service.verification_number,
        "provider_configured": service.is_configured,
    }


def _registration_payload(
    pending,
    *,
    delivery: str,
    delivered: bool,
    cooldown_seconds: int,
) -> dict:
    from .roles import role_key

    payload = {
        "registration_id": pending.registration_token,
        "phone_number": pending.phone_number,
        "role": pending.role,
        "role_key": role_key(pending.role),
        "expires_in": max(
            0, int((pending.expires_at - timezone.now()).total_seconds())
        ),
        "otp_expires_in": max(
            0,
            int(
                (
                    (pending.otp_expires_at or timezone.now())
                    - timezone.now()
                ).total_seconds()
            ),
        ),
        "resend_cooldown": cooldown_seconds,
        "delivery": delivery,
        "delivered": delivered,
    }
    payload.update(_whatsapp_service_info())
    return payload


# ============================================================
# REGISTER (shared customer + provider flow, WhatsApp OTP)
# ============================================================

class RegisterView(generics.CreateAPIView):
    """Step 1 of the shared registration flow.

    Validates the submission (role-independent for customers AND providers),
    stores it as a PendingRegistration and sends a WhatsApp OTP to the
    submitted phone number.  The permanent account — with the exact role
    chosen here — is only created after the OTP is verified.
    """

    serializer_class = RegisterSerializer
    permission_classes = [
        permissions.AllowAny
    ]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    def create(
        self,
        request,
        *args,
        **kwargs,
    ):
        serializer = self.get_serializer(
            data=request.data
        )

        serializer.is_valid(
            raise_exception=True
        )

        data = serializer.validated_data

        try:
            # Fail fast (no state) when delivery cannot work at all.
            ensure_whatsapp_available()
        except OTPServiceError as exc:
            return _otp_error_response(exc)

        pending, created = create_pending_registration(
            username=data["username"],
            email=data["email"],
            phone_number=data["phone"],
            role=data["role"],
            password=data["password"],
        )

        try:
            issued = issue_registration_otp(pending)
        except OTPCooldownError as exc:
            # A code was recently sent for this identity and is still valid.
            # The (possibly corrected) registration data is already saved —
            # continue with the fresh registration_id instead of failing.
            payload = _registration_payload(
                pending,
                delivery="recently_sent",
                delivered=False,
                cooldown_seconds=exc.retry_after_seconds,
            )
            payload["otp_already_sent"] = True
            payload["message"] = (
                f"A verification code was recently sent to your WhatsApp. "
                f"You can request a new one in {exc.retry_after_seconds}s."
            )
            return Response(
                payload,
                status=status.HTTP_202_ACCEPTED,
            )
        except OTPServiceError as exc:
            return _otp_error_response(exc)

        payload = _registration_payload(
            pending,
            delivery=delivery_channel(issued.delivery),
            delivered=issued.delivery.delivered,
            cooldown_seconds=settings.OTP_RESEND_COOLDOWN_SECONDS,
        )

        if settings.OTP_DEBUG_RETURN:
            # Development convenience only (never in production): lets the
            # local flow complete without a real WhatsApp integration.
            payload["debug_otp"] = issued.code

        return Response(
            payload,
            status=status.HTTP_202_ACCEPTED,
        )


# ============================================================
# LOGIN
# ============================================================

class LoginView(generics.GenericAPIView):
    serializer_class = LoginSerializer
    permission_classes = [
        permissions.AllowAny
    ]

    def post(self, request):
        serializer = self.get_serializer(
            data=request.data
        )

        serializer.is_valid(
            raise_exception=True
        )

        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]

        user = authenticate(
            request,
            username=email,
            password=password,
        )

        if user is None:
            try:
                candidate = User.objects.get(
                    email=email
                )
            except User.DoesNotExist:
                candidate = None

            if (
                candidate
                and candidate.check_password(password)
            ):
                user = candidate

        if (
            user is None
            or not user.is_active_account
        ):
            return Response(
                {
                    "error": "Invalid credentials."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = issue_tokens(user, request)

        if not user.is_otp_verified:
            # The WhatsApp OTP is requested explicitly from the verification
            # screen (`/api/auth/otp/request/`), so logging in alone never
            # spams a user's WhatsApp.
            payload["otp_required"] = True
            payload["otp_channel"] = "whatsapp"

        return Response(payload)


# ============================================================
# OTP REQUEST (login / re-verification for an existing user)
# ============================================================

class OTPRequestView(generics.GenericAPIView):
    """Sends a WhatsApp OTP to the authenticated user's phone number."""

    serializer_class = OTPRequestSerializer
    permission_classes = [
        permissions.IsAuthenticated
    ]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    def post(self, request):
        try:
            issued = issue_user_otp(request.user)
        except OTPServiceError as exc:
            return _otp_error_response(exc)

        data = {
            "message": "OTP sent to your WhatsApp number.",
            "delivery": delivery_channel(issued.delivery),
            "resend_cooldown": settings.OTP_RESEND_COOLDOWN_SECONDS,
        }
        data.update(_whatsapp_service_info())

        if settings.OTP_DEBUG_RETURN:
            data["debug_otp"] = issued.code

        return Response(data)


# ============================================================
# OTP VERIFY (login / re-verification for an existing user)
# ============================================================

class OTPVerifyView(generics.GenericAPIView):
    serializer_class = OTPVerifySerializer
    permission_classes = [
        permissions.IsAuthenticated
    ]

    def post(self, request):
        serializer = self.get_serializer(
            data=request.data
        )

        serializer.is_valid(
            raise_exception=True
        )

        try:
            verify_user_otp(request.user, serializer.validated_data["code"])
        except OTPServiceError as exc:
            return _otp_error_response(exc)

        return Response(
            issue_tokens(request.user)
        )


# ============================================================
# WHATSAPP SEND OTP (pending registration, phone-first entry)
# ============================================================

class WhatsAppSendOTPView(generics.GenericAPIView):
    """Request/resume a WhatsApp OTP for a phone number.

    If an active pending registration exists for the number, a fresh OTP is
    delivered and the registration_id is returned (this also lets a user
    recover the flow after refreshing the OTP screen).  The response is
    intentionally identical when no registration is pending, so the endpoint
    cannot be used to discover which numbers are mid-registration.
    """

    serializer_class = WhatsAppSendOTPSerializer
    permission_classes = [
        permissions.AllowAny
    ]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    def post(self, request):
        serializer = self.get_serializer(
            data=request.data
        )

        serializer.is_valid(
            raise_exception=True
        )

        try:
            phone_number = normalize_phone_number(
                serializer.validated_data["phone_number"]
            )
        except InvalidPhoneNumberError as exc:
            return Response(
                {"error": str(exc), "code": "invalid_phone_number"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pending = find_pending_registration_by_phone(phone_number)

        if pending is None:
            # Enumeration-safe: same shape as the success path.
            return Response(
                {
                    "message": (
                        "If a WhatsApp verification is pending for this "
                        "number, a new code has been sent."
                    ),
                    "phone_number": phone_number,
                },
                status=status.HTTP_202_ACCEPTED,
            )

        try:
            issued = issue_registration_otp(pending)
        except OTPServiceError as exc:
            return _otp_error_response(exc)

        payload = _registration_payload(
            pending,
            delivery=delivery_channel(issued.delivery),
            delivered=issued.delivery.delivered,
            cooldown_seconds=settings.OTP_RESEND_COOLDOWN_SECONDS,
        )

        if settings.OTP_DEBUG_RETURN:
            payload["debug_otp"] = issued.code

        return Response(
            payload,
            status=status.HTTP_202_ACCEPTED,
        )


# ============================================================
# WHATSAPP VERIFY OTP (completes the registration)
# ============================================================

class WhatsAppVerifyOTPView(generics.GenericAPIView):
    """Step 2 of the shared registration flow.

    Verifies the OTP tied to a pending registration — entirely server-side —
    then creates the permanent account with the role captured at
    registration, marks the phone number as verified and returns the normal
    JWT authentication response.  The request body cannot influence the role
    or any other account attribute.
    """

    serializer_class = WhatsAppVerifyOTPSerializer
    permission_classes = [
        permissions.AllowAny
    ]

    def post(self, request):
        serializer = self.get_serializer(
            data=request.data
        )

        serializer.is_valid(
            raise_exception=True
        )

        registration_id = serializer.validated_data["registration_id"]
        otp_code = serializer.validated_data["otp"]

        pending = find_pending_registration(registration_id)

        if pending is None:
            return Response(
                {
                    "error": (
                        "Your verification session could not be found or "
                        "has expired. Please register again."
                    ),
                    "code": "registration_expired",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user = complete_registration(pending, otp_code)
        except OTPServiceError as exc:
            return _otp_error_response(exc)

        logger.info(
            "Registration completed via WhatsApp OTP: user=%s role=%s",
            user.pk,
            user.role,
        )

        payload = issue_tokens(user, request)
        payload["registration"] = "completed"
        payload["phone_verified"] = True
        return Response(payload)


# ============================================================
# OTP RESEND (pending registration)
# ============================================================

class OTPResendView(generics.GenericAPIView):
    """Resend the WhatsApp OTP for a pending registration.

    Invalidates the previous OTP, resets the attempt counter and enforces
    both the resend cooldown and the per-registration request limit.
    """

    serializer_class = OTPResendSerializer
    permission_classes = [
        permissions.AllowAny
    ]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    def post(self, request):
        serializer = self.get_serializer(
            data=request.data
        )

        serializer.is_valid(
            raise_exception=True
        )

        pending = find_pending_registration(
            serializer.validated_data["registration_id"]
        )

        if pending is None:
            return Response(
                {
                    "error": (
                        "Your verification session could not be found or "
                        "has expired. Please register again."
                    ),
                    "code": "registration_expired",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            issued = issue_registration_otp(pending)
        except OTPServiceError as exc:
            return _otp_error_response(exc)

        payload = {
            "message": "A new code has been sent to your WhatsApp.",
            "delivery": delivery_channel(issued.delivery),
            "delivered": issued.delivery.delivered,
            "resend_cooldown": settings.OTP_RESEND_COOLDOWN_SECONDS,
        }
        payload.update(_whatsapp_service_info())

        if settings.OTP_DEBUG_RETURN:
            payload["debug_otp"] = issued.code

        return Response(
            payload,
            status=status.HTTP_202_ACCEPTED,
        )


# ============================================================
# CURRENT USER
# ============================================================

@api_view(["GET"])
@permission_classes([
    permissions.IsAuthenticated
])
def me(request):
    data = UserSerializer(
        request.user,
        context={"request": request},
    ).data

    if request.user.role == User.Role.CLIENT:
        profile, _ = (
            ClientProfile.objects.get_or_create(
                user=request.user
            )
        )

        profile_data = ClientProfileSerializer(
            profile,
            context={
                "request": request
            },
        ).data

        data["client_profile"] = profile_data

    if request.user.role == User.Role.FREELANCER:
        profile, _ = (
            FreelancerProfile.objects.get_or_create(
                user=request.user
            )
        )

        profile_data = FreelancerProfileSerializer(
            profile,
            context={
                "request": request
            },
        ).data

        data["freelancer_profile"] = profile_data

        if hasattr(profile, "kyc"):
            data["kyc"] = KYCSummarySerializer(
                profile.kyc,
                context={"request": request},
            ).data

    return Response(data)


# ============================================================
# PROFILE UPDATE
# ============================================================

class ProfileUpdateView(
    generics.GenericAPIView
):
    permission_classes = [
        permissions.IsAuthenticated,
        IsOTPVerified,
    ]

    def get_serializer(self, *args, **kwargs):
        return ProfileUpdateSerializer(
            *args,
            **kwargs,
            context={
                "request": self.request
            },
        )

    def get_profile(self, user):
        if user.role == User.Role.CLIENT:
            profile, _ = (
                ClientProfile.objects.get_or_create(
                    user=user
                )
            )
            return profile

        if user.role == User.Role.FREELANCER:
            profile, _ = (
                FreelancerProfile.objects.get_or_create(
                    user=user
                )
            )
            return profile

        return None

    def get(self, request):
        user = request.user
        profile = self.get_profile(user)

        data = UserSerializer(user, context={"request": request}).data

        if profile is not None:
            if user.role == User.Role.CLIENT:
                data["profile"] = (
                    ClientProfileSerializer(
                        profile,
                        context={
                            "request": request
                        },
                    ).data
                )

            elif user.role == User.Role.FREELANCER:
                data["profile"] = (
                    FreelancerProfileSerializer(
                        profile,
                        context={
                            "request": request
                        },
                    ).data
                )

        return Response(data)

    def patch(self, request):
        serializer = self.get_serializer(
            data=request.data,
            partial=True,
        )

        serializer.is_valid(
            raise_exception=True
        )

        data = serializer.validated_data
        user = request.user

        # ----------------------------------------
        # USER DATA
        # ----------------------------------------

        if "username" in data:
            username = data["username"].strip()

            if (
                User.objects
                .exclude(pk=user.pk)
                .filter(username=username)
                .exists()
            ):
                return Response(
                    {
                        "username": [
                            "A user with that username already exists."
                        ]
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user.username = username

        if "email" in data:
            email = data["email"].strip().lower()

            if (
                User.objects
                .exclude(pk=user.pk)
                .filter(email=email)
                .exists()
            ):
                return Response(
                    {
                        "email": [
                            "A user with that email already exists."
                        ]
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user.email = email

        if "phone" in data:
            user.phone = data["phone"]

        user.save()

        # ----------------------------------------
        # PROFILE DATA
        # ----------------------------------------

        profile = self.get_profile(user)

        if profile is not None:

            if user.role == User.Role.CLIENT:

                client_fields = [
                    "full_name",
                    "bio",
                    "location",
                    "address",
                ]

                for field in client_fields:
                    if field in data:
                        setattr(
                            profile,
                            field,
                            data[field],
                        )

            elif user.role == User.Role.FREELANCER:

                freelancer_fields = [
                    "professional_title",
                    "bio",
                    "experience_years",
                    "languages",
                    "location",
                    "education",
                    "certifications",
                ]

                for field in freelancer_fields:
                    if field in data:
                        setattr(
                            profile,
                            field,
                            data[field],
                        )

            profile.save()

        return Response(
            self.build_response(request)
        )

    def build_response(self, request):
        user = request.user

        data = UserSerializer(user).data

        profile = self.get_profile(user)

        if profile is not None:

            if user.role == User.Role.CLIENT:
                data["profile"] = (
                    ClientProfileSerializer(
                        profile,
                        context={
                            "request": request
                        },
                    ).data
                )

            elif user.role == User.Role.FREELANCER:
                data["profile"] = (
                    FreelancerProfileSerializer(
                        profile,
                        context={
                            "request": request
                        },
                    ).data
                )

        return data


# ============================================================
# PROFILE PHOTO UPLOAD
# ============================================================

class ProfilePhotoView(
    generics.GenericAPIView
):
    permission_classes = [
        permissions.IsAuthenticated,
        IsOTPVerified,
    ]

    def get_profile(self, user):
        if user.role == User.Role.CLIENT:
            profile, _ = (
                ClientProfile.objects.get_or_create(
                    user=user
                )
            )
            return profile

        if user.role == User.Role.FREELANCER:
            profile, _ = (
                FreelancerProfile.objects.get_or_create(
                    user=user
                )
            )
            return profile

        return None

    def post(self, request):
        profile = self.get_profile(
            request.user
        )

        if profile is None:
            return Response(
                {
                    "error": "Profile not available."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        image = request.FILES.get("avatar")

        if image is None:
            image = request.FILES.get(
                "profile_photo"
            )

        if image is None:
            return Response(
                {
                    "error": (
                        "No profile picture was uploaded."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile.avatar = image
        profile.save(
            update_fields=["avatar"]
        )

        if request.user.role == User.Role.CLIENT:
            data = ClientProfileSerializer(
                profile,
                context={
                    "request": request
                },
            ).data
        else:
            data = FreelancerProfileSerializer(
                profile,
                context={
                    "request": request
                },
            ).data

        return Response(data)


# ============================================================
# DELETE PROFILE PHOTO
# ============================================================

class ProfilePhotoDeleteView(
    generics.GenericAPIView
):
    permission_classes = [
        permissions.IsAuthenticated,
        IsOTPVerified,
    ]

    def get_profile(self, user):
        if user.role == User.Role.CLIENT:
            profile, _ = (
                ClientProfile.objects.get_or_create(
                    user=user
                )
            )
            return profile

        if user.role == User.Role.FREELANCER:
            profile, _ = (
                FreelancerProfile.objects.get_or_create(
                    user=user
                )
            )
            return profile

        return None

    def delete(self, request):
        profile = self.get_profile(
            request.user
        )

        if profile is None:
            return Response(
                {
                    "error": "Profile not available."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if profile.avatar:
            profile.avatar.delete(
                save=False
            )

        profile.avatar = None

        profile.save(
            update_fields=["avatar"]
        )

        return Response(
            {
                "error": (
                    "Profile picture deleted."
                )
            }
        )


# ============================================================
# CHANGE PASSWORD
# ============================================================

class ChangePasswordView(
    generics.GenericAPIView
):
    serializer_class = ChangePasswordSerializer

    permission_classes = [
        permissions.IsAuthenticated,
        IsOTPVerified,
    ]

    def post(self, request):
        serializer = self.get_serializer(
            data=request.data
        )

        serializer.is_valid(
            raise_exception=True
        )

        current_password = (
            serializer.validated_data[
                "current_password"
            ]
        )

        new_password = (
            serializer.validated_data[
                "new_password"
            ]
        )

        user = request.user

        if not user.check_password(
            current_password
        ):
            return Response(
                {
                    "current_password": [
                        "Current password is incorrect."
                    ]
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(
            new_password
        )

        user.save(
            update_fields=[
                "password"
            ]
        )

        return Response(
            {
                "message": (
                    "Password changed successfully."
                )
            }
        )


# ============================================================
# CLIENT PROFILE
# ============================================================

class ClientProfileView(
    generics.RetrieveUpdateAPIView
):
    serializer_class = ClientProfileSerializer

    permission_classes = [
        permissions.IsAuthenticated,
        IsOTPVerified,
    ]

    def get_object(self):
        profile, _ = (
            ClientProfile.objects.get_or_create(
                user=self.request.user
            )
        )

        return profile


# ============================================================
# FREELANCER PROFILE
# ============================================================

class FreelancerProfileView(
    generics.RetrieveUpdateAPIView
):
    serializer_class = FreelancerProfileSerializer

    permission_classes = [
        permissions.IsAuthenticated,
        IsOTPVerified,
    ]

    def get_object(self):
        profile, _ = (
            FreelancerProfile.objects.get_or_create(
                user=self.request.user
            )
        )

        return profile


# ============================================================
# FREELANCER PUBLIC
# ============================================================

class FreelancerPublicViewSet(
    viewsets.ReadOnlyModelViewSet
):
    serializer_class = FreelancerProfileSerializer
    permission_classes = [
        permissions.AllowAny
    ]

    queryset = (
        FreelancerProfile.objects
        .select_related("user")
        .prefetch_related(
            "skills",
            "kyc",
        )
    )

    filterset_fields = [
        "is_available",
        "location",
    ]

    search_fields = [
        "professional_title",
        "bio",
        "location",
        "user__email",
        "skills__name",
    ]


# ============================================================
# KYC
# ============================================================

class KYCViewSet(
    viewsets.ModelViewSet
):
    serializer_class = KYCSerializer

    def get_serializer_class(self):
        # Writes go through the validating KYC serializer; reads use the
        # status payload (which includes the reviewer and document URLs).
        if self.action in ("create", "update", "partial_update"):
            return KYCSerializer
        return KYCSummarySerializer

    permission_classes = [
        permissions.IsAuthenticated,
        IsOTPVerified,
    ]

    def get_queryset(self):
        queryset = (
            KYCVerification.objects
            .select_related(
                "freelancer__user",
                "reviewed_by",
            )
            .order_by("-submitted_at")
        )

        user = self.request.user

        if (
            user.role == User.Role.ADMIN
            or user.is_staff
        ):
            return queryset

        if user.role == User.Role.FREELANCER:
            return queryset.filter(
                freelancer__user=user
            )

        return queryset.none()

    def perform_create(self, serializer):
        user = self.request.user

        if user.role != User.Role.FREELANCER:
            raise PermissionError(
                "Only freelancers can submit KYC."
            )

        freelancer, _ = (
            FreelancerProfile.objects.get_or_create(
                user=user
            )
        )

        if KYCVerification.objects.filter(
            freelancer=freelancer
        ).exists():
            raise serializers.ValidationError(
                {
                    "error": (
                        "KYC already exists "
                        "for this freelancer."
                    )
                }
            )

        serializer.save(
            freelancer=freelancer
        )

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[
            IsAdminRole
        ],
    )
    def review(
        self,
        request,
        pk=None,
    ):
        kyc = self.get_object()

        serializer = KYCReviewSerializer(
            data=request.data
        )

        serializer.is_valid(
            raise_exception=True
        )

        new_status = (
            serializer.validated_data[
                "status"
            ]
        )

        rejection_reason = (
            serializer.validated_data.get(
                "rejection_reason",
                "",
            )
        )

        if (
            new_status
            == KYCVerification.Status.REJECTED
            and not rejection_reason
        ):
            return Response(
                {
                    "error": (
                        "Rejection reason is required "
                        "when rejecting KYC."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        kyc.status = new_status

        kyc.rejection_reason = (
            rejection_reason
            if new_status
            == KYCVerification.Status.REJECTED
            else ""
        )

        kyc.reviewed_at = timezone.now()
        kyc.reviewed_by = request.user

        kyc.save(
            update_fields=[
                "status",
                "rejection_reason",
                "reviewed_at",
                "reviewed_by",
            ]
        )

        return Response(
            KYCSummarySerializer(kyc, context={"request": request}).data
        )

# ============================================================
# Password reset (uid + token, emailed to the account address)
# ============================================================

class PasswordForgotView(APIView):
    """Request a password reset token.

    Always answers with the same message so the endpoint cannot be used to
    discover which email addresses have accounts.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    def post(self, request):
        email = str(request.data.get("email", "")).strip().lower()
        if not email:
            return Response(
                {"error": "Email is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response_payload = {
            "message": (
                "If that email is registered, a reset link and token "
                "have been sent."
            )
        }

        user = User.objects.filter(email__iexact=email, is_active=True).first()

        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)

            send_mail(
                subject="Reset your marketplace password",
                message=(
                    "We received a request to reset your password.\n\n"
                    f"User ID: {uid}\n"
                    f"Reset token: {token}\n\n"
                    "Open the app, choose \"Reset password\" and paste both "
                    "values. If you did not request this, you can ignore this "
                    "email.\n"
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=True,
            )

            if settings.OTP_DEBUG_RETURN:
                # Local development only (DEBUG). Saves developers from
                # reading the console email backend output.
                response_payload["uid"] = uid
                response_payload["debug_token"] = token

            logger.info("Password reset requested for user=%s", user.pk)

        return Response(response_payload)


class PasswordResetView(APIView):
    """Complete a password reset with the emailed uid + token."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    def post(self, request):
        uid = str(request.data.get("uid", "")).strip()
        token = str(request.data.get("token", "")).strip()
        new_password = request.data.get("new_password") or request.data.get(
            "password"
        )
        email = str(request.data.get("email", "")).strip().lower()

        if not uid or not token or not new_password:
            return Response(
                {"error": "User ID, token and new password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_password(new_password)
        except DjangoValidationError as exc:
            return Response(
                {"error": exc.messages[0]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_id, is_active=True)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            return Response(
                {"error": "This reset link is invalid."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if email and user.email.lower() != email:
            return Response(
                {"error": "This reset link is invalid."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not default_token_generator.check_token(user, token):
            return Response(
                {"error": "This reset link is invalid or has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(new_password)
        user.save(update_fields=["password"])

        # Every existing session must be signed out.
        for outstanding in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=outstanding)

        logger.info("Password reset completed for user=%s", user.pk)

        return Response({"message": "Your password has been reset. Please sign in."})


class UsernameAvailableView(APIView):
    """Check whether a username is still free (used by the signup form)."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    def _check(self, request):
        username = str(
            request.data.get("username") or request.query_params.get("username") or ""
        ).strip()

        if not username:
            return Response(
                {"error": "Username is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "username": username,
                "available": not User.objects.filter(
                    username__iexact=username
                ).exists(),
            }
        )

    def get(self, request):
        return self._check(request)

    def post(self, request):
        return self._check(request)
