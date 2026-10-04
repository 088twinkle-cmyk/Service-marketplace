from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from catalog.models import Skill
from .models import ClientProfile, FreelancerProfile, KYCVerification, User
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
        read_only_fields = ("id", "role", "is_otp_verified", "is_active_account", "date_joined")
class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    role = serializers.ChoiceField(choices=[User.Role.CLIENT, User.Role.FREELANCER])
    class Meta:
        model = User
        fields = ("id", "username", "email", "password", "role", "phone")
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
class ClientProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    class Meta:
        model = ClientProfile
        fields = "__all__"
        read_only_fields = ("user",)
class FreelancerProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    is_verified = serializers.BooleanField(read_only=True)
    skill_ids = serializers.PrimaryKeyRelatedField(
        source="skills", many=True, queryset=Skill.objects.all(), required=False
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
    status = serializers.ChoiceField(choices=[KYCVerification.Status.APPROVED, KYCVerification.Status.REJECTED])
    rejection_reason = serializers.CharField(required=False, allow_blank=True)