/**
 * Boot smoke test: the browser entry must mount the shared layout
 * (Navbar + routed screen) without throwing.
 */
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderAt } from "./test/render";

vi.mock("./services/api/client", async () => {
  const actual = await vi.importActual<typeof import("./services/api/client")>(
    "./services/api/client"
  );
  return {
    ...actual,
    api: {
      get: vi.fn(() => Promise.resolve({ data: { results: [] } })),
      post: vi.fn(() => Promise.resolve({ data: {} })),
      patch: vi.fn(() => Promise.resolve({ data: {} })),
      delete: vi.fn(() => Promise.resolve({ data: {} })),
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    },
  };
});

import AppRoutes from "./webRoutes";
import Navbar from "./components/Navbar";
import { SafeAreaProvider } from "react-native-safe-area-context";

function App() {
  return (
    <SafeAreaProvider>
      <Navbar />
      <AppRoutes />
    </SafeAreaProvider>
  );
}

describe("browser app shell", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the public home route", async () => {
    let view!: ReturnType<typeof renderAt>;

    await act(async () => {
      view = renderAt(<App />, "/");
    });

    expect(view.text()).toContain("Service Marketplace");
  });

  it("renders the login screen", async () => {
    let view!: ReturnType<typeof renderAt>;

    await act(async () => {
      view = renderAt(<App />, "/login");
    });

    const text = view.text();
    expect(text.toLowerCase()).toContain("sign in");
    expect(view.queryAll("input").length).toBeGreaterThan(0);
  });

  it("renders a fallback for unknown routes instead of a blank page", async () => {
    let view!: ReturnType<typeof renderAt>;

    await act(async () => {
      view = renderAt(<App />, "/definitely-not-a-route");
    });

    expect(view.text()).toContain("Page not found");
  });
});
