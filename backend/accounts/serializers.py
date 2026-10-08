from django.contrib.auth.password_validation import validate_password

from rest_framework import serializers

from catalog.models import Skill

from .models import (
    ClientProfile,
    FreelancerProfile,
    KYCVerification,
    User,
)


class UserSerializer(serializers.ModelSerializer):
    """The canonical user payload.

    `role` keeps the stored enum (CLIENT/FREELANCER/ADMIN); `role_key` is the
    lowercase marketplace term the UI branches on (customer/provider/admin).
    """

    full_name = serializers.SerializerMethodField()
    role_key = serializers.SerializerMethodField()
    account_type = serializers.SerializerMethodField()
    profile_photo = serializers.SerializerMethodField()
    kyc_status = serializers.SerializerMethodField()
    is_verified = serializers.SerializerMethodField()
    profile_completed = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "role",
            "role_key",
            "account_type",
            "phone",
            "profile_photo",
            "kyc_status",
            "is_verified",
            "profile_completed",
            "is_otp_verified",
            "is_active_account",
            "date_joined",
        )
        read_only_fields = (
            "id",
            "role",
            "role_key",
            "account_type",
            "profile_photo",
            "kyc_status",
            "is_verified",
            "profile_completed",
            "is_otp_verified",
            "is_active_account",
            "date_joined",
        )

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username

    def get_role_key(self, obj):
        from .roles import role_key

        return role_key(obj.role)

    def get_account_type(self, obj):
        from .roles import account_type

        return account_type(obj.role)

    def _role_profile(self, obj):
        if obj.role == User.Role.CLIENT:
            return getattr(obj, "client_profile", None)
        if obj.role == User.Role.FREELANCER:
            return getattr(obj, "freelancer_profile", None)
        return None

    def get_profile_photo(self, obj):
        profile = self._role_profile(obj)
        avatar = getattr(profile, "avatar", None) if profile else None
        if not avatar:
            return ""
        request = self.context.get("request")
        try:
            return request.build_absolute_uri(avatar.url) if request else avatar.url
        except ValueError:
            return ""

    def get_kyc_status(self, obj):
        if obj.role != User.Role.FREELANCER:
            return ""
        profile = getattr(obj, "freelancer_profile", None)
        kyc = getattr(profile, "kyc", None) if profile else None
        return kyc.status.lower() if kyc else "not_submitted"

    def get_is_verified(self, obj):
        if obj.role != User.Role.FREELANCER:
            return False
        profile = getattr(obj, "freelancer_profile", None)
        kyc = getattr(profile, "kyc", None) if profile else None
        return bool(kyc and kyc.status == KYCVerification.Status.APPROVED)

    def get_profile_completed(self, obj):
        if obj.role == User.Role.CLIENT:
            profile = getattr(obj, "client_profile", None)
            return bool(profile and (profile.full_name or profile.location))
        if obj.role == User.Role.FREELANCER:
            profile = getattr(obj, "freelancer_profile", None)
            return bool(
                profile and profile.professional_title and profile.location
            )
        return True


class RegisterSerializer(serializers.ModelSerializer):
    """Validates a shared customer/provider registration submission.

    No user is created here — the data goes into a PendingRegistration and
    the permanent account is only created after the WhatsApp OTP is verified
    (see accounts.otp.complete_registration).
    """

    password = serializers.CharField(write_only=True)

    role = serializers.CharField(default=User.Role.CLIENT)

    phone = serializers.CharField(required=True, max_length=32)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "password",
            "role",
            "phone",
        )

    def validate_role(self, value):
        from .roles import normalize_role

        normalized = normalize_role(value)
        if normalized == User.Role.ADMIN:
            raise serializers.ValidationError(
                "Admin accounts cannot be created through registration."
            )
        return normalized

    def validate_email(self, value):
        email = (value or "").strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return email

    def validate_username(self, value):
        username = (value or "").strip()
        if User.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError("This username is already taken.")
        return username

    def validate_phone(self, value):
        from whatsapp import InvalidPhoneNumberError, normalize_phone_number

        from .otp import phone_number_taken

        try:
            normalized = normalize_phone_number(value)
        except InvalidPhoneNumberError as exc:
            raise serializers.ValidationError(str(exc)) from exc

        if phone_number_taken(normalized):
            raise serializers.ValidationError(
                "An account with this WhatsApp number already exists."
            )
        return normalized

    def validate_password(self, value):
        validate_password(value)
        return value


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()


class OTPRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False)


class OTPVerifySerializer(serializers.Serializer):
    """Login-flow verification: the JWT identifies the user."""

    email = serializers.EmailField(required=False)
    code = serializers.CharField(max_length=8, required=False)
    # Alias accepted for clients that send {"otp": "123456"}.
    otp = serializers.CharField(max_length=8, required=False, write_only=True)

    def validate(self, attrs):
        code = attrs.get("code") or attrs.pop("otp", None)
        if not code:
            raise serializers.ValidationError(
                {"code": "Enter the 6-digit code sent to your WhatsApp."}
            )
        attrs["code"] = code
        return attrs


# ============================================================
# WHATSAPP OTP (shared registration verification)
# ============================================================

class WhatsAppSendOTPSerializer(serializers.Serializer):
    """Request an OTP for a phone number with a pending registration."""

    phone_number = serializers.CharField(required=True, max_length=32)


class WhatsAppVerifyOTPSerializer(serializers.Serializer):
    """Complete registration: verify the OTP tied to a pending registration."""

    registration_id = serializers.CharField(required=True, max_length=64)
    otp = serializers.CharField(required=True, max_length=8)

    def validate_otp(self, value):
        cleaned = str(value).strip()
        if not cleaned.isdigit() or len(cleaned) != 6:
            raise serializers.ValidationError("Enter the 6-digit code from WhatsApp.")
        return cleaned


class OTPResendSerializer(serializers.Serializer):
    """Resend the OTP for a pending registration."""

    registration_id = serializers.CharField(required=True, max_length=64)


# ============================================================
# PROFILE UPDATE
# ============================================================

class ProfileUpdateSerializer(serializers.Serializer):
    username = serializers.CharField(
        required=False,
        allow_blank=False,
        max_length=150,
    )

    email = serializers.EmailField(
        required=False,
    )

    phone = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=32,
    )

    full_name = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=160,
    )

    bio = serializers.CharField(
        required=False,
        allow_blank=True,
    )

    location = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=255,
    )

    address = serializers.CharField(
        required=False,
        allow_blank=True,
    )

    professional_title = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=160,
    )

    experience_years = serializers.IntegerField(
        required=False,
        min_value=0,
    )

    languages = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=255,
    )

    education = serializers.CharField(
        required=False,
        allow_blank=True,
    )

    certifications = serializers.CharField(
        required=False,
        allow_blank=True,
    )


# ============================================================
# PASSWORD
# ============================================================

class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(
        write_only=True,
        required=True,
    )

    new_password = serializers.CharField(
        write_only=True,
        required=True,
    )

    def validate_new_password(self, value):
        validate_password(
            value,
            self.context["request"].user,
        )
        return value


# ============================================================
# EXISTING PROFILE SERIALIZERS
# ============================================================

class ClientProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = ClientProfile
        fields = "__all__"
        read_only_fields = ("user",)


class FreelancerProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    is_verified = serializers.BooleanField(
        read_only=True
    )

    skill_ids = serializers.PrimaryKeyRelatedField(
        source="skills",
        many=True,
        queryset=Skill.objects.all(),
        required=False,
    )

    class Meta:
        model = FreelancerProfile

        fields = (
            "id",
            "user",
            "professional_title",
            "bio",
            "experience_years",
            "languages",
            "location",
            "education",
            "certifications",
            "avatar",
            "skill_ids",
            "rating_average",
            "rating_count",
            "completed_jobs",
            "response_rate",
            "average_response_minutes",
            "is_available",
            "is_verified",
        )

        read_only_fields = (
            "user",
            "rating_average",
            "rating_count",
            "completed_jobs",
            "response_rate",
            "average_response_minutes",
            "is_verified",
        )


class KYCSerializer(serializers.ModelSerializer):
    class Meta:
        model = KYCVerification
        fields = "__all__"

        read_only_fields = (
            "freelancer",
            "status",
            "rejection_reason",
            "submitted_at",
            "reviewed_at",
            "reviewed_by",
        )


class KYCReviewSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=[
            KYCVerification.Status.APPROVED,
            KYCVerification.Status.REJECTED,
        ]
    )

    rejection_reason = serializers.CharField(
        required=False,
        allow_blank=True,
    )

# ============================================================
# PROVIDER API SERIALIZERS  (/api/providers/)
# ============================================================

class KYCSummarySerializer(serializers.ModelSerializer):
    """Contract for /api/providers/kyc/.

    `kyc_status` is one of: not_submitted | pending | approved | rejected.
    """

    kyc_status = serializers.SerializerMethodField()
    is_verified = serializers.SerializerMethodField()
    document_front_url = serializers.SerializerMethodField()
    document_back_url = serializers.SerializerMethodField()
    reviewed_by_email = serializers.EmailField(
        source="reviewed_by.email", read_only=True, default=None
    )

    class Meta:
        model = KYCVerification
        fields = (
            "id",
            "legal_name",
            "document_type",
            "document_number",
            "kyc_status",
            "is_verified",
            "rejection_reason",
            "submitted_at",
            "reviewed_at",
            "reviewed_by_email",
            "document_front_url",
            "document_back_url",
        )
        read_only_fields = fields

    def _file_url(self, field_name):
        field = getattr(self.instance, field_name, None)
        if not field:
            return ""
        request = self.context.get("request")
        try:
            return request.build_absolute_uri(field.url) if request else field.url
        except ValueError:
            return ""

    def get_document_front_url(self, obj):
        return self._file_url("document_front")

    def get_document_back_url(self, obj):
        return self._file_url("document_back")

    def get_kyc_status(self, obj):
        return obj.status.lower()

    def get_is_verified(self, obj):
        return obj.status == KYCVerification.Status.APPROVED


# KYCSerializer is defined earlier in this module (used for submit);
# it is extended here so submissions validate file type/size.
class KYCSerializer(serializers.ModelSerializer):  # noqa: F811
    """Write serializer for KYC submissions (multipart)."""

    legal_name = serializers.CharField(max_length=160)
    document_type = serializers.ChoiceField(
        choices=[
            "citizenship",
            "national_id",
            "passport",
            "driving_license",
            "pan",
            "other",
        ]
    )
    document_number = serializers.CharField(max_length=80)

    class Meta:
        model = KYCVerification
        fields = (
            "legal_name",
            "document_type",
            "document_number",
            "document_front",
            "document_back",
        )
        extra_kwargs = {
            "document_front": {"required": False},
            "document_back": {"required": False},
        }

    def validate_document_front(self, value):
        from platformcore.uploads import validate_upload

        validate_upload(value)
        return value

    def validate_document_back(self, value):
        from platformcore.uploads import validate_upload

        validate_upload(value)
        return value

    def validate(self, attrs):
        have_existing = bool(self.instance and self.instance.document_front)
        if not attrs.get("document_front") and not have_existing:
            raise serializers.ValidationError(
                {"document_front": "Upload a photo of the document (front side)."}
            )
        return attrs


