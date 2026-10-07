/**
 * Dialog — the modal shell used by feedback, confirmations and image previews.
 * Centred card on desktop, bottom sheet feel on phones, always dismissible.
 */
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, radius, shadows, spacing, typography } from "../../theme/tokens";
import Icon, { type IconName } from "./Icon";

export default function Dialog({
  visible,
  onClose,
  title,
  description,
  icon,
  tone = "primary",
  children,
  footer,
  style,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: IconName;
  tone?: "primary" | "success" | "danger" | "warning";
  children?: React.ReactNode;
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const tint = TONES[tone];

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="Close dialog">
        <Pressable style={[styles.card, style]} onPress={(e) => e.stopPropagation()}>
          <Pressable
            style={styles.close}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Icon name="close" size={14} color={colors.textMuted} />
          </Pressable>

          {icon ? (
            <View style={[styles.iconCircle, { backgroundColor: tint.soft }]}>
              <Icon name={icon} size={24} color={tint.color} />
            </View>
          ) : null}

          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
          {children}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const TONES = {
  primary: { color: colors.primary, soft: colors.primarySoft },
  success: { color: colors.success, soft: colors.successSoft },
  danger: { color: colors.danger, soft: colors.dangerSoft },
  warning: { color: colors.warning, soft: colors.warningSoft },
} as const;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    padding: spacing.xxl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.lg,
  },
  close: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: { ...typography.h3, color: colors.text, textAlign: "center" },
  description: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  footer: { width: "100%", gap: spacing.sm, marginTop: spacing.xl },
});
