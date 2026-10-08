/**
 * OtpScreen — the shared WhatsApp verification screen.
 *
 * Covers the three entry modes (registration, login re-verification,
 * phone-number recovery), the resend cooldown and the error states the
 * backend can produce.  The API layer is fully mocked — no test touches a
 * real backend or WhatsApp provider.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderAt, type RenderResult } from "./test/render";

const authApiMock = vi.hoisted(() => ({
  register: vi.fn(),
  login: vi.fn(),
  whatsappVerifyOtp: vi.fn(),
  whatsappSendOtp: vi.fn(),
  otpResend: vi.fn(),
  verifyOtp: vi.fn(),
  requestOtp: vi.fn(),
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
      get: vi.fn(() =>
        Promise.resolve({
          data: { profile_completed: true, kyc_status: "not_submitted" },
        })
      ),
      post: vi.fn(() => Promise.resolve({ data: {} })),
      patch: vi.fn(() => Promise.resolve({ data: {} })),
      delete: vi.fn(() => Promise.resolve({ data: {} })),
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    },
  };
});

import OtpScreen from "./screens/auth/OtpScreen";

const REGISTRATION_URL =
  "/otp?registration_id=reg-token-1&phone=%2B9779843677123&role=provider&whatsapp_number=%2B9779843677123";

const AUTH_SUCCESS = {
  access: "access-1",
  refresh: "refresh-1",
  user: {
    id: 9,
    username: "verifyme",
    email: "verify@example.com",
    role: "FREELANCER",
    phone: "+9779843677123",
    is_otp_verified: true,
    is_active_account: true,
    date_joined: "2026-01-01T00:00:00Z",
  },
};

function apiError(status: number, data: { error: string; code: string; retry_after?: number }) {
  return Object.assign(new Error(data.error), {
    response: { status, data },
  });
}

function findElement(view: RenderResult, label: string) {
  return Array.from(
    view.container.querySelectorAll<HTMLElement>("div,span,button,input")
  ).find((el) => el.textContent?.trim() === label || (el as HTMLInputElement).value === label);
}

/**
 * RN-web `Modal` (used by Dialog/FeedbackModal) renders through a portal
 * attached to document.body — outside the test container — so popup text and
 * buttons are searched in the whole document.
 */
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

