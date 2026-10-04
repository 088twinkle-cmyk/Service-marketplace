from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from .models import ClientProfile, FreelancerProfile, KYCVerification, OTPCode, User
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