from django.contrib import admin
from .models import Availability, Category, PortfolioItem, Service, ServiceArea, ServiceImage, Skill, SubCategory
admin.site.register(Category)
admin.site.register(SubCategory)
admin.site.register(Skill)
admin.site.register(Service)
admin.site.register(ServiceImage)
admin.site.register(PortfolioItem)
admin.site.register(Availability)
admin.site.register(ServiceArea)