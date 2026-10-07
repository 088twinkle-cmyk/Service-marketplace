/**
 * `resolveMediaUrl` guards a real preview bug: Django serialises media URLs
 * with the host it runs on (`http://127.0.0.1:8001/media/...`), which a browser
 * on another machine — or behind the dev-server proxy — cannot reach. Those
 * dev/LAN hosts must collapse to a same-origin `/media/...` path, while genuine
 * remote media stays absolute.
 */
import { describe, expect, it } from "vitest";

import { resolveMediaUrl } from "./api";

describe("resolveMediaUrl", () => {
  it("turns a loopback media URL into a same-origin path on web", () => {
    expect(resolveMediaUrl("http://127.0.0.1:8001/media/services/a.jpg")).toBe(
      "/media/services/a.jpg"
    );
    expect(resolveMediaUrl("http://localhost:8001/media/services/a.jpg")).toBe(
      "/media/services/a.jpg"
    );
  });

  it("turns a LAN media URL into a same-origin path on web", () => {
    expect(resolveMediaUrl("http://192.168.1.88:8001/media/services/a.jpg")).toBe(
      "/media/services/a.jpg"
    );
    expect(resolveMediaUrl("http://169.254.0.21:8001/media/services/a.jpg")).toBe(
      "/media/services/a.jpg"
    );
  });

  it("keeps genuinely remote media untouched", () => {
    expect(resolveMediaUrl("https://cdn.example.com/a.jpg")).toBe(
      "https://cdn.example.com/a.jpg"
    );
  });

  it("keeps relative paths relative and handles empty input", () => {
    expect(resolveMediaUrl("/media/services/a.jpg")).toBe("/media/services/a.jpg");
    expect(resolveMediaUrl("media/services/a.jpg")).toBe("/media/services/a.jpg");
    expect(resolveMediaUrl(null)).toBe("");
    expect(resolveMediaUrl(undefined)).toBe("");
  });

  it("is idempotent, so double resolution is harmless", () => {
    const once = resolveMediaUrl("http://127.0.0.1:8001/media/services/a.jpg");
    expect(resolveMediaUrl(once)).toBe(once);
  });
});
