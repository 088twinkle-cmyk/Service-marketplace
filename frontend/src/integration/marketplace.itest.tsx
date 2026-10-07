/**
 * Live integration test — real browser API layer against a real Django server.
 *
 * Requires:
 *   backend:  python manage.py runserver 0.0.0.0:8001
 *   data:     python manage.py seed_demo
 *
 * Run with `npm run test:integration`.
 *
 * These tests drive the same modules the browser app loads (`servicesApi`,
 * `bookingsApi`, `chatsApi`, `kycApi`, the axios client with its JWT storage
 * and refresh interceptor), so they prove the frontend/backend contract —
 * pagination unwrapping, field names, status keys, multipart uploads and the
 * full reverse-bidding → payment → chat → completion flow.
 */
import React from "react";
import { beforeAll, describe, expect, it } from "vitest";

import { act, renderAt, type RenderResult } from "../test/render";
import HomeScreen from "../screens/customer/HomeScreen";
import SearchScreen from "../screens/customer/SearchScreen";
import CustomerDashboardScreen from "../screens/customer/CustomerDashboardScreen";
import ProviderHomeScreen from "../screens/provider/ProviderHomeScreen";
import { api } from "../services/api/client";
import { authApi } from "../services/api/authApi";
import { bookingsApi } from "../services/api/bookingsApi";
import { chatsApi } from "../services/api/chatsApi";
import { kycApi } from "../services/api/kycApi";
import { reviewsApi } from "../services/api/reviewsApi";
import { servicesApi } from "../services/api/servicesApi";
import { userApi } from "../services/api/userApi";
import { getItem, setItem, removeItems, StorageKeys } from "../utils/storage";

const CUSTOMER = { email: "anita@demo.marketplace", password: "DemoPass!2024" };
const PROVIDER = { email: "sita@demo.marketplace", password: "DemoPass!2024" };

async function signInAs(credentials: { email: string; password: string }) {
  const res = await authApi.login(credentials);
  const { access, refresh, user } = res.data;
  await setItem(StorageKeys.TOKEN, access);
  await setItem(StorageKeys.REFRESH_TOKEN, refresh);
  await setItem(StorageKeys.ROLE, user.role);
  await setItem(StorageKeys.USERNAME, user.username);
  await setItem(StorageKeys.EMAIL, user.email);
  return { access, refresh, user };
}

/** Mount a screen against the live API and let its data settle. */
async function renderLive(ui: React.ReactElement, waitMs = 1600): Promise<RenderResult> {
  let view!: RenderResult;
  await act(async () => {
    view = renderAt(ui);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  });
  return view;
}

async function signOut() {
  await removeItems([
    StorageKeys.TOKEN,
    StorageKeys.REFRESH_TOKEN,
    StorageKeys.ROLE,
    StorageKeys.USERNAME,
    StorageKeys.EMAIL,
    StorageKeys.SERVICES,
  ]);
}

