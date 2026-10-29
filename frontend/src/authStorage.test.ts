import { beforeEach, describe, expect, it } from "vitest";

import {
  clearPendingRegistration,
  getAuth,
  getPendingRegistration,
  setAuth,
  setPendingRegistration,
} from "./auth/auth";

beforeEach(() => {
  window.localStorage.clear();
});

describe("email OTP authentication storage", () => {
  it("persists pending registration context for refresh recovery", async () => {
    await setPendingRegistration({
      registrationId: "registration-1",
      email: "person@example.com",
    });

    await expect(getPendingRegistration()).resolves.toEqual({
      registrationId: "registration-1",
      email: "person@example.com",
    });
  });

  it("clears registration context without removing the verified session", async () => {
    await setAuth({
      access: "access-1",
      role: "CLIENT",
      username: "person",
    });
    await setPendingRegistration({
      registrationId: "registration-1",
      email: "person@example.com",
    });

    await clearPendingRegistration();

    await expect(getAuth()).resolves.toMatchObject({ token: "access-1" });
    await expect(getPendingRegistration()).resolves.toEqual({
      registrationId: undefined,
      email: undefined,
    });
  });
});
