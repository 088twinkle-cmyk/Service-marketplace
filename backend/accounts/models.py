from django.contrib.auth.models import AbstractUser
from django.db import models
class User(AbstractUser):
    class Role(models.TextChoices):
        CLIENT = "CLIENT", "Client"
        FREELANCER = "FREELANCER", "Freelancer"
        ADMIN = "ADMIN", "Admin"
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CLIENT)
    phone = models.CharField(max_length=32, blank=True)
    is_otp_verified = models.BooleanField(default=False)
    is_active_account = models.BooleanField(default=True)
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]
    def save(self, *args, **kwargs):
        if self.is_superuser:
            self.role = self.Role.ADMIN
            self.is_otp_verified = True
        super().save(*args, **kwargs)
    def __str__(self):
        return f"{self.email} ({self.role})"
class ClientProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="client_profile")
    full_name = models.CharField(max_length=160, blank=True)
    bio = models.TextField(blank=True)
    location = models.CharField(max_length=255, blank=True)
    address = models.TextField(blank=True)
    avatar = models.ImageField(upload_to="avatars/clients/", blank=True, null=True)
    def __str__(self):
        return self.full_name or self.user.email
class FreelancerProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="freelancer_profile")
    professional_title = models.CharField(max_length=160, blank=True)
    bio = models.TextField(blank=True)
    experience_years = models.PositiveIntegerField(default=0)
    languages = models.CharField(max_length=255, blank=True)
    location = models.CharField(max_length=255, blank=True)
    education = models.TextField(blank=True)
    certifications = models.TextField(blank=True)
    avatar = models.ImageField(upload_to="avatars/freelancers/", blank=True, null=True)
    skills = models.ManyToManyField("catalog.Skill", blank=True, related_name="freelancers")
    rating_average = models.DecimalField(max_digits=4, decimal_places=2, default=0)
    rating_count = models.PositiveIntegerField(default=0)
    completed_jobs = models.PositiveIntegerField(default=0)
    response_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    average_response_minutes = models.PositiveIntegerField(default=0)
    is_available = models.BooleanField(default=True)
    @property
    def is_verified(self):
        kyc = getattr(self, "kyc", None)
        return bool(kyc and kyc.status == KYCVerification.Status.APPROVED)
    def __str__(self):
        return self.professional_title or self.user.email
class KYCVerification(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
    freelancer = models.OneToOneField(
        FreelancerProfile, on_delete=models.CASCADE, related_name="kyc"
    )
    legal_name = models.CharField(max_length=160)
    document_type = models.CharField(max_length=80)
    document_number = models.CharField(max_length=80)
    document_front = models.FileField(upload_to="kyc/")
    document_back = models.FileField(upload_to="kyc/", blank=True, null=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    rejection_reason = models.TextField(blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(blank=True, null=True)
    reviewed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="kyc_reviews"
    )
    def __str__(self):
        return f"KYC {self.freelancer} ({self.status})"
class OTPCode(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="otp_codes")
    code_hash = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(blank=True, null=True)
    purpose = models.CharField(max_length=40, default="login")
    # Destination phone number (E.164) for WhatsApp delivery. Kept for audit
    # purposes — the OTP itself is only ever stored as a hash.
    phone_number = models.CharField(max_length=20, blank=True, default="")
    # Failed verification attempts against this code (brute-force guard).
    attempts = models.PositiveIntegerField(default=0)
    class Meta:
        ordering = ["-created_at"]
class PendingRegistration(models.Model):
    """A registration awaiting WhatsApp OTP verification.

    The marketplace has one shared registration + OTP flow for customers and
    providers.  Submitting the registration form stores the data here — NO
    permanent user account exists until the WhatsApp OTP is verified.  The
    password is stored as a Django password hash only.
    """
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending verification"
        CONSUMED = "CONSUMED", "Account created"
        EXPIRED = "EXPIRED", "Expired"
    registration_token = models.CharField(max_length=64, unique=True, db_index=True)
    username = models.CharField(max_length=150)
    email = models.EmailField(db_index=True)
    # E.164 normalised destination for the WhatsApp OTP (e.g. +9779843677123).
    phone_number = models.CharField(max_length=20, db_index=True)
    role = models.CharField(max_length=20, choices=User.Role.choices)
    # Django password hash — the plaintext password is never persisted.
    password_hash = models.CharField(max_length=128)
    # OTP state (hash only; the code itself is never stored in plaintext).
    otp_code_hash = models.CharField(max_length=128, blank=True, default="")
    otp_expires_at = models.DateTimeField(blank=True, null=True)
    otp_attempts = models.PositiveIntegerField(default=0)
    otp_request_count = models.PositiveIntegerField(default=0)
    otp_sent_at = models.DateTimeField(blank=True, null=True)
    phone_verified_at = models.DateTimeField(blank=True, null=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    expires_at = models.DateTimeField(db_index=True)
    class Meta:
        ordering = ["-created_at"]
    def __str__(self):
        return f"{self.email} → {self.phone_number} ({self.status})"