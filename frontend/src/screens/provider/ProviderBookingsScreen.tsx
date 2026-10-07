/**
 * ProviderBookingsScreen — incoming booking requests and their lifecycle.
 *
 * Same API calls as before (list, accept, reject, cancel, chat) with status
 * filters, clear per-booking actions and honest empty/loading/error states.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import axios from "axios";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";

import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Icon from "../../components/ui/Icon";
import { Chip, Container, StatCard } from "../../components/ui/Layout";
import PageHeader from "../../components/ui/PageHeader";
import { EmptyState, ErrorState } from "../../components/ui/States";
import { ListSkeleton } from "../../components/ui/Skeleton";
import { StatusBadge } from "../../components/ui/Badge";
import { bookingsApi, type BookingItem } from "../../services/api/bookingsApi";
import { getApiErrorMessage } from "../../services/api/client";
import { getAuth, logout } from "../../auth/auth";
import { canCancelBooking } from "../../utils/bookingHelpers";
import { colors, radius, spacing, typography, weight } from "../../theme/tokens";
import { useResponsive } from "../../theme/responsive";

type FilterKey = "all" | "pending" | "active" | "completed" | "closed";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "active", label: "Confirmed" },
  { key: "completed", label: "Completed" },
  { key: "closed", label: "Cancelled" },
];

export default function ProviderBookingsScreen() {
  const router = useRouter();
  const { isDesktop } = useResponsive();

  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
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

    setError(null);
    try {
      const data = await bookingsApi.listBookings();
      setBookings(data);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }
      setError(getApiErrorMessage(err, "We could not load your bookings."));
      setBookings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const notify = (type: FeedbackType, title: string, message: string) =>
    setPopup({ visible: true, type, title, message });

  const cancel = async (id: number) => {
    setCancellingId(id);
    try {
      await bookingsApi.cancelBooking(id);
      notify("success", "Booking cancelled", "The calendar slot is available again.");
      await load();
    } catch (err) {
      notify("error", "Cancel failed", getApiErrorMessage(err, "Could not cancel booking."));
    } finally {
      setCancellingId(null);
    }
  };

  const accept = async (id: number) => {
    setAcceptingId(id);
    try {
      await bookingsApi.acceptBooking(id);
      notify("success", "Booking accepted", "The customer has been notified by email.");
      await load();
    } catch (err) {
      notify("error", "Accept failed", getApiErrorMessage(err, "Could not accept booking."));
    } finally {
      setAcceptingId(null);
    }
  };

  const reject = async (id: number) => {
    setRejectingId(id);
    try {
      await bookingsApi.rejectBooking(id);
      notify("success", "Booking rejected", "The booking was cancelled and the customer notified.");
      await load();
    } catch (err) {
      notify("error", "Reject failed", getApiErrorMessage(err, "Could not reject booking."));
    } finally {
      setRejectingId(null);
    }
  };

  const counts = useMemo(() => {
    const pending = bookings.filter((b) => b.status === "pending" || b.status === "offers");
    const active = bookings.filter((b) =>
      ["confirmed", "in_progress", "agreed", "payment_pending", "deliverable_submitted"].includes(
        b.status
      )
    );
    const completed = bookings.filter((b) => b.status === "completed" || b.status === "reviewed");
    const closed = bookings.filter((b) =>
      ["cancelled", "rejected", "expired"].includes(b.status)
    );
    return { pending, active, completed, closed };
  }, [bookings]);

  const visible = useMemo(() => {
    if (filter === "pending") return counts.pending;
    if (filter === "active") return counts.active;
    if (filter === "completed") return counts.completed;
    if (filter === "closed") return counts.closed;
    return bookings;
  }, [filter, bookings, counts]);

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <Container style={styles.content}>
          <PageHeader
            eyebrow="Provider"
            title="Your bookings"
            subtitle="Accept or reject requests, cancel when plans change, and message customers inside confirmed bookings."
            onBack={() => router.push("/provider-home")}
            actions={
              <Button
                label="Manage availability"
                variant="outline"
                size="sm"
                icon="calendar"
                onPress={() => router.push("/provider-availability")}
              />
            }
          />

          {/* Summary */}
          <View style={styles.statsRow}>
            <StatCard label="Pending" value={counts.pending.length} icon="clock" tone="warning" />
            <StatCard label="Confirmed" value={counts.active.length} icon="check" tone="success" />
            <StatCard
              label="Completed"
              value={counts.completed.length}
              icon="sparkle"
              tone="neutral"
            />
            <StatCard label="Cancelled" value={counts.closed.length} icon="close" tone="neutral" />
          </View>

          <View style={[styles.filters, isDesktop ? styles.filtersDesktop : null]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {FILTERS.map((option) => (
                <Chip
                  key={option.key}
                  label={option.label}
                  size="sm"
                  active={filter === option.key}
                  onPress={() => setFilter(option.key)}
                />
              ))}
            </ScrollView>
          </View>

          {loading ? (
            <ListSkeleton rows={4} />
          ) : error ? (
            <ErrorState description={error} onRetry={load} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon="calendar"
              title={filter === "all" ? "No bookings yet" : "Nothing in this filter"}
              description={
                filter === "all"
                  ? "Requests appear here as soon as a customer books one of your published slots."
                  : "Try another status filter to see the rest of your bookings."
              }
              actionLabel={filter === "all" ? "Check my availability" : "Show all"}
              onAction={() =>
                filter === "all" ? router.push("/provider-availability") : setFilter("all")
              }
            />
          ) : (
            <View style={styles.list}>
              {visible.map((booking, index) => (
                <Animated.View
                  key={booking.id}
                  entering={FadeInDown.delay(Math.min(index, 6) * 40).duration(300)}
                >
                  <Card padding="lg" style={styles.card}>
                    <View style={styles.cardTop}>
                      <View style={styles.cardInfo}>
                        <Text style={styles.service} numberOfLines={1}>
                          {booking.service_title || `Service #${booking.service}`}
                        </Text>
                        <Text style={styles.meta}>
                          {booking.client_name ? `Customer: ${booking.client_name} · ` : ""}
                          {booking.booking_time
                            ? new Date(booking.booking_time).toLocaleString(undefined, {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "Time pending"}
                        </Text>
                        {booking.location_city || booking.location_address ? (
                          <View style={styles.locationRow}>
                            <Icon name="pin" size={13} color={colors.textSubtle} />
                            <Text style={styles.meta}>
                              {[booking.location_address, booking.location_city]
                                .filter(Boolean)
                                .join(", ")}
                            </Text>
                          </View>
                        ) : null}
                        {booking.agreed_price || booking.proposed_price ? (
                          <Text style={styles.price}>
                            Rs{" "}
                            {Number.parseFloat(
                              String(booking.agreed_price ?? booking.proposed_price)
                            ).toFixed(0)}
                            {booking.agreed_price ? " agreed" : " proposed by customer"}
                          </Text>
                        ) : null}
                      </View>
                      <StatusBadge status={booking.status} size="md" />
                    </View>

                    <View style={styles.actions}>
                      {booking.status === "pending" || booking.status === "offers" ? (
                        <>
                          <Button
                            label="Accept"
                            variant="success"
                            size="sm"
                            icon="check"
                            loading={acceptingId === booking.id}
                            onPress={() => accept(booking.id)}
                          />
                          <Button
                            label="Reject"
                            variant="danger"
                            size="sm"
                            icon="close"
                            loading={rejectingId === booking.id}
                            onPress={() => reject(booking.id)}
                          />
                        </>
                      ) : null}

                      {booking.status === "confirmed" || booking.chat_available ? (
                        <Button
                          label="Message customer"
                          variant="secondary"
                          size="sm"
                          icon="chat"
                          onPress={() =>
                            router.push({
                              pathname: "/chat",
                              params: { bookingId: String(booking.id) },
                            } as never)
                          }
                        />
                      ) : null}

                      {booking.service ? (
                        <Button
                          label="View service"
                          variant="ghost"
                          size="sm"
                          onPress={() => router.push(`/service/${booking.service}` as never)}
                        />
                      ) : null}

                      {!["cancelled", "rejected", "expired", "completed", "reviewed"].includes(
                        booking.status
                      ) ? (
                        canCancelBooking(booking.booking_time, booking.can_cancel) ? (
                          <Button
                            label="Cancel booking"
                            variant="ghost"
                            size="sm"
                            loading={cancellingId === booking.id}
                            onPress={() => cancel(booking.id)}
                          />
                        ) : (
                          <Text style={styles.tooLate}>
                            Within 24 hours — contact the customer instead.
                          </Text>
                        )
                      ) : null}
                    </View>
                  </Card>
                </Animated.View>
              ))}
            </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing.xxl, paddingBottom: spacing.giant },
  statsRow: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  filters: { marginTop: spacing.xl, marginBottom: spacing.lg },
  filtersDesktop: { marginTop: spacing.xxl },
  chipRow: { gap: spacing.sm, paddingRight: spacing.lg },
  list: { gap: spacing.md },
  card: { gap: spacing.lg },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    flexWrap: "wrap",
  },
  cardInfo: { flex: 1, minWidth: 200, gap: spacing.xs },
  service: { ...typography.h4, color: colors.text },
  meta: { ...typography.small, color: colors.textMuted, flexShrink: 1 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  price: { ...typography.smallStrong, color: colors.primaryDark },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tooLate: { ...typography.caption, color: colors.textSubtle, fontStyle: "italic" },
});
