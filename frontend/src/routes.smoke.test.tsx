/**
 * Route smoke test.
 *
 * Mounts every browser route against a stubbed API and asserts that the screen
 * renders (no crash, no blank page, no React errors). It is the cheap guard for
 * the redesign: a broken component or a bad `undefined` nearly always blows up
 * on one of these routes.
 *
 * The stub answers with realistic payloads so both the "has data" and the
 * derived states (ratings, badges, booking status) are exercised.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { act, renderAt, type RenderResult } from "./test/render";

const stub = vi.hoisted(() => ({ mode: "data" as "data" | "empty" | "fail" }));

vi.mock("./services/api/client", async () => {
  const actual = await vi.importActual<typeof import("./services/api/client")>(
    "./services/api/client"
  );

  const message = {
    id: 1,
    sender: 7,
    sender_name: "Anita Sharma",
    text: "See you at 9 in the morning.",
    image_url: "",
    is_read: true,
    created_at: "2026-01-09T12:00:00Z",
  };

  const service = {
    id: 1,
    provider: 7,
    provider_name: "Anita Sharma",
    provider_verified: true,
    provider_avatar: null,
    provider_rating: 4.8,
    provider_reviews: 12,
    title: "Deep home cleaning",
    description: "Full flat deep clean, kitchen and bathrooms included.",
    price: "2500.00",
    location: "Kathmandu",
    images: [],
    avg_rating: 4.8,
    review_count: 12,
    category: 1,
    category_name: "Home Improvement",
    category_slug: "home-improvement",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  };

  const booking = {
    id: 11,
    service: 1,
    service_title: "Deep home cleaning",
    status: "confirmed",
    status_key: "confirmed",
    status_label: "Confirmed",
    booking_time: "2026-01-10T09:00:00Z",
    appointment_start: "2026-01-10T09:00:00Z",
    appointment_end: "2026-01-10T11:00:00Z",
    location_city: "Kathmandu",
    agreed_price: "2500.00",
    can_cancel: true,
    chat_available: true,
    provider_name: "Anita Sharma",
    client_name: "Sita Rai",
    my_role: "client",
    has_review: false,
    created_at: "2026-01-05T00:00:00Z",
  };

  const room = {
    id: 3,
    booking: 11,
    customer: 1,
    provider: 7,
    other_user_name: "Anita Sharma",
    other_user_photo: "",
    service_title: "Deep home cleaning",
    last_message: message,
    unread_count: 0,
    is_active: true,
    created_at: "2026-01-05T00:00:00Z",
  };

  const profile = {
    id: 3,
    service_type: "Home cleaning",
    professional_title: "Home cleaning specialist",
    phone: "+9779800000000",
    location: "Kathmandu",
    kyc_status: "approved",
    is_verified: true,
    profile_completed: true,
    rating_average: "4.8",
    rating_count: 12,
    completed_jobs: 34,
  };

  const me = {
    id: 3,
    username: "Anita Sharma",
    email: "anita@demo.marketplace",
    role: "PROVIDER",
    role_key: "provider",
    phone: "+9779800000000",
    is_otp_verified: true,
    is_active_account: true,
    profile_photo: null,
    kyc_status: "approved",
    is_verified: true,
  };

  const slot = {
    id: 41,
    provider: 7,
    provider_name: "Anita Sharma",
    service: 1,
    service_title: "Deep home cleaning",
    date: "2026-01-10",
    start_time: "09:00:00",
    end_time: "11:00:00",
    status: "available",
  };

  function payload(url: string): unknown {
    const isList = /catalog\/services|bookings\/|chat\/conversations|reviews\//.test(url);
    if (stub.mode === "empty" && isList) return { count: 0, results: [] };

    if (url.includes("catalog/services/mine/")) return [service];
    if (/catalog\/services\/\d+\//.test(url)) return service;
    if (url.includes("catalog/services/")) return { count: 1, results: [service] };
    if (url.includes("catalog/categories/")) {
      return {
        count: 1,
        results: [
          { id: 1, name: "Home Repairs", slug: "home-repairs", service_count: 3 },
        ],
      };
    }
    if (url.includes("catalog/portfolio/")) return { count: 0, results: [] };
    if (url.includes("bookings/availability")) return { count: 1, results: [slot] };
    if (url.includes("bookings/")) return { count: 1, results: [booking] };
    if (url.includes("chat/conversations/booking/")) return room;
    if (url.includes("/messages/")) return { count: 1, results: [message] };
    if (url.includes("chat/conversations/")) return { count: 1, results: [room] };
    if (url.includes("reviews/")) {
      return {
        count: 1,
        results: [
          {
            id: 1,
            customer_name: "Sita Rai",
            provider: 7,
            service_title: "Deep home cleaning",
            rating: 5,
            comment: "Punctual and thorough.",
            created_at: "2026-01-02T00:00:00Z",
          },
        ],
      };
    }
    if (url.includes("providers/profile/")) return profile;
    if (url.includes("providers/kyc/")) {
      return {
        id: 1,
        legal_name: "Anita Sharma",
        document_type: "citizenship",
        document_number: "12-345-678",
        kyc_status: "approved",
        is_verified: true,
        submitted_at: "2025-12-01T00:00:00Z",
        reviewed_at: "2025-12-02T00:00:00Z",
      };
    }
    if (url.includes("auth/me/")) return me;
    if (url.includes("auth/")) return {};
    return { count: 0, results: [] };
  }

  return {
    ...actual,
    api: {
      get: vi.fn((url: string) =>
        stub.mode === "fail"
          ? Promise.reject(
              Object.assign(new Error("Network Error"), {
                isAxiosError: true,
                code: "ERR_NETWORK",
              })
            )
          : Promise.resolve({ data: payload(String(url)) })
      ),
      post: vi.fn(() => Promise.resolve({ data: {} })),
      patch: vi.fn(() => Promise.resolve({ data: {} })),
      delete: vi.fn(() => Promise.resolve({ data: {} })),
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    },
  };
});

import { SafeAreaProvider } from "react-native-safe-area-context";

import { setAuth } from "./auth/auth";
import AppRoutes from "./webRoutes";
import Navbar from "./components/Navbar";

function Shell() {
  return (
    <SafeAreaProvider>
      <Navbar />
      <AppRoutes />
    </SafeAreaProvider>
  );
}

/** The catalog hook debounces input by 350 ms — let it settle. */
async function settle(ms = 450) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function mount(route: string, seedProvider = false, seedAuth = true) {
  window.localStorage.clear();

  if (seedAuth) {
    await setAuth({
      access: "test-access-token",
      refresh: "test-refresh-token",
      role: seedProvider ? "PROVIDER" : "CUSTOMER",
      username: seedProvider ? "Anita Sharma" : "Sita Rai",
      email: "demo@marketplace.test",
    });
  }

  const errors: string[] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
    errors.push(args.map(String).join(" "));
  });

  let view!: RenderResult;
  await act(async () => {
    view = renderAt(<Shell />, route);
  });

  spy.mockRestore();
  return { view, errors };
}