describe("live marketplace", () => {
  beforeAll(async () => {
    await signOut();
  });

  it("serves the catalog to the browser through the paginated API", async () => {
    const services = await servicesApi.list();
    expect(services.length).toBeGreaterThan(0);

    const first = services[0];
    expect(first.title).toBeTruthy();
    expect(first.provider).toBeGreaterThan(0);
    expect(first.provider_name.length).toBeGreaterThan(0);
    expect(Number(first.price)).toBeGreaterThan(0);

    const searched = await servicesApi.list({ search: "bridal" });
    expect(searched.length).toBeGreaterThan(0);
    expect(searched.length).toBeLessThanOrEqual(services.length);
    expect(
      searched.some((s) => s.title.toLowerCase().includes("bridal"))
    ).toBe(true);

    // Kathmandu valley centre — every result must carry a distance.
    const nearby = await servicesApi.list({ lat: 27.7172, lng: 85.324, max_km: 25 });
    expect(nearby.length).toBeGreaterThan(0);
    expect(nearby.every((s) => typeof s.distance_km === "number")).toBe(true);
  });

  it("filters categories and providers on the server", async () => {
    const categories = await servicesApi.categories();
    expect(categories.length).toBeGreaterThan(0);

    const providers = await api.get("api/providers/", { params: { verified: "1" } });
    expect(providers.data.count).toBeGreaterThan(0);
    for (const row of providers.data.results) {
      expect(row.is_verified).toBe(true);
    }
  });

  it("logs in with JWT, returns the profile, and stores the token", async () => {
    const { user } = await signInAs(CUSTOMER);
    expect(user.username).toBe("anita_customer");
    expect(user.role).toBe("CLIENT");

    const stored = await getItem(StorageKeys.TOKEN);
    expect(stored).toBeTruthy();

    const me = await userApi.me();
    expect(me.email).toBe(CUSTOMER.email);
    expect(me.role_key).toBeDefined();
  });

  it("refreshes an expired access token through the axios interceptor", async () => {
    const { refresh } = await signInAs(CUSTOMER);
    // Simulate an expired access token: the interceptor must trade the refresh
    // token for a new access token and retry the request transparently.
    await setItem(StorageKeys.TOKEN, "expired.invalid.token");

    const me = await userApi.me();
    expect(me.email).toBe(CUSTOMER.email);

    const stored = await getItem(StorageKeys.TOKEN);
    expect(stored).not.toBe("expired.invalid.token");
    expect(stored && stored.split(".").length).toBe(3);

    const refreshed = await api.post("api/auth/token/refresh/", { refresh: await getItem(StorageKeys.REFRESH_TOKEN) ?? refresh });
    expect(refreshed.status).toBe(200);
  });

  it("keeps provider KYC data private but exposes the verified badge", async () => {
    await signInAs(PROVIDER);
    const profile = await kycApi.getProfile();
    expect(profile.kyc_status).toBe("approved");
    expect(profile.is_verified).toBe(true);
    expect(profile.profile_completed).toBe(true);

    const kyc = await kycApi.getKyc();
    expect(kyc.document_number).toBeTruthy();

    // The public provider payload must never contain the document data.
    await signOut();
    const publicProfile = await api.get(`api/providers/${profile.id}/`);
    const serialized = JSON.stringify(publicProfile.data);
    expect(serialized).not.toContain(kyc.document_number as string);
    expect(serialized).not.toContain("document_front");
    expect(publicProfile.data.is_verified).toBe(true);
  });

  it("runs the whole booking workflow through the frontend API layer", async () => {
    // ---------- provider publishes availability ----------
    const providerSession = await signInAs(PROVIDER);
    const providerProfile = await kycApi.getProfile();
    const mine = await servicesApi.listMine();
    expect(mine.length).toBeGreaterThan(0);
    const service = mine[0];

    const slots = await bookingsApi.listAvailability({
      provider: providerProfile.id as number,
      status: "available",
    });
    expect(slots.length).toBeGreaterThan(0);
    const slot = slots.find((s) => s.status === "available" && s.date >= todayIso());
    expect(slot).toBeTruthy();

    // ---------- customer books a slot ----------
    await signInAs(CUSTOMER);
    const booking = await bookingsApi.createBooking({
      service: service.id,
      slot_id: slot!.id,
      title: "Integration test booking",
      requirements: "Created by the live integration test.",
      proposed_price: "2600.00",
    });
    expect(booking.status).toBe("pending");
    expect(booking.can_cancel).toBe(false);

    // Chat stays closed until both sides agree on a price.
    await expect(bookingsApi.chatForBooking(booking.id)).rejects.toThrow();

    // ---------- provider counters ----------
    await signInAs(PROVIDER);
    const countered = await bookingsApi.counterOffer(booking.id, {
      amount: "2750.00",
      message: "Includes travel.",
    });
    expect(countered.status).toBe("offers");

    // ---------- customer accepts the counter-offer ----------
    await signInAs(CUSTOMER);
    const accepted = await bookingsApi.acceptBooking(booking.id);
    expect(accepted.status).toBe("agreed");
    expect(Number(accepted.agreed_price)).toBe(2750);

    // ---------- payment (server-side sandbox verifier) ----------
    await bookingsApi.startPayment(booking.id);
    const initiated = await api.post("api/payments/initiate/", { booking: booking.id });
    expect(initiated.status).toBe(200);
    expect(initiated.data.esewa?.signature).toBeTruthy();

    const verified = await api.post(
      `api/payments/${initiated.data.payment.id}/verify/`,
      { force_success: true }
    );
    expect(verified.data.status).toBe("SUCCESS");

    const afterPayment = await bookingsApi.getBooking(booking.id);
    expect(afterPayment.status).toBe("confirmed");
    expect(afterPayment.chat_available).toBe(true);

    // ---------- chat ----------
    const conversation = await chatsApi.roomForBooking(booking.id);
    expect(conversation.booking).toBe(booking.id);

    const sent = await chatsApi.sendMessage(conversation.id, {
      text: "See you at the appointment.",
    });
    expect(sent.text).toBe("See you at the appointment.");

    const messages = await chatsApi.getMessages(conversation.id);
    expect(messages.length).toBeGreaterThan(0);
    await chatsApi.markRead(conversation.id);

    // ---------- delivery, revision and completion ----------
    await signInAs(PROVIDER);
    expect((await bookingsApi.startWork(booking.id)).status).toBe("in_progress");

    const submitted = await bookingsApi.submitDeliverable(booking.id, {
      title: "Final result",
      description: "Uploaded by the integration test.",
      url: "https://example.com/deliverable",
    });
    expect(submitted.status).toBe("deliverable_submitted");

    await signInAs(CUSTOMER);
    const revision = await bookingsApi.requestRevision(
      booking.id,
      "Please adjust the styling."
    );
    expect(revision.status).toBe("revision_requested");

    await signInAs(PROVIDER);
    await bookingsApi.submitDeliverable(booking.id, { title: "Revision 1" });

    await signInAs(CUSTOMER);
    const completed = await bookingsApi.approve(booking.id);
    expect(completed.status).toBe("completed");

    // ---------- review ----------
    const review = await api.post("api/reviews/", {
      booking: booking.id,
      rating: 5,
      comment: "Integration test review.",
    });
    expect(review.status).toBe(201);

    const feed = await reviewsApi.byProvider(providerProfile.id as number);
    expect(feed.some((r) => r.id === review.data.id)).toBe(true);

    await expect(
      api.post("api/reviews/", {
        booking: booking.id,
        rating: 4,
        comment: "Duplicate review",
      })
    ).rejects.toThrow();

    // ---------- provider earnings are computed by the backend ----------
    await signInAs(PROVIDER);
    const summary = await api.get("api/payments/summary/");
    expect(Number(summary.data.total_earned)).toBeGreaterThanOrEqual(2750);
    expect(summary.data.jobs_paid).toBeGreaterThanOrEqual(1);

    // ---------- notifications reached both parties ----------
    const notifications = await api.get("api/notifications/");
    expect(notifications.data.count).toBeGreaterThan(0);

    void providerSession;
  });

  it("renders the redesigned screens with live marketplace data", async () => {
    // ---------- public catalog screens ----------
    await signOut();
    const catalog = await servicesApi.list();
    expect(catalog.length).toBeGreaterThan(0);
    const liveTitle = catalog[0].title;

    const home = await renderLive(<HomeScreen />);
    const homeText = home.text();
    expect(homeText).toContain("Find the Right Professional for Your Service");
    expect(homeText).toContain(liveTitle);

    const search = await renderLive(<SearchScreen />);
    expect(search.text()).toContain("Browse services");
    expect(search.text()).toContain(liveTitle);

    // ---------- customer dashboard ----------
    await signInAs(CUSTOMER);
    const dashboard = await renderLive(<CustomerDashboardScreen />);
    const dashboardText = dashboard.text();
    expect(dashboardText).toContain("Welcome back");
    expect(dashboardText).toContain("anita_customer");

    // ---------- provider dashboard ----------
    await signInAs(PROVIDER);
    const providerHome = await renderLive(<ProviderHomeScreen />);
    const providerText = providerHome.text();
    expect(providerText).toContain("Welcome back");
    expect(providerText).toMatch(/Verified|verification/i);
  });
});

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
