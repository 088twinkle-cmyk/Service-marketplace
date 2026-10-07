"""Catalog serializers.

The API exposes two layers of fields on purpose:

* the **native** model fields (`freelancer`, `starting_price`, `image`, ...)
  which the Django admin and any first-party client can rely on, and
* **contract** aliases (`provider`, `provider_name`, `price`, `image_url`,
  `avg_rating`, `distance_km`, ...) that the marketplace UI consumes.

Keeping both in one serializer means no screen has to reshape data and no
field has to be duplicated in the database.
"""
from django.db.models import Avg, Count, Q
from rest_framework import serializers

from accounts.serializers import FreelancerProfileSerializer

from .models import (
    Availability,
    Category,
    PortfolioItem,
    Service,
    ServiceArea,
    ServiceImage,
    Skill,
    SubCategory,
)


class SubCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = SubCategory
        fields = "__all__"


class CategorySerializer(serializers.ModelSerializer):
    subcategories = SubCategorySerializer(many=True, read_only=True)
    service_count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = "__all__"

    def get_service_count(self, obj):
        annotated = getattr(obj, "service_count", None)
        if annotated is not None:
            return annotated
        return obj.services.filter(is_active=True).count()


class SkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = Skill
        fields = "__all__"


class ServiceImageSerializer(serializers.ModelSerializer):
    """`image` is the stored file; `image_url` is the absolute URL for the UI."""

    image_url = serializers.SerializerMethodField()

    class Meta:
        model = ServiceImage
        fields = "__all__"
        read_only_fields = ("service",)

    def get_image_url(self, obj):
        if not obj.image:
            return ""
        request = self.context.get("request")
        try:
            return request.build_absolute_uri(obj.image.url) if request else obj.image.url
        except ValueError:
            return ""


class ProviderBriefSerializer(serializers.Serializer):
    """Read-only provider summary embedded in a service payload."""

    id = serializers.IntegerField()
    username = serializers.CharField()
    display_name = serializers.CharField()
    is_verified = serializers.BooleanField()
    rating_average = serializers.FloatField()
    review_count = serializers.IntegerField()
    completed_jobs = serializers.IntegerField()
    location = serializers.CharField(allow_blank=True)


def provider_display_name(profile):
    if not profile:
        return ""
    return (
        profile.user.get_full_name()
        or profile.professional_title
        or profile.user.username
    )


def provider_is_verified(profile):
    if not profile:
        return False
    kyc = getattr(profile, "kyc", None)
    return bool(kyc and kyc.status == "APPROVED")


