/**
 * ProviderProfileScreen — `/provider/:id`.
 *
 * A public profile assembled only from data the API already exposes: the
 * provider's active listings (`/api/catalog/services/`), their reviews
 * (`/api/reviews/?provider=`) and the provider fields carried by each service
 * (name, photo, verification, rating, city).
 *
 * `?name=` is used purely to narrow the server-side search when arriving from a
 * listing card; a direct visit still works and simply scans the catalog page.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import Animated, { FadeInDown } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";

import ReviewList from "../../components/ReviewList";
import ServiceCard from "../../components/ServiceCard";
import Avatar from "../../components/ui/Avatar";
import Badge, { VerifiedBadge } from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card, { Divider } from "../../components/ui/Card";
import Icon from "../../components/ui/Icon";
import { Container, Grid, StatCard } from "../../components/ui/Layout";
import Rating from "../../components/ui/Rating";
import { EmptyState, ErrorState } from "../../components/ui/States";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { reviewsApi, type ReviewItem } from "../../services/api/reviewsApi";
import { servicesApi, type ServiceItem } from "../../services/api/servicesApi";
import { colors, radius, spacing, typography, weight } from "../../theme/tokens";

export default function ProviderProfileScreen() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const providerId = Number(id);

  const [services, setServices] = useState<ServiceItem[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(providerId) || providerId <= 0) {
      setError("This provider link is not valid.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [firstPage, providerReviews] = await Promise.all([
        servicesApi.list(name ? { search: name } : {}),
        reviewsApi.byProvider(providerId).catch(() => [] as ReviewItem[]),
      ]);

      let mine = firstPage.filter((service) => service.provider === providerId);

      if (mine.length === 0 && name) {
        // The narrowed search missed (renamed provider) — scan a catalog page.
        const all = await servicesApi.list({});
        mine = all.filter((service) => service.provider === providerId);
      }

      setServices(mine);
      setReviews(providerReviews);
    } catch {
      setError("We could not load this provider right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [providerId, name]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Container style={styles.content}>
        <SkeletonBlock height={150} radiusValue={radius.xl} />
        <View style={{ height: spacing.xl }} />
        <SkeletonBlock height={220} radiusValue={radius.xl} />
      </Container>
    );
  }

  if (error) {
    return (
      <Container style={styles.content}>
        <ErrorState description={error} onRetry={load} />
      </Container>
    );
  }

  const lead = services[0];
  const providerName = lead?.provider_name || name || "Provider";
  const verified = services.some((service) => service.provider_verified);
  const location = services.find((service) => service.location)?.location;
  const prices = services
    .map((service) => Number.parseFloat(String(service.price ?? "0")))
    .filter((value) => Number.isFinite(value) && value > 0);
  const fromPrice = prices.length ? Math.min(...prices) : null;
  const reviewCount = reviews.length;
  const averageRating = reviewCount
    ? reviews.reduce((total, review) => total + Number(review.rating || 0), 0) / reviewCount
    : lead?.provider_rating ?? lead?.avg_rating ?? 0;
  const avatar = services.find((service) => service.provider_avatar)?.provider_avatar ?? null;

  const bookService = (service: ServiceItem) =>
    router.push({
      pathname: "/book",
      params: {
        serviceId: String(service.id),
        title: service.title,
        price: service.price,
        provider: service.provider_name,
        providerId: String(service.provider),
      },
    } as never);

  const cheapest = [...services].sort(
    (a, b) => Number.parseFloat(String(a.price ?? "0")) - Number.parseFloat(String(b.price ?? "0"))
  )[0];

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Container style={styles.content}>
          <Button
            label="Back to marketplace"
            variant="ghost"
            size="sm"
            icon="chevron-left"
            onPress={() => router.back()}
          />

          <Animated.View entering={FadeInDown.duration(420)}>
            <Card padding="lg" style={styles.profileCard}>
              <View style={styles.profileRow}>
                <Avatar uri={avatar ?? undefined} name={providerName} size={84} verified={verified} />

                <View style={styles.profileInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>{providerName}</Text>
                    {verified ? <VerifiedBadge /> : null}
                  </View>

                  <View style={styles.metaRow}>
                    <Rating value={averageRating} count={reviewCount} size={14} />
                    {location ? (
                      <View style={styles.metaItem}>
                        <Icon name="pin" size={13} color={colors.textSubtle} />
                        <Text style={styles.metaText}>{location}</Text>
                      </View>
                    ) : null}
                  </View>

                  <Text style={styles.providerSub}>
                    {services.length} active listing{services.length === 1 ? "" : "s"} on Service
                    Marketplace
                    {fromPrice != null ? ` · from Rs ${fromPrice.toFixed(0)}` : ""}
                  </Text>
                </View>

                {cheapest ? (
                  <View style={styles.profileCta}>
                    <Button
                      label="Book a service"
                      size="md"
                      trailingIcon="arrow-right"
                      onPress={() => bookService(cheapest)}
                    />
                  </View>
                ) : null}
              </View>

              <Divider style={{ marginVertical: spacing.lg }} />

              <View style={styles.statsRow}>
                <StatCard
                  label="Services"
                  value={services.length}
                  icon="grid"
                  hint="Active listings"
                />
                <StatCard
                  label="Reviews"
                  value={reviewCount}
                  icon="chat"
                  tone="neutral"
                  hint="From completed bookings"
                />
                <StatCard
                  label="Rating"
                  value={averageRating ? averageRating.toFixed(1) : "—"}
                  icon="star"
                  tone="warning"
                  hint={reviewCount ? `${reviewCount} review${reviewCount === 1 ? "" : "s"}` : "No reviews yet"}
                />
                <StatCard
                  label="From"
                  value={fromPrice != null ? `Rs ${fromPrice.toFixed(0)}` : "—"}
                  icon="wallet"
                  tone="success"
                  hint="Cheapest listing"
                />
              </View>
            </Card>
          </Animated.View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Services by {providerName}</Text>
              {verified ? (
                <Badge label="Identity verified" tone="success" icon="shield" size="md" />
              ) : (
                <Badge label="Verification pending" tone="warning" size="md" />
              )}
            </View>

            {services.length === 0 ? (
              <EmptyState
                icon="search"
                title="No active listings"
                description={`${providerName} has no published services right now. Browse the marketplace for similar professionals.`}
                actionLabel="Browse services"
                onAction={() => router.push("/search")}
              />
            ) : (
              <Grid>
                {services.map((service, index) => (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    index={index}
                    onPress={() => bookService(service)}
                    footerNote="Book"
                  />
                ))}
              </Grid>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Reviews</Text>
            <View style={styles.reviewWrap}>
              <ReviewList reviews={reviews} />
            </View>
          </View>
        </Container>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing.xl, paddingBottom: spacing.giant },
  profileCard: { marginTop: spacing.lg, gap: spacing.lg },
  profileRow: { flexDirection: "row", alignItems: "center", gap: spacing.xl, flexWrap: "wrap" },
  profileInfo: { flex: 1, minWidth: 220, gap: spacing.xs },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  name: { ...typography.h2, color: colors.text },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  metaText: { fontSize: 13, color: colors.textMuted, fontWeight: weight.medium },
  providerSub: { ...typography.small, color: colors.textMuted },
  profileCta: { alignItems: "flex-end" },
  statsRow: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  section: { marginTop: spacing.giant },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.lg,
    flexWrap: "wrap",
  },
  sectionTitle: { ...typography.h3, color: colors.text },
  reviewWrap: { marginTop: spacing.md },
});
