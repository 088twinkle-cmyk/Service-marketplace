"""
Seed data for the Service Marketplace
Run with: python manage.py shell < seed_data.py
"""

from accounts.models import User, FreelancerProfile, ClientProfile
from catalog.models import Category, SubCategory, Skill, Service, ServiceImage
from django.contrib.auth.hashers import make_password

# Create categories
categories_data = [
    {"name": "Graphic Design & Creative", "slug": "graphic-design", "description": "Logo design, branding, posters, UI assets, illustration"},
    {"name": "Web Development", "slug": "web-development", "description": "Frontend, backend, full-stack, WordPress, Shopify"},
    {"name": "Mobile Development", "slug": "mobile-development", "description": "Android, iOS, Flutter, React Native apps"},
    {"name": "Software & IT", "slug": "software-it", "description": "Python, Java, JavaScript, databases, DevOps, cybersecurity"},
    {"name": "Writing & Translation", "slug": "writing-translation", "description": "Content writing, copywriting, translation, transcription"},
    {"name": "Digital Marketing", "slug": "digital-marketing", "description": "SEO, social media, advertising, email marketing"},
    {"name": "Video, Animation & Audio", "slug": "video-animation", "description": "Video editing, motion graphics, voice-over, podcast production"},
    {"name": "Photography", "slug": "photography", "description": "Event photography, product photography, editing"},
    {"name": "Business & Consulting", "slug": "business-consulting", "description": "Business plans, market research, HR consulting, project management"},
    {"name": "Data & AI", "slug": "data-ai", "description": "Data entry, analysis, machine learning, AI integration, automation"},
    {"name": "Education & Tutoring", "slug": "education-tutoring", "description": "Academic tutoring, language lessons, professional training"},
    {"name": "Beauty & Personal Care", "slug": "beauty-care", "description": "Hair, makeup, nails, massage services"},
    {"name": "Home & Local Services", "slug": "home-services", "description": "Cleaning, repair, maintenance, plumbing, electrical"},
    {"name": "Events & Lifestyle", "slug": "events-lifestyle", "description": "Event planning, decoration, catering, DJ/MC"},
    {"name": "Handmade & Craft", "slug": "handmade-craft", "description": "Tailoring, custom products, art, crafts"},
]

categories = []
for cat_data in categories_data:
    cat, created = Category.objects.get_or_create(
        slug=cat_data["slug"],
        defaults={
            "name": cat_data["name"],
            "description": cat_data["description"],
            "is_active": True
        }
    )
    categories.append(cat)
    print(f"{'Created' if created else 'Found'} category: {cat.name}")

# Create skills
skills_data = [
    "Python", "JavaScript", "React", "Django", "WordPress", "Shopify",
    "UI/UX Design", "Logo Design", "Video Editing", "SEO", "Social Media",
    "Data Analysis", "Machine Learning", "Translation", "Content Writing",
    "Photography", "Event Planning", "Cleaning", "Plumbing", "Electrical"
]

skills = []
for skill_name in skills_data:
    skill, created = Skill.objects.get_or_create(
        name=skill_name,
        defaults={"slug": skill_name.lower().replace(" ", "-")}
    )
    skills.append(skill)
    print(f"{'Created' if created else 'Found'} skill: {skill.name}")

# Create a test freelancer
freelancer_user, created = User.objects.get_or_create(
    email="freelancer@example.com",
    defaults={
        "username": "freelancer1",
        "phone": "9876543211",
        "password": make_password("freelancer123"),
        "role": User.Role.FREELANCER,
        "is_otp_verified": True,
        "is_active_account": True
    }
)
if created:
    print(f"Created freelancer user: {freelancer_user.email}")
else:
    print(f"Found freelancer user: {freelancer_user.email}")

freelancer_profile, created = FreelancerProfile.objects.get_or_create(
    user=freelancer_user,
    defaults={
        "professional_title": "Full Stack Developer",
        "bio": "Experienced developer specializing in web and mobile applications",
        "experience_years": 5,
        "languages": "English, Nepali",
        "location": "Kathmandu",
        "is_available": True
    }
)
if created:
    print(f"Created freelancer profile for {freelancer_user.email}")
else:
    print(f"Found freelancer profile for {freelancer_user.email}")

# Create test services
services_data = [
    {
        "title": "Custom Website Development",
        "description": "I will build a professional, responsive website tailored to your needs",
        "category": categories[1],  # Web Development
        "starting_price": 50000,
        "price_max": 150000,
        "delivery_days": 7,
        "service_mode": Service.Mode.REMOTE,
        "skills": [skills[0], skills[1], skills[2]]  # Python, JavaScript, React
    },
    {
        "title": "Logo Design",
        "description": "Professional logo design with multiple concepts and revisions",
        "category": categories[0],  # Graphic Design
        "starting_price": 15000,
        "price_max": 50000,
        "delivery_days": 3,
        "service_mode": Service.Mode.REMOTE,
        "skills": [skills[6], skills[7]]  # UI/UX Design, Logo Design
    },
    {
        "title": "Home Cleaning Service",
        "description": "Complete home cleaning service for apartments and houses",
        "category": categories[12],  # Home & Local Services
        "starting_price": 2000,
        "price_max": 5000,
        "duration_minutes": 120,
        "service_mode": Service.Mode.LOCAL,
        "location": "Kathmandu",
        "travel_radius_km": 10,
        "skills": [skills[18]]  # Cleaning
    },
    {
        "title": "Event Photography",
        "description": "Professional event photography with high-quality edited photos",
        "category": categories[7],  # Photography
        "starting_price": 25000,
        "price_max": 75000,
        "service_mode": Service.Mode.BOTH,
        "location": "Kathmandu",
        "travel_radius_km": 50,
        "skills": [skills[16]]  # Photography
    },
]

for service_data in services_data:
    skills_to_add = service_data.pop("skills", [])
    service, created = Service.objects.get_or_create(
        freelancer=freelancer_profile,
        title=service_data["title"],
        defaults={**service_data, "is_active": True}
    )
    if created:
        service.skills.set(skills_to_add)
        print(f"Created service: {service.title}")
    else:
        print(f"Found service: {service.title}")

print("\nSeed data completed successfully!")
