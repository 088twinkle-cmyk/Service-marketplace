import { api, unwrapList } from "./client";

export type ChatMessage = {
  id: number;
  sender: number;
  sender_name: string;
  text: string;
  image_url: string;
  is_read: boolean;
  created_at: string;
};

export type ChatRoom = {
  id: number;
  booking: number;
  customer: number;
  provider: number;
  other_user_name: string;
  other_user_photo: string;
  service_title: string;
  last_message: ChatMessage | null;
  unread_count: number;
  is_active: boolean;
  created_at: string;
};

export const chatsApi = {
  listRooms: () =>
    api.get("api/chat/conversations/").then((r) => unwrapList<ChatRoom>(r.data)),

  getMessages: (roomId: number) =>
    api
      .get(`api/chat/conversations/${roomId}/messages/`)
      .then((r) => unwrapList<ChatMessage>(r.data)),

  sendMessage: (roomId: number, data: { text?: string; image_url?: string }) =>
    api.post<ChatMessage>(`api/chat/conversations/${roomId}/send/`, data).then((r) => r.data),

  markRead: (roomId: number) =>
    api.post(`api/chat/conversations/${roomId}/mark-read/`),

  roomForBooking: (bookingId: number) =>
    api.get<ChatRoom>(`api/chat/conversations/booking/${bookingId}/`).then((r) => r.data),
};
