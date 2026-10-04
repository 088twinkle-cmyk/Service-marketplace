from django.contrib import admin
from .models import LedgerTransaction, Payment
admin.site.register(Payment)
admin.site.register(LedgerTransaction)