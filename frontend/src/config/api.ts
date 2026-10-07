import Constants from "expo-constants";
import { Platform } from "react-native";

/** Last-resort LAN IP — prefer Expo debuggerHost or app.json extra.apiUrl. */
const FALLBACK_HOST = "192.168.1.88";
export const API_PORT = 8001;

type DebuggerHostCarrier = { debuggerHost?: string | null } | null | undefined;

function hostFromExpo(): string | null {
  const constants = Constants as unknown as {
    expoGoConfig?: DebuggerHostCarrier;
    manifest?: DebuggerHostCarrier;
  };

  const go = constants.expoGoConfig?.debuggerHost;
  if (go) return go.split(":")[0];

  const legacy = constants.manifest?.debuggerHost;
  if (legacy) return legacy.split(":")[0];

  return null;
}

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function isTunnelHost(host: string): boolean {
  const h = host.toLowerCase();
  // When running Expo with `--tunnel`, debuggerHost can be a public/tunnel domain.
  // That host can reach Expo, but it cannot reach your local Django server on :8001.
  return h.includes("ngrok") || h.endsWith(".ngrok.io") || h.endsWith(".ngrok.app") || h.endsWith(".exp.direct");
}

export function getApiBaseUrl(): string {
  // Expo Go / dev client: debuggerHost is the PC IP the phone can reach.
  const host = hostFromExpo();
  if (host && host !== "localhost" && host !== "127.0.0.1" && !isTunnelHost(host)) {
    return `http://${host}:${API_PORT}/`;
  }

  const extra = Constants.expoConfig?.extra?.apiUrl as string | undefined;
  if (extra?.trim()) {
    return normalizeBaseUrl(extra);
  }

  if (Platform.OS === "web") {
    // Same-origin: the dev server (or production host) proxies /api and
    // /media to Django, so the app also works behind a preview URL or from a
    // phone on the LAN.
    return "/";
  }

  return `http://${FALLBACK_HOST}:${API_PORT}/`;
}

/** Hosts that only exist inside the dev machine / LAN, never in a browser. */
const LOOPBACK_HOST = /^(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|0\.0\.0\.0|\[::1\])$/i;
const PRIVATE_HOST =
  /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3})$/;

/**
 * Resolve a (possibly relative) media URL returned by the Django backend
 * into a URL the current device can actually load.
 *
 * The backend serialises absolute URLs built from the host it happens to run
 * on (`http://127.0.0.1:8001/media/...` when developed locally). Those are
 * unreachable from another machine, a phone or a preview URL, so dev/LAN hosts
 * are rewritten to a same-origin `/media/...` path: the browser hits the Vite
 * `/media` proxy (or the production reverse proxy) and the native app gets the
 * API base prepended again below. Genuinely remote media (S3, CDN) is kept
 * untouched.
 */
export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return "";

  // Inline data — nothing to resolve.
  if (url.startsWith("data:")) return url;

  if (url.startsWith("http://") || url.startsWith("https://")) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return url;
    }

    if (!LOOPBACK_HOST.test(parsed.hostname) && !PRIVATE_HOST.test(parsed.hostname)) {
      // A real remote URL — use as-is.
      return url;
    }

    const path = `${parsed.pathname}${parsed.search}`;
    const base = getApiBaseUrl().replace(/\/$/, "");
    // Web: base is "/" → "" → the path stays relative and the dev/prod proxy
    // forwards it. Native: the API host is prepended again.
    return base ? `${base}${path}` : path;
  }

  // Relative path — prepend the API base (strip trailing slash to avoid double-slash)
  const base = getApiBaseUrl().replace(/\/$/, "");
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${base}${path}`;
}
