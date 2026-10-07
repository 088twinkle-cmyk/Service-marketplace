"""Create development demo data.

    python manage.py seed_demo
    python manage.py seed_demo --reset      # delete demo accounts first
    python manage.py seed_demo --force      # allow running with DEBUG=False

The command is idempotent: running it twice does not duplicate rows. It never
runs automatically, and it refuses to run in production (DEBUG=False) unless
``--force`` is given, so demo accounts can never leak into a live platform.
"""
import io
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from django.utils.text import slugify

from accounts.models import FreelancerProfile, KYCVerification, User
from bookings.models import AvailabilitySlot, ProjectBooking
from catalog.models import Category, PortfolioItem, Service, ServiceImage, Skill, SubCategory
from platformcore.geo import coords_for_location
from reviews.models import Review

DEMO_PASSWORD = "DemoPass!2024"

CITY_CYCLE = ["Kathmandu", "Lalitpur", "Bhaktapur", "Pokhara"]

PROVIDERS = [
    {
        "username": "sita_hair",
        "email": "sita@demo.marketplace",
        "title": "Hair stylist & bridal specialist",
        "bio": "10 years of salon experience specialising in bridal hair, styling and colour.",
        "experience": 10,
        "city": "Kathmandu",
        "skills": ["Makeup", "Hair"],
        "services": [
            {
                "title": "Bridal hair styling",
                "category": "Beauty & Personal Care",
                "description": "Complete bridal hair styling at your home, including trial session.",
                "price": "4500",
                "duration": 120,
                "location": "Kathmandu",
            },
            {
                "title": "Haircut & blow dry",
                "category": "Beauty & Personal Care",
                "description": "Precision haircut, wash and blow dry with styling advice.",
                "price": "1200",
                "duration": 60,
                "location": "Kathmandu",
            },
        ],
    },
    {
        "username": "meera_makeup",
        "email": "meera@demo.marketplace",
        "title": "Professional makeup artist",
        "bio": "Party, engagement and bridal makeup using cruelty-free products.",
        "experience": 7,
        "city": "Lalitpur",
        "skills": ["Makeup", "Hair"],
        "services": [
            {
                "title": "Party makeup",
                "category": "Beauty & Personal Care",
                "description": "Long-lasting event makeup with premium products and lashes.",
                "price": "2500",
                "duration": 90,
                "location": "Lalitpur",
            },
            {
                "title": "Mehndi design (bridal)",
                "category": "Beauty & Personal Care",
                "description": "Intricate bridal mehndi for hands and feet using organic henna.",
                "price": "3000",
                "duration": 150,
                "location": "Lalitpur",
            },
        ],
    },
    {
        "username": "rekha_nails",
        "email": "rekha@demo.marketplace",
        "title": "Nail technician & massage therapist",
        "bio": "Nail art, manicure, pedicure and relaxing full-body massage at home.",
        "experience": 5,
        "city": "Bhaktapur",
        "skills": ["Nails", "Massage"],
        "services": [
            {
                "title": "Gel manicure & nail art",
                "category": "Beauty & Personal Care",
                "description": "Gel polish manicure with hand-painted nail art of your choice.",
                "price": "1800",
                "duration": 75,
                "location": "Bhaktapur",
            },
            {
                "title": "Relaxing full body massage",
                "category": "Beauty & Personal Care",
                "description": "Sixty minute therapeutic full body massage with aromatic oils.",
                "price": "2200",
                "duration": 60,
                "location": "Bhaktapur",
            },
        ],
    },
]

CUSTOMERS = [
    ("anita_customer", "anita@demo.marketplace", "Anita Sharma", "Kathmandu"),
    ("bikash_customer", "bikash@demo.marketplace", "Bikash Thapa", "Lalitpur"),
]


def make_image(label: str, colour: tuple[int, int, int]) -> bytes:
    """Render a simple placeholder image with Pillow."""
    from PIL import Image, ImageDraw

    image = Image.new("RGB", (900, 600), colour)
    draw = ImageDraw.Draw(image)
    draw.rectangle([0, 480, 900, 600], fill=(255, 255, 255))
    draw.text((30, 515), label[:60], fill=(15, 23, 42))
    draw.text((30, 40), "SERVICE MARKETPLACE", fill=(255, 255, 255))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=85)
    return buffer.getvalue()


