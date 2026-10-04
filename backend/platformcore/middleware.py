from .models import AuditLog
class AuditMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
    def __call__(self, request):
        response = self.get_response(request)
        path = request.path
        if path.startswith("/api/") and request.method in ("POST", "PUT", "PATCH", "DELETE"):
            ip = request.META.get("REMOTE_ADDR")
            user = request.user if getattr(request, "user", None) and request.user.is_authenticated else None
            try:
                AuditLog.objects.create(
                    actor=user,
                    method=request.method,
                    path=path[:255],
                    status_code=response.status_code,
                    ip_address=ip,
                    action=f"{request.method} {path}",
                )
            except Exception:
                pass
        return response