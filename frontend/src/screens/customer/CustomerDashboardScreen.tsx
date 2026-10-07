/**
 * CustomerDashboardScreen — the customer's account + activity hub.
 *
 * Summary cards, the next appointment, the full booking history (with cancel),
 * recently viewed services and recent searches. Every number is derived from
 * the bookings/profile the API returns — nothing is estimated.
 */
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import axios from "axios";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter, useFocusEffect } from "expo-router";

import FeedbackModal from "../../components/FeedbackModal";
import ProfileSection from "../../components/ProfileSection";
import ServiceCard from "../../components/ServiceCard";
import Badge, { StatusBadge } from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card, { SectionCard } from "../../components/ui/Card";
import Icon from "../../components/ui/Icon";
import { Container, StatCard } from "../../components/ui/Layout";
import PageHeader from "../../components/ui/PageHeader";
import { EmptyState, ErrorState } from "../../components/ui/States";
import { ListSkeleton, StatSkeleton } from "../../components/ui/Skeleton";
import { bookingsApi, type BookingItem } from "../../services/api/bookingsApi";
import { getApiErrorMessage } from "../../services/api/client";
import { userApi, type UserProfile } from "../../services/api/userApi";
import { getAuth, logout } from "../../auth/auth";
import { StorageKeys, setItem } from "../../utils/storage";
import { canCancelBooking } from "../../utils/bookingHelpers";
import {
  clearActivityHistory,
  getSearchHistory,
  getViewedServices,
  type SearchHistoryItem,
  type ViewedService,
} from "../../utils/activityHistory";
import { colors, radius, spacing, typography, weight } from "../../theme/tokens";
import { useResponsive } from "../../theme/responsive";