class Command(BaseCommand):
    help = "Seed development data: categories, demo providers, services, slots and reviews."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete the demo accounts (and their data) before seeding.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Allow seeding even when DJANGO_DEBUG is false.",
        )

    def handle(self, *args, **options):
        if not settings.DEBUG and not options["force"]:
            raise CommandError(
                "Refusing to seed demo data with DEBUG disabled. "
                "Use --force only if you are certain this is not production."
            )

        self.stdout.write(self.style.MIGRATE_HEADING("Seeding development data…"))

        if options["reset"]:
            self._reset()

        categories = self._seed_catalog()
        admin_user = self._seed_admin()
        providers = self._seed_providers(categories)
        customers = self._seed_customers()
        self._seed_bookings_and_reviews(providers, customers, admin_user)

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Demo data ready."))
        self.stdout.write(
            f"  Admin     : admin@demo.marketplace / {DEMO_PASSWORD} (superuser)\n"
            f"  Customers : " + ", ".join(u for u, *_ in CUSTOMERS) + "\n"
            f"  Providers : " + ", ".join(p["username"] for p in PROVIDERS) + "\n"
            f"  Password  : {DEMO_PASSWORD}"
        )

    # ------------------------------------------------------------------
    def _reset(self):
        usernames = [p["username"] for p in PROVIDERS] + [c[0] for c in CUSTOMERS]
        usernames.append("admin_demo")
        deleted = User.objects.filter(username__in=usernames).delete()
        self.stdout.write(f"  removed previous demo rows: {deleted[0]}")

    def _seed_catalog(self):
        from django.core.management import call_command

        call_command("seed_catalog", verbosity=0)

        # Make sure the beauty categories required by the marketplace exist.
        beauty, _ = Category.objects.get_or_create(
            slug="beauty-personal-care",
            defaults={
                "name": "Beauty & Personal Care",
                "description": "Hair, makeup, nails, mehndi and massage at home.",
                "default_service_mode": "LOCAL",
                "sort_order": 1,
            },
        )
        for order, name in enumerate(["Hair", "Nails", "Makeup", "Massage", "Mehndi", "Grooming"], start=1):
            SubCategory.objects.get_or_create(
                category=beauty,
                slug=slugify(name),
                defaults={"name": name},
            )
            Skill.objects.get_or_create(slug=slugify(name), defaults={"name": name})

        for order, name in enumerate(
            ["Other Services", "Home & Local Services", "Events & Lifestyle"], start=90
        ):
            Category.objects.get_or_create(
                slug=slugify(name),
                defaults={
                    "name": name,
                    "description": f"{name} on the marketplace.",
                    "sort_order": order,
                },
            )

        self.stdout.write(f"  categories: {Category.objects.count()}")
        return {c.name: c for c in Category.objects.all()}

    def _seed_admin(self):
        admin, created = User.objects.get_or_create(
            username="admin_demo",
            defaults={
                "email": "admin@demo.marketplace",
                "role": User.Role.ADMIN,
                "is_staff": True,
                "is_superuser": True,
                "is_otp_verified": True,
                "phone": "9800000000",
            },
        )
        if created:
            admin.set_password(DEMO_PASSWORD)
            admin.save()
            self.stdout.write("  created demo admin")
        return admin

    def _seed_providers(self, categories):
        skill_map = {s.name: s for s in Skill.objects.all()}
        providers = []

        for index, spec in enumerate(PROVIDERS):
            user, created = User.objects.get_or_create(
                username=spec["username"],
                defaults={
                    "email": spec["email"],
                    "role": User.Role.FREELANCER,
                    "is_otp_verified": True,
                    "phone": f"98111100{index:02d}",
                },
            )
            if created:
                user.set_password(DEMO_PASSWORD)
                user.save()

            profile, _ = FreelancerProfile.objects.get_or_create(user=user)
            lat, lng = coords_for_location(spec["city"])
            profile.professional_title = spec["title"]
            profile.bio = spec["bio"]
            profile.experience_years = spec["experience"]
            profile.location = spec["city"]
            profile.languages = "Nepali, English"
            profile.is_available = True
            profile.save()

            profile.skills.set(
                [skill_map[name] for name in spec["skills"] if name in skill_map]
            )

            KYCVerification.objects.update_or_create(
                freelancer=profile,
                defaults={
                    "legal_name": f"{spec['username'].split('_')[0].title()} Demo",
                    "document_type": "citizenship",
                    "document_number": f"DEMO-{1000 + index}",
                    "status": KYCVerification.Status.APPROVED,
                    "reviewed_at": timezone.now(),
                },
            )

            self._seed_services(profile, spec, categories)
            self._seed_slots(profile)
            self._seed_portfolio(profile, spec, categories)

            providers.append(profile)

        self.stdout.write(f"  providers: {FreelancerProfile.objects.count()}")
        return providers

    def _seed_services(self, profile, spec, categories):
        for service_index, service_spec in enumerate(spec["services"]):
            category = categories.get(service_spec["category"]) or Category.objects.first()
            service, created = Service.objects.get_or_create(
                freelancer=profile,
                title=service_spec["title"],
                defaults={
                    "category": category,
                    "description": service_spec["description"],
                    "starting_price": Decimal(service_spec["price"]),
                    "duration_minutes": service_spec["duration"],
                    "location": service_spec["location"],
                    "service_mode": Service.Mode.LOCAL,
                    "travel_radius_km": 15,
                    "tags": "home service, verified",
                    "client_requirements": "Please share your address and preferred time.",
                },
            )
            lat, lng = coords_for_location(service_spec["location"] or spec["city"])
            if lat is not None:
                service.latitude = lat
                service.longitude = lng
                service.save(update_fields=["latitude", "longitude"])

            if not service.images.exists():
                for photo in range(2):
                    image = ServiceImage(service=service, caption=f"{service.title} photo {photo + 1}")
                    image.image.save(
                        f"demo-{profile.user.username}-{service_index}-{photo}.jpg",
                        ContentFile(
                            make_image(
                                f"{service.title} — {spec['city']}",
                                (37 + photo * 25, 99, 235 - photo * 40),
                            )
                        ),
                        save=True,
                    )

    def _seed_slots(self, profile):
        today = timezone.localdate()
        for day_offset in range(1, 15):
            day = today + timedelta(days=day_offset)
            for start_hour, end_hour in ((9, 11), (14, 16), (16, 18)):
                AvailabilitySlot.objects.get_or_create(
                    freelancer=profile,
                    date=day,
                    start_time=f"{start_hour:02d}:00",
                    defaults={
                        "end_time": f"{end_hour:02d}:00",
                        "service": profile.services.first(),
                    },
                )

    def _seed_portfolio(self, profile, spec, categories):
        if profile.portfolio.exists():
            return
        for index, service_spec in enumerate(spec["services"]):
            item = PortfolioItem(
                freelancer=profile,
                title=f"{service_spec['title']} — recent work",
                description="Completed for a customer in " + spec["city"] + ".",
                category=categories.get(service_spec["category"]),
            )
            item.image.save(
                f"portfolio-{profile.user.username}-{index}.jpg",
                ContentFile(
                    make_image(service_spec["title"], (16, 185, 129 - index * 30))
                ),
                save=True,
            )

    def _seed_customers(self):
        customers = []
        for index, (username, email, full_name, city) in enumerate(CUSTOMERS):
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "email": email,
                    "role": User.Role.CLIENT,
                    "is_otp_verified": True,
                    "phone": f"98222200{index:02d}",
                },
            )
            if created:
                user.set_password(DEMO_PASSWORD)
                user.save()

            profile = user.client_profile
            profile.full_name = full_name
            profile.location = city
            profile.save()
            customers.append(user)
        return customers

    def _seed_bookings_and_reviews(self, providers, customers, admin_user):
        """One completed+reviewed booking and one pending request."""
        if not providers or not customers:
            return

        provider = providers[0]
        customer = customers[0]
        client_profile = customer.client_profile
        service = provider.services.first()

        completed, created = ProjectBooking.objects.get_or_create(
            client=client_profile,
            freelancer=provider,
            service=service,
            defaults={
                "title": service.title,
                "requirements": "Home visit in Kathmandu, morning preferred.",
                "proposed_price": service.starting_price,
                "agreed_price": service.starting_price,
                "status": ProjectBooking.Status.COMPLETED,
                "booking_type": ProjectBooking.BookingType.LOCAL_APPOINTMENT,
                "service_mode": ProjectBooking.ServiceMode.LOCAL,
                "location_city": "Kathmandu",
                "location_address": "Baluwatar, Kathmandu",
                "appointment_start": timezone.now() - timedelta(days=6),
                "appointment_end": timezone.now() - timedelta(days=6) + timedelta(hours=2),
                "completed_at": timezone.now() - timedelta(days=5),
                "paid_at": timezone.now() - timedelta(days=6),
            },
        )
        if created:
            from payments.models import LedgerTransaction, Payment
            from payments.services import mark_success

            payment = Payment.objects.create(
                booking=completed,
                payer=customer,
                amount=completed.agreed_price,
                status=Payment.Status.PENDING,
                transaction_uuid=f"demo-{completed.pk}-{timezone.now().timestamp():.0f}",
                idempotency_key=f"demo-{completed.pk}",
            )
            mark_success(payment, gateway_ref="DEMO-REF")
            LedgerTransaction.objects.get_or_create(
                payment=payment,
                kind=LedgerTransaction.Kind.SETTLEMENT,
                defaults={
                    "booking": completed,
                    "amount": payment.amount,
                    "note": "Demo settlement on completion",
                },
            )
            provider.completed_jobs += 1
            provider.save(update_fields=["completed_jobs"])

        if not hasattr(completed, "review"):
            Review.objects.create(
                booking=completed,
                reviewer=customer,
                freelancer=provider,
                rating=5,
                comment="Excellent service, arrived on time and the styling was perfect.",
            )
            from reviews.views import recalc_freelancer_rating

            recalc_freelancer_rating(provider)

        # A pending request so the provider dashboard has something actionable.
        second_service = providers[0].services.last() or service
        ProjectBooking.objects.get_or_create(
            client=customers[1].client_profile,
            freelancer=providers[0],
            title="Bridal makeup trial",
            defaults={
                "service": second_service,
                "category": second_service.category,
                "requirements": "Trial session before the wedding in November.",
                "proposed_price": Decimal("2000"),
                "status": ProjectBooking.Status.PENDING_PROVIDER_RESPONSE,
                "booking_type": ProjectBooking.BookingType.LOCAL_APPOINTMENT,
                "service_mode": ProjectBooking.ServiceMode.LOCAL,
                "location_city": "Lalitpur",
                "appointment_start": timezone.now() + timedelta(days=5, hours=3),
                "appointment_end": timezone.now() + timedelta(days=5, hours=5),
            },
        )

        self.stdout.write(f"  bookings: {ProjectBooking.objects.count()}")
