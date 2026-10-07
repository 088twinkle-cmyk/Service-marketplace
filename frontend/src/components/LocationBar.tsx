/**
 * LocationBar — city selector + GPS shortcut.
 *
 * Kept intentionally compact: it sits directly under the search field at the
 * top of home/search, and collapses into a horizontally scrollable chip row on
 * phones so it never overflows.
 */
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { ServiceCity } from "../utils/geo";
import { colors, radius, spacing, typography, weight } from "../theme/tokens";
import Button from "./ui/Button";
import { Chip } from "./ui/Layout";
import Icon from "./ui/Icon";

type Props = {
  city: ServiceCity;
  cities: readonly ServiceCity[];
  usingGps: boolean;
  onSelectCity: (city: ServiceCity) => void;
  onUseGps: () => void;
};

export default function LocationBar({
  city,
  cities,
  usingGps,
  onSelectCity,
  onUseGps,
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.labelRow}>
          <Icon name="pin" size={15} color={colors.primary} />
          <Text style={styles.label}>
            {usingGps ? "Using your current location" : `Nearest to ${city}`}
          </Text>
        </View>

        <Button
          label={usingGps ? "GPS on" : "Use GPS"}
          variant={usingGps ? "secondary" : "outline"}
          size="sm"
          icon="pin"
          onPress={onUseGps}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {cities.map((c) => (
          <Chip
            key={c}
            label={c}
            active={city === c && !usingGps}
            onPress={() => onSelectCity(c)}
            size="sm"
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    flexWrap: "wrap",
  },
  labelRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexShrink: 1 },
  label: { ...typography.smallStrong, color: colors.text, flexShrink: 1 },
  chips: { gap: spacing.sm, paddingRight: spacing.sm },
});
