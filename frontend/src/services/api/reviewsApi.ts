import { api, unwrapList } from "./client";

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
      .get("api/reviews/", { params: { provider: providerId } })
      .then((r) => unwrapList<ReviewItem>(r.data)),
  byService: (serviceId: number) =>
    api
      .get("api/reviews/", { params: { service: serviceId } })
      .then((r) => unwrapList<ReviewItem>(r.data)),
};
