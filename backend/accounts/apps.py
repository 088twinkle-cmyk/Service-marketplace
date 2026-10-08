from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "accounts"

    def ready(self):
        from . import signals  # noqa: F401

        # Safe (name-only) startup warning when real WhatsApp delivery is
        # enabled but the Meta configuration is incomplete.
        from django.core.checks import register

        from .checks import check_whatsapp_otp_configuration

        register(check_whatsapp_otp_configuration)