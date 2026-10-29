"""Report email OTP readiness without exposing SMTP credentials."""
from django.conf import settings
from django.core.management.base import BaseCommand

from accounts.email_otp import email_delivery_configured


class Command(BaseCommand):
    help = "Check email OTP configuration without printing credential values."

    def handle(self, *args, **options):
        backend = settings.EMAIL_BACKEND
        ready = email_delivery_configured()
        simulated = (
            backend == "django.core.mail.backends.console.EmailBackend"
        )
        self.stdout.write(self.style.MIGRATE_HEADING("Email OTP configuration"))
        self.stdout.write(f"  Email backend: {backend}")
        self.stdout.write(f"  Email delivery ready: {'YES' if ready else 'NO'}")
        if simulated and ready:
            self.stdout.write(
                self.style.WARNING(
                    "  Console backend is for development only; email contents "
                    "are printed to the backend console, not delivered."
                )
            )
        elif not ready:
            self.stdout.write(
                self.style.WARNING(
                    "  Configure SMTP settings in backend/.env and restart Django."
                )
            )
