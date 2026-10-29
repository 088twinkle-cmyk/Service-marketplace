/**
 * RegisterScreen — step 1 of the shared email OTP registration.
 *
 * Asserts the email verification copy, the customer/provider role choice
 * and the hand-over to the shared OTP screen.  The API layer is mocked.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderAt, type RenderResult } from "./test/render";

const authApiMock = vi.hoisted(() => ({
  register: vi.fn(),
  checkUsername: vi.fn(),
}));

vi.mock("./services/api/authApi", () => ({
  authApi: authApiMock,
  getApiErrorCode: (err: unknown) =>
    (err as { response?: { data?: { code?: string } } })?.response?.data?.code,
  getApiRetryAfter: (err: unknown, fallback = 45) =>
    (err as { response?: { data?: { retry_after?: number } } })?.response?.data
      ?.retry_after ?? fallback,
}));

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
import { getPendingRegistration } from "./auth/auth";
import RegisterScreen from "./screens/auth/RegisterScreen";

const REGISTRATION_STARTED = {
  registration_id: "reg-token-9",
  email: "sita@example.com",
  role: "FREELANCER",
  role_key: "provider",
  expires_in: 1800,
  otp_expires_in: 600,
  resend_cooldown: 45,
  delivery: "email",
  delivered: true,
};

function bodyText(): string {
  return document.body.textContent ?? "";
}

function findInDocument(label: string) {
  const matches = Array.from(
    document.querySelectorAll<HTMLElement>("div,span,button,input")
  ).filter((el) => el.textContent?.trim() === label);
  // Several wrappers share the same text; dispatch on the deepest/last one
  // so the event bubbles up through the interactive Pressable.
  return matches[matches.length - 1];
}

async function pressInDocument(label: string) {
  const el = findInDocument(label);
  expect(el, `document element labelled "${label}"`).toBeTruthy();
  await act(async () => {
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function settle(ms = 60) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function typeInto(input: HTMLInputElement | null | undefined, value: string) {
  expect(input).toBeTruthy();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )!.set!;
    setter.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("RegisterScreen — email registration entry", () => {
  it("presents email verification, not Google verification", async () => {
    const view = renderAt(<RegisterScreen />, "/register");
    await settle();

    const text = view.text();
    expect(text).toContain("Create your account");
    expect(text).toContain("verify your email");
    expect(text).toContain("Why we verify your email");
    expect(text).toContain("Email OTP");
    expect(text.toLowerCase()).not.toContain("google");
  });

  it("starts a pending registration and hands over to the shared OTP screen", async () => {
    authApiMock.register.mockResolvedValue({ data: REGISTRATION_STARTED });

    // Mount the whole route table: after registration the app must land on
    // the SHARED OTP screen (/otp), rendered with the registration context.
    const view = renderAt(<AppRoutes />, "/register");
    await settle();

    // Choose the provider role first.
    const providerCard = Array.from(
      view.container.querySelectorAll<HTMLElement>("div,span")
    ).find((el) => el.textContent?.trim() === "I offer services");
    expect(providerCard).toBeTruthy();
    await act(async () => {
      providerCard?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const inputs = Array.from(
      view.container.querySelectorAll<HTMLInputElement>("input")
    );
    // username, email, phone, password — in form order.
    expect(inputs.length).toBeGreaterThanOrEqual(4);
    await typeInto(inputs[0], "sitarai");
    await typeInto(inputs[1], "sita@example.com");
    await typeInto(inputs[2], "+9779843677123");
    await typeInto(inputs[3], "Str0ngPass!2024");

    await pressInDocument("Create account & send code");
    await settle();

    expect(authApiMock.register).toHaveBeenCalledWith({
      username: "sitarai",
      email: "sita@example.com",
      phone: "+9779843677123",
      password: "Str0ngPass!2024",
      role: "FREELANCER",
    });

    expect(bodyText()).toContain("Email code sent");
    expect(window.localStorage.getItem("pending_registration_id")).toBe("reg-token-9");

    await pressInDocument("Continue");
    await settle();

    // Routed to the shared OTP screen with the registration context…
    expect(view.text()).toContain("Verify your email");
    expect(view.text()).toContain("Verifying your provider account");
    // …and the context is persisted for refresh-safety.
    await expect(getPendingRegistration()).resolves.toEqual({
      registrationId: "reg-token-9",
      email: "sita@example.com",
    });
  });

  it("surfaces an email-configuration problem from the server", async () => {
    authApiMock.register.mockRejectedValue(
      Object.assign(
        new Error("Email verification is not configured on this server yet."),
        {
          response: {
            status: 503,
            data: {
              error: "Email verification is not configured on this server yet.",
              code: "email_unavailable",
            },
          },
        }
      )
    );

    const view = renderAt(<RegisterScreen />, "/register");
    await settle();

    const inputs = Array.from(
      view.container.querySelectorAll<HTMLInputElement>("input")
    );
    await typeInto(inputs[0], "newuser");
    await typeInto(inputs[1], "newuser@example.com");
    await typeInto(inputs[2], "9843677123");
    await typeInto(inputs[3], "Str0ngPass!2024");

    await pressInDocument("Create account & send code");
    await settle();

    expect(bodyText()).toContain("Email not available");
  });
});
