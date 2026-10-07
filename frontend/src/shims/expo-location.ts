/**
 * Web shim for `expo-location` built on the browser Geolocation API.
 */
export const Accuracy = {
  Lowest: 1,
  Low: 2,
  Balanced: 3,
  High: 4,
  Highest: 5,
} as const;

export async function requestForegroundPermissionsAsync() {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { status: "denied" as const, granted: false };
  }
  // The browser prompts on the first getCurrentPosition call; report granted
  // here so callers proceed and let getCurrentPositionAsync surface failures.
  const permission = (navigator as Navigator & {
    permissions?: { query: (d: { name: string }) => Promise<{ state: string }> };
  }).permissions;

  if (permission?.query) {
    try {
      const result = await permission.query({ name: "geolocation" });
      const granted = result.state === "granted";
      return {
        status: granted ? ("granted" as const) : result.state === "prompt" ? ("granted" as const) : ("denied" as const),
        granted,
      };
    } catch {
      /* fall through */
    }
  }

  return { status: "granted" as const, granted: true };
}

export async function getCurrentPositionAsync(options?: {
  accuracy?: number;
  timeout?: number;
}) {
  return new Promise<{
    coords: { latitude: number; longitude: number; accuracy: number | null };
    timestamp: number;
  }>((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not available in this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy ?? null,
          },
          timestamp: position.timestamp,
        }),
      (error) => reject(new Error(error.message || "Could not read your location.")),
      {
        enableHighAccuracy: (options?.accuracy ?? 3) >= 4,
        timeout: options?.timeout ?? 15000,
        maximumAge: 60000,
      }
    );
  });
}

export async function reverseGeocodeAsync(): Promise<
  Array<{ city?: string | null; region?: string | null; country?: string | null }>
> {
  // No geocoding provider is configured for the web build.
  return [];
}

export default {
  Accuracy,
  requestForegroundPermissionsAsync,
  getCurrentPositionAsync,
  reverseGeocodeAsync,
};
