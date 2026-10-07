"""Consistent, human-readable API error responses.

Every DRF error leaves the API in the same JSON shape:

    {"error": "<human readable message>", "detail": {...field errors...}}

Server-side exceptions are logged and returned as a generic message so a
Django traceback is never exposed to an API client.
"""
import logging

from django.core.exceptions import PermissionDenied, ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import exceptions
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger("marketplace")


def _first_message(detail):
    """Flatten any DRF error structure down to one readable sentence."""
    if isinstance(detail, str):
        return detail
    if isinstance(detail, list):
        for item in detail:
            message = _first_message(item)
            if message:
                return message
        return ""
    if isinstance(detail, dict):
        for key, value in detail.items():
            message = _first_message(value)
            if message:
                return f"{key}: {message}" if key != "detail" else message
        return ""
    return str(detail)


def api_exception_handler(exc, context):
    # Map Django exceptions onto DRF equivalents.
    if isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(
            exc.messages if hasattr(exc, "messages") else str(exc)
        )
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    if isinstance(exc, PermissionDenied):
        exc = exceptions.PermissionDenied()

    response = drf_exception_handler(exc, context)

    view = context.get("view") if context else None
    request = context.get("request") if context else None
    path = getattr(request, "path", "?")
    method = getattr(request, "method", "?")
    user_id = getattr(getattr(request, "user", None), "id", None)

    if response is None:
        # Unhandled exception -> log with traceback, return a safe message.
        logger.exception(
            "Unhandled API error: %s %s (user=%s)", method, path, user_id
        )
        return Response(
            {"error": "Something went wrong on our side. Please try again."},
            status=500,
        )

    detail = response.data
    message = _first_message(detail) or "Request could not be completed."

    if response.status_code >= 500:
        logger.error(
            "API %s %s failed (%s): %s",
            method,
            path,
            response.status_code,
            message,
        )
    elif response.status_code == 401:
        logger.info("Auth failure on %s %s (user=%s)", method, path, user_id)
    elif response.status_code == 403:
        logger.warning(
            "Permission denied: %s %s (user=%s, view=%s)",
            method,
            path,
            user_id,
            view.__class__.__name__ if view else "?",
        )

    payload = {"error": message}
    if isinstance(detail, dict) and "detail" not in detail:
        payload["detail"] = detail
    elif isinstance(detail, dict):
        payload["detail"] = detail.get("detail")

    response.data = payload
    return response
