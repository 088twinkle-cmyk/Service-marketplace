/**
 * Web shim for `expo-constants`.
 *
 * In the browser the API base URL should always be a same-origin relative
 * path so the Vite dev server can proxy `/api` and `/media` to Django.
 * That also means the app keeps working when it is opened from a phone or
 * from a proxied preview URL.
 */
type ExpoConfig = {
  name: string;
  slug: string;
  version: string;
  extra?: Record<string, unknown>;
};

const expoConfig: ExpoConfig = {
  name: "Service Marketplace",
  slug: "service-marketplace",
  version: "1.0.0",
  extra: {
    // Set VITE_API_URL to point the browser build at a different backend.
    apiUrl: import.meta.env?.VITE_API_URL ?? undefined,
  },
};

const Constants = {
  expoConfig,
  manifest: null,
  expoGoConfig: null,
  appOwnership: null as string | null,
  executionEnvironment: "browser" as const,
  platform: { web: {} },
  exponentConfig: expoConfig,
  deviceName: "browser",
  sessionId: undefined as string | undefined,
};

export default Constants;
export { Constants };
