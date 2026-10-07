"""Shared upload validation (file type, extension and size).

Used by every endpoint that accepts user files: profile photos, service and
portfolio images, KYC documents and completion proof. Executable uploads are
rejected, and the stored extension is derived from an allow-list so a file
cannot be given an arbitrary name.
"""
import os

from django.conf import settings
from django.core.exceptions import ValidationError

IMAGE_EXTENSIONS = getattr(settings, "ALLOWED_IMAGE_EXTENSIONS", None) or [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
]
IMAGE_MIME_TYPES = getattr(settings, "ALLOWED_IMAGE_MIME_TYPES", None) or [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
]

# Documents (KYC) and completion proof may also be PDFs.
DOCUMENT_EXTENSIONS = IMAGE_EXTENSIONS + [".pdf"]
DOCUMENT_MIME_TYPES = IMAGE_MIME_TYPES + ["application/pdf"]


def _max_bytes() -> int:
    return int(getattr(settings, "MAX_UPLOAD_SIZE_MB", 10)) * 1024 * 1024


def validate_upload(
    file,
    *,
    allow_documents: bool = False,
    max_bytes: int | None = None,
):
    """Raise ``ValidationError`` when an uploaded file is not acceptable."""
    if file is None:
        return file

    name = (getattr(file, "name", "") or "").lower()
    extension = os.path.splitext(name)[1]

    allowed_extensions = DOCUMENT_EXTENSIONS if allow_documents else IMAGE_EXTENSIONS
    allowed_types = DOCUMENT_MIME_TYPES if allow_documents else IMAGE_MIME_TYPES

    if extension not in allowed_extensions:
        raise ValidationError(
            "Unsupported file type "
            f"({extension or 'unknown'}). Allowed: "
            + ", ".join(ext.lstrip('.') for ext in allowed_extensions)
        )

    content_type = (getattr(file, "content_type", "") or "").lower()
    # Browsers occasionally send a generic type; only reject a wrong image type.
    if content_type and content_type not in allowed_types and not content_type.startswith(
        "image/"
    ):
        raise ValidationError(
            f"Unsupported content type ({content_type}). Upload an image file."
        )
    if content_type and content_type.startswith("image/") and content_type not in allowed_types:
        raise ValidationError(
            f"Unsupported image format ({content_type})."
        )

    limit = max_bytes if max_bytes is not None else _max_bytes()
    size = getattr(file, "size", None)
    if size is not None and size > limit:
        raise ValidationError(
            f"File is too large ({size // (1024 * 1024)} MB). "
            f"Maximum is {limit // (1024 * 1024)} MB."
        )

    return file


def validate_base64_upload(
    *,
    file_name: str,
    mime_type: str,
    byte_length: int,
    allow_documents: bool = False,
):
    """Validate a base64 upload before it is written to storage."""
    name = (file_name or "upload").lower()
    extension = os.path.splitext(name)[1]

    allowed_extensions = DOCUMENT_EXTENSIONS if allow_documents else IMAGE_EXTENSIONS
    allowed_types = DOCUMENT_MIME_TYPES if allow_documents else IMAGE_MIME_TYPES

    if extension not in allowed_extensions:
        raise ValidationError(
            "Unsupported file type "
            f"({extension or 'unknown'}). Allowed: "
            + ", ".join(ext.lstrip('.') for ext in allowed_extensions)
        )

    normalised_mime = (mime_type or "").lower()
    if normalised_mime and normalised_mime not in allowed_types:
        raise ValidationError(f"Unsupported content type ({normalised_mime}).")

    limit = _max_bytes()
    if byte_length > limit:
        raise ValidationError(
            f"File is too large ({byte_length // (1024 * 1024)} MB). "
            f"Maximum is {limit // (1024 * 1024)} MB."
        )
    if byte_length == 0:
        raise ValidationError("The uploaded file is empty.")
