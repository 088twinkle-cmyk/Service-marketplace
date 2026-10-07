"""Shared test helpers.

Tests build data through the real models and the real API where possible, so
they exercise the same code paths a browser would.
"""
from datetime import timedelta
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import FreelancerProfile, KYCVerification, User
from bookings.models import AvailabilitySlot
from catalog.models import Category, Service, Skill

PASSWORD = "Str0ngPass!2024"


def png_bytes() -> bytes:
    """A tiny valid PNG so ImageField/validation accepts it in tests."""
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
        b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )


def image_upload(name="photo.png", content_type="image/png") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, png_bytes(), content_type=content_type)


def make_category(name="Beauty & Personal Care", slug="beauty-personal-care") -> Category:
    category, _ = Category.objects.get_or_create(
        slug=slug,
        defaults={"name": name, "description": name},
    )
    return category


def make_user(
    username="user1",
    email=None,
    role=User.Role.CLIENT,
    verified_otp=True,
    phone="9800000000",
    password=PASSWORD,
) -> User:
    user = User.objects.create_user(
        username=username,
        email=email or f"{username}@example.com",
        password=password,
        role=role,
        phone=phone,
    )
    user.is_otp_verified = verified_otp
    user.save(update_fields=["is_otp_verified"])
    return user


def make_provider(username="provider1", *, approved=True, city="Kathmandu") -> FreelancerProfile:
    user = make_user(username, role=User.Role.FREELANCER)
    profile = FreelancerProfile.objects.get(user=user)
    profile.professional_title = "Verified provider"
    profile.bio = "Experienced provider"
    profile.location = city
    profile.save()

    if approved:
        KYCVerification.objects.create(
            freelancer=profile,
            legal_name="Test Provider",
            document_type="citizenship",
            document_number=f"DOC-{username}",
            document_front=image_upload("doc.png"),
            status=KYCVerification.Status.APPROVED,
            reviewed_at=timezone.now(),
        )
    return profile


def make_service(
    profile: FreelancerProfile,
    *,
    title="Hair styling at home",
    price="2000.00",
    location="Kathmandu",
    latitude="27.717200",
    longitude="85.324000",
    category=None,
    active=True,
) -> Service:
    return Service.objects.create(
        freelancer=profile,
        category=category or make_category(),
        title=title,
        description="Professional service at your home.",
        service_mode=Service.Mode.LOCAL,
        starting_price=Decimal(price),
        location=location,
        latitude=Decimal(latitude),
        longitude=Decimal(longitude),
        is_active=active,
    )


def make_slot(profile, service=None, *, days_ahead=3, start="09:00", end="11:00") -> AvailabilitySlot:
    return AvailabilitySlot.objects.create(
        freelancer=profile,
        service=service,
        date=timezone.localdate() + timedelta(days=days_ahead),
        start_time=start,
        end_time=end,
    )


def auth_client(user) -> APIClient:
    """A client authenticated with a real JWT (not force_authenticate)."""
    from rest_framework_simplejwt.tokens import RefreshToken

    client = APIClient()
    token = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


def api_client() -> APIClient:
    return APIClient()
