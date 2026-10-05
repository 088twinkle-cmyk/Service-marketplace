import { kycApi } from "../services/api/kycApi";
import { StorageKeys, setItem } from "../utils/storage";
import { Routes, type AppRoute } from "./routes";

export async function syncProviderProfile(): Promise<void> {
  try {
    const profile = await kycApi.getProfile();

    await setItem(
      StorageKeys.PROFILE_COMPLETED,
      profile.profile_completed ? "true" : "false"
    );

    await setItem(StorageKeys.KYC_STATUS, profile.kyc_status);
  } catch {
    // Ignore profile sync errors.
  }
}

/**
 * After login / register:
 * CLIENT / CUSTOMER → customer home
 * PROVIDER / FREELANCER → provider dashboard
 * ADMIN → customer home for now
 */
export async function getPostLoginRoute(role: string): Promise<AppRoute> {
  const normalizedRole = role?.trim().toUpperCase();

  if (
    normalizedRole === "PROVIDER" ||
    normalizedRole === "FREELANCER"
  ) {
    await syncProviderProfile();
    return Routes.PROVIDER_HOME;
  }

  return Routes.HOME;
}

/**
 * App start.
 * The authenticated user's role decides which dashboard to show.
 */
export async function resolveInitialRoute(): Promise<AppRoute> {
  return Routes.HOME;
}