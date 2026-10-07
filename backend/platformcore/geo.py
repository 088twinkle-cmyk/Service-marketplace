"""Location helpers.

Coordinates are stored explicitly on every locatable record (service,
service area) so a real map provider can be plugged in later without a schema
change. Until a geocoding API key is configured, a small built-in gazetteer
resolves well-known marketplace cities to coordinates.
"""
import math

from django.conf import settings

# Fallback gazetteer: matches the cities the UI offers out of the box.
CITY_COORDS = {
    "kathmandu": (27.7172, 85.3240),
    "lalitpur": (27.6588, 85.3247),
    "patan": (27.6588, 85.3247),
    "bhaktapur": (27.6710, 85.4298),
    "pokhara": (28.2096, 83.9856),
    "bharatpur": (27.6833, 84.4333),
    "biratnagar": (26.4525, 87.2718),
    "birgunj": (27.0104, 84.8770),
    "butwal": (27.7000, 83.4500),
    "dharan": (26.8123, 87.2839),
    "hetauda": (27.4287, 85.0322),
    "itahari": (26.6643, 87.2768),
    "janakpur": (26.7288, 85.9250),
    "nepalgunj": (28.0500, 81.6167),
}

EARTH_RADIUS_KM = 6371.0


def coords_for_location(location: str):
    """Return ``(lat, lng)`` for a free-text location, or ``(None, None)``."""
    if not location:
        return None, None
    haystack = location.strip().lower()
    for city, coords in CITY_COORDS.items():
        if city in haystack:
            return coords
    return None, None


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    if None in (lat1, lon1, lat2, lon2):
        return 0.0
    lat1, lon1, lat2, lon2 = map(float, (lat1, lon1, lat2, lon2))
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    )
    return EARTH_RADIUS_KM * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def bounding_box(lat: float, lng: float, radius_km: float):
    """A cheap SQL-friendly (min_lat, max_lat, min_lng, max_lng) box."""
    lat_delta = radius_km / 111.0
    cos_lat = max(math.cos(math.radians(lat)), 0.01)
    lng_delta = radius_km / (111.0 * cos_lat)
    return (
        lat - lat_delta,
        lat + lat_delta,
        lng - lng_delta,
        lng + lng_delta,
    )


def default_radius_km() -> int:
    return int(getattr(settings, "DEFAULT_SERVICE_RADIUS_KM", 25))
