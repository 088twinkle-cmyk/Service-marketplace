from django.core.management.base import BaseCommand
from django.utils.text import slugify
from catalog.models import Category, Skill, SubCategory
CATEGORIES = [
    ("Graphic Design & Creative", "REMOTE", ["Logo Design", "Branding", "Posters", "Social Media Design", "Illustration"]),
    ("Web Development", "REMOTE", ["Frontend", "Backend", "Full-stack", "WordPress", "Shopify", "APIs"]),
    ("Mobile Development", "REMOTE", ["Android", "iOS", "Flutter", "React Native", "App Maintenance"]),
    ("Software & IT", "REMOTE", ["Python", "Django", "JavaScript", "DevOps", "Cybersecurity", "Technical Support"]),
    ("Writing & Translation", "REMOTE", ["Content Writing", "Copywriting", "Proofreading", "Translation", "Transcription"]),
    ("Digital Marketing", "REMOTE", ["SEO", "Social Media Management", "Advertising", "Email Marketing"]),
    ("Video, Animation & Audio", "REMOTE", ["Video Editing", "Motion Graphics", "Voice-over", "Podcast Production"]),
    ("Photography", "BOTH", ["Event Photography", "Product Photography", "Retouching"]),
    ("Business & Consulting", "REMOTE", ["Business Plans", "Market Research", "Virtual Assistance", "Project Management"]),
    ("Data & AI", "REMOTE", ["Data Entry", "Data Analysis", "Dashboards", "Machine Learning", "Automation"]),
    ("Education & Tutoring", "BOTH", ["Academic Tutoring", "Language Lessons", "Computer Training"]),
    ("Beauty & Personal Care", "LOCAL", ["Hair", "Makeup", "Nails", "Mehndi", "Massage"]),
    ("Home & Local Services", "LOCAL", ["Cleaning", "Repair", "Plumbing", "Electrical", "Moving"]),
    ("Events & Lifestyle", "LOCAL", ["Event Planning", "Decoration", "DJ/MC", "Catering Coordination"]),
    ("Handmade & Craft", "BOTH", ["Tailoring", "Custom Products", "Art", "Personalized Products"]),
    ("Other Services", "BOTH", ["Custom Request"]),
]
SKILLS = [
    "Logo Design", "Branding", "React", "Django", "Python", "JavaScript", "Flutter", "SEO",
    "Copywriting", "Video Editing", "Photography", "Data Analysis", "Machine Learning",
    "Tutoring", "Plumbing", "Electrical", "Cleaning", "Makeup", "Event Planning",
]
class Command(BaseCommand):
    help = "Seed marketplace categories, subcategories and skills"
    def handle(self, *args, **options):
        for index, (name, mode, subs) in enumerate(CATEGORIES, start=1):
            cat, _ = Category.objects.get_or_create(
                slug=slugify(name),
                defaults={
                    "name": name,
                    "default_service_mode": mode,
                    "sort_order": index,
                    "description": name,
                },
            )
            for sub in subs:
                SubCategory.objects.get_or_create(
                    category=cat,
                    slug=slugify(sub),
                    defaults={"name": sub},
                )
        for skill in SKILLS:
            Skill.objects.get_or_create(slug=slugify(skill), defaults={"name": skill})
        self.stdout.write(self.style.SUCCESS("Catalog seeded."))