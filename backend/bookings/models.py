from django.conf import settings
from django.db import models


class AvailabilitySlot(models.Model):
    STATUS_AVAILABLE = "available"
    STATUS_BOOKED = "booked"
    STATUS_BLOCKED = "blocked"

    STATUS_CHOICES = [
        (STATUS_AVAILABLE, "Available"),
        (STATUS_BOOKED, "Booked"),
        (STATUS_BLOCKED, "Blocked"),
    ]

    provider = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="availability_slots",
    )
    service = models.ForeignKey(
        "marketplace.Service",
        on_delete=models.CASCADE,
        related_name="availability_slots",
        null=True,
        blank=True,
    )
    date = models.DateField()
    start_time = models.TimeField(default="09:00")
    end_time = models.TimeField(default="17:00")
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_AVAILABLE
    )
    booking = models.OneToOneField(
        "Booking",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="availability_slot",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["date", "start_time"]
        unique_together = [["provider", "service", "date", "start_time"]]


class Booking(models.Model):
    TYPE_FIXED = "FIXED_SERVICE_BOOKING"
    TYPE_CUSTOM = "CUSTOM_JOB"
    TYPE_LOCAL = "LOCAL_APPOINTMENT"
    TYPE_REMOTE = "REMOTE_PROJECT"
    TYPE_MILESTONE = "MILESTONE_PROJECT"
    TYPE_CHOICES = [
        (TYPE_FIXED, "Fixed service booking"),
        (TYPE_CUSTOM, "Custom job"),
        (TYPE_LOCAL, "Local appointment"),
        (TYPE_REMOTE, "Remote project"),
        (TYPE_MILESTONE, "Milestone project"),
    ]

    DRAFT = "DRAFT"
    PENDING_PROVIDER_RESPONSE = "PENDING_PROVIDER_RESPONSE"
    COUNTER_OFFERED = "COUNTER_OFFERED"
    AGREEMENT_REACHED = "AGREEMENT_REACHED"
    PAYMENT_PENDING = "PAYMENT_PENDING"
    PAYMENT_FAILED = "PAYMENT_FAILED"
    CONFIRMED = "CONFIRMED"
    IN_PROGRESS = "IN_PROGRESS"
    DELIVERABLE_SUBMITTED = "DELIVERABLE_SUBMITTED"
    CLIENT_REVIEWING = "CLIENT_REVIEWING"
    REVISION_REQUESTED = "REVISION_REQUESTED"
    COMPLETED = "COMPLETED"
    REVIEWED = "REVIEWED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"
    DISPUTED = "DISPUTED"

    STATUS_CHOICES = [
        (DRAFT, "Draft"),
        (PENDING_PROVIDER_RESPONSE, "Pending provider response"),
        (COUNTER_OFFERED, "Counter offered"),
        (AGREEMENT_REACHED, "Agreement reached"),
        (PAYMENT_PENDING, "Payment pending"),
        (PAYMENT_FAILED, "Payment failed"),
        (CONFIRMED, "Confirmed"),
        (IN_PROGRESS, "In progress"),
        (DELIVERABLE_SUBMITTED, "Deliverable submitted"),
        (CLIENT_REVIEWING, "Client reviewing"),
        (REVISION_REQUESTED, "Revision requested"),
        (COMPLETED, "Completed"),
        (REVIEWED, "Reviewed"),
        (REJECTED, "Rejected"),
        (CANCELLED, "Cancelled"),
        (EXPIRED, "Expired"),
        (DISPUTED, "Disputed"),
    ]

    LEGACY_STATUS_MAP = {
        "pending": PENDING_PROVIDER_RESPONSE,
        "confirmed": CONFIRMED,
        "completed": COMPLETED,
        "cancelled": CANCELLED,
    }

    CHAT_STATUSES = {
        CONFIRMED,
        IN_PROGRESS,
        DELIVERABLE_SUBMITTED,
        CLIENT_REVIEWING,
        REVISION_REQUESTED,
        COMPLETED,
        REVIEWED,
        DISPUTED,
    }

    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="customer_bookings",
        null=True,
        blank=True,
    )
    provider = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="provider_bookings",
        null=True,
        blank=True,
    )
    service = models.ForeignKey(
        "marketplace.Service",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    booking_type = models.CharField(
        max_length=32, choices=TYPE_CHOICES, default=TYPE_FIXED
    )
    service_mode = models.CharField(max_length=12, default="LOCAL")
    title = models.CharField(max_length=255, blank=True)
    requirements = models.TextField(blank=True)
    proposed_price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    agreed_price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    deadline = models.DateTimeField(null=True, blank=True)
    location_text = models.CharField(max_length=255, blank=True)
    booking_time = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=40,
        choices=STATUS_CHOICES,
        default=PENDING_PROVIDER_RESPONSE,
    )
    notes = models.TextField(blank=True)
    revision_limit = models.PositiveSmallIntegerField(default=1)
    revision_count = models.PositiveSmallIntegerField(default=0)
    price_locked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def canonical_status(self) -> str:
        return self.LEGACY_STATUS_MAP.get(self.status, self.status)

    def cancel_and_release_slot(self):
        self.status = self.CANCELLED
        self.save(update_fields=["status", "updated_at"])
        slot = getattr(self, "availability_slot", None)
        if slot:
            slot.status = AvailabilitySlot.STATUS_AVAILABLE
            slot.booking = None
            slot.save(update_fields=["status", "booking"])

    @property
    def display_title(self) -> str:
        if self.title:
            return self.title
        if self.service_id:
            return self.service.title
        return f"Project #{self.pk}"


