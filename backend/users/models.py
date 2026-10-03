from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    ROLE_CHOICES = (
        ("customer", "Client"),
        ("provider", "Freelancer"),
        ("admin", "Admin"),
    )

    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="customer")
    phone = models.CharField(max_length=15, null=True, blank=True)
    profile_photo = models.ImageField(upload_to="profile_photos/", null=True, blank=True)
    is_suspended = models.BooleanField(default=False)


class ClientProfile(models.Model):
    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="client_profile"
    )
    location = models.CharField(max_length=255, blank=True)
    bio = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class FreelancerProfile(models.Model):
    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="freelancer_profile"
    )
    professional_title = models.CharField(max_length=200, blank=True)
    bio = models.TextField(blank=True)
    experience = models.TextField(blank=True)
    languages = models.CharField(max_length=255, blank=True)
    location = models.CharField(max_length=255, blank=True)
    education = models.TextField(blank=True)
    response_rate = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    skills = models.ManyToManyField(
        "marketplace.Skill", blank=True, related_name="freelancers"
    )
