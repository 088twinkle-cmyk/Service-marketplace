import { api } from "./client";

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
  title: string;
  description: string;
  price: string;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  distance_km?: number | null;
  images?: ServiceImage[];
  avg_rating?: number;
  review_count?: number;
  created_at: string;
};

export type ListServicesParams = {
  lat?: number;
  lng?: number;
  city?: string;
  search?: string;
  max_km?: number;
};

export const servicesApi = {
  list: async (params: ListServicesParams = {}): Promise<ServiceItem[]> => {
    const query: Record<string, string> = {};
    if (params.lat != null) query.lat = String(params.lat);
    if (params.lng != null) query.lng = String(params.lng);
    if (params.city) query.city = params.city;
    if (params.search) query.search = params.search;
    const res = await api.get<ServiceItem[]>("api/catalog/services/", { params: query });
    return Array.isArray(res.data) ? res.data : [];
  },
  get: async (id: number): Promise<ServiceItem> => {
    const res = await api.get<ServiceItem>(`api/catalog/services/${id}/`);
    return res.data;
  },
};
