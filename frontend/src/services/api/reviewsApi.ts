import { api } from "./client";

export type ReviewItem = {
  id: number;
  customer_name: string;
  provider: number;
  service_title: string;
  rating: number;
  comment: string;
  created_at: string;
};

export const reviewsApi = {
  byProvider: (providerId: number) =>
    api
      .get<ReviewItem[]>("api/reviews/", { params: { provider: providerId } })
      .then((r) => (Array.isArray(r.data) ? r.data : [])),
  byService: (serviceId: number) =>
    api
      .get<ReviewItem[]>("api/reviews/", { params: { service: serviceId } })
      .then((r) => (Array.isArray(r.data) ? r.data : [])),
};
