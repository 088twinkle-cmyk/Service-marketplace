from .models import Notification


def notify(user, title: str, body: str, event_type: str) -> None:
    if not user:
        return
    Notification.objects.create(
        user=user,
        title=title[:200],
        body=body,
        event_type=event_type[:50],
    )
