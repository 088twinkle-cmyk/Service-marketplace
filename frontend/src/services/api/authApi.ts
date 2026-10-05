
import axios from "axios";
import { getApiBaseUrl } from "../../config/api";

export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = {
  username: string;
  email: string;
  phone: string;
  password: string;
  role: "CLIENT" | "FREELANCER";
};

export type RegisterResponse = {
  refresh: string;
  access: string;
  user: {
    id: number;
    username: string;
    email: string;
    role: string;
    phone: string | null;
    is_otp_verified: boolean;
    is_active_account: boolean;
    date_joined: string;
  };
  debug_otp?: string;
};

export type AuthResponse = {
  refresh: string;
  access: string;
  user: {
    id: number;
    username: string;
    email: string;
    role: string;
    phone: string | null;
    is_otp_verified: boolean;
    is_active_account: boolean;
    date_joined: string;
  };
  otp_required?: boolean;
  debug_otp?: string;
};

const authClient = axios.create({
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 20000,
});

authClient.interceptors.request.use((config) => {
  config.baseURL = getApiBaseUrl();
  return config;
});

export const authApi = {
  // Register a new account.
  // Backend automatically generates and sends the OTP.
  register: (data: RegisterPayload) =>
    authClient.post<RegisterResponse>(
      "api/auth/register/",
      data
    ),

  // Login with email and password.
  login: (data: LoginPayload) =>
    authClient.post<AuthResponse>(
      "api/auth/login/",
      data
    ),

  // Verify OTP after login/registration.
  // The backend requires the JWT access token.
  verifyOtp: (accessToken: string, code: string) =>
    authClient.post<AuthResponse>(
      "api/auth/otp/verify/",
      { code },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    ),

  // Request/resend OTP for an authenticated user.
  requestOtp: (accessToken: string) =>
    authClient.post<{ detail: string; debug_otp?: string }>(
      "api/auth/otp/request/",
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    ),

  // Forgot password.
  // Keep these only if the backend later provides these endpoints.
  forgotPassword: (email: string) =>
    authClient
      .post<{ message: string; email_sent?: boolean }>(
        "api/auth/users/forgot-password/",
        { email }
      )
      .then((response) => response.data),

  // Reset password.
  // Keep these only if the backend later provides these endpoints.
  resetPassword: (data: {
    email: string;
    uid: string;
    token: string;
    new_password: string;
  }) =>
    authClient
      .post<{ message: string }>(
        "api/auth/users/reset-password/",
        data
      )
      .then((response) => response.data),

  // Check username availability.
  // Keep this only if the backend later provides this endpoint.
  checkUsername: (username: string) =>
    authClient
      .post<{ available: boolean }>(
        "api/auth/users/check-username/",
        { username }
      )
      .then((response) => response.data),
};

