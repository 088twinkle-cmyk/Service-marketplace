/**
 * ChatScreen — booking conversations.
 *
 * Two panes on desktop (conversation list + thread) and one pane on mobile.
 * The API contract is unchanged: rooms come from `/api/chat/conversations/`,
 * messages are polled every 3 seconds and sending posts `{ text }`.
 * Reached either with `?roomId=` / `?bookingId=` (from a booking) or without
 * params (the full inbox).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import Avatar from "../../components/ui/Avatar";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Icon from "../../components/ui/Icon";
import { Container } from "../../components/ui/Layout";
import PageHeader from "../../components/ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/States";
import { ListSkeleton } from "../../components/ui/Skeleton";
import { chatsApi, type ChatMessage, type ChatRoom } from "../../services/api/chatsApi";
import { getApiErrorMessage } from "../../services/api/client";
import { getAuth } from "../../auth/auth";
import { resolveMediaUrl } from "../../config/api";
import { colors, radius, shadows, spacing, typography, weight } from "../../theme/tokens";
import { useResponsive } from "../../theme/responsive";

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  const { roomId, bookingId } = useLocalSearchParams<{
    roomId?: string;
    bookingId?: string;
  }>();

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState<string | null>(null);

  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState("");
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [popup, setPopup] = useState({
    visible: false,
    type: "info" as FeedbackType,
    title: "",
    message: "",
  });

  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Current user (needed to align bubbles).
  useEffect(() => {
    (async () => {
      const auth = await getAuth();
      if (!auth.token) {
        router.replace("/login");
        return;
      }
      try {
        const { userApi } = await import("../../services/api/userApi");
        const me = await userApi.me();
        setCurrentUserId(me.id);
      } catch {
        router.replace("/login");
      }
    })();
  }, [router]);

  const loadRooms = useCallback(async () => {
    setRoomsError(null);
    try {
      const data = await chatsApi.listRooms();
      setRooms(data);
    } catch (err) {
      setRoomsError(getApiErrorMessage(err, "Could not load your conversations."));
    } finally {
      setRoomsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  // Resolve the requested room (by id or by booking) once.
  const loadRoom = useCallback(async () => {
    setThreadError(null);
    try {
      if (roomId) {
        const list = await chatsApi.listRooms();
        setRooms(list);
        setRoomsLoading(false);
        const found = list.find((r) => r.id === Number(roomId));
        if (found) setRoom(found);
        else setThreadError("This conversation is not available for your account.");
      } else if (bookingId) {
        const found = await chatsApi.roomForBooking(Number(bookingId));
        setRoom(found);
      }
    } catch (err) {
      setThreadError(getApiErrorMessage(err, "Could not load this conversation."));
    } finally {
      setLoading(false);
    }
  }, [roomId, bookingId]);

  useEffect(() => {
    loadRoom();
  }, [loadRoom]);

  const loadMessages = useCallback(async () => {
    if (!room) return;
    try {
      const msgs = await chatsApi.getMessages(room.id);
      setMessages(msgs);
    } catch {
      // Silent during polling — the user keeps the last known messages.
    }
  }, [room]);

  useEffect(() => {
    if (!room) return;
    loadMessages();
    pollRef.current = setInterval(loadMessages, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [room, loadMessages]);

  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text || !room || sending) return;
    setSending(true);
    setInputText("");
    try {
      await chatsApi.sendMessage(room.id, { text });
      await loadMessages();
    } catch (err) {
      setInputText(text);
      setPopup({
        visible: true,
        type: "error",
        title: "Message not sent",
        message: getApiErrorMessage(err, "Could not send message."),
      });
    } finally {
      setSending(false);
    }
  };

  const openRoom = (next: ChatRoom) => {
    router.push({ pathname: "/chat", params: { roomId: String(next.id) } } as never);
  };

  const showThread = Boolean(room) || Boolean(roomId || bookingId);

  /* ------------------------------------------------------------------ */
  /* Conversation list pane                                             */
  /* ------------------------------------------------------------------ */
  const listPane = (
    <Card padding="none" style={styles.listPane}>
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Conversations</Text>
        <Badge label={`${rooms.length}`} tone="neutral" />
      </View>

      {roomsLoading ? (
        <View style={styles.listLoading}>
          <ListSkeleton rows={4} />
        </View>
      ) : roomsError ? (
        <View style={styles.listLoading}>
          <ErrorState description={roomsError} onRetry={loadRooms} />
        </View>
      ) : rooms.length === 0 ? (
        <View style={styles.listLoading}>
          <EmptyState
            icon="chat"
            title="No conversations yet"
            description="A chat opens automatically with each booking once it is confirmed."
            actionLabel="Browse services"
            onAction={() => router.push("/search")}
            bare
          />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {rooms.map((item) => {
            const active = room?.id === item.id;
            const preview = item.last_message?.text?.trim() || "No messages yet";
            const time = item.last_message?.created_at
              ? new Date(item.last_message.created_at).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                })
              : "";

            return (
              <Pressable
                key={item.id}
                onPress={() => openRoom(item)}
                accessibilityRole="button"
                accessibilityLabel={`Open conversation with ${item.other_user_name}`}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  styles.roomRow,
                  hovered ? styles.roomRowHover : null,
                  active ? styles.roomRowActive : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Avatar
                  uri={item.other_user_photo ? resolveMediaUrl(item.other_user_photo) : undefined}
                  name={item.other_user_name}
                  size={44}
                />
                <View style={styles.roomInfo}>
                  <View style={styles.roomTop}>
                    <Text style={styles.roomName} numberOfLines={1}>
                      {item.other_user_name}
                    </Text>
                    <Text style={styles.roomTime}>{time}</Text>
                  </View>
                  <Text style={styles.roomService} numberOfLines={1}>
                    {item.service_title}
                  </Text>
                  <Text style={styles.roomPreview} numberOfLines={1}>
                    {preview}
                  </Text>
                </View>
                {item.unread_count > 0 ? (
                  <View style={styles.unread}>
                    <Text style={styles.unreadText}>{item.unread_count}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </Card>
  );

  /* ------------------------------------------------------------------ */
  /* Thread pane                                                        */
  /* ------------------------------------------------------------------ */
  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMe = item.sender === currentUserId;
    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowMine : null]}>
        {!isMe ? (
          <Avatar
            uri={room?.other_user_photo ? resolveMediaUrl(room.other_user_photo) : undefined}
            name={item.sender_name || room?.other_user_name}
            size={30}
            style={styles.msgAvatar}
          />
        ) : null}

        <View style={[styles.bubble, isMe ? styles.bubbleMine : styles.bubbleOther]}>
          {item.text ? (
            <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMine : null]}>{item.text}</Text>
          ) : null}
          {item.image_url ? (
            <Image
              source={{ uri: resolveMediaUrl(item.image_url) }}
              style={styles.bubbleImage}
              contentFit="cover"
            />
          ) : null}
          <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMine : null]}>
            {new Date(item.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
      </View>
    );
  };

  const threadPane = (
    <Card padding="none" style={styles.threadPane}>
      {room ? (
        <View style={styles.threadHeader}>
          {!isDesktop ? (
            <Pressable
              onPress={() => router.push("/chat")}
              accessibilityRole="button"
              accessibilityLabel="Back to conversations"
              style={styles.threadBack}
            >
              <Icon name="chevron-left" size={14} color={colors.primary} />
            </Pressable>
          ) : null}

          <Avatar
            uri={room.other_user_photo ? resolveMediaUrl(room.other_user_photo) : undefined}
            name={room.other_user_name}
            size={42}
          />
          <View style={styles.threadInfo}>
            <Text style={styles.threadName} numberOfLines={1}>
              {room.other_user_name}
            </Text>
            <Text style={styles.threadService} numberOfLines={1}>
              {room.service_title}
            </Text>
          </View>
          <Badge
            label={room.is_active ? "Booking active" : "Booking closed"}
            tone={room.is_active ? "success" : "neutral"}
            dot
          />
        </View>
      ) : null}

      {loading ? (
        <LoadingState label="Opening conversation…" />
      ) : threadError ? (
        <View style={styles.threadState}>
          <ErrorState description={threadError} onRetry={loadRoom} />
        </View>
      ) : !room ? (
        <View style={styles.threadState}>
          <EmptyState
            icon="chat"
            title="Select a conversation"
            description="Choose a conversation from the list to read the messages and reply."
            bare
          />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMessage}
          contentContainerStyle={styles.msgList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyThread}>
              <Icon name="chat" size={22} color={colors.primary} />
              <Text style={styles.emptyThreadTitle}>No messages yet</Text>
              <Text style={styles.emptyThreadText}>
                Say hello and confirm the details of your booking.
              </Text>
            </View>
          }
        />
      )}

      {room ? (
        <View style={[styles.inputBar, { paddingBottom: (isDesktop ? 0 : insets.bottom) + spacing.md }]}>
          <TextInput
            style={styles.input}
            placeholder="Write a message…"
            placeholderTextColor={colors.textSubtle}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={2000}
            onSubmitEditing={sendMessage}
            blurOnSubmit={false}
            accessibilityLabel="Message"
          />
          <Button
            label="Send"
            icon="arrow-right"
            disabled={!inputText.trim() || sending}
            loading={sending}
            onPress={sendMessage}
          />
        </View>
      ) : null}
    </Card>
  );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Container style={styles.content}>
          <PageHeader
            eyebrow="Messages"
            title="Your conversations"
            subtitle="Chat opens with a booking once the provider confirms it."
            onBack={() => router.back()}
          />

          {isDesktop ? (
            <View style={styles.split}>
              <View style={styles.listColumn}>{listPane}</View>
              <View style={styles.threadColumn}>{threadPane}</View>
            </View>
          ) : showThread ? (
            threadPane
          ) : (
            listPane
          )}
        </Container>
      </ScrollView>

      <FeedbackModal
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={() => setPopup((p) => ({ ...p, visible: false }))}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1 },
  content: { paddingTop: spacing.xl, paddingBottom: spacing.giant, flex: 1 },
  split: { flexDirection: "row", gap: spacing.xl, alignItems: "flex-start", flex: 1 },
  listColumn: { width: 330, flexShrink: 0 },
  threadColumn: { flex: 1, minWidth: 0 },

  listPane: { overflow: "hidden", maxHeight: 620 },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listTitle: { ...typography.h4, color: colors.text },
  listLoading: { padding: spacing.lg },

  roomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  roomRowHover: { backgroundColor: colors.surfaceAlt },
  roomRowActive: { backgroundColor: colors.primarySoft },
  roomInfo: { flex: 1, gap: 2, minWidth: 0 },
  roomTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  roomName: { ...typography.bodyStrong, color: colors.text, flexShrink: 1 },
  roomTime: { fontSize: 11, color: colors.textSubtle },
  roomService: { fontSize: 12, color: colors.primaryDark, fontWeight: weight.medium },
  roomPreview: { fontSize: 12.5, color: colors.textMuted },
  unread: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadText: { color: colors.textInverse, fontSize: 11, fontWeight: weight.bold },

  threadPane: { overflow: "hidden", flex: 1, minHeight: 480 },
  threadHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  threadBack: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  threadInfo: { flex: 1, minWidth: 0 },
  threadName: { ...typography.bodyStrong, color: colors.text },
  threadService: { fontSize: 12.5, color: colors.textMuted },

  threadState: { padding: spacing.xl },
  msgList: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.sm },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  msgRowMine: { flexDirection: "row-reverse" },
  msgAvatar: { marginBottom: 2 },
  bubble: {
    maxWidth: "76%",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.lg,
    gap: spacing.xs,
  },
  bubbleOther: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: radius.xs,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: radius.xs,
    ...shadows.xs,
  },
  bubbleText: { fontSize: 14.5, lineHeight: 21, color: colors.text },
  bubbleTextMine: { color: colors.textInverse },
  bubbleImage: { width: 210, height: 150, borderRadius: radius.md },
  bubbleTime: { fontSize: 10.5, color: colors.textSubtle, alignSelf: "flex-end" },
  bubbleTimeMine: { color: "rgba(255,255,255,0.78)" },

  emptyThread: { alignItems: "center", paddingVertical: spacing.giant, gap: spacing.sm },
  emptyThreadTitle: { ...typography.h4, color: colors.text },
  emptyThreadText: { ...typography.small, color: colors.textMuted, textAlign: "center" },

  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.md,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    maxHeight: 120,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  pressed: { opacity: 0.85 },
});
