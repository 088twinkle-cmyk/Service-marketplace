from pathlib import Path
import os
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-insecure-change-me")

DEBUG = os.getenv("DJANGO_DEBUG", "true").lower() == "true"

ALLOWED_HOSTS = [
    h.strip()
    for h in os.getenv(
        "DJANGO_ALLOWED_HOSTS",
        "localhost,127.0.0.1,testserver"
    ).split(",")
    if h.strip()
]

if DEBUG:
    # The sandboxed preview proxies requests through a *.e2b.app host. Only
    # development builds accept these; production must list real hosts via
    # DJANGO_ALLOWED_HOSTS.
    ALLOWED_HOSTS += [".e2b.app", ".arena.dev", ".localhost"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",

    "accounts.apps.AccountsConfig",
    "catalog",
    "bookings",
    "chats",
    "payments",
    "reviews",
    "notifications.apps.NotificationsConfig",
    "media_app.apps.MediaAppConfig",
    "platformcore",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",

    "corsheaders.middleware.CorsMiddleware",

    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",

    "platformcore.middleware.AuditMiddleware",
]

ROOT_URLCONF = "config.urls"

WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {
            "min_length": 8
        },
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"
    },
]

LANGUAGE_CODE = "en-us"

TIME_ZONE = "Asia/Kathmandu"

USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# ============================================================
# CORS
# ============================================================

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        ",".join(
            [
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:8081",
                "http://127.0.0.1:8081",
                "http://localhost:8082",
                "http://127.0.0.1:8082",
            ]
        ),
    ).split(",")
    if origin.strip()
]

CORS_ALLOW_CREDENTIALS = True

# In development the frontend is often opened from a phone (or a proxied
# preview URL), so any private-network origin is accepted. Production must
# list its origins explicitly in CORS_ALLOWED_ORIGINS.
CORS_ALLOWED_ORIGIN_REGEXES = [] if not DEBUG else [
    r"^http://localhost:\d+$",
    r"^http://127\.0\.0\.1:\d+$",
    r"^http://10\.\d+\.\d+\.\d+:\d+$",
    r"^http://192\.168\.\d+\.\d+:\d+$",
    r"^http://172\.(1[6-9]|2\d|3[01])\.\d+\.\d+:\d+$",
    r"^https://[a-z0-9-]+\.(e2b\.app|arena\.dev)$",
]
CORS_URLS_REGEX = r"^/(api|media)/.*$"


# ============================================================
# Throttling (brute-force protection)
# ============================================================

THROTTLE_ANON = os.getenv("THROTTLE_ANON", "60/min")
THROTTLE_USER = os.getenv("THROTTLE_USER", "1000/day")
THROTTLE_LOGIN = os.getenv("THROTTLE_LOGIN", "10/min")
THROTTLE_OTP = os.getenv("THROTTLE_OTP", "5/min")


# ============================================================
# Django REST Framework
# ============================================================

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),

    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),

    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),

    "DEFAULT_PAGINATION_CLASS": (
        "rest_framework.pagination.PageNumberPagination"
    ),

    "PAGE_SIZE": 20,

    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ),

    "DEFAULT_THROTTLE_RATES": {
        "anon": THROTTLE_ANON,
        "user": THROTTLE_USER,
        "login": THROTTLE_LOGIN,
        "otp": THROTTLE_OTP,
    },

    # Never leak a Django traceback to an API client.
    "EXCEPTION_HANDLER": "platformcore.exceptions.api_exception_handler",
}


# ============================================================
# JWT
# ============================================================

from datetime import timedelta

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=int(
            os.getenv(
                "JWT_ACCESS_MINUTES",
                "60"
            )
        )
    ),

    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=int(
            os.getenv(
                "JWT_REFRESH_DAYS",
                "7"
            )
        )
    ),

    "ROTATE_REFRESH_TOKENS": True,

    "BLACKLIST_AFTER_ROTATION": True,

    "AUTH_HEADER_TYPES": (
        "Bearer",
    ),
}


# ============================================================
# EMAIL / OTP
# ============================================================

EMAIL_BACKEND = os.getenv(
    "EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend"
)

DEFAULT_FROM_EMAIL = os.getenv(
    "DEFAULT_FROM_EMAIL",
    "noreply@marketplace.local"
)

OTP_EXPIRY_MINUTES = int(
    os.getenv(
        "OTP_EXPIRY_MINUTES",
        "10"
    )
)

OTP_DEBUG_RETURN = DEBUG


# ============================================================
# ESEWA
# ============================================================

ESEWA_MERCHANT_CODE = os.getenv(
    "ESEWA_MERCHANT_CODE",
    "EPAYTEST"
)

ESEWA_SECRET_KEY = os.getenv(
    "ESEWA_SECRET_KEY",
    "8gBm/:&EnhH.1/q"
)

ESEWA_SUCCESS_URL = os.getenv(
    "ESEWA_SUCCESS_URL",
    "http://localhost:5173/payments/esewa/success"
)

ESEWA_FAILURE_URL = os.getenv(
    "ESEWA_FAILURE_URL",
    "http://localhost:5173/payments/esewa/failure"
)

ESEWA_FORM_URL = os.getenv(
    "ESEWA_FORM_URL",
    "https://rc-epay.esewa.com.np/api/epay/main/v2/form"
)

ESEWA_STATUS_URL = os.getenv(
    "ESEWA_STATUS_URL",
    "https://rc.esewa.com.np/api/epay/transaction/status/"
)

ESEWA_TRUST_SANDBOX_SUCCESS = os.getenv(
    "ESEWA_TRUST_SANDBOX_SUCCESS",
    "true"
).lower() == "true"


# ============================================================
# LOGGING
# ============================================================

LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[{asctime}] {levelname} {name} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
        "file": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": str(LOG_DIR / "marketplace.log"),
            "maxBytes": 5 * 1024 * 1024,
            "backupCount": 3,
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console", "file"],
        "level": os.getenv("DJANGO_LOG_LEVEL", "INFO"),
    },
    "loggers": {
        # Log important business events under the "marketplace" namespace.
        "marketplace": {
            "handlers": ["console", "file"],
            "level": "INFO",
            "propagate": False,
        },
        "django.request": {
            "handlers": ["console", "file"],
            "level": "WARNING",
            "propagate": False,
        },
    },
}


# ============================================================
# UPLOADS
# ============================================================

MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "10"))
ALLOWED_IMAGE_EXTENSIONS = [
    ".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif",
]
ALLOWED_IMAGE_MIME_TYPES = [
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif",
]

# Upload requests larger than this are rejected by Django before hitting a view.
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_SIZE_MB * 1024 * 1024 * 2
FILE_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_SIZE_MB * 1024 * 1024

# Booking rules
BOOKING_CANCEL_CUTOFF_HOURS = int(os.getenv("BOOKING_CANCEL_CUTOFF_HOURS", "24"))
DEFAULT_SERVICE_RADIUS_KM = int(os.getenv("DEFAULT_SERVICE_RADIUS_KM", "25"))
