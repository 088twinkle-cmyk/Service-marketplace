/**
 * ServiceCard — the marketplace listing card.
 *
 * Reusable everywhere a service appears (home, search, dashboard, provider
 * listings). Every field is optional except title/price: the card only shows
 * what the API actually returned, and falls back to a neutral placeholder when
 * a provider has not uploaded photos yet.
 */
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Image } from "expo-image";
import Animated, { FadeInDown } from "react-native-reanimated";

import type { ServiceItem } from "../services/api/servicesApi";
import { resolveMediaUrl } from "../config/api";
import { colors, radius, shadows, spacing, typography, weight } from "../theme/tokens";
import Avatar from "./ui/Avatar";
import Badge, { VerifiedBadge } from "./ui/Badge";
import Icon from "./ui/Icon";
import Rating from "./ui/Rating";

export type ServiceCardProps = {
  service: ServiceItem;
  onPress: () => void;
  /** Staggered entrance used by grids. */
  index?: number;
  /** Compact variant for "recently viewed" style rows. */
  variant?: "grid" | "row";
  /** Optional footer text override (e.g. "Your listing"). */
  footerNote?: string;
};

export default function ServiceCard({
  service,
  onPress,
  index = 0,
  variant = "grid",
  footerNote,
}: ServiceCardProps) {
  const image = resolveMediaUrl(service.images?.[0]?.image_url);
  const price = Number.parseFloat(String(service.price ?? "0"));

  if (variant === "row") {
    return (
      <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 40).duration(280)}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${service.title} by ${service.provider_name}`}
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
            styles.row,
            hovered ? styles.rowHover : null,
            pressed ? styles.pressed : null,
          ]}
        >
          <Thumb image={image} style={styles.rowThumb} />
          <View style={styles.rowBody}>
            <Text style={styles.title} numberOfLines={1}>
              {service.title}
            </Text>
            <Text style={styles.rowMeta} numberOfLines={1}>
              {service.provider_name}
              {service.location ? ` · ${service.location}` : ""}
            </Text>
            <Rating value={service.avg_rating} count={service.review_count} size={13} />
          </View>
          <Text style={styles.rowPrice}>Rs {price.toFixed(0)}</Text>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(320)}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${service.title} by ${service.provider_name}`}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
          styles.card,
          hovered ? styles.cardHover : null,
          pressed ? styles.pressed : null,
        ]}
      >
        <View style={styles.media}>
          <Thumb image={image} style={styles.image} />
          {service.category_name ? (
            <View style={styles.categoryTag}>
              <Text style={styles.categoryText} numberOfLines={1}>
                {service.category_name}
              </Text>
            </View>
          ) : null}
          {service.distance_km != null ? (
            <View style={styles.distanceTag}>
              <Icon name="pin" size={11} color={colors.textInverse} />
              <Text style={styles.distanceText}>{service.distance_km.toFixed(1)} km</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <View style={styles.providerRow}>
            <Avatar
              uri={service.provider_avatar ?? undefined}
              name={service.provider_name}
              size={30}
            />
            <Text style={styles.providerName} numberOfLines={1}>
              {service.provider_name || "Provider"}
            </Text>
            {service.provider_verified ? <VerifiedBadge compact /> : null}
          </View>

          <Text style={styles.title} numberOfLines={2}>
            {service.title}
          </Text>

          <Rating value={service.avg_rating} count={service.review_count} size={13} />

          <View style={styles.locationRow}>
            <Icon name="pin" size={13} color={colors.textSubtle} />
            <Text style={styles.location} numberOfLines={1}>
              {service.location || "Location on request"}
            </Text>
          </View>

          <View style={styles.footer}>
            <View style={styles.priceBlock}>
              <Text style={styles.priceLabel}>Starting from</Text>
              <Text style={styles.price}>Rs {price.toFixed(0)}</Text>
            </View>
            <View style={styles.cta}>
              <Text style={styles.ctaText}>{footerNote ?? "View service"}</Text>
              <Icon name="arrow-right" size={14} color={colors.primaryDark} />
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function Thumb({ image, style }: { image?: string; style: object }) {
  if (image) {
    return <Image source={{ uri: image }} style={style} contentFit="cover" transition={180} />;
  }
  return (
    <View style={[style, styles.placeholder]}>
      <Icon name="sparkle" size={22} color={colors.primary} />
      <Text style={styles.placeholderText}>Photos coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadows.xs,
  },
  cardHover: { ...shadows.md, transform: [{ translateY: -3 }], borderColor: colors.borderStrong },
  pressed: { opacity: 0.95 },

  media: { position: "relative" },
  image: { width: "100%", height: 172, backgroundColor: colors.surfaceMuted },
  placeholder: {
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  placeholderText: { fontSize: 11.5, color: colors.primaryDark, fontWeight: weight.medium },

  categoryTag: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    maxWidth: "72%",
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.94)",
  },
  categoryText: { fontSize: 11, fontWeight: weight.semibold, color: colors.text },
  distanceTag: {
    position: "absolute",
    bottom: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: "rgba(15,23,42,0.72)",
  },
  distanceText: { fontSize: 11, color: colors.textInverse, fontWeight: weight.semibold },

  body: { padding: spacing.lg, gap: spacing.sm },
  providerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  providerName: {
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: weight.semibold,
    color: colors.textMuted,
  },
  title: { ...typography.h4, color: colors.text, lineHeight: 21 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  location: { fontSize: 12.5, color: colors.textMuted, flexShrink: 1 },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  priceBlock: { flexShrink: 1 },
  priceLabel: { fontSize: 11, color: colors.textSubtle, fontWeight: weight.medium },
  price: { ...typography.price, color: colors.text },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  ctaText: { fontSize: 12.5, fontWeight: weight.semibold, color: colors.primaryDark },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  rowHover: { borderColor: colors.borderStrong, ...shadows.sm },
  rowThumb: { width: 54, height: 54, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  rowBody: { flex: 1, gap: 2 },
  rowMeta: { fontSize: 12.5, color: colors.textMuted },
  rowPrice: { ...typography.bodyStrong, color: colors.text },
});