class ServiceSerializer(serializers.ModelSerializer):
    images = ServiceImageSerializer(many=True, read_only=True)
    freelancer_detail = FreelancerProfileSerializer(source="freelancer", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    category_slug = serializers.CharField(source="category.slug", read_only=True)

    # ---- contract aliases used by the marketplace UI ----
    provider = serializers.IntegerField(source="freelancer_id", read_only=True)
    provider_name = serializers.SerializerMethodField()
    provider_verified = serializers.SerializerMethodField()
    provider_avatar = serializers.SerializerMethodField()
    provider_rating = serializers.SerializerMethodField()
    provider_reviews = serializers.SerializerMethodField()
    price = serializers.DecimalField(
        source="starting_price", max_digits=12, decimal_places=2, read_only=True
    )
    avg_rating = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()
    distance_km = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()

    # ---- write-only helpers ----
    image_urls = serializers.ListField(
        child=serializers.CharField(), write_only=True, required=False
    )
    category_slug_input = serializers.SlugField(write_only=True, required=False)

    class Meta:
        model = Service
        fields = "__all__"
        read_only_fields = ("freelancer", "created_at", "updated_at")

    # -- helpers ---------------------------------------------------------
    def _request(self):
        return self.context.get("request")

    def _absolute(self, file_field):
        if not file_field:
            return ""
        request = self._request()
        try:
            return request.build_absolute_uri(file_field.url) if request else file_field.url
        except ValueError:
            return ""

    def get_provider_name(self, obj):
        return provider_display_name(obj.freelancer) or ""

    def get_provider_verified(self, obj):
        return provider_is_verified(obj.freelancer)

    def get_provider_avatar(self, obj):
        return self._absolute(getattr(obj.freelancer, "avatar", None))

    def get_provider_rating(self, obj):
        return float(getattr(obj.freelancer, "rating_average", 0) or 0)

    def get_provider_reviews(self, obj):
        return getattr(obj.freelancer, "rating_count", 0) or 0

    def get_avg_rating(self, obj):
        annotated = getattr(obj, "avg_rating", None)
        if annotated is not None:
            return round(float(annotated), 2)
        return float(getattr(obj.freelancer, "rating_average", 0) or 0)

    def get_review_count(self, obj):
        annotated = getattr(obj, "review_count", None)
        if annotated is not None:
            return annotated
        return getattr(obj.freelancer, "rating_count", 0) or 0

    def get_distance_km(self, obj):
        distance = getattr(obj, "distance_km", None)
        return round(float(distance), 2) if distance is not None else None

    def get_is_mine(self, obj):
        user = getattr(self._request(), "user", None)
        return bool(
            user
            and user.is_authenticated
            and obj.freelancer
            and obj.freelancer.user_id == user.id
        )

    # -- validation ------------------------------------------------------
    def validate_starting_price(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Price cannot be negative.")
        return value

    def validate(self, attrs):
        # `price` may be posted instead of `starting_price`.
        if "starting_price" not in attrs and "price" in self.initial_data:
            raw = self.initial_data.get("price")
            if raw not in (None, ""):
                try:
                    attrs["starting_price"] = serializers.DecimalField(
                        max_digits=12, decimal_places=2
                    ).to_internal_value(raw)
                except Exception:
                    raise serializers.ValidationError(
                        {"price": "Enter a valid price, for example 1500."}
                    )

        # A category is required by the model; fall back to a sensible default so
        # a provider can publish quickly, and let `category_slug` pick one too.
        if not attrs.get("category") and not (self.instance and self.instance.category):
            slug = self.initial_data.get("category_slug_input") or self.initial_data.get(
                "category_slug"
            )
            category = None
            if slug:
                category = Category.objects.filter(slug=slug).first()
            if category is None:
                category = (
                    Category.objects.filter(slug="other-services").first()
                    or Category.objects.filter(name__iexact="Other Services").first()
                    or Category.objects.filter(is_active=True).order_by("sort_order").first()
                )
            if category is None:
                raise serializers.ValidationError(
                    {"category": "Select a category (no categories exist yet)."}
                )
            attrs["category"] = category

        price_max = attrs.get("price_max", getattr(self.instance, "price_max", None))
        price_min = attrs.get("starting_price", getattr(self.instance, "starting_price", None))
        if price_max is not None and price_min is not None and price_max < price_min:
            raise serializers.ValidationError(
                {"price_max": "Maximum price must be greater than the starting price."}
            )
        return attrs

    def _attach_images(self, service):
        urls = self.initial_data.get("image_urls") or []
        if not isinstance(urls, (list, tuple)):
            return
        for index, url in enumerate(urls):
            if not isinstance(url, str) or not url.strip():
                continue
            path = url.split("?", 1)[0]
            marker = "/media/"
            if marker in path:
                path = path.split(marker, 1)[1]
            elif path.startswith("http"):
                # Remote URL we cannot map to local storage; skip it.
                continue
            if ServiceImage.objects.filter(service=service, image=path).exists():
                continue
            ServiceImage.objects.create(
                service=service, image=path, sort_order=index
            )

    def create(self, validated_data):
        validated_data.pop("image_urls", None)
        validated_data.pop("category_slug_input", None)
        service = super().create(validated_data)
        self._attach_images(service)
        return service

    def update(self, instance, validated_data):
        validated_data.pop("image_urls", None)
        validated_data.pop("category_slug_input", None)
        service = super().update(instance, validated_data)
        self._attach_images(service)
        return service


class PortfolioItemSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = PortfolioItem
        fields = "__all__"
        read_only_fields = ("freelancer", "created_at")

    def _absolute(self, file_field):
        if not file_field:
            return ""
        request = self.context.get("request")
        try:
            return request.build_absolute_uri(file_field.url) if request else file_field.url
        except ValueError:
            return ""

    def get_image_url(self, obj):
        return self._absolute(obj.image)

    def get_file_url(self, obj):
        return self._absolute(obj.file)

    def validate_image(self, value):
        from platformcore.uploads import validate_upload

        validate_upload(value)
        return value


class AvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Availability
        fields = "__all__"
        read_only_fields = ("freelancer",)

    def validate(self, attrs):
        start = attrs.get("start_time") or getattr(self.instance, "start_time", None)
        end = attrs.get("end_time") or getattr(self.instance, "end_time", None)
        if start and end and start >= end:
            raise serializers.ValidationError(
                {"end_time": "End time must be after the start time."}
            )
        weekday = attrs.get("weekday", getattr(self.instance, "weekday", None))
        specific_date = attrs.get(
            "specific_date", getattr(self.instance, "specific_date", None)
        )
        if weekday is None and specific_date is None:
            raise serializers.ValidationError(
                {"weekday": "Set either a weekday (0=Monday) or a specific date."}
            )
        return attrs


class ServiceAreaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceArea
        fields = "__all__"
        read_only_fields = ("freelancer",)
