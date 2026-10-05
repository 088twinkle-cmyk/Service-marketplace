"""
Create client profile for test user
Run with: python manage.py shell < create_client_profile.py
"""

from accounts.models import User, ClientProfile

# Get the test client user
try:
    user = User.objects.get(email="test@example.com")
    print(f"Found user: {user.email} (role: {user.role})")
    
    # Create client profile
    profile, created = ClientProfile.objects.get_or_create(
        user=user,
        defaults={
            "full_name": "Test Client",
            "location": "Kathmandu",
        }
    )
    
    if created:
        print(f"Created client profile for {user.email}")
    else:
        print(f"Client profile already exists for {user.email}")
        
except User.DoesNotExist:
    print("Test user not found. Please register first.")
