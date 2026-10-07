/**
 * EmptyState / ErrorState / LoadingState — the three states every data screen
 * needs, so no page ever shows a blank rectangle.
 */
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, spacing, typography, weight } from "../../theme/tokens";
import Button from "./Button";
import Icon, { type IconName } from "./Icon";

type EmptyProps = {
  title: string;
  description?: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Rendered inside a dashed card (default) or bare. */
  bare?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export function EmptyState({
  title,
  description,
  icon = "sparkle",
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  bare,
  style,
  children,
}: EmptyProps) {
  return (
    <View style={[bare ? styles.bare : styles.box, style]}>
      <View style={styles.iconCircle}>
        <Icon name={icon} size={22} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {children}
      {actionLabel || secondaryLabel ? (
        <View style={styles.actions}>
          {secondaryLabel && onSecondary ? (
            <Button label={secondaryLabel} variant="ghost" size="sm" onPress={onSecondary} />
          ) : null}
          {actionLabel && onAction ? (
            <Button label={actionLabel} size="sm" onPress={onAction} trailingIcon="arrow-right" />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  actionLabel = "Try again",
  onRetry,
  style,
}: {
  title?: string;
  description?: string;
  actionLabel?: string;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.box, styles.errorBox, style]}>
      <View style={[styles.iconCircle, styles.errorCircle]}>
        <Icon name="alert" size={22} color={colors.danger} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {onRetry ? (
        <View style={styles.actions}>
          <Button label={actionLabel} variant="outline" size="sm" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

export function LoadingState({
  label = "Loading…",
  inline,
  style,
}: {
  label?: string;
  /** Small spinner instead of a centred block. */
  inline?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  if (inline) {
    return (
      <View style={[styles.inline, style]}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.inlineLabel}>{label}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.loading, style]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.loadingLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceAlt,
  },
  errorBox: { borderColor: colors.dangerBorder, backgroundColor: colors.dangerSoft },
  bare: { alignItems: "center", paddingVertical: spacing.xl },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  errorCircle: { backgroundColor: "#FFFFFF" },
  title: { ...typography.h4, color: colors.text, textAlign: "center" },
  description: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.sm,
    maxWidth: 420,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  loading: { paddingVertical: spacing.giant, alignItems: "center", gap: spacing.md },
  loadingLabel: { color: colors.textMuted, fontSize: 14, fontWeight: weight.medium },
  inline: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  inlineLabel: { color: colors.textMuted, fontSize: 13 },
});
