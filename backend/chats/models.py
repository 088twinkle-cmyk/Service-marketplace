from django.conf import settings
from django.db import models
class Conversation(models.Model):
    booking = models.OneToOneField(
        "bookings.ProjectBooking", on_delete=models.CASCADE, related_name="conversation"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    def __str__(self):
        return f"Chat for {self.booking_id}"
class Message(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    body = models.TextField(blank=True)
    attachment = models.FileField(upload_to="chat/", blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)
    class Meta:
        ordering = ["created_at"]