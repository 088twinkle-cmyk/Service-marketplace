/**
 * ProviderHomeScreen — the provider business dashboard.
 *
 * Everything on this page is computed from data the provider already owns:
 * their provider profile (KYC status), their services (`/services/mine/`),
 * their bookings and their reviews. KYC progress doubles as the onboarding
 * checklist.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";

import Avatar from "../../components/ui/Avatar";
import Badge, { StatusBadge, statusMeta } from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card, { SectionCard } from "../../components/ui/Card";
import Icon, { type IconName } from "../../components/ui/Icon";
import { Container, StatCard, StepTrail } from "../../components/ui/Layout";
import Rating from "../../components/ui/Rating";
import { EmptyState } from "../../components/ui/States";
import { ListSkeleton, StatSkeleton } from "../../components/ui/Skeleton";
import { bookingsApi, type BookingItem } from "../../services/api/bookingsApi";
import { kycApi } from "../../services/api/kycApi";
import { reviewsApi } from "../../services/api/reviewsApi";
import { servicesApi, type ServiceItem } from "../../services/api/servicesApi";
import { userApi } from "../../services/api/userApi";
import { getAuth } from "../../auth/auth";
import { resolveMediaUrl } from "../../config/api";
import { colors, radius, spacing, typography, weight } from "../../theme/tokens";
import { useResponsive } from "../../theme/responsive";

type QuickAction = {
  label: string;
  hint: string;
  icon: IconName;
  route: string;
};

export default function ProviderHomeScreen() {
  const router = useRouter();
  const { isDesktop } = useResponsive();

  const [username, setUsername] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState("pending");
  const [profileCompleted, setProfileCompleted] = useState<boolean | null>(null);
  const [verified, setVerified] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [rating, setRating] = useState<{ average: number; count: number }>({ average: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const auth = await getAuth();
      const [profile, mine, allBookings, me] = await Promise.all([
        kycApi
          .getProfile()
          .catch(() => ({ kyc_status: "pending", is_verified: false, profile_completed: false } as never)),
        servicesApi.listMine().catch(() => [] as ServiceItem[]),
        bookingsApi.listBookings().catch(() => [] as BookingItem[]),
        userApi.me().catch(() => null),
      ]);

      setKycStatus(profile?.kyc_status || "pending");
      setVerified(!!profile?.is_verified);
      setProfileCompleted(profile?.profile_completed ?? null);
      setRejectionReason(profile?.rejection_reason || "");
      setServices(mine);
      setBookings(allBookings);
      setUsername(me?.username || auth.username || "");
      setAvatarUri(me?.profile_photo || null);

      // Reviews are already public; average them locally for the dashboard.
      if (me?.id) {
        const reviews = await reviewsApi.byProvider(me.id).catch(() => []);
        if (reviews.length > 0) {
          const average =
            reviews.reduce((total, review) => total + Number(review.rating || 0), 0) / reviews.length;
          setRating({ average, count: reviews.length });
        } else {
          setRating({ average: 0, count: 0 });
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = () => {
    setRefreshing(true);
    load();
  };

  const metrics = useMemo(() => {
    const now = Date.now();
    const pending = bookings.filter((b) => b.status === "pending" || b.status === "offers");
    const upcoming = bookings.filter(
      (b) =>
        b.booking_time &&
        new Date(b.booking_time).getTime() > now &&
        !["cancelled", "rejected", "expired"].includes(b.status)
    );
    const completed = bookings.filter((b) => b.status === "completed" || b.status === "reviewed");
    const inProgress = bookings.filter((b) =>
      ["confirmed", "in_progress", "agreed", "payment_pending"].includes(b.status)
    );
    const agreedValue = completed.reduce((total, booking) => {
      const value = Number.parseFloat(String(booking.agreed_price ?? booking.proposed_price ?? "0"));
      return total + (Number.isFinite(value) ? value : 0);
    }, 0);

    return { pending, upcoming, completed, inProgress, agreedValue };
  }, [bookings]);

  const kycApproved = verified || kycStatus === "approved";
  const kycStep = kycApproved ? 3 : kycStatus === "pending" && (profileCompleted ?? true) ? 2 : 1;

  const kycLabel = kycApproved
    ? "Verification complete"
    : kycStatus === "rejected"
      ? "Verification needs attention"
      : kycStatus === "pending" && (profileCompleted ?? true)
        ? "Documents under review"
        : "Finish your verification";

  const kycTone = kycApproved ? "success" : kycStatus === "rejected" ? "danger" : "warning";

  const quickActions: QuickAction[] = [
    {
      label: "Manage services",
      hint: `${services.length} listing${services.length === 1 ? "" : "s"}`,
      icon: "sparkle",
      route: "/provider-services",
    },
    {
      label: "Availability",
      hint: "Set your calendar",
      icon: "calendar",
      route: "/provider-availability",
    },
    {
      label: "Bookings",
      hint: `${metrics.pending.length} pending`,
      icon: "grid",
      route: "/provider-bookings",
    },
    {
      label: "Verification",
      hint: statusMeta(kycStatus).label,
      icon: "shield",
      route: "/provider-kyc",
    },
  ];

  const recentBookings = useMemo(
    () =>
      [...bookings]
        .sort(
          (a, b) =>
            new Date(b.created_at ?? b.booking_time ?? 0).getTime() -
            new Date(a.created_at ?? a.booking_time ?? 0).getTime()
        )
        .slice(0, 5),
    [bookings]
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
      >
        <Container style={styles.content}>
          {/* Greeting */}
          <Animated.View entering={FadeInDown.duration(400)} style={styles.greeting}>
            <Avatar
              uri={avatarUri ? resolveMediaUrl(avatarUri) : undefined}
              name={username}
              size={60}
              verified={kycApproved}
            />
            <View style={styles.greetingText}>
              <Text style={styles.greetingEyebrow}>Provider dashboard</Text>
              <Text style={styles.greetingTitle}>
                {username ? `Welcome back, ${username}` : "Welcome back"}
              </Text>
              <View style={styles.greetingBadges}>
                {kycApproved ? (
                  <Badge label="Verified provider" tone="success" icon="shield" />
                ) : (
                  <Badge label={statusMeta(kycStatus).label} tone={kycTone} dot />
                )}
                <Badge label={`${services.length} services live`} tone="neutral" />
              </View>
            </View>
            <View style={styles.greetingActions}>
              <Button
                label="Add a service"
                icon="plus"
                onPress={() => router.push("/provider-services")}
              />
              <Button
                label="Messages"
                variant="outline"
                icon="chat"
                onPress={() => router.push("/chat")}
              />
            </View>
          </Animated.View>

          {/* KYC checklist */}
          <Card padding="lg" tone={kycTone} style={styles.kycCard}>
            <View style={styles.kycHeader}>
              <View style={styles.kycIcon}>
                <Icon
                  name={kycApproved ? "check" : kycStatus === "rejected" ? "alert" : "shield"}
                  size={18}
                  color={kycApproved ? colors.success : kycStatus === "rejected" ? colors.danger : colors.warning}
                />
              </View>
              <View style={styles.kycText}>
                <Text style={styles.kycTitle}>{kycLabel}</Text>
                <Text style={styles.kycBody}>
                  {kycApproved
                    ? "Your identity is verified — customers see the verified badge on your listings."
                    : kycStatus === "pending"
                      ? "Your documents are with our review team. You will be notified once a decision is made."
                      : kycStatus === "rejected"
                        ? rejectionReason
                          ? `Last submission rejected: ${rejectionReason}`
                          : "Your last submission was rejected. Correct it and submit again."
                        : "Submit your identity document to earn the verified badge. Customers filter for verified providers."}
                </Text>
              </View>
              {!kycApproved ? (
                <Button
                  label={kycStatus === "rejected" ? "Resubmit KYC" : "Continue KYC"}
                  variant="outline"
                  onPress={() => router.push("/provider-kyc")}
                />
              ) : null}
            </View>

            <View style={styles.kycTrail}>
              <StepTrail
                steps={["Provider profile", "Documents submitted", "Approved"]}
                current={kycStep}
              />
            </View>
          </Card>

          {/* Metrics */}
          {loading ? (
            <StatSkeleton tiles={4} />
          ) : (
            <View style={styles.statsRow}>
              <StatCard
                label="Active services"
                value={services.filter((s) => s.is_active !== false).length}
                icon="sparkle"
                hint={`${services.length} total`}
              />
              <StatCard
                label="Pending requests"
                value={metrics.pending.length}
                icon="clock"
                tone="warning"
                hint="Waiting for your answer"
              />
              <StatCard
                label="Upcoming"
                value={metrics.upcoming.length}
                icon="calendar"
                tone="success"
                hint={`${metrics.inProgress.length} in progress`}
              />
              <StatCard
                label="Completed"
                value={metrics.completed.length}
                icon="check"
                tone="neutral"
                hint={`Rs ${metrics.agreedValue.toFixed(0)} agreed in total`}
              />
            </View>
          )}

          <View style={[styles.layout, isDesktop ? styles.layoutDesktop : null]}>
            <View style={styles.main}>
              {/* Recent bookings */}
              <SectionCard
                title="Recent bookings"
                subtitle="Newest requests and their current status."
                style={styles.section}
                action={
                  <Button
                    label="View all"
                    variant="ghost"
                    size="sm"
                    onPress={() => router.push("/provider-bookings")}
                  />
                }
              >
                {loading ? (
                  <ListSkeleton rows={3} />
                ) : recentBookings.length === 0 ? (
                  <EmptyState
                    icon="calendar"
                    title="No bookings yet"
                    description="Once customers book your services, the requests will show up here."
                    actionLabel="Review my services"
                    onAction={() => router.push("/provider-services")}
                    bare
                  />
                ) : (
                  <View style={styles.bookingList}>
                    {recentBookings.map((booking, index) => (
                      <Animated.View
                        key={booking.id}
                        entering={FadeInDown.delay(Math.min(index, 5) * 40).duration(280)}
                        style={styles.bookingRow}
                      >
                        <View style={styles.bookingMain}>
                          <Text style={styles.bookingTitle} numberOfLines={1}>
                            {booking.service_title || `Service #${booking.service}`}
                          </Text>
                          <Text style={styles.bookingMeta}>
                            {booking.client_name ? `${booking.client_name} · ` : ""}
                            {booking.booking_time
                              ? new Date(booking.booking_time).toLocaleString(undefined, {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "Time pending"}
                          </Text>
                        </View>
                        <StatusBadge status={booking.status} />
                      </Animated.View>
                    ))}
                  </View>
                )}
              </SectionCard>
            </View>

            {/* Side rail */}
            <View style={[styles.rail, isDesktop ? styles.railDesktop : null]}>
              <Card padding="lg" style={styles.section}>
                <Text style={styles.sectionTitle}>Ratings & reviews</Text>
                {rating.count > 0 ? (
                  <>
                    <View style={styles.ratingRow}>
                      <Text style={styles.ratingValue}>{rating.average.toFixed(1)}</Text>
                      <Rating value={rating.average} count={rating.count} size={16} />
                    </View>
                    <Text style={styles.ratingHint}>
                      Based on {rating.count} review{rating.count === 1 ? "" : "s"} left by customers
                      after completed bookings.
                    </Text>
                  </>
                ) : (
                  <Text style={styles.ratingHint}>
                    No reviews yet. Reviews appear here after customers complete a booking with you.
                  </Text>
                )}
              </Card>

              <Card padding="lg" style={styles.section}>
                <Text style={styles.sectionTitle}>Quick actions</Text>
                <View style={styles.actionGrid}>
                  {quickActions.map((action) => (
                    <Button
                      key={action.label}
                      label={action.label}
                      hint={action.hint}
                      icon={action.icon}
                      variant="outline"
                      size="md"
                      align="flex-start"
                      fullWidth
                      onPress={() => router.push(action.route as never)}
                    />
                  ))}
                </View>
              </Card>

              <Card padding="lg" style={styles.section} tone="primary">
                <Text style={styles.sectionTitle}>How bookings reach you</Text>
                <View style={styles.flowList}>
                  {[
                    "A customer picks one of your open slots.",
                    "The request arrives as “Pending” in your bookings.",
                    "Accept it, or reject it to release the slot.",
                    "Agreed price unlocks the booking chat for coordination.",
                  ].map((line, index) => (
                    <View key={line} style={styles.flowRow}>
                      <View style={styles.flowDot}>
                        <Text style={styles.flowDotText}>{index + 1}</Text>
                      </View>
                      <Text style={styles.flowText}>{line}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            </View>
          </View>
        </Container>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing.xxl, paddingBottom: spacing.giant },

  greeting: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    flexWrap: "wrap",
    marginBottom: spacing.xxl,
  },
  greetingText: { flex: 1, minWidth: 220, gap: spacing.xs },
  greetingEyebrow: { ...typography.label, color: colors.primary, textTransform: "uppercase" },
  greetingTitle: { ...typography.h2, color: colors.text },
  greetingBadges: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", marginTop: spacing.xs },
  greetingActions: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },

  kycCard: { marginBottom: spacing.xxl, gap: spacing.lg },
  kycHeader: { flexDirection: "row", gap: spacing.lg, alignItems: "flex-start", flexWrap: "wrap" },
  kycIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  kycText: { flex: 1, minWidth: 220 },
  kycTitle: { ...typography.h4, color: colors.text },
  kycBody: { ...typography.small, color: colors.textMuted, marginTop: spacing.xs },
  kycTrail: { paddingTop: spacing.sm },

  statsRow: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap", marginBottom: spacing.xxl },

  layout: { gap: spacing.xxl },
  layoutDesktop: { flexDirection: "row", alignItems: "flex-start" },
  main: { flex: 1, gap: spacing.xxl, minWidth: 0 },
  rail: { width: "100%" },
  railDesktop: { width: 360, flexShrink: 0, gap: spacing.xxl },
  section: { marginBottom: 0 },
  sectionTitle: { ...typography.h4, color: colors.text, marginBottom: spacing.md },

  bookingList: { gap: spacing.sm },
  bookingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  bookingMain: { flex: 1, minWidth: 0, gap: 2 },
  bookingTitle: { ...typography.bodyStrong, color: colors.text },
  bookingMeta: { ...typography.small, color: colors.textMuted },

  ratingRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  ratingValue: { ...typography.display, color: colors.text },
  ratingHint: { ...typography.small, color: colors.textMuted, marginTop: spacing.sm },

  actionGrid: { gap: spacing.sm },

  flowList: { gap: spacing.sm },
  flowRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  flowDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  flowDotText: { fontSize: 10.5, fontWeight: weight.bold, color: colors.primaryDark },
  flowText: { flex: 1, ...typography.small, color: colors.textMuted },
});
