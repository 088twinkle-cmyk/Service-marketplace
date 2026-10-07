import hashlib
import hmac
import secrets

from datetime import timedelta

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

import logging

logger = logging.getLogger("marketplace")

from .models import (
    ClientProfile,
    FreelancerProfile,
    KYCVerification,
    OTPCode,
    User,
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
    OTPVerifySerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    UserSerializer,
)


# ============================================================
# OTP
# ============================================================

def _hash_otp(code: str) -> str:
    return hmac.new(
        settings.SECRET_KEY.encode(),
        code.encode(),
        hashlib.sha256,
    ).hexdigest()


def issue_tokens(user: User, request=None):
    refresh = RefreshToken.for_user(user)
    refresh["role"] = user.role

    return {
        "refresh": str(refresh),
        "access": str(refresh.access_token),
        "user": UserSerializer(user, context={"request": request}).data,
    }


def send_otp(
    user: User,
    purpose: str = "login",
):
    code = f"{secrets.randbelow(1_000_000):06d}"

    OTPCode.objects.create(
        user=user,
        code_hash=_hash_otp(code),
        expires_at=(
            timezone.now()
            + timedelta(
                minutes=settings.OTP_EXPIRY_MINUTES
            )
        ),
        purpose=purpose,
    )

    send_mail(
        subject="Your marketplace verification code",
        message=(
            f"Your OTP code is {code}. "
            f"It expires in "
            f"{settings.OTP_EXPIRY_MINUTES} minutes."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=True,
    )

    return code


# ============================================================
# REGISTER
# ============================================================

class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [
        permissions.AllowAny
    ]

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

        user = serializer.save()

        code = send_otp(
            user,
            purpose="register",
        )

        payload = issue_tokens(user, request)

        if settings.OTP_DEBUG_RETURN:
            payload["debug_otp"] = code

        return Response(
            payload,
            status=status.HTTP_201_CREATED,
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
            code = send_otp(user)

            if settings.OTP_DEBUG_RETURN:
                payload["debug_otp"] = code

            payload["otp_required"] = True

        return Response(payload)


# ============================================================
# OTP REQUEST
# ============================================================

class OTPRequestView(generics.GenericAPIView):
    serializer_class = OTPRequestSerializer
    permission_classes = [
        permissions.IsAuthenticated
    ]

    def post(self, request):
        code = send_otp(request.user)

        data = {
            "error": "OTP sent.",
        }

        if settings.OTP_DEBUG_RETURN:
            data["debug_otp"] = code

        return Response(data)


# ============================================================
# OTP VERIFY
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

        code = serializer.validated_data["code"]

        otp = (
            OTPCode.objects.filter(
                user=request.user,
                consumed_at__isnull=True,
                expires_at__gt=timezone.now(),
            )
            .order_by("-created_at")
            .first()
        )

        if (
            not otp
            or not hmac.compare_digest(
                otp.code_hash,
                _hash_otp(code),
            )
        ):
            return Response(
                {
                    "error": (
                        "Invalid or expired OTP."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        otp.consumed_at = timezone.now()

        otp.save(
            update_fields=[
                "consumed_at"
            ]
        )

        request.user.is_otp_verified = True

        request.user.save(
            update_fields=[
                "is_otp_verified"
            ]
        )

        return Response(
            issue_tokens(request.user)
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
