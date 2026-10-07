import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import axios from "axios";
import { useRouter, useFocusEffect } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import ScreenShell from "../../components/ScreenShell";
import ProfileSection from "../../components/ProfileSection";
import { bookingsApi, type BookingItem } from "../../services/api/bookingsApi";
import { userApi, type UserProfile } from "../../services/api/userApi";
import { getApiErrorMessage } from "../../services/api/client";
import FeedbackModal from "../../components/FeedbackModal";
import { StorageKeys, setItem } from "../../utils/storage";
import {
  getViewedServices,
  getSearchHistory,
  clearActivityHistory,
  type ViewedService,
  type SearchHistoryItem,
} from "../../utils/activityHistory";
import { getAuth, logout } from "../../auth/auth";
import { canCancelBooking } from "../../utils/bookingHelpers";
import {
  CARD,
  TEXT,
  TEXT_MUTED,
  BORDER,
  PRIMARY,
  TAG_BG,
} from "../../theme/colors";

export default function CustomerDashboardScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [viewed, setViewed] = useState<ViewedService[]>([]);
  const [searches, setSearches] = useState<SearchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [popup, setPopup] = useState({ visible: false, title: "", message: "" });

  const load = useCallback(async () => {
    const auth = await getAuth();
    if (!auth.token) {
      router.replace("/login");
      return;
    }
    try {
      const [p, b, v, s] = await Promise.all([
        userApi.me(),
        bookingsApi.listBookings().catch(() => []),
        getViewedServices(),
        getSearchHistory(),
      ]);
      setProfile(p);
      if (p.role === "provider" && p.kyc_status) {
        await setItem(StorageKeys.KYC_STATUS, p.kyc_status);
      }
      setBookings(b);
      setViewed(v);
      setSearches(s);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const cancelBooking = async (id: number) => {
    setCancellingId(id);
    try {
      await bookingsApi.cancelBooking(id);
      setPopup({
        visible: true,
        title: "Cancelled",
        message: "Your booking was cancelled. The time slot is available again.",
      });
      await load();
    } catch (err) {
      setPopup({
        visible: true,
        title: "Cancel failed",
        message: getApiErrorMessage(err, "Could not cancel booking."),
      });
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <ScreenShell
      step="My account"
      title="Your dashboard"
      subtitle="Recent activity, searches, and bookings in one place."
      scroll
    >
      <View style={styles.wrap}>
        {loading ? (
          <ActivityIndicator color={PRIMARY} style={{ marginVertical: 32 }} />
        ) : (
          <>
            <ProfileSection profile={profile} onUpdated={setProfile} />

            <Section title="Booked services">
              {bookings.length === 0 ? (
                <Empty text="No bookings yet. Browse services to book." />
              ) : (
                bookings.map((b, i) => (
                  <Animated.View key={b.id} entering={FadeInDown.delay(i * 40).duration(300)}>
                    <View style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{b.service_title || `Service #${b.service}`}</Text>
                        <Text style={styles.rowMeta}>
                          {b.booking_time ? formatDate(b.booking_time) : "Time pending"}
                        </Text>
                      </View>
                      <View style={[styles.badge, b.status === "cancelled" && styles.badgeMuted]}>
                        <Text style={styles.badgeText}>{b.status}</Text>
                      </View>
                    </View>
                    {b.status !== "cancelled" &&
                      canCancelBooking(b.booking_time, b.can_cancel) && (
                        <TouchableOpacity
                          style={styles.cancelRow}
                          disabled={cancellingId === b.id}
                          onPress={() => cancelBooking(b.id)}
                        >
                          {cancellingId === b.id ? (
                            <ActivityIndicator color={PRIMARY} size="small" />
                          ) : (
                            <Text style={styles.cancelLink}>Cancel booking (24h+ before)</Text>
                          )}
                        </TouchableOpacity>
                      )}
                    {b.status !== "cancelled" &&
                      !canCancelBooking(b.booking_time, b.can_cancel) && (
                        <Text style={styles.tooLate}>Within 24 hours — contact provider</Text>
                      )}
                  </Animated.View>
                ))
              )}
            </Section>

            <Section title="Recently viewed">
              {viewed.length === 0 ? (
                <Empty text="Services you open will appear here." />
              ) : (
                viewed.map((v, i) => (
                  <Animated.View key={`${v.id}-${v.viewedAt}`} entering={FadeInDown.delay(i * 40).duration(300)}>
                    <TouchableOpacity
                      style={styles.row}
                      onPress={async () => {
                        const auth = await getAuth();
                        if (auth.role?.toLowerCase() === "provider" && v.is_mine) {
                          router.replace("/provider-services");
                          return;
                        }
                        router.push(`/service/${v.id}` as never);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{v.title}</Text>
                        <Text style={styles.rowMeta}>
                          {v.provider_name ? `${v.provider_name} · ` : ""}
                          {formatDate(v.viewedAt)}
                        </Text>
                      </View>
                      <Text style={styles.link}>View</Text>
                    </TouchableOpacity>
                  </Animated.View>
                ))
              )}
            </Section>

            <Section title="Recent searches">
              {searches.length === 0 ? (
                <Empty text="Your search history will show here." />
              ) : (
                searches.map((s, i) => (
                  <Animated.View key={`${s.query}-${s.searchedAt}`} entering={FadeInDown.delay(i * 40).duration(300)}>
                    <TouchableOpacity
                      style={styles.row}
                      onPress={() => router.push({ pathname: "/search", params: { q: s.query } } as never)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{s.query}</Text>
                        <Text style={styles.rowMeta}>{formatDate(s.searchedAt)}</Text>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                ))
              )}
            </Section>

            {(viewed.length > 0 || searches.length > 0) && (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={async () => {
                  await clearActivityHistory();
                  setViewed([]);
                  setSearches([]);
                }}
              >
                <Text style={styles.clearText}>Clear search & view history</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      <FeedbackModal
        visible={popup.visible}
        type="info"
        title={popup.title}
        message={popup.message}
        onClose={() => setPopup((p) => ({ ...p, visible: false }))}
      />
    </ScreenShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.container}>{children}</View>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: TEXT, marginBottom: 10 },
  container: {
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  rowTitle: { fontSize: 15, fontWeight: "600", color: TEXT },
  rowMeta: { fontSize: 13, color: TEXT_MUTED, marginTop: 4 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: TAG_BG,
  },
  badgeMuted: { opacity: 0.7 },
  badgeText: { fontSize: 12, fontWeight: "700", color: TEXT, textTransform: "capitalize" },
  link: { color: PRIMARY, fontWeight: "700", fontSize: 14 },
  empty: { padding: 20 },
  emptyText: { color: TEXT_MUTED, fontSize: 14, lineHeight: 20 },
  clearBtn: {
    alignItems: "center",
    paddingVertical: 14,
    marginBottom: 20,
  },
  clearText: { color: TEXT_MUTED, fontWeight: "600" },
  cancelRow: { paddingHorizontal: 16, paddingBottom: 12 },
  cancelLink: { color: PRIMARY, fontWeight: "700", fontSize: 13 },
  tooLate: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontStyle: "italic",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
});
