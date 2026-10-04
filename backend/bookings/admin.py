from django.contrib import admin
from .models import BookingAttachment, CounterOffer, Deliverable, Milestone, ProjectBooking
admin.site.register(ProjectBooking)
admin.site.register(BookingAttachment)
admin.site.register(CounterOffer)
admin.site.register(Milestone)
admin.site.register(Deliverable)