from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import ClientProfile, FreelancerProfile, User
@receiver(post_save, sender=User)
def create_role_profile(sender, instance, created, **kwargs):
    if not created:
        return
    if instance.role == User.Role.CLIENT:
        ClientProfile.objects.get_or_create(user=instance, defaults={"full_name": instance.username})
    if instance.role == User.Role.FREELANCER:
        FreelancerProfile.objects.get_or_create(user=instance)