async function press(view: RenderResult, label: string) {
  const el = findElement(view, label);
  expect(el, `button labelled "${label}"`).toBeTruthy();
  await act(async () => {
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
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

async function mountOtp(route = "/otp") {
  const view = renderAt(<OtpScreen />, route);
  await settle();
  return view;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("OtpScreen — phone recovery mode (no context)", () => {
  it("asks for the WhatsApp number when there is nothing to resume", async () => {
    const view = await mountOtp("/otp");

    expect(view.text()).toContain("Verify your WhatsApp");
    expect(view.text()).toContain("WhatsApp number");
    expect(view.text()).toContain("Send OTP");
    // No code was requested behind the user's back.
    expect(authApiMock.requestOtp).not.toHaveBeenCalled();
    expect(authApiMock.otpResend).not.toHaveBeenCalled();
  });

  it("resumes a pending registration after entering the number", async () => {
    authApiMock.whatsappSendOtp.mockResolvedValue({
      data: {
        registration_id: "reg-token-1",
        phone_number: "+9779843677123",
        resend_cooldown: 45,
        whatsapp_number: "+9779843677123",
        delivery: "whatsapp",
        delivered: true,
      },
    });

    const view = await mountOtp("/otp");

    const input = view.container.querySelector("input");
    expect(input).toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )!.set!;
      setter.call(input, "+977 9843677123");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await press(view, "Send OTP");
    await settle();

    expect(authApiMock.whatsappSendOtp).toHaveBeenCalledWith("+977 9843677123");
    // Now in registration mode: OTP entry + resend with cooldown.
    expect(view.text()).toContain("Resend OTP in 45s");
    expect(findElement(view, "Verify")).toBeTruthy();
  });

  it("tells the user when no pending verification exists (enumeration-safe)", async () => {
    authApiMock.whatsappSendOtp.mockResolvedValue({
      data: {
        message:
          "If a WhatsApp verification is pending for this number, a new code has been sent.",
        phone_number: "+9779800000000",
      },
    });

    const view = await mountOtp("/otp");
    const input = view.container.querySelector("input");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )!.set!;
      setter.call(input, "+9779800000000");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await press(view, "Send OTP");
    await settle();

    expect(bodyText()).toContain("No verification found");
  });
});

describe("OtpScreen — registration mode", () => {
  it("shows the WhatsApp context and the locked role", async () => {
    const view = await mountOtp(REGISTRATION_URL);

    expect(view.text()).toContain("Verify your WhatsApp");
    expect(view.text()).toContain("+9779843677123");
    expect(view.text()).toContain("Verifying your provider account");
    expect(findElement(view, "Verify")).toBeTruthy();
    expect(findElement(view, "Resend OTP")).toBeTruthy();
  });

  it("autofills the dev code from a resend and enforces the cooldown", async () => {
    authApiMock.otpResend.mockResolvedValue({
      data: {
        message: "A new code has been sent to your WhatsApp.",
        delivery: "simulated",
        delivered: false,
        resend_cooldown: 45,
        whatsapp_number: "+9779843677123",
        debug_otp: "654321",
      },
    });

    const view = await mountOtp(REGISTRATION_URL);

    await press(view, "Resend OTP");
    await settle();

    expect(authApiMock.otpResend).toHaveBeenCalledWith("reg-token-1");
    expect(view.text()).toContain("Resend OTP in 45s");
    // __DEV__ builds autofill the returned development code.
    const otpInput = Array.from(
      view.container.querySelectorAll<HTMLInputElement>("input")
    ).find((el) => el.value === "654321");
    expect(otpInput).toBeTruthy();
  });

  it("verifies the code, stores the JWT and routes by role", async () => {
    authApiMock.whatsappVerifyOtp.mockResolvedValue({ data: AUTH_SUCCESS });

    const view = await mountOtp(REGISTRATION_URL);

    // Dev autofill happens through resend in real flows; set the code directly.
    const codeInput = Array.from(
      view.container.querySelectorAll<HTMLInputElement>("input")
    ).find((el) => el.getAttribute("inputmode") === "numeric" || el.value === "");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )!.set!;
      setter.call(codeInput, "482731");
      codeInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await press(view, "Verify");
    await settle();

    expect(authApiMock.whatsappVerifyOtp).toHaveBeenCalledWith("reg-token-1", "482731");
    expect(bodyText()).toContain("WhatsApp verified");

    // The JWT is stored once the popup is confirmed.
    await pressInDocument("Continue");
    expect(window.localStorage.getItem("token")).toBe("access-1");
    expect(window.localStorage.getItem("role")).toBe("FREELANCER");
    // The pending registration context was cleared.
    expect(window.localStorage.getItem("pending_registration_id")).toBeNull();
  });

  it("shows an inline error for an incorrect code", async () => {
    authApiMock.whatsappVerifyOtp.mockRejectedValue(
      apiError(400, {
        error: "That code is incorrect. 4 attempts left.",
        code: "otp_invalid",
      })
    );

    const view = await mountOtp(REGISTRATION_URL);

    const codeInput = Array.from(
      view.container.querySelectorAll<HTMLInputElement>("input")
    ).find((el) => el.getAttribute("inputmode") === "numeric" || el.value === "");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )!.set!;
      setter.call(codeInput, "000000");
      codeInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await press(view, "Verify");
    await settle();

    expect(view.text()).toContain("That code is incorrect.");
    expect(window.localStorage.getItem("token")).toBeNull();
  });

  it("reports an expired verification session and sends the user back to register", async () => {
    authApiMock.otpResend.mockRejectedValue(
      apiError(400, {
        error: "Your verification session could not be found or has expired.",
        code: "registration_expired",
      })
    );

    const view = await mountOtp(REGISTRATION_URL);
    await press(view, "Resend OTP");
    await settle();

    expect(bodyText()).toContain("Verification expired");
  });

  it("explains when WhatsApp is not configured on the server", async () => {
    authApiMock.whatsappVerifyOtp.mockRejectedValue(
      apiError(503, {
        error: "WhatsApp verification is not configured on this server yet.",
        code: "whatsapp_unavailable",
      })
    );

    const view = await mountOtp(REGISTRATION_URL);

    const codeInput = Array.from(
      view.container.querySelectorAll<HTMLInputElement>("input")
    ).find((el) => el.getAttribute("inputmode") === "numeric" || el.value === "");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )!.set!;
      setter.call(codeInput, "111111");
      codeInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await press(view, "Verify");
    await settle();

    expect(view.text()).toContain("not configured");
  });
});

describe("OtpScreen — login mode (unverified existing account)", () => {
  it("requests the WhatsApp OTP automatically for a signed-in user", async () => {
    window.localStorage.setItem("token", "stored-access");
    window.localStorage.setItem("email", "back@example.com");

    authApiMock.requestOtp.mockResolvedValue({
      data: {
        message: "OTP sent to your WhatsApp number.",
        delivery: "whatsapp",
        resend_cooldown: 45,
        whatsapp_number: "+9779843677123",
        debug_otp: "246810",
      },
    });

    const view = await mountOtp("/otp?email=back%40example.com");

    // Exactly one automatic request, even with effects firing twice.
    expect(authApiMock.requestOtp.mock.calls.length).toBe(1);
    expect(view.text()).toContain("finish signing in");
    expect(view.text()).toContain("Resend OTP in 45s");
    // Dev build: the code is autofilled.
    const otpInput = Array.from(
      view.container.querySelectorAll<HTMLInputElement>("input")
    ).find((el) => el.value === "246810");
    expect(otpInput).toBeTruthy();
  });

  it("verifies through the authenticated endpoint", async () => {
    window.localStorage.setItem("token", "stored-access");

    authApiMock.requestOtp.mockResolvedValue({
      data: {
        message: "OTP sent to your WhatsApp number.",
        delivery: "whatsapp",
        resend_cooldown: 0,
        whatsapp_number: "+9779843677123",
        debug_otp: "135790",
      },
    });
    authApiMock.verifyOtp.mockResolvedValue({
      data: { ...AUTH_SUCCESS, user: { ...AUTH_SUCCESS.user, role: "CLIENT" } },
    });

    const view = await mountOtp("/otp");

    await press(view, "Verify");
    await settle();

    expect(authApiMock.verifyOtp).toHaveBeenCalledWith("stored-access", "135790");
    expect(bodyText()).toContain("WhatsApp verified");
  });
});
