from django.db.models.signals import post_save
from django.dispatch import receiver

from .roles import is_freelancer


@receiver(post_save, sender="users.User")
def create_role_profiles(sender, instance, created, **kwargs):
    if not created:
        return
    from kyc.models import ProviderProfile
    from .models import ClientProfile, FreelancerProfile

    if is_freelancer(instance):
        FreelancerProfile.objects.get_or_create(user=instance)
        ProviderProfile.objects.get_or_create(user=instance)
    else:
        ClientProfile.objects.get_or_create(user=instance)
