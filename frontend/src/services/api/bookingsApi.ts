import { api } from "./client";

export type BookingItem = {
  id: number;
  service: number;
  service_title?: string;
  title?: string;
  requirements?: string;
  status: string;
  booking_time?: string | null;
  proposed_price?: string | number | null;
  agreed_price?: string | number | null;
  can_cancel?: boolean;
};

export const bookingsApi = {
  // Get bookings visible to the current user
  listBookings: () =>
    api
      .get<BookingItem[]>("api/bookings/projects/")
      .then((r) => (Array.isArray(r.data) ? r.data : [])),

  // Create a new project booking
  createBooking: (data: {
    service: number;
    title?: string;
    requirements?: string;
    proposed_price?: string | number;
    booking_type?: string;
    service_mode?: string;
    category?: number;
    open_to_all?: boolean;
  }) =>
    api.post<BookingItem>("api/bookings/projects/", data),

  // Accept booking
  acceptBooking: (bookingId: number) =>
    api.post<BookingItem>(
      `api/bookings/projects/${bookingId}/accept/`
    ),

  // Reject booking
  rejectBooking: (bookingId: number, data?: Record<string, unknown>) =>
    api.post<BookingItem>(
      `api/bookings/projects/${bookingId}/reject/`,
      data ?? {}
    ),

  // Cancel booking
  cancelBooking: (bookingId: number) =>
    api.post<BookingItem>(
      `api/bookings/projects/${bookingId}/cancel/`
    ),

  // Freelancer sends a counter offer
  counterOffer: (
    bookingId: number,
    data: {
      amount: string | number;
      message?: string;
    }
  ) =>
    api.post<BookingItem>(
      `api/bookings/projects/${bookingId}/counter/`,
      data
    ),

  // Client starts payment
  startPayment: (bookingId: number) =>
    api.post<BookingItem>(
      `api/bookings/projects/${bookingId}/start_payment/`
    ),

  // Freelancer starts work
  startWork: (bookingId: number) =>
    api.post<BookingItem>(
      `api/bookings/projects/${bookingId}/start_work/`
    ),

  // Freelancer submits deliverable
  submitDeliverable: (
    bookingId: number,
    data: Record<string, unknown>
  ) =>
    api.post<BookingItem>(
      `api/bookings/projects/${bookingId}/submit_deliverable/`,
      data
    ),

  // Client approves completed work
  approve: (bookingId: number) =>
    api.post<BookingItem>(
      `api/bookings/projects/${bookingId}/approve/`
    ),

  // Client requests revision
  requestRevision: (
    bookingId: number,
    message: string
  ) =>
    api.post<BookingItem>(
      `api/bookings/projects/${bookingId}/request_revision/`,
      { message }
    ),
};