import { api } from "./client";

export type UserProfile = {
  id: number;
  username: string;
  email: string;
  role: string;
  /** Lowercased role helper returned by the API: customer | provider | admin. */
  role_key?: string;
  phone: string | null;

  is_otp_verified?: boolean;
  is_active_account?: boolean;
  date_joined?: string;

  profile_photo?: string | null;
  kyc_status?: string;
  is_verified?: boolean;

  client_profile?: any;
  freelancer_profile?: any;
  profile?: any;
};

export const userApi = {
  // ------------------------------------------
  // Current logged-in user
  // ------------------------------------------

  me: () =>
    api
      .get<UserProfile>("api/auth/me/")
      .then((r) => r.data),

  // ------------------------------------------
  // Save profile information
  // ------------------------------------------

  updateProfile: (data: {
    username?: string;
    email?: string;
    phone?: string;

    full_name?: string;
    bio?: string;
    location?: string;
    address?: string;

    professional_title?: string;
    experience_years?: number;
    languages?: string;
    education?: string;
    certifications?: string;
  }) =>
    api
      .patch<UserProfile>(
        "api/auth/profile/",
        data
      )
      .then((r) => r.data),

  // ------------------------------------------
  // Upload profile picture
  // ------------------------------------------

  uploadPhoto: (formData: FormData) =>
    api
      .post(
        "api/auth/profile/photo/",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      )
      .then((r) => r.data),

  // ------------------------------------------
  // Delete profile picture
  // ------------------------------------------

  deletePhoto: () =>
    api
      .delete(
        "api/auth/profile/photo/delete/"
      )
      .then((r) => r.data),

  // ------------------------------------------
  // Change password
  // ------------------------------------------

  changePassword: (
    current_password: string,
    new_password: string
  ) =>
    api
      .post<{ message: string }>(
        "api/auth/password/change/",
        {
          current_password,
          new_password,
        }
      )
      .then((r) => r.data),

  // ------------------------------------------
  // Existing client profile
  // ------------------------------------------

  clientProfile: () =>
    api
      .get(
        "api/auth/client-profile/"
      )
      .then((r) => r.data),

  // ------------------------------------------
  // Existing freelancer profile
  // ------------------------------------------

  freelancerProfile: () =>
    api
      .get(
        "api/auth/freelancer-profile/"
      )
      .then((r) => r.data),

  // ------------------------------------------
  // Legacy methods (removed - use accounts endpoints)
  // ------------------------------------------
};