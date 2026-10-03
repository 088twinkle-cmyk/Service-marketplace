from django.conf import settings
from django.db import models


class KYCVerification(models.Model):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"

    STATUS_CHOICES = [
        (PENDING, "Pending"),
        (APPROVED, "Approved"),
        (REJECTED, "Rejected"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="kyc_verification",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=PENDING)
    rejection_reason = models.TextField(blank=True)
    id_number = models.CharField(max_length=50, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class ProviderProfile(models.Model):
    KYC_PENDING = "pending"
    KYC_SUBMITTED = "submitted"
    KYC_APPROVED = "approved"
    KYC_REJECTED = "rejected"

    KYC_STATUS_CHOICES = [
        (KYC_PENDING, "Pending"),
        (KYC_SUBMITTED, "Submitted"),
        (KYC_APPROVED, "Approved"),
        (KYC_REJECTED, "Rejected"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="provider_profile",
    )
    service_type = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    location = models.CharField(max_length=255, blank=True)
    id_number = models.CharField(max_length=50, blank=True)
    kyc_status = models.CharField(
        max_length=20,
        choices=KYC_STATUS_CHOICES,
        default=KYC_PENDING,
    )
    is_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def profile_completed(self) -> bool:
        return bool(self.service_type and self.phone and self.location)

    def __str__(self):
        return f"ProviderProfile({self.user_id})"
