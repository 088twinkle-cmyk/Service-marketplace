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

/**
 * Step 1 of registration: the backend stores a pending registration and
 * sends a WhatsApp OTP.  The permanent account (and JWTs) only exist after
 * `whatsappVerifyOtp` succeeds.
 */
export type RegistrationStartResponse = {
  registration_id: string;
  phone_number: string;
  role: string;
  role_key: string;
  expires_in: number;
  otp_expires_in: number;
  resend_cooldown: number;
  delivery: "whatsapp" | "simulated" | "recently_sent";
  delivered: boolean;
  whatsapp_number: string;
  otp_already_sent?: boolean;
  message?: string;
  debug_otp?: string;
};

export type OtpResendResponse = {
  message: string;
  delivery: "whatsapp" | "simulated";
  delivered: boolean;
  resend_cooldown: number;
  whatsapp_number: string;
  debug_otp?: string;
};

export type AuthUser = {
  id: number;
  username: string;
  email: string;
  role: string;
  role_key?: string;
  phone: string | null;
  is_otp_verified: boolean;
  is_active_account: boolean;
  date_joined: string;
};

export type AuthResponse = {
  refresh: string;
  access: string;
  user: AuthUser;
  otp_required?: boolean;
  otp_channel?: "whatsapp";
  registration?: string;
  phone_verified?: boolean;
  debug_otp?: string;
};

export type RequestOtpResponse = {
  message: string;
  delivery: "whatsapp" | "simulated";
  resend_cooldown: number;
  whatsapp_number: string;
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

/**
 * Machine-readable error code from a backend OTP error
 * (`{error, code, retry_after?}`), or undefined.
 */
export function getApiErrorCode(err: unknown): string | undefined {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { code?: string } | undefined;
    return data?.code;
  }
  return undefined;
}

/** Seconds to wait before retrying, when the backend reports a cooldown. */
export function getApiRetryAfter(err: unknown, fallback = 45): number {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { retry_after?: number } | undefined;
    if (data?.retry_after && data.retry_after > 0) {
      return Math.min(600, Math.ceil(data.retry_after));
    }
  }
  return fallback;
}

export const authApi = {
  // Register a new account (customer or provider). The backend stores a
  // pending registration and sends a WhatsApp OTP — no account exists yet.
  register: (data: RegisterPayload) =>
    authClient.post<RegistrationStartResponse>(
      "api/auth/register/",
      data
    ),

  // Login with email and password.
  login: (data: LoginPayload) =>
    authClient.post<AuthResponse>(
      "api/auth/login/",
      data
    ),

  // Complete registration: verify the WhatsApp OTP tied to the pending
  // registration.  Returns the normal JWT authentication response.
  whatsappVerifyOtp: (registrationId: string, otp: string) =>
    authClient.post<AuthResponse>(
      "api/auth/whatsapp/verify-otp/",
      { registration_id: registrationId, otp },
      {}
    ),

  // Re-request an OTP by phone number (recovers the flow after a page
  // refresh, when the registration id was lost).
  whatsappSendOtp: (phoneNumber: string) =>
    authClient.post<RegistrationStartResponse | { message: string; phone_number: string }>(
      "api/auth/whatsapp/send-otp/",
      { phone_number: phoneNumber },
      {}
    ),

  // Resend the OTP for a pending registration (cooldown enforced server-side).
  otpResend: (registrationId: string) =>
    authClient.post<OtpResendResponse>(
      "api/auth/otp/resend/",
      { registration_id: registrationId },
      {}
    ),

  // Verify OTP after login (unverified existing account).
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

  // Request/resend OTP for an authenticated user (their WhatsApp number).
  requestOtp: (accessToken: string) =>
    authClient.post<RequestOtpResponse>(
      "api/auth/otp/request/",
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    ),

  // Forgot password — emails a user id + reset token.
  forgotPassword: (email: string) =>
    authClient
      .post<{ message: string; uid?: string; debug_token?: string }>(
        "api/auth/password/forgot/",
        { email }
      )
      .then((response) => response.data),

  // Reset password with the emailed uid + token.
  resetPassword: (data: {
    email: string;
    uid: string;
    token: string;
    new_password: string;
  }) =>
    authClient
      .post<{ message: string }>(
        "api/auth/password/reset/",
        data
      )
      .then((response) => response.data),

  // Check username availability.
  checkUsername: (username: string) =>
    authClient
      .post<{ username: string; available: boolean }>(
        "api/auth/username-available/",
        { username }
      )
      .then((response) => response.data),
};
