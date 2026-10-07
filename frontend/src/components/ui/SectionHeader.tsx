/**
 * SectionHeader — the rhythm element between page sections:
 * optional eyebrow, title, supporting line and a right-hand action.
 */
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, spacing, typography, weight } from "../../theme/tokens";

type Props = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  action?: React.ReactNode;
  /** Centered variant used by landing sections. */
  align?: "left" | "center";
  size?: "md" | "lg";
  style?: StyleProp<ViewStyle>;
};

export default function SectionHeader({
  title,
  subtitle,
  eyebrow,
  action,
  align = "left",
  size = "md",
  style,
}: Props) {
  const centered = align === "center";

  return (
    <View style={[styles.wrap, centered && styles.centered, style]}>
      <View style={[styles.text, centered && styles.textCentered]}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={[size === "lg" ? styles.titleLg : styles.title, centered && styles.centerText]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, centered && styles.centerText]}>{subtitle}</Text>
        ) : null}
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  centered: { flexDirection: "column", alignItems: "center" },
  text: { flex: 1 },
  textCentered: { alignItems: "center", flex: 0 },
  eyebrow: {
    ...typography.label,
    color: colors.primary,
    textTransform: "uppercase",
    marginBottom: spacing.xs + 2,
  },
  title: { ...typography.h3, color: colors.text },
  titleLg: { ...typography.h2, color: colors.text, letterSpacing: -0.3 },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs + 2 },
  centerText: { textAlign: "center" },
  action: { flexShrink: 0 },
});
