"""Report WhatsApp OTP delivery readiness.

    python manage.py whatsapp_status

Prints ONLY setting names, whether they are set, and which provider would be
used.  Values — especially the WHATSAPP_ACCESS_TOKEN — are never printed,
so the output is safe to paste into an issue or chat.
"""
from django.core.management.base import BaseCommand

from whatsapp import get_whatsapp_otp_service
from whatsapp.config import whatsapp_configuration_status


class Command(BaseCommand):
    help = (
        "Check WhatsApp OTP configuration. Prints setting names and status "
        "only — never values."
    )

    def handle(self, *args, **options):
        status = whatsapp_configuration_status()
        service = get_whatsapp_otp_service()

        write = self.stdout.write
        enabled = status["enabled"]
        provider = status["provider"]
        configured = status["configured"]

        write(self.style.MIGRATE_HEADING("WhatsApp OTP configuration"))
        write("")
        write(f"  WHATSAPP_OTP_ENABLED        : {'true' if enabled else 'false'}")
        write(f"  Provider selected           : {provider}")
        write(
            "  Real Cloud API delivery     : "
            + ("YES" if configured and provider == "cloud" else "NO")
        )
        write(
            "  Business number (display)   : "
            + (service.verification_number or "(not set)")
        )
        write("")

        if status["missing"]:
            write(self.style.WARNING("  Missing required settings (names only):"))
            for name in status["missing"]:
                write(f"    - {name}")
            write("")

        optional = status.get("optional", {})
        if optional:
            write("  Optional (not required for sending):")
            for name, is_set in optional.items():
                write(f"    - {name}: {'set' if is_set else 'not set'}")
            write("")

        if not enabled:
            write(
                "  Delivery is DISABLED. Local development (DEBUG) uses the\n"
                "  clearly-labelled simulated provider; production answers\n"
                "  HTTP 503 whatsapp_not_configured."
            )
        elif not configured:
            write(
                self.style.WARNING(
                    "  NOT CONFIGURED for real delivery: the API answers\n"
                    "  HTTP 503 whatsapp_not_configured until the missing\n"
                    "  settings are filled in backend/.env."
                )
            )
        else:
            write(
                self.style.SUCCESS(
                    "  All required settings are present. Remember that the\n"
                    "  template referenced by WHATSAPP_OTP_TEMPLATE_NAME must\n"
                    "  also be APPROVED in the Meta dashboard — sending fails\n"
                    "  with whatsapp_unavailable (503) otherwise."
                )
            )

        write("")
        write(
            "  Values are never printed by this command.\n"
            "  See WHATSAPP-OTP.md ('Required Meta credentials') for where to\n"
            "  obtain each value."
        )