class ProviderOnboardingSerializer(serializers.ModelSerializer):
    """Contract for /api/providers/profile/."""

    user = UserSerializer(read_only=True)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=32)
    service_type = serializers.CharField(
        source="professional_title", required=False, allow_blank=True, max_length=160
    )
    profile_completed = serializers.SerializerMethodField()
    kyc_status = serializers.SerializerMethodField()
    is_verified = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()
    rejection_reason = serializers.SerializerMethodField()
    skill_ids = serializers.PrimaryKeyRelatedField(
        source="skills", many=True, queryset=Skill.objects.all(), required=False
    )

    class Meta:
        model = FreelancerProfile
        fields = (
            "id",
            "user",
            "phone",
            "service_type",
            "professional_title",
            "bio",
            "experience_years",
            "languages",
            "location",
            "education",
            "certifications",
            "avatar",
            "avatar_url",
            "skill_ids",
            "rating_average",
            "rating_count",
            "completed_jobs",
            "response_rate",
            "average_response_minutes",
            "is_available",
            "profile_completed",
            "kyc_status",
            "is_verified",
            "rejection_reason",
        )
        read_only_fields = (
            "user",
            "rating_average",
            "rating_count",
            "completed_jobs",
            "response_rate",
            "average_response_minutes",
        )

    def get_profile_completed(self, obj):
        return bool(
            obj.professional_title
            and obj.location
            and obj.user.phone
        )

    def get_kyc_status(self, obj):
        kyc = getattr(obj, "kyc", None)
        return kyc.status.lower() if kyc else "not_submitted"

    def get_is_verified(self, obj):
        kyc = getattr(obj, "kyc", None)
        return bool(kyc and kyc.status == KYCVerification.Status.APPROVED)

    def get_rejection_reason(self, obj):
        kyc = getattr(obj, "kyc", None)
        if kyc and kyc.status == KYCVerification.Status.REJECTED:
            return kyc.rejection_reason
        return ""

    def get_avatar_url(self, obj):
        if not obj.avatar:
            return ""
        request = self.context.get("request")
        try:
            return request.build_absolute_uri(obj.avatar.url) if request else obj.avatar.url
        except ValueError:
            return ""

    def update(self, instance, validated_data):
        phone = validated_data.pop("phone", None)
        instance = super().update(instance, validated_data)
        if phone is not None:
            instance.user.phone = phone
            instance.user.save(update_fields=["phone"])
        return instance


class ProviderServiceSummarySerializer(serializers.ModelSerializer):
    price = serializers.DecimalField(
        source="starting_price", max_digits=12, decimal_places=2, read_only=True
    )
    image_url = serializers.SerializerMethodField()

    class Meta:
        from catalog.models import Service as _Service

        model = _Service
        fields = ("id", "title", "price", "category", "image_url", "is_active")

    def get_image_url(self, obj):
        first = obj.images.first()
        if not first or not first.image:
            return ""
        request = self.context.get("request")
        try:
            return request.build_absolute_uri(first.image.url) if request else first.image.url
        except ValueError:
            return ""


class ProviderPortfolioSummarySerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        from catalog.models import PortfolioItem as _PortfolioItem

        model = _PortfolioItem
        fields = ("id", "title", "description", "image_url", "created_at")

    def get_image_url(self, obj):
        if not obj.image:
            return ""
        request = self.context.get("request")
        try:
            return request.build_absolute_uri(obj.image.url) if request else obj.image.url
        except ValueError:
            return ""


class ProviderPublicSerializer(serializers.ModelSerializer):
    """Public provider card. Never exposes KYC documents or contact details."""

    user = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()
    services = ProviderServiceSummarySerializer(many=True, read_only=True)
    portfolio = ProviderPortfolioSummarySerializer(many=True, read_only=True)
    skills = serializers.SlugRelatedField(many=True, read_only=True, slug_field="name")
    is_verified = serializers.SerializerMethodField()
    kyc_status = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()
    avg_rating = serializers.SerializerMethodField()

    class Meta:
        model = FreelancerProfile
        fields = (
            "id",
            "user",
            "display_name",
            "professional_title",
            "bio",
            "experience_years",
            "languages",
            "location",
            "education",
            "certifications",
            "rating_average",
            "rating_count",
            "avg_rating",
            "review_count",
            "completed_jobs",
            "response_rate",
            "average_response_minutes",
            "is_available",
            "is_verified",
            "kyc_status",
            "skills",
            "services",
            "portfolio",
        )

    def get_user(self, obj):
        return {"id": obj.user_id, "username": obj.user.username}

    def get_display_name(self, obj):
        return (
            obj.user.get_full_name()
            or obj.professional_title
            or obj.user.username
        )

    def get_is_verified(self, obj):
        kyc = getattr(obj, "kyc", None)
        return bool(kyc and kyc.status == KYCVerification.Status.APPROVED)

    def get_kyc_status(self, obj):
        kyc = getattr(obj, "kyc", None)
        return kyc.status.lower() if kyc else "not_submitted"

    def get_review_count(self, obj):
        annotated = getattr(obj, "review_count", None)
        if annotated is not None:
            return annotated
        return obj.reviews.filter(is_visible=True).count()

    def get_avg_rating(self, obj):
        annotated = getattr(obj, "avg_rating", None)
        if annotated is not None:
            return round(float(annotated), 2)
        return float(obj.rating_average)
