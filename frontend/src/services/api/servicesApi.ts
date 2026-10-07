/** Catalog: services, categories and provider lookups. */
import { api, unwrapList } from "./client";

export type ServiceImage = {
  id: number;
  image_url: string;
  caption: string;
};

export type ServiceItem = {
  id: number;
  provider: number;
  provider_name: string;
  provider_verified: boolean;
  provider_avatar?: string | null;
  provider_rating?: number;
  is_mine?: boolean;
  title: string;
  description: string;
  price: string;
  starting_price?: string;
  currency?: string;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  distance_km?: number | null;
  images?: ServiceImage[];
  avg_rating?: number;
  review_count?: number;
  category?: number | null;
  category_name?: string;
  category_slug?: string;
  service_mode?: string;
  duration_minutes?: number | null;
  delivery_days?: number | null;
  is_active?: boolean;
  created_at: string;
};

export type CategoryItem = {
  id: number;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  service_count?: number;
};

export type ListServicesParams = {
  lat?: number;
  lng?: number;
  city?: string;
  search?: string;
  /** Alias used by the catalog SearchFilter. */
  q?: string;
  max_km?: number;
  min_price?: number;
  max_price?: number;
  min_rating?: number;
  category?: number | string;
  subcategory?: number;
  service_mode?: string;
  verified?: boolean;
  available?: boolean;
  mine?: boolean;
  ordering?: string;
};

function toQuery(params: ListServicesParams): Record<string, string> {
  const query: Record<string, string> = {};

  const set = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return;
    if (typeof value === "boolean") {
      if (value) query[key] = "1";
      return;
    }
    query[key] = String(value);
  };

  set("lat", params.lat);
  set("lng", params.lng);
  set("city", params.city);
  set("search", params.search ?? params.q);
  set("max_km", params.max_km);
  set("min_price", params.min_price);
  set("max_price", params.max_price);
  set("min_rating", params.min_rating);
  set("category", params.category);
  set("subcategory", params.subcategory);
  set("service_mode", params.service_mode);
  set("verified", params.verified);
  set("available", params.available);
  set("mine", params.mine);
  set("ordering", params.ordering);

  return query;
}

type RawService = Record<string, unknown>;

function toService(raw: RawService): ServiceItem {
  return {
    ...(raw as unknown as ServiceItem),
    provider:
      (raw.provider as number) ??
      (raw.freelancer as number) ??
      0,
    price: String(raw.price ?? raw.starting_price ?? "0"),
    provider_name: (raw.provider_name as string) || "",
    provider_verified: Boolean(raw.provider_verified),
    location: (raw.location as string) || "",
  };
}

export const servicesApi = {
  list: async (params: ListServicesParams = {}): Promise<ServiceItem[]> => {
    const res = await api.get("api/catalog/services/", { params: toQuery(params) });
    return unwrapList<RawService>(res.data).map(toService);
  },

  /** The signed-in provider's own services, including inactive ones. */
  listMine: async (): Promise<ServiceItem[]> => {
    const res = await api.get("api/catalog/services/mine/");
    return unwrapList<RawService>(res.data).map(toService);
  },

  get: async (id: number): Promise<ServiceItem> => {
    const res = await api.get(`api/catalog/services/${id}/`);
    return toService(res.data as RawService);
  },

  create: (data: Record<string, unknown> | FormData) =>
    api
      .post("api/catalog/services/", data)
      .then((r) => toService(r.data as RawService)),

  update: (id: number, data: Record<string, unknown> | FormData) =>
    api
      .patch(`api/catalog/services/${id}/`, data)
      .then((r) => toService(r.data as RawService)),

  remove: (id: number) => api.delete(`api/catalog/services/${id}/`),

  categories: async (): Promise<CategoryItem[]> => {
    const res = await api.get("api/catalog/categories/");
    return unwrapList<CategoryItem>(res.data);
  },

  /** Portfolio items for a provider (public). */
  portfolio: async (freelancerId: number) => {
    const res = await api.get("api/catalog/portfolio/", {
      params: { freelancer: freelancerId },
    });
    return unwrapList<Record<string, unknown>>(res.data);
  },
};