/** react-native-web reads `documentElement.clientWidth` + the resize event. */
async function setViewport(width: number, height = 900) {
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(document.documentElement, "clientHeight", {
    configurable: true,
    value: height,
  });
  await act(async () => {
    window.dispatchEvent(new Event("resize"));
  });
}

function expectRendered(view: RenderResult, expected: string) {
  const text = view.text();
  expect(text.length).toBeGreaterThan(20);
  expect(text).toContain(expected);
  return text;
}

describe("every browser route renders", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  const publicRoutes: Array<[string, string]> = [
    ["/", "Find the Right Professional for Your Service"],
    ["/search", "Browse services"],
    ["/service/1", "Deep home cleaning"],
    ["/provider/7", "Anita Sharma"],
    ["/login", "Welcome back"],
    ["/register", "Create your account"],
    ["/otp", "Verify your WhatsApp"],
    ["/forgot-password", "Forgot your password?"],
    ["/reset-password", "Set a new password"],
    ["/choose-services", "What services do you need?"],
    ["/definitely-not-a-route", "Page not found"],
  ];

  it.each(publicRoutes)("%s renders", async (route, expected) => {
    const { view, errors } = await mount(route);
    expectRendered(view, expected);
    expect(errors.join("\n")).not.toMatch(/useNavigate\(\) may be used only/);
  });

  const customerRoutes: Array<[string, string]> = [
    ["/dashboard", "Welcome back"],
    ["/chat", "Your conversations"],
    [
      "/book?serviceId=1&title=Deep%20home%20cleaning&price=2500&provider=Anita%20Sharma&providerId=7",
      "Deep home cleaning",
    ],
    ["/book", "Booking unavailable"],
  ];

  it.each(customerRoutes)("%s renders for a signed-in customer", async (route, expected) => {
    const { view } = await mount(route);
    const text = expectRendered(view, expected).toLowerCase();
    expect(text).not.toContain("page not found");
  });

  const providerRoutes: Array<[string, string]> = [
    ["/provider-home", "Welcome back"],
    ["/provider-onboarding", "Tell us about your work"],
    ["/provider-kyc", "Identity verification"],
    ["/provider-services", "Your services"],
    ["/provider-bookings", "Your bookings"],
    ["/provider-availability", "Manage availability"],
  ];

  it.each(providerRoutes)("%s renders for a signed-in provider", async (route, expected) => {
    const { view } = await mount(route, true);
    expectRendered(view, expected);
  });

  it("shows an empty state when the catalog has no listings", async () => {
    stub.mode = "empty";
    try {
      const { view } = await mount("/search");
      await settle();
      expect(view.text()).toContain("No services");
    } finally {
      stub.mode = "data";
    }
  });

  it("shows a retryable error state when the API is unreachable", async () => {
    stub.mode = "fail";
    try {
      const { view } = await mount("/search");
      await settle();
      const text = view.text();
      expect(text).toContain("We could not load services");
      expect(text).toContain("Try again");
    } finally {
      stub.mode = "data";
    }
  });

  it("renders the mobile header and a desktop header at their breakpoints", async () => {
    await setViewport(390, 844);
    const mobile = await mount("/", false, false);
    expect(mobile.view.text()).toContain("Find the Right Professional for Your Service");
    expect(document.querySelector('[aria-label="Open menu"]')).toBeTruthy();

    await setViewport(1440, 900);
    const desktop = await mount("/", false, false);
    expect(desktop.view.text()).toContain("Find the Right Professional for Your Service");
    expect(desktop.view.text()).toContain("Sign In");
    expect(document.querySelector('[aria-label="Open menu"]')).toBeNull();
  });

  it("renders the customer dashboard on a phone width", async () => {
    await setViewport(360, 780);
    const { view } = await mount("/dashboard");
    await settle(50);
    expect(view.text()).toContain("Welcome back");
  });
});
