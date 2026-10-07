import base64
import uuid

from django.core.files.base import ContentFile
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from platformcore.uploads import validate_base64_upload, validate_upload

from .models import MediaFile


def _save_media(request, file_content: bytes, file_name: str, purpose: str):
    safe_name = file_name or f"upload-{uuid.uuid4().hex[:8]}.jpg"
    media = MediaFile.objects.create(
        uploaded_by=request.user,
        purpose=purpose[:50],
    )
    media.file.save(safe_name, ContentFile(file_content), save=True)
    url = request.build_absolute_uri(media.file.url)
    return media, url


class MediaUploadView(APIView):
    """Multipart upload (web / some native clients)."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        upload = request.FILES.get("file")
        if not upload:
            for key in request.FILES:
                upload = request.FILES[key]
                break
        if not upload:
            return Response(
                {"error": "No file uploaded. Send it as multipart field 'file'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_upload(upload)
        except Exception as exc:  # ValidationError
            message = exc.messages[0] if hasattr(exc, "messages") else str(exc)
            return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)

        purpose = (request.data.get("purpose") or "service").strip()
        media = MediaFile.objects.create(
            uploaded_by=request.user,
            file=upload,
            purpose=purpose[:50],
        )
        url = request.build_absolute_uri(media.file.url)
        return Response({"id": media.id, "url": url}, status=status.HTTP_201_CREATED)


class MediaUploadBase64View(APIView):
    """JSON base64 upload — reliable for Expo / React Native image picker."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def post(self, request):
        raw_b64 = request.data.get("image_base64") or request.data.get("image")
        if not raw_b64:
            return Response(
                {"error": "image_base64 is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if isinstance(raw_b64, str) and "," in raw_b64:
            raw_b64 = raw_b64.split(",", 1)[1]

        try:
            file_bytes = base64.b64decode(raw_b64, validate=True)
        except Exception:
            return Response(
                {"error": "Invalid base64 image data."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file_name = (request.data.get("file_name") or "upload.jpg").strip()
        mime_type = (request.data.get("mime_type") or "image/jpeg").strip()
        purpose = (request.data.get("purpose") or "service").strip()

        try:
            validate_base64_upload(
                file_name=file_name,
                mime_type=mime_type,
                byte_length=len(file_bytes),
            )
        except Exception as exc:
            message = exc.messages[0] if hasattr(exc, "messages") else str(exc)
            return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)

        media, url = _save_media(request, file_bytes, file_name, purpose)
        return Response(
            {"id": media.id, "url": url},
            status=status.HTTP_201_CREATED,
        )
