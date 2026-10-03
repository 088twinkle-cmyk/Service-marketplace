from django.db import models
from django.conf import settings

User = settings.AUTH_USER_MODEL


class Category(models.Model):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name


class SubCategory(models.Model):
    category = models.ForeignKey(
        Category, on_delete=models.CASCADE, related_name="subcategories"
    )
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        unique_together = [["category", "slug"]]

    def __str__(self):
        return f"{self.category.name} / {self.name}"


class Skill(models.Model):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True)
    category = models.ForeignKey(
        Category, on_delete=models.SET_NULL, null=True, blank=True, related_name="skills"
    )

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Service(models.Model):
    MODE_REMOTE = "REMOTE"
    MODE_LOCAL = "LOCAL"
    MODE_BOTH = "BOTH"
    MODE_CHOICES = [
        (MODE_REMOTE, "Remote / digital"),
        (MODE_LOCAL, "Local / on-demand"),
        (MODE_BOTH, "Remote and local"),
    ]

    provider = models.ForeignKey(User, on_delete=models.CASCADE, related_name="services")
    category = models.ForeignKey(
        Category, on_delete=models.SET_NULL, null=True, blank=True, related_name="services"
    )
    subcategory = models.ForeignKey(
        SubCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="services",
    )
    title = models.CharField(max_length=255)
    description = models.TextField()
    service_mode = models.CharField(
        max_length=12, choices=MODE_CHOICES, default=MODE_LOCAL
    )
    price = models.DecimalField(max_digits=10, decimal_places=2)
    price_max = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    delivery_time = models.CharField(max_length=120, blank=True)
    client_requirements = models.TextField(blank=True)
    location = models.CharField(max_length=255, blank=True)
    travel_radius_km = models.PositiveIntegerField(null=True, blank=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    skills = models.ManyToManyField(Skill, blank=True, related_name="services")
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if self.location and (self.latitude is None or self.longitude is None):
            from .geo import coords_for_location

            self.latitude, self.longitude = coords_for_location(self.location)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title


class ServiceImage(models.Model):
    service = models.ForeignKey(
        Service, on_delete=models.CASCADE, related_name="images"
    )
    image_url = models.URLField(max_length=500)
    caption = models.CharField(max_length=200, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]


class ServiceArea(models.Model):
    freelancer = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="service_areas"
    )
    service = models.ForeignKey(
        Service, on_delete=models.CASCADE, null=True, blank=True, related_name="areas"
    )
    city = models.CharField(max_length=120)
    radius_km = models.PositiveIntegerField(default=10)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
