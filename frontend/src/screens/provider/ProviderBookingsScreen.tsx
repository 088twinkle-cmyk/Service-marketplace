import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import axios from "axios";
import { useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import ScreenShell from "../../components/ScreenShell";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import { bookingsApi, type BookingItem } from "../../services/api/bookingsApi";
import { getApiErrorMessage } from "../../services/api/client";
import { getAuth, logout } from "../../auth/auth";
import { canCancelBooking } from "../../utils/bookingHelpers";
import { CARD, TEXT, TEXT_MUTED, BORDER, PRIMARY } from "../../theme/colors";

export default function ProviderBookingsScreen() {
  const router = useRouter();
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [acceptingId, setAcceptingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [popup, setPopup] = useState({
    visible: false,
    type: "info" as FeedbackType,
    title: "",
    message: "",
  });

  const load = useCallback(async () => {
    const auth = await getAuth();
    if (!auth.token) {
      router.replace("/login");
      return;
    }
    try {
      const data = await bookingsApi.listBookings();
      setBookings(data);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }
      setBookings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const cancel = async (id: number) => {
    setCancellingId(id);
    try {
      await bookingsApi.cancelBooking(id);
      setPopup({
        visible: true,
        type: "success",
        title: "Booking cancelled",
        message: "The calendar slot is available again.",
      });
      await load();
    } catch (err) {
      setPopup({
        visible: true,
        type: "error",
        title: "Cancel failed",
        message: getApiErrorMessage(err, "Could not cancel booking."),
      });
    } finally {
      setCancellingId(null);
    }
  };

  const accept = async (id: number) => {
    setAcceptingId(id);
    try {
      await bookingsApi.acceptBooking(id);
      setPopup({
        visible: true,
        type: "success",
        title: "Booking accepted",
        message: "Customer has been notified by email.",
      });
      await load();
    } catch (err) {
      setPopup({
        visible: true,
        type: "error",
        title: "Accept failed",
        message: getApiErrorMessage(err, "Could not accept booking."),
      });
    } finally {
      setAcceptingId(null);
    }
  };

  const reject = async (id: number) => {
    setRejectingId(id);
    try {
      await bookingsApi.rejectBooking(id);
      setPopup({
        visible: true,
        type: "success",
        title: "Booking rejected",
        message: "Booking was cancelled and customer has been notified by email.",
      });
      await load();
    } catch (err) {
      setPopup({
        visible: true,
        type: "error",
        title: "Reject failed",
        message: getApiErrorMessage(err, "Could not reject booking."),
      });
    } finally {
      setRejectingId(null);
    }
  };

  return (
    <ScreenShell
      showBack
      step="Provider"
      title="Your bookings"
      subtitle="Cancel a booking to release the date on your calendar."
    >
      {loading ? (
        <ActivityIndicator color={PRIMARY} style={{ marginTop: 24 }} />
      ) : bookings.length === 0 ? (
        <Text style={styles.empty}>No bookings yet.</Text>
      ) : (
        bookings.map((b, i) => (
          <Animated.View
            key={b.id}
            entering={FadeInDown.delay(i * 60).duration(350)}
            style={styles.card}
          >
            <Text style={styles.service}>{b.service_title || `Service #${b.service}`}</Text>
            <Text style={styles.meta}>
              {b.booking_time
                ? new Date(b.booking_time).toLocaleString()
                : "Time pending"}
            </Text>
            <View style={styles.row}>
              <View
                style={[
                  styles.badge,
                  b.status === "cancelled" && styles.badgeCancelled,
                  b.status === "confirmed" && styles.badgeConfirmed,
                ]}
              >
                <Text style={styles.badgeText}>{b.status}</Text>
              </View>
              {b.status === "pending" ? (
                <View style={styles.pendingActions}>
                  <TouchableOpacity
                    style={styles.acceptBtn}
                    disabled={acceptingId === b.id}
                    onPress={() => accept(b.id)}
                  >
                    {acceptingId === b.id ? (
                      <ActivityIndicator color={PRIMARY} size="small" />
                    ) : (
                      <Text style={styles.acceptText}>Accept</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectBtn}
                    disabled={rejectingId === b.id}
                    onPress={() => reject(b.id)}
                  >
                    {rejectingId === b.id ? (
                      <ActivityIndicator color="#B91C1C" size="small" />
                    ) : (
                      <Text style={styles.rejectText}>Reject</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : null}
              {b.status === "confirmed" ? (
                <TouchableOpacity
                  style={styles.chatBtn}
                  onPress={() => router.push({ pathname: "/chat", params: { bookingId: String(b.id) } } as never)}
                >
                  <Text style={styles.chatBtnText}>Chat</Text>
                </TouchableOpacity>
              ) : null}
              {b.status !== "cancelled" && b.status !== "confirmed" && canCancelBooking(b.booking_time, b.can_cancel) ? (
                <TouchableOpacity
                  style={styles.cancelBtn}
                  disabled={cancellingId === b.id}
                  onPress={() => cancel(b.id)}
                >
                  {cancellingId === b.id ? (
                    <ActivityIndicator color={PRIMARY} size="small" />
                  ) : (
                    <Text style={styles.cancelText}>Cancel (24h+ before)</Text>
                  )}
                </TouchableOpacity>
              ) : b.status !== "cancelled" ? (
                <Text style={styles.tooLate}>Within 24h — cannot cancel</Text>
              ) : null}
            </View>
          </Animated.View>
        ))
      )}

      <FeedbackModal
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={() => setPopup((p) => ({ ...p, visible: false }))}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  empty: { color: TEXT_MUTED, textAlign: "center", marginTop: 24 },
  card: {
    backgroundColor: CARD,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 12,
  },
  service: { fontSize: 16, fontWeight: "700", color: TEXT },
  meta: { color: TEXT_MUTED, marginTop: 6, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: "#FFF7ED",
  },
  badgeConfirmed: { backgroundColor: "#ECFDF5" },
  badgeCancelled: { backgroundColor: "#F3F4F6" },
  badgeText: { fontSize: 12, fontWeight: "700", color: TEXT, textTransform: "capitalize" },
  pendingActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  acceptBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#86EFAC",
  },
  acceptText: { color: "#166534", fontWeight: "700", fontSize: 13 },
  rejectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  rejectText: { color: "#B91C1C", fontWeight: "700", fontSize: 13 },
  cancelBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  cancelText: { color: PRIMARY, fontWeight: "700", fontSize: 13 },
  chatBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: PRIMARY,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  chatBtnText: { color: PRIMARY, fontWeight: "700", fontSize: 14 },
  tooLate: { fontSize: 12, color: TEXT_MUTED, fontStyle: "italic" },
});
