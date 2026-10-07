from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),

    # Authentication, current user, profiles
    path("api/auth/", include("accounts.urls")),

    # Provider onboarding, KYC, public provider directory
    path("api/providers/", include("accounts.provider_urls")),

    # Categories, services, portfolio, availability rules
    path("api/catalog/", include("catalog.urls")),

    # Service requests, offers, bookings, availability slots
    path("api/bookings/", include("bookings.urls")),

    # Customer <-> provider chat
    path("api/chat/", include("chats.urls")),

    # eSewa payments and ledger
    path("api/payments/", include("payments.urls")),

    # Reviews, disputes, reports
    path("api/reviews/", include("reviews.urls")),

    # In-app notifications
    path("api/notifications/", include("notifications.urls")),

    # File uploads (base64 + multipart)
    path("api/media/", include("media_app.urls")),

    # Admin monitoring endpoints
    path("api/admin/", include("platformcore.urls")),
    # Backwards compatible alias for the original mount point
    path("api/platform/", include("platformcore.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
