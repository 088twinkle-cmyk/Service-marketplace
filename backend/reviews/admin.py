from django.contrib import admin
from .models import Dispute, Report, Review
admin.site.register(Review)
admin.site.register(Dispute)
admin.site.register(Report)