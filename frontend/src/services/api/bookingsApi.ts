/**
 * Bookings + provider availability.
 *
 * The Django API speaks the lowercase `status_key` contract
 * (`pending`, `confirmed`, `cancelled`, …) while the screens were written
 * against `booking.status`. Every response is normalised here so screens keep
 * a single, stable shape.
 */
import { api, unwrapList } from "./client";

export type BookingStatus =
  | "draft"
  | "pending"
  | "offers"
  | "agreed"
  | "payment_pending"
  | "payment_failed"
  | "confirmed"
  | "in_progress"
  | "deliverable_submitted"
  | "client_reviewing"
  | "revision_requested"
  | "completed"
  | "reviewed"
  | "rejected"
  | "cancelled"
  | "expired"
  | "disputed"
  | string;

export type CounterOffer = {
  id: number;
  amount: string;
  message: string;
  status: string;
  created_at: string;
  created_by_name?: string;
};

export type BookingItem = {
  id: number;
  service: number | null;
  service_id?: number | null;
  service_title?: string;
  title?: string;
  requirements?: string;
  /** Lowercase status used by the UI. */
  status: BookingStatus;
  status_key?: string;
  status_label?: string;
  booking_time?: string | null;
  appointment_start?: string | null;
  appointment_end?: string | null;
  location_city?: string;
  location_address?: string;
  proposed_price?: string | number | null;
  agreed_price?: string | number | null;
  can_cancel?: boolean;
  chat_available?: boolean;
  client_name?: string;
  provider_name?: string;
  provider?: number | null;
  my_role?: string;
  active_counter_offer?: CounterOffer | null;
  counter_offers?: CounterOffer[];
  has_review?: boolean;
  created_at?: string;
};

export type AvailabilitySlot = {
  id: number;
  provider: number;
  provider_name?: string;
  service: number | null;
  service_title?: string;
  date: string;
  start_time: string;
  end_time: string;
  /** lowercase: available | booked | blocked */
  status: string;
  note?: string;
};

export type CreateBookingPayload = {
  service?: number;
  slot_id?: number | null;
  title?: string;
  requirements?: string;
  proposed_price?: string | number;
  booking_type?: string;
  service_mode?: string;
  category?: number;
  freelancer?: number;
  open_to_all?: boolean;
  appointment_start?: string;
  appointment_end?: string;
  location_address?: string;
  location_city?: string;
};

function normalizeStatus(raw: unknown): string {
  const value = String(raw ?? "").trim();
  return value.toLowerCase();
}

function toBooking(raw: Record<string, unknown>): BookingItem {
  const statusKey =
    normalizeStatus(raw.status_key) || normalizeStatus(raw.status);

  return {
    ...(raw as unknown as BookingItem),
    status: statusKey,
    status_key: statusKey,
    service: (raw.service as number) ?? null,
    service_title: (raw.service_title as string) || (raw.title as string) || "",
    booking_time:
      (raw.booking_time as string) ??
      (raw.appointment_start as string) ??
      (raw.created_at as string) ??
      null,
    can_cancel: Boolean(raw.can_cancel),
  };
}

function toSlot(raw: Record<string, unknown>): AvailabilitySlot {
  return {
    ...(raw as unknown as AvailabilitySlot),
    status: normalizeStatus(raw.status) || "available",
    provider: (raw.provider as number) ?? 0,
    service: (raw.service as number) ?? null,
  };
}

export const bookingsApi = {
  /** Bookings visible to the signed-in user (customer, provider or admin). */
  listBookings: () =>
    api
      .get("api/bookings/projects/")
      .then((r) => unwrapList<Record<string, unknown>>(r.data).map(toBooking)),

  getBooking: (bookingId: number) =>
    api
      .get(`api/bookings/projects/${bookingId}/`)
      .then((r) => toBooking(r.data as Record<string, unknown>)),

  createBooking: (data: CreateBookingPayload) =>
    api
      .post("api/bookings/projects/", data)
      .then((r) => toBooking(r.data as Record<string, unknown>)),

  acceptBooking: (bookingId: number, data?: Record<string, unknown>) =>
    api
      .post(`api/bookings/projects/${bookingId}/accept/`, data ?? {})
      .then((r) => toBooking(r.data as Record<string, unknown>)),

  rejectBooking: (bookingId: number, data?: Record<string, unknown>) =>
    api
      .post(`api/bookings/projects/${bookingId}/reject/`, data ?? {})
      .then((r) => toBooking(r.data as Record<string, unknown>)),

  cancelBooking: (bookingId: number, data?: Record<string, unknown>) =>
    api
      .post(`api/bookings/projects/${bookingId}/cancel/`, data ?? {})
      .then((r) => toBooking(r.data as Record<string, unknown>)),

  counterOffer: (
    bookingId: number,
    data: { amount: string | number; message?: string }
  ) =>
    api
      .post(`api/bookings/projects/${bookingId}/counter/`, data)
      .then((r) => toBooking(r.data as Record<string, unknown>)),

  startPayment: (bookingId: number) =>
    api
      .post(`api/bookings/projects/${bookingId}/start_payment/`)
      .then((r) => toBooking(r.data as Record<string, unknown>)),

  startWork: (bookingId: number) =>
    api
      .post(`api/bookings/projects/${bookingId}/start_work/`)
      .then((r) => toBooking(r.data as Record<string, unknown>)),

  submitDeliverable: (bookingId: number, data: Record<string, unknown>) =>
    api
      .post(`api/bookings/projects/${bookingId}/submit_deliverable/`, data)
      .then((r) => toBooking(r.data as Record<string, unknown>)),

  approve: (bookingId: number) =>
    api
      .post(`api/bookings/projects/${bookingId}/approve/`)
      .then((r) => toBooking(r.data as Record<string, unknown>)),

  requestRevision: (bookingId: number, message: string) =>
    api
      .post(`api/bookings/projects/${bookingId}/request_revision/`, { message })
      .then((r) => toBooking(r.data as Record<string, unknown>)),

  /** Booking-scoped conversation (only once a price is agreed). */
  chatForBooking: (bookingId: number) =>
    api.get(`api/bookings/projects/${bookingId}/chat/`).then((r) => r.data),

  // -- availability -------------------------------------------------
  listAvailability: (params: {
    provider?: number;
    service?: number;
    month?: string;
    from?: string;
    to?: string;
    status?: string;
  }) => {
    const query: Record<string, string> = {};
    if (params.provider != null) query.provider = String(params.provider);
    if (params.service != null) query.service = String(params.service);
    if (params.month) query.month = params.month;
    if (params.from) query.from = params.from;
    if (params.to) query.to = params.to;
    if (params.status) query.status = params.status;

    return api
      .get("api/bookings/slots/", { params: query })
      .then((r) => unwrapList<Record<string, unknown>>(r.data).map(toSlot));
  },

  createAvailability: (data: {
    service?: number;
    date: string;
    start_time: string;
    end_time: string;
    note?: string;
  }) =>
    api
      .post("api/bookings/slots/", data)
      .then((r) => toSlot(r.data as Record<string, unknown>)),

  toggleBlock: (slotId: number) =>
    api
      .post(`api/bookings/slots/${slotId}/toggle-block/`)
      .then((r) => toSlot(r.data as Record<string, unknown>)),

  deleteAvailability: (slotId: number) =>
    api.delete(`api/bookings/slots/${slotId}/`),

  /** Materialise the provider's weekly rules into a month of slots. */
  generateAvailability: (month?: string) =>
    api
      .post("api/bookings/slots/generate/", month ? { month } : {})
      .then((r) => r.data as { created: number; month: string }),
};
