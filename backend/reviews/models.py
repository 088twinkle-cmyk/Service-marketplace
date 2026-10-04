from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class Review(models.Model):
    booking = models.OneToOneField(
        "bookings.ProjectBooking",
        on_delete=models.CASCADE,
        related_name="review",
    )

    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reviews_given",
    )

    freelancer = models.ForeignKey(
        "accounts.FreelancerProfile",
        on_delete=models.CASCADE,
        related_name="reviews",
    )

    rating = models.PositiveSmallIntegerField()
    comment = models.TextField(blank=True)
    is_visible = models.BooleanField(default=True)

    moderated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="moderated_reviews",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        if self.rating < 1 or self.rating > 5:
            raise ValidationError("Rating must be between 1 and 5.")


class Dispute(models.Model):
    class Status(models.TextChoices):
        OPEN = "OPEN"
        UNDER_REVIEW = "UNDER_REVIEW"
        RESOLVED = "RESOLVED"
        REJECTED = "REJECTED"

    booking = models.ForeignKey(
        "bookings.ProjectBooking",
        on_delete=models.CASCADE,
        related_name="disputes",
    )

    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )

    reason = models.TextField()

    evidence = models.FileField(
        upload_to="disputes/",
        blank=True,
        null=True,
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.OPEN,
    )

    resolution = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(
        null=True,
        blank=True,
    )


class Report(models.Model):
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )

    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reports_against",
        null=True,
        blank=True,
    )

    booking = models.ForeignKey(
        "bookings.ProjectBooking",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    reason = models.CharField(max_length=120)
    details = models.TextField()

    is_resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)