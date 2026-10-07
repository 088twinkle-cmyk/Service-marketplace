/**
 * Card / SectionCard / Divider — the surface language of the app.
 *
 * A card always has: white surface, 1px hairline border, generous radius and a
 * soft shadow. `interactive` adds the hover lift used by clickable cards, and
 * `tone` switches to a status wash (used by KYC + dashboard callouts).
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

import { colors, radius, shadows, spacing, toneColors, weight, type Tone } from "../../theme/tokens";

type Padding = "none" | "sm" | "md" | "lg";

type Props = {
  children?: React.ReactNode;
  padding?: Padding;
  tone?: Tone;
  interactive?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
};

const PADDINGS: Record<Padding, number> = {
  none: 0,
  sm: spacing.md,
  md: spacing.lg,
  lg: spacing.xxl,
};

export default function Card({
  children,
  padding = "md",
  tone,
  interactive,
  onPress,
  style,
  testID,
  accessibilityLabel,
}: Props) {
  const toneStyle = tone
    ? { backgroundColor: toneColors[tone].bg, borderColor: toneColors[tone].border }
    : null;

  if (!onPress) {
    return (
      <View style={[styles.card, { padding: PADDINGS[padding] }, toneStyle, style]} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.card,
        { padding: PADDINGS[padding] },
        toneStyle,
        interactive && hovered ? styles.hover : null,
        pressed ? styles.pressed : null,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

/** Card with a title row and an optional right-hand action. */
export function SectionCard({
  title,
  subtitle,
  action,
  children,
  style,
  padding = "lg",
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: Padding;
}) {
  return (
    <View style={[styles.card, { padding: PADDINGS[padding] }, style]}>
      {title || action ? (
        <View style={styles.header}>
          <View style={styles.headerText}>
            {title ? <Text style={styles.titleText}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitleText}>{subtitle}</Text> : null}
          </View>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.xs,
  },
  hover: { ...shadows.md, borderColor: colors.borderStrong, transform: [{ translateY: -2 }] },
  pressed: { opacity: 0.94 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  headerText: { flex: 1 },
  titleText: { fontSize: 16, fontWeight: weight.bold, color: colors.text },
  subtitleText: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.xs,
    lineHeight: 19,
  },
  divider: { height: 1, backgroundColor: colors.border, width: "100%" },
});
