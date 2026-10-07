"""Role helpers for the accounts app.

The stored role values are the enum in ``accounts.models.User.Role``
(CLIENT / FREELANCER / ADMIN). The marketplace UI talks about
*customer* / *provider* / *admin*, and older clients may post the lowercase
or legacy spellings. Everything funnels through this module so the mapping
lives in one place.
"""
from .models import User

# Input aliases -> stored enum value
ROLE_ALIASES = {
    "client": User.Role.CLIENT,
    "customer": User.Role.CLIENT,
    "buyer": User.Role.CLIENT,
    "freelancer": User.Role.FREELANCER,
    "provider": User.Role.FREELANCER,
    "seller": User.Role.FREELANCER,
    "serviceprovider": User.Role.FREELANCER,
    "admin": User.Role.ADMIN,
    "staff": User.Role.ADMIN,
    "superuser": User.Role.ADMIN,
}

# Stored enum value -> UI role key
ROLE_KEYS = {
    User.Role.CLIENT: "customer",
    User.Role.FREELANCER: "provider",
    User.Role.ADMIN: "admin",
}


def normalize_role(role, default=User.Role.CLIENT) -> str:
    """Return a stored role value for any accepted spelling."""
    if not role:
        return default
    key = str(role).strip().lower().replace("_", "").replace("-", "").replace(" ", "")
    return ROLE_ALIASES.get(key, default)


def account_type(role) -> str:
    """The uppercase account type used by API clients."""
    stored = normalize_role(role)
    if stored == User.Role.FREELANCER:
        return "FREELANCER"
    if stored == User.Role.ADMIN:
        return "ADMIN"
    return "CLIENT"


def role_key(role) -> str:
    """The lowercase UI role key: customer | provider | admin."""
    return ROLE_KEYS.get(normalize_role(role), "customer")


def is_client(user) -> bool:
    return bool(user and getattr(user, "is_authenticated", False) and user.role == User.Role.CLIENT)


def is_provider(user) -> bool:
    return bool(
        user and getattr(user, "is_authenticated", False) and user.role == User.Role.FREELANCER
    )


def is_admin(user) -> bool:
    return bool(
        user
        and getattr(user, "is_authenticated", False)
        and (user.role == User.Role.ADMIN or user.is_staff)
    )
