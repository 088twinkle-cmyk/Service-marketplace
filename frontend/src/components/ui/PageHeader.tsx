/**
 * PageHeader — the top of every inner screen: optional breadcrumb/back action,
 * eyebrow, title, description and a slot for primary actions.
 */
import React from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, spacing, typography, weight } from "../../theme/tokens";
import { useResponsive } from "../../theme/responsive";
import Icon from "./Icon";

type Props = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  onBack?: () => void;
  backLabel?: string;
  actions?: React.ReactNode;
  /** Right-hand content below the title on desktop (e.g. filters). */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function PageHeader({
  title,
  subtitle,
  eyebrow,
  onBack,
  backLabel = "Back",
  actions,
  children,
  style,
}: Props) {
  const { isMobile } = useResponsive();

  return (
    <View style={[styles.wrap, style]}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          style={({ pressed }: { pressed: boolean }) => [styles.back, pressed && styles.pressed]}
        >
          <Icon name="chevron-left" size={14} color={colors.primary} />
          <Text style={styles.backText}>{backLabel}</Text>
        </Pressable>
      ) : null}

      <View style={[styles.row, isMobile && styles.rowStack]}>
        <View style={styles.text}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.xxl },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  backText: { color: colors.primary, fontWeight: weight.semibold, fontSize: 13.5 },
  pressed: { opacity: 0.7 },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.lg,
  },
  rowStack: { flexDirection: "column", alignItems: "stretch", gap: spacing.md },
  text: { flex: 1 },
  eyebrow: {
    ...typography.label,
    color: colors.primary,
    textTransform: "uppercase",
    marginBottom: spacing.xs + 2,
  },
  title: { ...typography.h1, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: spacing.sm, maxWidth: 680 },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
});
