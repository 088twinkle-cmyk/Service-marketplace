from django.core.management.base import BaseCommand
from accounts.models import User, ClientProfile

class Command(BaseCommand):
    help = 'Create client profile for test user'

    def handle(self, *args, **options):
        try:
            user = User.objects.get(email="test@example.com")
            self.stdout.write(f"Found user: {user.email} (role: {user.role})")
            
            profile, created = ClientProfile.objects.get_or_create(
                user=user,
                defaults={
                    "full_name": "Test Client",
                    "location": "Kathmandu",
                }
            )
            
            if created:
                self.stdout.write(self.style.SUCCESS(f"Created client profile for {user.email}"))
            else:
                self.stdout.write(self.style.WARNING(f"Client profile already exists for {user.email}"))
                
        except User.DoesNotExist:
            self.stdout.write(self.style.ERROR("Test user not found. Please register first."))
