/**
 * ServiceDetailScreen — the listing detail page.
 *
 * Desktop: gallery + description on the left, a sticky booking card on the
 * right. Mobile: stacked content with a sticky action bar. Same data and the
 * same booking hand-off as before (`/book` with service + provider params).
 */
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Image } from "expo-image";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";

import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import ReviewList from "../../components/ReviewList";
import Avatar from "../../components/ui/Avatar";
import Badge, { VerifiedBadge } from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card, { Divider } from "../../components/ui/Card";
import Icon from "../../components/ui/Icon";
import { Container } from "../../components/ui/Layout";
import { ErrorState } from "../../components/ui/States";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { getAuth } from "../../auth/auth";
import { resolveMediaUrl } from "../../config/api";
import { reviewsApi, type ReviewItem } from "../../services/api/reviewsApi";
import { servicesApi, type ServiceItem } from "../../services/api/servicesApi";
import { colors, radius, shadows, spacing, typography, weight } from "../../theme/tokens";
import { useResponsive } from "../../theme/responsive";
import { trackServiceView } from "../../utils/activityHistory";

export default function ServiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isDesktop } = useResponsive();

  const [service, setService] = useState<ServiceItem | null>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [providerOwnsService, setProviderOwnsService] = useState(false);
  const [popup, setPopup] = useState({
    visible: false,
    type: "error" as FeedbackType,
    title: "",
    message: "",
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const s = await servicesApi.get(Number(id));
        setService(s);
        trackServiceView({
          id: s.id,
          title: s.title,
          provider_name: s.provider_name,
        });
        const r = await reviewsApi.byProvider(s.provider).catch(() => []);
        setReviews(r);
      } catch {
        setFailed(true);
        setPopup({
          visible: true,
          type: "error",
          title: "Could not load this service",
          message: "The listing may have been removed, or the server is unreachable.",
        });
      } finally {
        setLoading(false);
      }
    };
    if (id) load();
  }, [id]);

  useEffect(() => {
    if (!service) return;
    (async () => {
      const auth = await getAuth();
      const role = auth.role?.toLowerCase();
      if (role === "provider" && service.is_mine) {
        setProviderOwnsService(true);
        router.replace("/provider-services");
      }
    })();
  }, [service, router]);

  if (loading) {
    return <DetailSkeleton />;
  }

  if (!service) {
    return (
      <Container style={styles.notFoundWrap}>
        <ErrorState
          title="Service not found"
          description={
            failed
              ? "We could not load this listing. Check your connection and try again."
              : "This listing may have been removed by the provider."
          }
          actionLabel="Back to marketplace"
          onRetry={() => router.replace("/")}
        />
        <View style={styles.notFoundActions}>
          <Button label="Browse services" variant="outline" onPress={() => router.push("/search")} />
        </View>
      </Container>
    );
  }

  const images = service.images ?? [];
  const hasPhotos = images.length > 0;
  const price = Number.parseFloat(String(service.price ?? "0"));

  const bookingParams = {
    pathname: "/book" as const,
    params: {
      serviceId: String(service.id),
      title: service.title,
      price: service.price,
      provider: service.provider_name,
      providerId: String(service.provider),
    },
  };

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Container style={styles.content}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }: { pressed: boolean }) => [styles.back, pressed && styles.pressed]}
          >
            <Icon name="chevron-left" size={13} color={colors.primary} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          <View style={[styles.layout, isDesktop ? styles.layoutDesktop : null]}>
            {/* Main column */}
            <Animated.View entering={FadeInDown.duration(420)} style={styles.main}>
              <View style={styles.gallery}>
                {hasPhotos ? (
                  <Image
                    source={{ uri: resolveMediaUrl(images[activeImage]?.image_url) }}
                    style={styles.heroImage}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <View style={[styles.heroImage, styles.heroPlaceholder]}>
                    <Icon name="sparkle" size={26} color={colors.primary} />
                    <Text style={styles.heroPlaceholderTitle}>No photos yet</Text>
                    <Text style={styles.heroPlaceholderText}>
                      This provider has not uploaded photos for the listing.
                    </Text>
                  </View>
                )}

                {images.length > 1 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.thumbs}
                  >
                    {images.map((image, index) => (
                      <Pressable
                        key={image.id}
                        onPress={() => setActiveImage(index)}
                        accessibilityRole="button"
                        accessibilityLabel={`Show photo ${index + 1}`}
                        style={[
                          styles.thumbWrap,
                          index === activeImage ? styles.thumbActive : null,
                        ]}
                      >
                        <Image
                          source={{ uri: resolveMediaUrl(image.image_url) }}
                          style={styles.thumb}
                          contentFit="cover"
                        />
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}
              </View>

              <View style={styles.headerBlock}>
                <View style={styles.badgeRow}>
                  {service.category_name ? (
                    <Badge label={service.category_name} tone="primary" />
                  ) : null}
                  {service.provider_verified ? <VerifiedBadge /> : null}
                  {service.service_mode ? (
                    <Badge label={service.service_mode} tone="neutral" />
                  ) : null}
                </View>

                <Text style={styles.title}>{service.title}</Text>

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Icon name="star" size={14} color={colors.star} />
                    <Text style={styles.metaText}>
                      {(service.avg_rating ?? 0) > 0
                        ? `${service.avg_rating?.toFixed(1)} · ${service.review_count ?? 0} review${
                            (service.review_count ?? 0) === 1 ? "" : "s"
                          }`
                        : "No reviews yet"}
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Icon name="pin" size={14} color={colors.textSubtle} />
                    <Text style={styles.metaText}>
                      {service.location || "Location on request"}
                      {service.distance_km != null ? ` · ${service.distance_km.toFixed(1)} km away` : ""}
                    </Text>
                  </View>
                  {service.duration_minutes ? (
                    <View style={styles.metaItem}>
                      <Icon name="clock" size={14} color={colors.textSubtle} />
                      <Text style={styles.metaText}>{service.duration_minutes} min</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <Card padding="lg" style={styles.section}>
                <Text style={styles.sectionTitle}>About this service</Text>
                <Text style={styles.description}>
                  {service.description || "The provider has not added a description yet."}
                </Text>
              </Card>

              <Card padding="lg" style={styles.section}>
                <Text style={styles.sectionTitle}>Provided by</Text>
                <View style={styles.providerRow}>
                  <Avatar
                    uri={service.provider_avatar ?? undefined}
                    name={service.provider_name}
                    size={56}
                    verified={service.provider_verified}
                  />
                  <View style={styles.providerInfo}>
                    <Text style={styles.providerName}>{service.provider_name}</Text>
                    <Text style={styles.providerMeta}>
                      {service.location ? `${service.location} · ` : ""}
                      {service.provider_verified ? "ID verified" : "Verification pending"}
                    </Text>
                  </View>
                  <Button
                    label="View profile"
                    variant="outline"
                    size="sm"
                    onPress={() =>
                      router.push({
                        pathname: "/provider/[id]",
                        params: { id: String(service.provider), name: service.provider_name },
                      } as never)
                    }
                  />
                </View>
              </Card>

              <Card padding="lg" style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Reviews {reviews.length > 0 ? `(${reviews.length})` : ""}
                </Text>
                <ReviewList reviews={reviews} />
              </Card>
            </Animated.View>

            {/* Booking rail */}
            <View style={[styles.rail, isDesktop ? styles.railDesktop : null]}>
              <Card padding="lg" style={styles.bookingCard}>
                <Text style={styles.priceLabel}>Starting price</Text>
                <Text style={styles.price}>Rs {price.toFixed(0)}</Text>
                <Text style={styles.priceHint}>
                  The final amount is confirmed with the provider before the work starts.
                </Text>

                {!providerOwnsService ? (
                  <Button
                    label="Continue to booking"
                    size="lg"
                    fullWidth
                    trailingIcon="arrow-right"
                    onPress={() => router.push(bookingParams as never)}
                  />
                ) : (
                  <Badge label="This is your own listing" tone="neutral" size="md" />
                )}

                <Divider style={{ marginVertical: spacing.lg }} />

                <View style={styles.railFacts}>
                  <RailFact icon="calendar" text="Pick a real slot from the provider's calendar" />
                  <RailFact icon="chat" text="Chat opens with the booking once it is confirmed" />
                  <RailFact icon="clock" text="Free cancellation up to 24 hours before" />
                </View>
              </Card>
            </View>
          </View>
        </Container>
      </ScrollView>

      {/* Mobile sticky action bar */}
      {!isDesktop && !providerOwnsService ? (
        <View style={styles.stickyBar}>
          <View style={styles.stickyPrice}>
            <Text style={styles.stickyLabel}>Starting price</Text>
            <Text style={styles.stickyValue}>Rs {price.toFixed(0)}</Text>
          </View>
          <Button
            label="Continue"
            size="lg"
            trailingIcon="arrow-right"
            onPress={() => router.push(bookingParams as never)}
          />
        </View>
      ) : null}

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

function RailFact({ icon, text }: { icon: "calendar" | "chat" | "clock"; text: string }) {
  return (
    <View style={styles.railFact}>
      <Icon name={icon} size={15} color={colors.primary} />
      <Text style={styles.railFactText}>{text}</Text>
    </View>
  );
}

function DetailSkeleton() {
  return (
    <Container style={styles.content}>
      <SkeletonBlock width={90} height={14} />
      <View style={{ height: spacing.lg }} />
      <SkeletonBlock height={300} radiusValue={radius.xl} />
      <View style={{ height: spacing.xl }} />
      <SkeletonBlock width="70%" height={26} />
      <View style={{ height: spacing.md }} />
      <SkeletonBlock width="40%" height={14} />
      <View style={{ height: spacing.xl }} />
      <SkeletonBlock height={120} radiusValue={radius.xl} />
    </Container>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing.xl, paddingBottom: spacing.giant },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
    marginBottom: spacing.lg,
  },
  backText: { color: colors.primary, fontWeight: weight.semibold, fontSize: 13.5 },
  pressed: { opacity: 0.7 },

  layout: { gap: spacing.xxl },
  layoutDesktop: { flexDirection: "row", alignItems: "flex-start" },
  main: { flex: 1, gap: spacing.xl },
  rail: { width: "100%" },
  railDesktop: { width: 360, flexShrink: 0 },

  gallery: { gap: spacing.md },
  heroImage: {
    width: "100%",
    height: 320,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceMuted,
  },
  heroPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.primarySoft,
  },
  heroPlaceholderTitle: { ...typography.h4, color: colors.primaryDark },
  heroPlaceholderText: { ...typography.small, color: colors.textMuted },
  thumbs: { gap: spacing.sm },
  thumbWrap: {
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: "transparent",
    padding: 2,
  },
  thumbActive: { borderColor: colors.primary },
  thumb: { width: 76, height: 60, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },

  headerBlock: { gap: spacing.md },
  badgeRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  title: { ...typography.h1, color: colors.text, letterSpacing: -0.4 },
  metaRow: { flexDirection: "row", gap: spacing.lg, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  metaText: { fontSize: 13, color: colors.textMuted, fontWeight: weight.medium },

  section: { gap: spacing.md },
  sectionTitle: { ...typography.h4, color: colors.text },
  description: { ...typography.body, color: colors.text, lineHeight: 24 },

  providerRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg, flexWrap: "wrap" },
  providerInfo: { flex: 1, minWidth: 160 },
  providerName: { ...typography.h4, color: colors.text },
  providerMeta: { ...typography.small, color: colors.textMuted, marginTop: 2 },

  bookingCard: { gap: spacing.sm, ...shadows.sm },
  priceLabel: { ...typography.caption, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  price: { ...typography.display, color: colors.text, letterSpacing: -0.6 },
  priceHint: { ...typography.small, color: colors.textMuted, marginBottom: spacing.md },
  railFacts: { gap: spacing.md },
  railFact: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  railFactText: { flex: 1, ...typography.small, color: colors.textMuted },

  stickyBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.lg,
  },
  stickyPrice: { flexShrink: 1 },
  stickyLabel: { fontSize: 11, color: colors.textSubtle, textTransform: "uppercase", letterSpacing: 0.5 },
  stickyValue: { ...typography.price, color: colors.text },

  notFoundWrap: { paddingTop: spacing.giant, paddingBottom: spacing.giant, alignItems: "center" },
  notFoundActions: { marginTop: spacing.lg },
});
