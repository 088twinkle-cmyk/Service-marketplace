/**
 * ProviderCard — a marketplace professional.
 *
 * Every value comes from data the catalog API already returns for the
 * provider's listings (name, rating, review count, verification, city). Nothing
 * is estimated client-side.
 */
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Animated, { FadeInDown } from "react-native-reanimated";

import { colors, radius, shadows, spacing, typography, weight } from "../theme/tokens";
import Avatar from "./ui/Avatar";
import Badge, { VerifiedBadge } from "./ui/Badge";
import Icon from "./ui/Icon";
import Rating from "./ui/Rating";

export type ProviderSummary = {
  id: number;
  name: string;
  verified?: boolean;
  rating?: number | null;
  reviewCount?: number | null;
  location?: string;
  serviceCount?: number;
  avatarUri?: string | null;
  /** Cheapest listing price for this provider, when known. */
  fromPrice?: number | null;
};

type Props = {
  provider: ProviderSummary;
  onPress: () => void;
  index?: number;
};

export default function ProviderCard({ provider, onPress, index = 0 }: Props) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(320)}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${provider.name}, ${provider.serviceCount ?? 1} services`}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
          styles.card,
          hovered ? styles.hover : null,
          pressed ? styles.pressed : null,
        ]}
      >
        <Avatar
          uri={provider.avatarUri ?? undefined}
          name={provider.name}
          size={56}
          verified={provider.verified}
        />

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {provider.name || "Provider"}
          </Text>

          <Rating value={provider.rating} count={provider.reviewCount} size={13} />

          <View style={styles.metaRow}>
            {provider.location ? (
              <View style={styles.metaItem}>
                <Icon name="pin" size={12} color={colors.textSubtle} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {provider.location}
                </Text>
              </View>
            ) : null}
            {provider.serviceCount ? (
              <View style={styles.metaItem}>
                <Icon name="grid" size={12} color={colors.textSubtle} />
                <Text style={styles.metaText}>
                  {provider.serviceCount} service{provider.serviceCount === 1 ? "" : "s"}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.aside}>
          {provider.verified ? <VerifiedBadge compact /> : <Badge label="New" tone="neutral" />}
          {provider.fromPrice != null ? (
            <Text style={styles.price}>from Rs {provider.fromPrice.toFixed(0)}</Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadows.xs,
  },
  hover: { ...shadows.md, transform: [{ translateY: -2 }], borderColor: colors.borderStrong },
  pressed: { opacity: 0.95 },
  info: { flex: 1, gap: spacing.xs },
  name: { ...typography.h4, color: colors.text },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  metaText: { fontSize: 12, color: colors.textMuted, fontWeight: weight.medium },
  aside: { alignItems: "flex-end", gap: spacing.xs },
  price: { fontSize: 12.5, fontWeight: weight.bold, color: colors.text },
});
