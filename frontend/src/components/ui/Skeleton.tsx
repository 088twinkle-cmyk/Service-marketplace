/**
 * Skeleton placeholders.
 *
 * Loading states mirror the real layout (card grid, dashboard rows, calendar)
 * so the page does not jump when data arrives. The pulse is a CSS animation on
 * web (see `web.css`) and a static tint on native, via the reanimated shim.
 */
import React, { useEffect } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { colors, radius, spacing } from "../../theme/tokens";

export function SkeletonBlock({
  width = "100%",
  height = 14,
  radiusValue = radius.sm,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  radiusValue?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 950 }), -1, true);
  }, [opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        { width, height, backgroundColor: colors.surfaceMuted, borderRadius: radiusValue },
        animated,
        style,
      ]}
    />
  );
}

/** One service card placeholder (image + three lines). */
export function ServiceCardSkeleton() {
  return (
    <View style={styles.card}>
      <SkeletonBlock height={160} radiusValue={0} />
      <View style={styles.body}>
        <View style={styles.row}>
          <SkeletonBlock width={34} height={34} radiusValue={17} />
          <SkeletonBlock width="55%" height={12} />
        </View>
        <SkeletonBlock width="85%" height={16} />
        <SkeletonBlock width="45%" height={12} />
        <View style={styles.footer}>
          <SkeletonBlock width={70} height={12} />
          <SkeletonBlock width={80} height={20} />
        </View>
      </View>
    </View>
  );
}

export function ServiceGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.grid}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.gridItem}>
          <ServiceCardSkeleton />
        </View>
      ))}
    </View>
  );
}

/** Generic list rows (dashboard, bookings, chat). */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.listRow}>
          <SkeletonBlock width={44} height={44} radiusValue={22} />
          <View style={styles.listText}>
            <SkeletonBlock width="55%" height={14} />
            <SkeletonBlock width="35%" height={12} />
          </View>
          <SkeletonBlock width={72} height={24} radiusValue={12} />
        </View>
      ))}
    </View>
  );
}

/** Dashboard summary tiles. */
export function StatSkeleton({ tiles = 4 }: { tiles?: number }) {
  return (
    <View style={styles.statRow}>
      {Array.from({ length: tiles }).map((_, i) => (
        <View key={i} style={styles.statTile}>
          <SkeletonBlock width="50%" height={22} />
          <SkeletonBlock width="75%" height={12} />
        </View>
      ))}
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
  },
  body: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -spacing.sm },
  gridItem: { width: "50%", paddingHorizontal: spacing.sm, paddingBottom: spacing.lg },
  list: { gap: spacing.md },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  listText: { flex: 1, gap: spacing.sm },
  statRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statTile: {
    flexGrow: 1,
    flexBasis: 150,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
});
