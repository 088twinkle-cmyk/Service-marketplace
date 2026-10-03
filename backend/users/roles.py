CLIENT_ROLES = {"customer", "client"}
FREELANCER_ROLES = {"provider", "freelancer"}
ADMIN_ROLES = {"admin"}

STORED_CLIENT = "customer"
STORED_FREELANCER = "provider"
STORED_ADMIN = "admin"


def normalize_role(role) -> str:
    value = (role or STORED_CLIENT).strip().lower()
    if value in CLIENT_ROLES:
        return STORED_CLIENT
    if value in FREELANCER_ROLES:
        return STORED_FREELANCER
    if value in ADMIN_ROLES:
        return STORED_ADMIN
    return STORED_CLIENT


def account_type(role: str) -> str:
    stored = normalize_role(role)
    if stored == STORED_FREELANCER:
        return "FREELANCER"
    if stored == STORED_ADMIN:
        return "ADMIN"
    return "CLIENT"


def is_client(user) -> bool:
    return getattr(user, "role", "") in CLIENT_ROLES


def is_freelancer(user) -> bool:
    return getattr(user, "role", "") in FREELANCER_ROLES


def is_admin(user) -> bool:
    return (
        getattr(user, "role", "") in ADMIN_ROLES
        or getattr(user, "is_staff", False)
        or getattr(user, "is_superuser", False)
    )
