from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from .models import ClientProfile, FreelancerProfile, KYCVerification, OTPCode, PendingRegistration, User
@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    fieldsets = DjangoUserAdmin.fieldsets + (
        ("Marketplace", {"fields": ("role", "phone", "is_otp_verified", "is_active_account")}),
    )
    list_display = ("email", "username", "role", "is_otp_verified", "is_staff")
    list_filter = ("role", "is_otp_verified", "is_staff")
admin.site.register(ClientProfile)
admin.site.register(FreelancerProfile)
admin.site.register(KYCVerification)
admin.site.register(OTPCode)
@admin.register(PendingRegistration)
class PendingRegistrationAdmin(admin.ModelAdmin):
    """Read-mostly view over pending WhatsApp OTP registrations.

    OTP hashes are visible to admins for audit purposes, but the OTP code
    itself is never stored anywhere.
    """

    list_display = (
        "email",
        "phone_number",
        "role",
        "status",
        "otp_request_count",
        "otp_attempts",
        "created_at",
        "expires_at",
    )
    list_filter = ("status", "role")
    search_fields = ("email", "phone_number", "username")
    readonly_fields = (
        "registration_token",
        "password_hash",
        "otp_code_hash",
        "otp_sent_at",
        "otp_expires_at",
        "otp_attempts",
        "otp_request_count",
        "phone_verified_at",
        "created_at",
        "updated_at",
    )