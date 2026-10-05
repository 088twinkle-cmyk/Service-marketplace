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
    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "role",
            "phone",
            "is_otp_verified",
            "is_active_account",
            "date_joined",
        )
        read_only_fields = (
            "id",
            "role",
            "is_otp_verified",
            "is_active_account",
            "date_joined",
        )


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    role = serializers.ChoiceField(
        choices=[
            User.Role.CLIENT,
            User.Role.FREELANCER,
        ]
    )

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

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")

        user = User(**validated_data)
        user.set_password(password)
        user.save()

        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()


class OTPRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False)


class OTPVerifySerializer(serializers.Serializer):
    email = serializers.EmailField(required=False)
    code = serializers.CharField(max_length=8)


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