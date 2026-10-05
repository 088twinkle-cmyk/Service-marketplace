from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    action = models.CharField(max_length=80)
    model_name = models.CharField(max_length=80)
    object_id = models.CharField(max_length=64, blank=True)
    extra = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class Report(models.Model):
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reports_filed",
    )
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reports_received",
        null=True,
        blank=True,
    )
    booking = models.ForeignKey(
        "bookings.ProjectBooking",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reports",
    )
    reason = models.CharField(max_length=200)
    details = models.TextField(blank=True)
    status = models.CharField(max_length=20, default="OPEN")
    created_at = models.DateTimeField(auto_now_add=True)


def audit(actor, action: str, model_name: str, object_id="", extra=None):
    AuditLog.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action[:80],
        model_name=model_name[:80],
        object_id=str(object_id)[:64],
        extra=extra or {},
    )
