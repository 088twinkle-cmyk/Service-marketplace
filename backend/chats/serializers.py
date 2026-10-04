from rest_framework import serializers
from .models import Conversation, Message
class MessageSerializer(serializers.ModelSerializer):
    sender_email = serializers.EmailField(source="sender.email", read_only=True)
    class Meta:
        model = Message
        fields = "__all__"
        read_only_fields = ("conversation", "sender", "created_at", "read_at")
class ConversationSerializer(serializers.ModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)
    booking_title = serializers.CharField(source="booking.title", read_only=True)
    class Meta:
        model = Conversation
        fields = "__all__"