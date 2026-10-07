"""Notification helpers.

Every business event that a user should know about is routed through
``notify`` / ``notify_booking_event`` so the delivery mechanism (currently
in-app rows; email or push later) lives in exactly one place.
"""
import logging

from .models import Notification

logger = logging.getLogger("marketplace")

# Event names used across the app (also useful for filtering in the UI).
EVENT_BOOKING_REQUESTED = "booking_requested"
EVENT_BOOKING_ACCEPTED = "booking_accepted"
EVENT_BOOKING_REJECTED = "booking_rejected"
EVENT_COUNTER_OFFER = "counter_offer"
EVENT_OFFER_ACCEPTED = "offer_accepted"
EVENT_OFFER_REJECTED = "offer_rejected"
EVENT_PAYMENT_SUCCESS = "payment_success"
EVENT_PAYMENT_FAILED = "payment_failed"
EVENT_BOOKING_CANCELLED = "booking_cancelled"
EVENT_BOOKING_STATUS = "booking_status"
EVENT_VERIFICATION = "verification"
EVENT_MESSAGE = "new_message"
EVENT_REVIEW = "review_received"


def notify(user, title: str, body: str, event_type: str) -> Notification | None:
    """Create an in-app notification. Never raises into the request cycle."""
    if not user:
        return None

    try:
        notification = Notification.objects.create(
            user=user,
            title=title[:200],
            body=body,
            event_type=event_type[:50],
        )
    except Exception:  # pragma: no cover - defensive
        logger.exception("Could not create notification for user=%s", getattr(user, "id", None))
        return None

    logger.info(
        "notify user=%s event=%s title=%s",
        getattr(user, "id", None),
        event_type,
        title[:80],
    )
    return notification


# ---------------------------------------------------------------------------
# Booking-aware helpers
# ---------------------------------------------------------------------------

def booking_client_user(booking):
    return getattr(getattr(booking, "client", None), "user", None)


def booking_provider_user(booking):
    freelancer = getattr(booking, "freelancer", None)
    return getattr(freelancer, "user", None)


def notify_booking_event(booking, event_type: str, *, title: str, body: str, audience: str):
    """Send a booking notification to the client, the provider or both.

    ``audience`` is one of ``"client"``, ``"provider"`` or ``"both"``.
    """
    recipients = []
    if audience in ("client", "both"):
        recipients.append(booking_client_user(booking))
    if audience in ("provider", "both"):
        recipients.append(booking_provider_user(booking))

    seen = set()
    for user in recipients:
        if not user or user.id in seen:
            continue
        seen.add(user.id)
        notify(user, title, body, event_type)
