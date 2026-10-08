"""Phone number helpers.

The marketplace is Nepal-first, so phone numbers are normalised to E.164
(``+977XXXXXXXXXX``) before they reach any provider.  The default country
code is configurable through ``PHONE_DEFAULT_COUNTRY_CODE`` so the same code
works for other markets without touching business logic.
"""
import re

from django.conf import settings

# Spaces, dashes, dots and parentheses are tolerated in input; only the
# digits are kept (the leading "+" is tracked separately).
_ALLOWED_CHARS = re.compile(r"\D")

# Nepal mobile numbers are 10 digits starting with 9 (98XXXXXXXX / 97XXXXXXXX).
NEPAL_LOCAL_PATTERN = re.compile(r"^9\d{9}$")

E164_PATTERN = re.compile(r"^\+\d{8,15}$")


class InvalidPhoneNumberError(ValueError):
    """Raised when a phone number cannot be normalised safely."""


def _default_country_code() -> str:
    code = str(getattr(settings, "PHONE_DEFAULT_COUNTRY_CODE", "+977") or "+977").strip()
    if not code.startswith("+"):
        code = f"+{code}"
    return code


def normalize_phone_number(raw: str, *, default_country_code: str | None = None) -> str:
    """Normalise ``raw`` to E.164 (``+<countrycode><number>``).

    Accepted inputs (default country code ``+977``):

    * ``"+977 9843677123"``  → ``"+9779843677123"``
    * ``"98-4367-7123"``     → ``"+9779843677123"``   (local 10-digit number)
    * ``"009779843677123"``  → ``"+9779843677123"``   (international prefix)
    * ``"9779843677123"``    → ``"+9779843677123"``   (country code, no ``+``)

    Raises :class:`InvalidPhoneNumberError` for anything that cannot be
    interpreted unambiguously.
    """
    if raw is None:
        raise InvalidPhoneNumberError("Phone number is required.")

    value = str(raw).strip()
    if not value:
        raise InvalidPhoneNumberError("Phone number is required.")

    has_plus = value.startswith("+")
    digits = _ALLOWED_CHARS.sub("", value)

    # "00…" is the international dialling prefix (e.g. from a phone contact).
    if not has_plus and digits.startswith("00"):
        digits = digits[2:]
        has_plus = True

    if has_plus:
        candidate = f"+{digits}"
    else:
        country_code = (default_country_code or _default_country_code()).replace("+", "")
        local_length_without_cc = len(digits) - len(country_code)
        if digits.startswith(country_code) and local_length_without_cc >= 8:
            # Typed with the country code but no "+".
            candidate = f"+{digits}"
        elif NEPAL_LOCAL_PATTERN.match(digits):
            # Bare local mobile number (10 digits starting with 9).
            candidate = f"+{country_code}{digits}"
        else:
            raise InvalidPhoneNumberError(
                "Enter the phone number in international format, e.g. +9779843677123."
            )

    if not E164_PATTERN.match(candidate):
        raise InvalidPhoneNumberError(
            "Enter a valid phone number in international format, e.g. +9779843677123."
        )

    return candidate


def phone_e164(raw: str) -> str | None:
    """Like :func:`normalize_phone_number` but returns ``None`` when invalid."""
    try:
        return normalize_phone_number(raw)
    except InvalidPhoneNumberError:
        return None


def mask_phone_number(phone_number: str) -> str:
    """``"+9779843677123"`` → ``"+977 •••••123"`` (safe for logs/UI)."""
    value = str(phone_number or "")
    if len(value) < 5:
        return "•"
    head = value[:-3] if value.startswith("+") else value[:3]
    tail = value[-3:]
    return f"{head[:4]} •••••{tail}"
