/**
 * Rating — star row + numeric value + review count.
 * Renders "New" (instead of a fake 0) when a provider has no reviews yet.
 */
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, spacing, weight } from "../../theme/tokens";
import Icon from "./Icon";

type Props = {
  value?: number | null;
  count?: number | null;
  size?: number;
  showCount?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function Rating({
  value,
  count,
  size = 14,
  showCount = true,
  compact,
  style,
}: Props) {
  const rating = Number(value ?? 0);
  const reviews = Number(count ?? 0);
  const hasRating = rating > 0;

  if (!hasRating) {
    return (
      <View style={[styles.row, style]}>
        <Icon name="star" size={size} color={colors.borderStrong} />
        <Text style={[styles.value, { fontSize: size - 1 }]}>New on the marketplace</Text>
      </View>
    );
  }

  return (
    <View style={[styles.row, style]}>
      <Icon name="star" size={size} color={colors.star} />
      <Text style={[styles.value, { fontSize: size - 1 }]}>{rating.toFixed(1)}</Text>
      {showCount && reviews > 0 ? (
        <Text style={[styles.count, { fontSize: size - 2 }]}>
          {compact ? `(${reviews})` : `· ${reviews} review${reviews === 1 ? "" : "s"}`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xs + 1 },
  value: { fontWeight: weight.bold, color: colors.text },
  count: { color: colors.textMuted, fontWeight: weight.medium },
});
