import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { servicesApi, type ServiceItem } from "../services/api/servicesApi";

/**
 * Keyword categories kept from the original implementation: the catalog
 * endpoint exposes real categories, but the marketplace navigation (home +
 * search chips) has always been keyword based, so filtering stays consistent.
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  All: [],
  "Home Repairs": ["plumb", "pipe", "leak", "repair", "electric", "wiring", "fan"],
  Automobile: ["car", "bike", "vehicle", "auto"],
  "Tech & Digital": ["laptop", "computer", "pc", "virus", "tech", "digital"],
  "Personal Service": ["maid", "clean", "laundry", "hair"],
  "Pet Care": ["pet", "dog", "cat"],
  Professional: ["professional", "consult"],
  "Home Improvement": ["bathroom", "kitchen", "renovation", "install"],
  "Health & Wellness": ["health", "wellness", "spa"],
  Trainings: ["train", "course", "class"],
};

export const BROWSE_CATEGORIES = Object.keys(CATEGORY_KEYWORDS);

/** Sort options — every value maps to a real `ordering` the API accepts. */
export const SORT_OPTIONS = [
  { key: "default", label: "Best match", ordering: undefined as string | undefined },
  { key: "price-asc", label: "Price: low to high", ordering: "starting_price" },
  { key: "price-desc", label: "Price: high to low", ordering: "-starting_price" },
  { key: "newest", label: "Newest first", ordering: "-created_at" },
  { key: "distance", label: "Nearest first", ordering: "distance" },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]["key"];

type Params = {
  lat: number;
  lng: number;
  city: string;
  search: string;
  category: string;
  locationReady?: boolean;
  /* Optional catalog filters — all backed by the Django catalog endpoint. */
  minPrice?: number | null;
  maxPrice?: number | null;
  minRating?: number | null;
  verifiedOnly?: boolean;
  availableOnly?: boolean;
  sort?: SortKey;
  /** Radius in km; the API only applies it together with lat/lng. */
  maxKm?: number | null;
};

export function useServiceCatalog({
  lat,
  lng,
  city,
  search,
  category,
  locationReady = true,
  minPrice = null,
  maxPrice = null,
  minRating = null,
  verifiedOnly = false,
  availableOnly = false,
  sort = "default",
  maxKm = null,
}: Params) {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hadData = useRef(false);

  const ordering = useMemo(
    () => SORT_OPTIONS.find((option) => option.key === sort)?.ordering,
    [sort]
  );

  const load = useCallback(
    async (isRefresh = false) => {
      if (!locationReady) return;
      try {
        if (isRefresh) setRefreshing(true);
        else if (!hadData.current) setLoading(true);
        setError(null);

        const data = await servicesApi.list({
          lat,
          lng,
          city: city.toLowerCase(),
          search: search.trim() || undefined,
          min_price: minPrice ?? undefined,
          max_price: maxPrice ?? undefined,
          min_rating: minRating ?? undefined,
          verified: verifiedOnly || undefined,
          available: availableOnly || undefined,
          max_km: maxKm ?? undefined,
          // "distance" is only meaningful with coordinates; the API ignores it
          // otherwise, so fall back to the default ordering in that case.
          ordering:
            ordering === "distance" && !Number.isFinite(lat) ? undefined : ordering,
        });

        setServices(data);
        hadData.current = data.length > 0;
      } catch {
        setError("Could not load services. Check your connection and try again.");
        if (!hadData.current) setServices([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      lat,
      lng,
      city,
      search,
      locationReady,
      minPrice,
      maxPrice,
      minRating,
      verifiedOnly,
      availableOnly,
      ordering,
      maxKm,
    ]
  );

  useEffect(() => {
    if (!locationReady) return;
    // Debounce free-text search so typing does not hammer the API.
    const timer = setTimeout(() => load(), search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search, locationReady]);

  const filtered = useMemo(() => {
    if (category === "All") return services;
    const keys = CATEGORY_KEYWORDS[category] || [];
    if (keys.length === 0) return services;
    return services.filter((s) => {
      const blob = `${s.title} ${s.description}`.toLowerCase();
      return keys.some((k) => blob.includes(k));
    });
  }, [services, category]);

  return {
    /** Every result the API returned (before the keyword category filter). */
    allServices: services,
    services: filtered,
    totalCount: filtered.length,
    loading: loading && !hadData.current,
    refreshing,
    error,
    refresh: () => load(true),
  };
}

export { CATEGORY_KEYWORDS };
