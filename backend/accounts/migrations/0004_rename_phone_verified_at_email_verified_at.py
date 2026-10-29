from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_pendingregistration_otpcode_attempts_and_more"),
    ]

    operations = [
        migrations.RenameField(
            model_name="pendingregistration",
            old_name="phone_verified_at",
            new_name="email_verified_at",
        ),
    ]