export default function CustomerDashboardScreen() {
  const router = useRouter();
  const { isDesktop } = useResponsive();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [viewed, setViewed] = useState<ViewedService[]>([]);
  const [searches, setSearches] = useState<SearchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [popup, setPopup] = useState({ visible: false, title: "", message: "" });

  const load = useCallback(async () => {
    const auth = await getAuth();
    if (!auth.token) {
      router.replace("/login");
      return;
    }

    setError(null);
    try {
      const [userProfile, userBookings, viewedServices, searchHistory] = await Promise.all([
        userApi.me(),
        bookingsApi.listBookings().catch(() => []),
        getViewedServices(),
        getSearchHistory(),
      ]);

      setProfile(userProfile);
      if (userProfile.role === "provider" && userProfile.kyc_status) {
        await setItem(StorageKeys.KYC_STATUS, userProfile.kyc_status);
      }
      setBookings(userBookings);
      setViewed(viewedServices);
      setSearches(searchHistory);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }
      setError(
        axios.isAxiosError(err)
          ? getApiErrorMessage(err, "We could not load your dashboard.")
          : "We could not load your dashboard. Please try again."
      );
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

  const stats = useMemo(() => {
    const now = Date.now();
    const active = bookings.filter((b) => b.status !== "cancelled" && b.status !== "rejected");
    const upcoming = active.filter(
      (b) => b.booking_time && new Date(b.booking_time).getTime() > now
    );
    const completed = bookings.filter(
      (b) => b.status === "completed" || b.status === "reviewed"
    );
    const cancelled = bookings.filter(
      (b) => b.status === "cancelled" || b.status === "rejected" || b.status === "expired"
    );
    return { total: bookings.length, upcoming, completed, cancelled, active };
  }, [bookings]);

  const nextBooking = useMemo(() => {
    return [...stats.upcoming].sort(
      (a, b) => new Date(a.booking_time ?? 0).getTime() - new Date(b.booking_time ?? 0).getTime()
    )[0];
  }, [stats.upcoming]);

  const cancelBooking = async (id: number) => {
    setCancellingId(id);
    try {
      await bookingsApi.cancelBooking(id);
      setPopup({
        visible: true,
        title: "Booking cancelled",
        message: "Your booking was cancelled and the time slot is available again.",
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

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return "Time to be confirmed";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "Time to be confirmed";
    return date.toLocaleString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const openService = async (service: ViewedService) => {
    const auth = await getAuth();
    if (auth.role?.toLowerCase() === "provider" && service.is_mine) {
      router.replace("/provider-services");
      return;
    }
    router.push(`/service/${service.id}` as never);
  };

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Container style={styles.content}>
          <PageHeader
            eyebrow="My account"
            title={profile ? `Welcome back, ${profile.username}` : "Your dashboard"}
            subtitle="Bookings, activity and account details in one place."
            actions={
              <>
                <Button
                  label="Browse services"
                  variant="outline"
                  size="sm"
                  icon="search"
                  onPress={() => router.push("/search")}
                />
                <Button
                  label="Messages"
                  variant="secondary"
                  size="sm"
                  icon="chat"
                  onPress={() => router.push("/chat")}
                />
              </>
            }
          />

          {error ? <ErrorState description={error} onRetry={load} /> : null}

          {loading ? (
            <>
              <StatSkeleton tiles={4} />
              <View style={{ height: spacing.xl }} />
              <ListSkeleton rows={3} />
            </>
          ) : (
            <>
              {/* Summary */}
              <View style={styles.statsRow}>
                <StatCard label="Bookings" value={stats.total} icon="calendar" hint="All time" />
                <StatCard
                  label="Upcoming"
                  value={stats.upcoming.length}
                  icon="clock"
                  tone="success"
                  hint="Scheduled ahead"
                />
                <StatCard
                  label="Completed"
                  value={stats.completed.length}
                  icon="check"
                  tone="success"
                  hint="Finished services"
                />
                <StatCard
                  label="Cancelled"
                  value={stats.cancelled.length}
                  icon="close"
                  tone="neutral"
                  hint="Cancelled or expired"
                />
              </View>

              <View style={[styles.layout, isDesktop ? styles.layoutDesktop : null]}>
                <View style={styles.main}>
                  {/* Next appointment */}
                  <SectionCard
                    title="Next appointment"
                    subtitle="Your soonest confirmed or pending booking."
                    style={styles.section}
                  >
                    {nextBooking ? (
                      <View style={styles.nextCard}>
                        <View style={styles.nextTop}>
                          <View style={styles.nextIcon}>
                            <Icon name="calendar" size={18} color={colors.primaryDark} />
                          </View>
                          <View style={styles.nextInfo}>
                            <Text style={styles.nextTitle} numberOfLines={1}>
                              {nextBooking.service_title || `Service #${nextBooking.service}`}
                            </Text>
                            <Text style={styles.nextMeta}>
                              {formatDateTime(nextBooking.booking_time)}
                              {nextBooking.provider_name ? ` · ${nextBooking.provider_name}` : ""}
                            </Text>
                            {nextBooking.location_city || nextBooking.location_address ? (
                              <Text style={styles.nextMeta}>
                                {[nextBooking.location_address, nextBooking.location_city]
                                  .filter(Boolean)
                                  .join(", ")}
                              </Text>
                            ) : null}
                          </View>
                          <StatusBadge status={nextBooking.status} size="md" />
                        </View>

                        <View style={styles.nextActions}>
                          {nextBooking.status === "confirmed" || nextBooking.chat_available ? (
                            <Button
                              label="Message provider"
                              variant="secondary"
                              size="sm"
                              icon="chat"
                              onPress={() =>
                                router.push({
                                  pathname: "/chat",
                                  params: { bookingId: String(nextBooking.id) },
                                } as never)
                              }
                            />
                          ) : null}
                          {nextBooking.service ? (
                            <Button
                              label="View service"
                              variant="ghost"
                              size="sm"
                              onPress={() =>
                                router.push(`/service/${nextBooking.service}` as never)
                              }
                            />
                          ) : null}
                          {canCancelBooking(nextBooking.booking_time, nextBooking.can_cancel) ? (
                            <Button
                              label="Cancel booking"
                              variant="danger"
                              size="sm"
                              loading={cancellingId === nextBooking.id}
                              onPress={() => cancelBooking(nextBooking.id)}
                            />
                          ) : (
                            <Text style={styles.tooLate}>
                              Within 24 hours — contact the provider to change this booking.
                            </Text>
                          )}
                        </View>
                      </View>
                    ) : (
                      <EmptyState
                        icon="calendar"
                        title="No upcoming services"
                        description="Your upcoming services will appear here as soon as you book one."
                        actionLabel="Find a professional"
                        onAction={() => router.push("/search")}
                        bare
                      />
                    )}
                  </SectionCard>

                  {/* Booking history */}
                  <SectionCard
                    title="Booking history"
                    subtitle={`${bookings.length} booking${bookings.length === 1 ? "" : "s"} in total.`}
                    style={styles.section}
                  >
                    {bookings.length === 0 ? (
                      <EmptyState
                        icon="calendar"
                        title="No bookings yet"
                        description="Your upcoming services will appear here."
                        actionLabel="Browse services"
                        onAction={() => router.push("/search")}
                        bare
                      />
                    ) : (
                      <View style={styles.bookingList}>
                        {bookings.map((booking, index) => (
                          <Animated.View
                            key={booking.id}
                            entering={FadeInDown.delay(Math.min(index, 6) * 40).duration(300)}
                          >
                            <View style={styles.bookingRow}>
                              <View style={styles.bookingMain}>
                                <Text style={styles.bookingTitle} numberOfLines={1}>
                                  {booking.service_title || `Service #${booking.service}`}
                                </Text>
                                <Text style={styles.bookingMeta}>
                                  {formatDateTime(booking.booking_time)}
                                  {booking.provider_name ? ` · ${booking.provider_name}` : ""}
                                </Text>
                                {booking.agreed_price || booking.proposed_price ? (
                                  <Text style={styles.bookingPrice}>
                                    Rs{" "}
                                    {Number.parseFloat(
                                      String(booking.agreed_price ?? booking.proposed_price)
                                    ).toFixed(0)}
                                    {booking.agreed_price ? " agreed" : " proposed"}
                                  </Text>
                                ) : null}
                              </View>

                              <View style={styles.bookingAside}>
                                <StatusBadge status={booking.status} />
                                <View style={styles.bookingActions}>
                                  {booking.service &&
                                  booking.provider &&
                                  booking.status !== "cancelled" ? (
                                    <Button
                                      label="Message"
                                      variant="ghost"
                                      size="sm"
                                      onPress={() =>
                                        router.push({
                                          pathname: "/chat",
                                          params: { bookingId: String(booking.id) },
                                        } as never)
                                      }
                                    />
                                  ) : null}
                                  {booking.status !== "cancelled" &&
                                  booking.status !== "completed" &&
                                  booking.status !== "reviewed" &&
                                  canCancelBooking(booking.booking_time, booking.can_cancel) ? (
                                    <Button
                                      label="Cancel"
                                      variant="ghost"
                                      size="sm"
                                      loading={cancellingId === booking.id}
                                      onPress={() => cancelBooking(booking.id)}
                                    />
                                  ) : null}
                                </View>
                              </View>
                            </View>
                          </Animated.View>
                        ))}
                      </View>
                    )}
                  </SectionCard>
                </View>

                {/* Side rail */}
                <View style={[styles.rail, isDesktop ? styles.railDesktop : null]}>
                  <ProfileSection profile={profile} onUpdated={setProfile} />

                  <Card padding="lg" style={styles.section}>
                    <View style={styles.railHeader}>
                      <Text style={styles.railTitle}>Recently viewed</Text>
                      <Badge label={`${viewed.length}`} tone="neutral" />
                    </View>
                    {viewed.length === 0 ? (
                      <Text style={styles.railEmpty}>
                        Services you open will appear here for a quick return.
                      </Text>
                    ) : (
                      <View style={styles.viewedList}>
                        {viewed.slice(0, 5).map((item, index) => (
                          <ServiceCard
                            key={`${item.id}-${item.viewedAt}`}
                            variant="row"
                            index={index}
                            service={
                              {
                                id: item.id,
                                title: item.title,
                                provider_name: item.provider_name ?? "",
                                provider: 0,
                                provider_verified: false,
                                is_mine: item.is_mine,
                                description: "",
                                price: "0",
                                location: "",
                                created_at: item.viewedAt,
                              } as never
                            }
                            onPress={() => openService(item)}
                          />
                        ))}
                      </View>
                    )}
                  </Card>

                  <Card padding="lg" style={styles.section}>
                    <View style={styles.railHeader}>
                      <Text style={styles.railTitle}>Recent searches</Text>
                      <Badge label={`${searches.length}`} tone="neutral" />
                    </View>
                    {searches.length === 0 ? (
                      <Text style={styles.railEmpty}>Your search history will show here.</Text>
                    ) : (
                      <View style={styles.searchChips}>
                        {searches.slice(0, 8).map((item) => (
                          <Pressable
                            key={`${item.query}-${item.searchedAt}`}
                            onPress={() =>
                              router.push({
                                pathname: "/search",
                                params: { q: item.query },
                              } as never)
                            }
                            accessibilityRole="button"
                            accessibilityLabel={`Search again for ${item.query}`}
                            style={({ pressed }: { pressed: boolean }) => [
                              styles.searchChip,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Icon name="search" size={12} color={colors.textMuted} />
                            <Text style={styles.searchChipText}>{item.query}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}

                    {viewed.length > 0 || searches.length > 0 ? (
                      <Button
                        label="Clear activity history"
                        variant="ghost"
                        size="sm"
                        style={{ marginTop: spacing.md }}
                        onPress={async () => {
                          await clearActivityHistory();
                          setViewed([]);
                          setSearches([]);
                        }}
                      />
                    ) : null}
                  </Card>
                </View>
              </View>
            </>
          )}
        </Container>
      </ScrollView>

      <FeedbackModal
        visible={popup.visible}
        type="info"
        title={popup.title}
        message={popup.message}
        onClose={() => setPopup((p) => ({ ...p, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing.xxl, paddingBottom: spacing.giant },
  statsRow: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap", marginBottom: spacing.xxl },
  layout: { gap: spacing.xxl },
  layoutDesktop: { flexDirection: "row", alignItems: "flex-start" },
  main: { flex: 1, gap: spacing.xxl, minWidth: 0 },
  rail: { width: "100%" },
  railDesktop: { width: 380, flexShrink: 0, gap: spacing.xxl },
  section: { marginBottom: 0 },

  nextCard: { gap: spacing.lg },
  nextTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  nextIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  nextInfo: { flex: 1, gap: 2 },
  nextTitle: { ...typography.h4, color: colors.text },
  nextMeta: { ...typography.small, color: colors.textMuted },
  nextActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  tooLate: { ...typography.caption, color: colors.textSubtle, fontStyle: "italic" },

  bookingList: { gap: spacing.md },
  bookingRow: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  bookingMain: { flex: 1, minWidth: 180, gap: 2 },
  bookingTitle: { ...typography.bodyStrong, color: colors.text },
  bookingMeta: { ...typography.small, color: colors.textMuted },
  bookingPrice: { ...typography.caption, color: colors.primaryDark, fontWeight: weight.semibold },
  bookingAside: { alignItems: "flex-end", gap: spacing.sm },
  bookingActions: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap", justifyContent: "flex-end" },

  railHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  railTitle: { ...typography.h4, color: colors.text },
  railEmpty: { ...typography.small, color: colors.textMuted },
  viewedList: { gap: spacing.sm },
  searchChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  searchChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  searchChipText: { fontSize: 12.5, color: colors.text, fontWeight: weight.medium },
  pressed: { opacity: 0.7 },
});
