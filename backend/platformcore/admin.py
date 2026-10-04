from django.contrib import admin
from .models import AuditLog, PlatformSetting
admin.site.register(AuditLog)
admin.site.register(PlatformSetting)