from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class ProjectBooking(models.Model):
    class BookingType(models.TextChoices):
        FIXED_SERVICE = "FIXED_SERVICE", "Fixed service"
        CUSTOM_JOB = "CUSTOM_JOB", "Custom job"
        LOCAL_APPOINTMENT = "LOCAL_APPOINTMENT", "Local appointment"
        REMOTE_PROJECT = "REMOTE_PROJECT", "Remote project"
        MILESTONE_PROJECT = "MILESTONE_PROJECT", "Milestone project"

    class ServiceMode(models.TextChoices):
        LOCAL = "LOCAL", "Local"
        REMOTE = "REMOTE", "Remote"

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PENDING_PROVIDER_RESPONSE = (
            "PENDING_PROVIDER_RESPONSE",
            "Pending provider response",
        )
        COUNTER_OFFERED = "COUNTER_OFFERED", "Counter offered"
        AGREEMENT_REACHED = "AGREEMENT_REACHED", "Agreement reached"
        PAYMENT_PENDING = "PAYMENT_PENDING", "Payment pending"
        PAYMENT_FAILED = "PAYMENT_FAILED", "Payment failed"
        CONFIRMED = "CONFIRMED", "Confirmed"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        DELIVERABLE_SUBMITTED = (
            "DELIVERABLE_SUBMITTED",
            "Deliverable submitted",
        )
        CLIENT_REVIEWING = "CLIENT_REVIEWING", "Client reviewing"
        REVISION_REQUESTED = "REVISION_REQUESTED", "Revision requested"
        COMPLETED = "COMPLETED", "Completed"
        REVIEWED = "REVIEWED", "Reviewed"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"
        EXPIRED = "EXPIRED", "Expired"
        DISPUTED = "DISPUTED", "Disputed"

    client = models.ForeignKey(
        "accounts.ClientProfile",
        on_delete=models.CASCADE,
        related_name="project_bookings",
    )

    freelancer = models.ForeignKey(
        "accounts.FreelancerProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="project_bookings",
    )

    # Service is defined in catalog.models
    service = models.ForeignKey(
        "catalog.Service",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="project_bookings",
    )

    category = models.ForeignKey(
        "catalog.Category",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="project_bookings",
    )

    booking_type = models.CharField(
        max_length=40,
        choices=BookingType.choices,
        default=BookingType.CUSTOM_JOB,
    )

    service_mode = models.CharField(
        max_length=10,
        choices=ServiceMode.choices,
        default=ServiceMode.LOCAL,
    )

    title = models.CharField(
        max_length=255,
    )

    requirements = models.TextField(
        blank=True,
    )

    proposed_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
    )

    agreed_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )

    deadline = models.DateTimeField(
        null=True,
        blank=True,
    )

    appointment_start = models.DateTimeField(
        null=True,
        blank=True,
    )

    appointment_end = models.DateTimeField(
        null=True,
        blank=True,
    )

    location_address = models.CharField(
        max_length=500,
        blank=True,
    )

    location_city = models.CharField(
        max_length=120,
        blank=True,
    )

    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[
            MinValueValidator(-90),
            MaxValueValidator(90),
        ],
    )

    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[
            MinValueValidator(-180),
            MaxValueValidator(180),
        ],
    )

    revision_limit = models.PositiveSmallIntegerField(
        default=1,
    )

    revisions_used = models.PositiveSmallIntegerField(
        default=0,
    )

    open_to_all = models.BooleanField(
        default=False,
    )

    expires_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    status = models.CharField(
        max_length=40,
        choices=Status.choices,
        default=Status.PENDING_PROVIDER_RESPONSE,
    )

    paid_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    completed_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title or f"Project #{self.pk}"


class BookingAttachment(models.Model):
    booking = models.ForeignKey(
        ProjectBooking,
        on_delete=models.CASCADE,
        related_name="attachments",
    )

    file = models.FileField(
        upload_to="booking_attachments/",
    )

    original_name = models.CharField(
        max_length=255,
        blank=True,
    )

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="booking_attachments",
    )

    uploaded_at = models.DateTimeField(
        auto_now_add=True,
    )

    def __str__(self):
        return self.original_name or self.file.name


class CounterOffer(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"
        SUPERSEDED = "SUPERSEDED", "Superseded"

    booking = models.ForeignKey(
        ProjectBooking,
        on_delete=models.CASCADE,
        related_name="counter_offers",
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="created_counter_offers",
    )

    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
    )

    message = models.TextField(
        blank=True,
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Counter offer #{self.pk} - {self.amount}"


class Milestone(models.Model):
    booking = models.ForeignKey(
        ProjectBooking,
        on_delete=models.CASCADE,
        related_name="milestones",
    )

    title = models.CharField(
        max_length=200,
    )

    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
    )

    due_date = models.DateField(
        null=True,
        blank=True,
    )

    is_completed = models.BooleanField(
        default=False,
    )

    sort_order = models.PositiveSmallIntegerField(
        default=0,
    )

    def __str__(self):
        return self.title


class Deliverable(models.Model):
    booking = models.ForeignKey(
        ProjectBooking,
        on_delete=models.CASCADE,
        related_name="deliverables",
    )

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="uploaded_deliverables",
    )

    title = models.CharField(
        max_length=255,
        blank=True,
    )

    file = models.FileField(
        upload_to="deliverables/",
        blank=True,
        null=True,
    )

    link_url = models.URLField(
        blank=True,
    )

    note = models.TextField(
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    def __str__(self):
        return self.title or f"Deliverable #{self.pk}"


class RevisionRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"
        COMPLETED = "COMPLETED", "Completed"

    booking = models.ForeignKey(
        ProjectBooking,
        on_delete=models.CASCADE,
        related_name="revision_requests",
    )

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="revision_requests",
    )

    message = models.TextField()

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    resolved_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Revision request for {self.booking_id}"

class AvailabilitySlot(models.Model):
    """A concrete, bookable time window offered by a provider.

    Providers either add slots directly or generate them from the recurring
    `catalog.Availability` rules. A slot is reserved atomically when a booking
    is created, which is what prevents double booking.
    """

    class Status(models.TextChoices):
        AVAILABLE = "AVAILABLE", "Available"
        BOOKED = "BOOKED", "Booked"
        BLOCKED = "BLOCKED", "Blocked"

    freelancer = models.ForeignKey(
        "accounts.FreelancerProfile",
        on_delete=models.CASCADE,
        related_name="slots",
    )

    service = models.ForeignKey(
        "catalog.Service",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="slots",
    )

    date = models.DateField(db_index=True)
    start_time = models.TimeField()
    end_time = models.TimeField()

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.AVAILABLE,
    )

    booking = models.OneToOneField(
        ProjectBooking,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="slot",
    )

    note = models.CharField(max_length=160, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["date", "start_time"]
        indexes = [
            models.Index(fields=["freelancer", "date"]),
            models.Index(fields=["status", "date"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["freelancer", "date", "start_time"],
                name="unique_provider_slot_start",
            ),
        ]

    def __str__(self):
        return f"{self.freelancer_id} {self.date} {self.start_time}-{self.end_time} ({self.status})"

    @property
    def is_past(self) -> bool:
        from django.utils import timezone

        return self.date < timezone.localdate()