class BookingAttachment(models.Model):
    booking = models.ForeignKey(
        Booking, on_delete=models.CASCADE, related_name="attachments"
    )
    file_url = models.URLField(max_length=500)
    filename = models.CharField(max_length=200, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    created_at = models.DateTimeField(auto_now_add=True)


class CounterOffer(models.Model):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    SUPERSEDED = "SUPERSEDED"

    booking = models.ForeignKey(
        Booking, on_delete=models.CASCADE, related_name="counter_offers"
    )
    creator = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="counter_offers"
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    message = models.TextField(blank=True)
    status = models.CharField(max_length=20, default=PENDING)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class Milestone(models.Model):
    booking = models.ForeignKey(
        Booking, on_delete=models.CASCADE, related_name="milestones"
    )
    title = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    due_date = models.DateField(null=True, blank=True)
    is_completed = models.BooleanField(default=False)
    sort_order = models.PositiveSmallIntegerField(default=0)


class Deliverable(models.Model):
    booking = models.ForeignKey(
        Booking, on_delete=models.CASCADE, related_name="deliverables"
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE
    )
    file_url = models.URLField(max_length=500, blank=True)
    link_url = models.URLField(max_length=500, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class RevisionRequest(models.Model):
    booking = models.ForeignKey(
        Booking, on_delete=models.CASCADE, related_name="revision_requests"
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE
    )
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)


class Payment(models.Model):
    INITIATED = "INITIATED"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"

    booking = models.ForeignKey(
        Booking, on_delete=models.CASCADE, related_name="payments"
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=8, default="NPR")
    status = models.CharField(max_length=20, default=INITIATED)
    gateway = models.CharField(max_length=20, default="esewa")
    merchant_pid = models.CharField(max_length=80, unique=True)
    gateway_ref = models.CharField(max_length=120, blank=True)
    idempotency_key = models.CharField(max_length=80, unique=True)
    raw_callback = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class Transaction(models.Model):
    CREDIT = "CREDIT"
    DEBIT = "DEBIT"

    payment = models.ForeignKey(
        Payment, on_delete=models.CASCADE, related_name="transactions"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="transactions"
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    tx_type = models.CharField(max_length=12)
    description = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Dispute(models.Model):
    OPEN = "OPEN"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"

    booking = models.OneToOneField(
        Booking, on_delete=models.CASCADE, related_name="dispute"
    )
    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="disputes_opened"
    )
    reason = models.TextField()
    status = models.CharField(max_length=20, default=OPEN)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
