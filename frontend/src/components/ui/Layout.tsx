/**
 * Layout primitives: Container, Grid, Chip, StatCard, StepTrail.
 *
 * `Container` keeps the content column centred at a comfortable reading width
 * on desktop while staying edge-to-edge on phones; `Grid` is the single place
 * that decides how many cards fit per row.
 */
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { colors, radius, shadows, spacing, typography, weight } from "../../theme/tokens";
import { useResponsive } from "../../theme/responsive";
import Icon, { type IconName } from "./Icon";

/* -------------------------------------------------------------------------- */
/* Container                                                                  */
/* -------------------------------------------------------------------------- */

export function Container({
  children,
  /** `narrow` is used by auth + form screens, `wide` by dashboards. */
  width = "content",
  style,
}: {
  children?: React.ReactNode;
  width?: "content" | "narrow" | "form" | "full";
  style?: StyleProp<ViewStyle>;
}) {
  const { gutter } = useResponsive();
  const maxWidth =
    width === "narrow" ? 760 : width === "form" ? 520 : width === "full" ? undefined : 1200;

  return (
    <View
      style={[
        styles.container,
        { paddingHorizontal: gutter, maxWidth, alignSelf: "center", width: "100%" },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Grid                                                                       */
/* -------------------------------------------------------------------------- */

export function Grid({
  children,
  columns,
  gap = spacing.lg,
  style,
}: {
  children: React.ReactNode;
  /** Override the responsive default (1 / 2 / 3–4). */
  columns?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const responsive = useResponsive();
  const cols = columns ?? responsive.columns;
  const items = React.Children.toArray(children).filter(Boolean);
  const itemWidth = `${100 / cols}%` as `${number}%`;

  return (
    <View style={[styles.grid, { marginHorizontal: -gap / 2 }, style]}>
      {items.map((child, index) => (
        <View key={index} style={{ width: itemWidth, paddingHorizontal: gap / 2, paddingBottom: gap }}>
          {child}
        </View>
      ))}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Chip                                                                      */
/* -------------------------------------------------------------------------- */

export function Chip({
  label,
  active,
  onPress,
  icon,
  disabled,
  size = "md",
  style,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: IconName;
  disabled?: boolean;
  size?: "sm" | "md";
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.chip,
        size === "sm" ? styles.chipSm : null,
        active ? styles.chipActive : null,
        hovered && !active ? styles.chipHover : null,
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      {icon ? (
        <Icon name={icon} size={14} color={active ? colors.textOnPrimary : colors.textMuted} />
      ) : null}
      <Text
        style={[styles.chipText, active ? styles.chipTextActive : null, size === "sm" && { fontSize: 12.5 }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* StatCard                                                                   */
/* -------------------------------------------------------------------------- */

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "primary",
  style,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: IconName;
  tone?: "primary" | "success" | "warning" | "neutral";
  style?: StyleProp<ViewStyle>;
}) {
  const tint =
    tone === "success"
      ? { bg: colors.successSoft, fg: colors.success }
      : tone === "warning"
        ? { bg: colors.warningSoft, fg: colors.warning }
        : tone === "neutral"
          ? { bg: colors.surfaceMuted, fg: colors.textMuted }
          : { bg: colors.primarySoft, fg: colors.primary };

  return (
    <View style={[styles.stat, style]}>
      <View style={styles.statTop}>
        <Text style={styles.statLabel}>{label}</Text>
        {icon ? (
          <View style={[styles.statIcon, { backgroundColor: tint.bg }]}>
            <Icon name={icon} size={15} color={tint.fg} />
          </View>
        ) : null}
      </View>
      <Text style={styles.statValue}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* StepTrail                                                                  */
/* -------------------------------------------------------------------------- */

export function StepTrail({
  steps,
  current,
  style,
}: {
  steps: string[];
  /** 0-based index of the active step. */
  current: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { isMobile } = useResponsive();

  return (
    <View style={[styles.trail, style]}>
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <React.Fragment key={step}>
            <View style={styles.trailStep}>
              <View
                style={[
                  styles.trailDot,
                  done ? styles.trailDotDone : null,
                  active ? styles.trailDotActive : null,
                ]}
              >
                {done ? (
                  <Icon name="check" size={12} color={colors.textInverse} />
                ) : (
                  <Text
                    style={[
                      styles.trailNum,
                      active ? styles.trailNumActive : null,
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              {!isMobile || active ? (
                <Text
                  style={[
                    styles.trailLabel,
                    active ? styles.trailLabelActive : null,
                    done ? styles.trailLabelDone : null,
                  ]}
                  numberOfLines={1}
                >
                  {step}
                </Text>
              ) : null}
            </View>

            {index < steps.length - 1 ? (
              <View style={[styles.trailLine, done ? styles.trailLineDone : null]} />
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

export function ProgressBar({ value, style }: { value: number; style?: StyleProp<ViewStyle> }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={[styles.progressTrack, style]}>
      <View style={[styles.progressFill, { width: `${pct * 100}%` as `${number}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%" },
  grid: { flexDirection: "row", flexWrap: "wrap" },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 1,
    paddingHorizontal: spacing.lg - 2,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  chipSm: { height: 32, paddingHorizontal: spacing.md },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipHover: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { fontSize: 13.5, fontWeight: weight.semibold, color: colors.textMuted },
  chipTextActive: { color: colors.textOnPrimary },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.45 },

  stat: {
    flexGrow: 1,
    flexBasis: 150,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadows.xs,
  },
  statTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statLabel: { ...typography.caption, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { ...typography.statValue, color: colors.text, marginTop: spacing.sm },
  statHint: { ...typography.caption, color: colors.textSubtle, marginTop: 2 },

  trail: { flexDirection: "row", alignItems: "center", flexWrap: "nowrap" },
  trailStep: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  trailDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  trailDotActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  trailDotDone: { borderColor: colors.primary, backgroundColor: colors.primary },
  trailNum: { fontSize: 12, fontWeight: weight.bold, color: colors.textMuted },
  trailNumActive: { color: colors.primary },
  trailLabel: { fontSize: 12.5, color: colors.textMuted, fontWeight: weight.medium },
  trailLabelActive: { color: colors.text, fontWeight: weight.semibold },
  trailLabelDone: { color: colors.textMuted },
  trailLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderStrong,
    marginHorizontal: spacing.sm,
    minWidth: 12,
  },
  trailLineDone: { backgroundColor: colors.primary },

  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden",
    width: "100%",
  },
  progressFill: { height: "100%", borderRadius: 3, backgroundColor: colors.primary },
});
