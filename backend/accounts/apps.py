from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "accounts"

    def ready(self):
        from . import signals  # noqa: F401

        # Safe startup warning when real email delivery is not configured.
        from django.core.checks import register

        from .checks import check_email_otp_configuration

        register(check_email_otp_configuration)