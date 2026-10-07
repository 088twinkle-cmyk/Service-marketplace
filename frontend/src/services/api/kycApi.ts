/**
 * Provider onboarding + KYC.
 *
 * Profile data lives at `/api/providers/profile/`; identity documents are
 * submitted to `/api/providers/kyc/` as multipart form data. Public endpoints
 * never expose the uploaded documents.
 */
import { Platform } from "react-native";

import { api, unwrapList } from "./client";

export type ProviderProfilePayload = {
  service?: string;
  service_type?: string;
  phone?: string;
  location?: string;
  bio?: string;
  experience_years?: number;
  languages?: string;
};

export type ProviderProfile = {
  id?: number;
  service_type: string;
  professional_title?: string;
  phone?: string | null;
  location?: string;
  kyc_status: string;
  is_verified: boolean;
  profile_completed: boolean;
  rejection_reason?: string;
  rating_average?: string | number;
  rating_count?: number;
  completed_jobs?: number;
  avatar_url?: string | null;
};

export type KycRecord = {
  id?: number;
  legal_name?: string;
  document_type?: string;
  document_number?: string;
  document_front_url?: string;
  document_back_url?: string;
  kyc_status: string;
  is_verified: boolean;
  rejection_reason?: string;
  submitted_at?: string | null;
  reviewed_at?: string | null;
};

export type KycSubmitPayload = {
  legal_name: string;
  document_type: string;
  document_number: string;
  /** Picked file: a web `File`, a Blob, or an Expo asset ({uri,name,type}). */
  document_front?: unknown;
  document_back?: unknown;
};

export const DOCUMENT_TYPES = [
  { value: "citizenship", label: "Citizenship" },
  { value: "license", label: "Driving licence" },
  { value: "passport", label: "Passport" },
  { value: "national_id", label: "National ID" },
] as const;

function appendFile(form: FormData, field: string, file: unknown) {
  if (!file || typeof form.append !== "function") return;

  // Web: a real File/Blob from <input type="file"> or fetch(blob:).
  if (typeof Blob !== "undefined" && file instanceof Blob) {
    const name =
      (file as File).name || `kyc-${field}.${file.type === "image/png" ? "png" : "jpg"}`;
    form.append(field, file, name);
    return;
  }

  // Native: Expo asset descriptors are accepted by RN's FormData.
  const asset = file as { uri?: string; name?: string; fileName?: string; mimeType?: string; type?: string };
  if (asset?.uri) {
    form.append(field, {
      uri: asset.uri,
      name: asset.name || asset.fileName || `kyc-${field}.jpg`,
      type: asset.mimeType || asset.type || "image/jpeg",
    } as unknown as Blob);
  }
}

export const kycApi = {
  getProfile: () =>
    api.get<ProviderProfile>("api/providers/profile/").then((r) => r.data),

  /** Onboarding: POST and PATCH are both accepted by the backend. */
  saveProfile: (data: ProviderProfilePayload) => {
    const payload = {
      service_type: data.service_type ?? data.service,
      phone: data.phone,
      location: data.location,
      bio: data.bio,
      experience_years: data.experience_years,
      languages: data.languages,
    };

    return api
      .patch<ProviderProfile>("api/providers/profile/", payload)
      .then((r) => r.data);
  },

  getKyc: () =>
    api.get<KycRecord>("api/providers/kyc/").then((r) => r.data),

  submitKyc: (data: KycSubmitPayload | string) => {
    const payload: KycSubmitPayload =
      typeof data === "string"
        ? {
            legal_name: "",
            document_type: "citizenship",
            document_number: data,
          }
        : data;

    const form = new FormData();
    form.append("legal_name", payload.legal_name || payload.document_number);
    form.append("document_type", payload.document_type || "citizenship");
    form.append("document_number", payload.document_number);

    appendFile(form, "document_front", payload.document_front);
    appendFile(form, "document_back", payload.document_back);
    // React Native needs an explicit filename part for the multipart section,
    // which appendFile already provides when a uri is present.

    return api
      .post<KycRecord>("api/providers/kyc/", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
};

/** Public provider directory (used by search screens). */
export const providersApi = {
  list: async (params: { q?: string; city?: string; category?: string; verified?: boolean } = {}) => {
    const query: Record<string, string> = {};
    if (params.q) query.q = params.q;
    if (params.city) query.city = params.city;
    if (params.category) query.category = params.category;
    if (params.verified) query.verified = "1";
    const res = await api.get("api/providers/", { params: query });
    return unwrapList<Record<string, unknown>>(res.data);
  },
  get: (id: number) =>
    api.get(`api/providers/${id}/`).then((r) => r.data),
};

export const IS_WEB = Platform.OS === "web";
