/**
 * Routing regression test for the browser entry.
 *
 * The bug this guards against: `expo-router` was mapped to the browser shim in
 * `tsconfig.json`, so the Expo/Metro build loaded the shim while the browser
 * entry loaded it a second way, and `useNavigate()` ran outside of a
 * `<Router>`:
 *
 *   "useNavigate() may be used only in the context of a <Router> component."
 *
 * The fix keeps `expo-router` → real package for Expo/Metro and resolves the
 * shim only through the Vite alias. This test boots the *real* browser entry
 * (`src/main.tsx`) inside jsdom, so a regression fails here instead of in the
 * user's browser.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act } from "./test/render";

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

// The shim keeps a module-level imperative navigator; importing the entry
// twice would double-register it.
describe("browser entry (src/main.tsx)", () => {
  it("mounts the shell without a router-context error and navigates", async () => {
    // react-native-web derives its window dimensions from
    // `document.documentElement.clientWidth`, which jsdom reports as 0. Pin a
    // desktop viewport before importing the entry so the header renders its
    // inline navigation (the `Sign In` link) instead of the mobile menu.
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 1440,
    });
    Object.defineProperty(document.documentElement, "clientHeight", {
      configurable: true,
      value: 900,
    });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });

    const container = document.createElement("div");
    container.id = "root";
    document.body.appendChild(container);

    const errors: string[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.map(String).join(" "));
    });

    await act(async () => {
      // Import (not render) — main.tsx boots React itself, exactly like the
      // browser does.
      await import("./main");
    });

    const text = () => container.textContent ?? "";

    // The Navbar (which consumes the shim's useRouter/usePathname/useFocusEffect)
    // rendered inside BrowserRouter.
    expect(text()).toContain("Service Marketplace");
    expect(text()).toContain("Sign In");
    expect(errors.join("\n")).not.toContain("useNavigate() may be used only");

    // Client-side navigation still works: tap "Sign In" and land on /login.
    const signIn = Array.from(
      container.querySelectorAll<HTMLElement>("div,span")
    ).find((el) => el.textContent?.trim() === "Sign In");

    expect(signIn).toBeTruthy();

    await act(async () => {
      signIn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(window.location.pathname).toBe("/login");
    expect(text().toLowerCase()).toContain("sign in");

    errorSpy.mockRestore();
    container.remove();
  });
});
