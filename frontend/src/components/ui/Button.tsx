/**
 * Button — one control for every call to action.
 *
 * Variants: primary · secondary (soft indigo) · outline · ghost · danger · success
 * Sizes:    sm · md · lg
 * States:   default · hover · pressed · disabled · loading
 */
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { colors, radius, shadows, spacing, weight } from "../../theme/tokens";
import Icon, { type IconName } from "./Icon";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "success";
export type ButtonSize = "sm" | "md" | "lg";

type Props = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon on the leading edge. */
  icon?: IconName;
  /** Icon on the trailing edge (e.g. an arrow for a "next" action). */
  trailingIcon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Secondary line under the label. */
  hint?: string;
  align?: "center" | "flex-start";
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
};

const HEIGHTS: Record<ButtonSize, number> = { sm: 36, md: 44, lg: 52 };
const FONT: Record<ButtonSize, number> = { sm: 13, md: 15, lg: 16 };
const PADDING: Record<ButtonSize, number> = { sm: 14, md: 20, lg: 24 };

export default function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  trailingIcon,
  loading,
  disabled,
  fullWidth,
  hint,
  align = "center",
  style,
  testID,
  accessibilityLabel,
}: Props) {
  const inactive = disabled || loading;
  const palette = VARIANTS[variant];

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.base,
        {
          minHeight: HEIGHTS[size],
          paddingHorizontal: PADDING[size],
          backgroundColor: palette.background,
          borderColor: palette.border,
        },
        variant === "primary" && !inactive ? shadows.primary : null,
        align === "flex-start" ? styles.alignStart : null,
        fullWidth ? styles.fullWidth : null,
        hovered && !inactive ? { backgroundColor: palette.hoverBackground, borderColor: palette.hoverBorder } : null,
        pressed && !inactive ? styles.pressed : null,
        inactive ? styles.disabled : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.text} />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size={size === "sm" ? 15 : 17} color={palette.text} /> : null}
          <View style={hint ? styles.labels : undefined}>
            <Text
              style={[
                styles.label,
                { color: palette.text, fontSize: FONT[size] },
                align === "flex-start" ? styles.textLeft : null,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
            {hint ? (
              <Text
                style={[
                  styles.hint,
                  { color: palette.hint },
                  align === "flex-start" ? styles.textLeft : null,
                ]}
              >
                {hint}
              </Text>
            ) : null}
          </View>
          {trailingIcon ? (
            <Icon name={trailingIcon} size={size === "sm" ? 15 : 17} color={palette.text} />
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

export const VARIANTS: Record<
  ButtonVariant,
  { background: string; hoverBackground: string; text: string; hint: string; border: string; hoverBorder: string }
> = {
  primary: {
    background: colors.primary,
    hoverBackground: colors.primaryDark,
    text: colors.textOnPrimary,
    hint: "rgba(255,255,255,0.82)",
    border: colors.primary,
    hoverBorder: colors.primaryDark,
  },
  secondary: {
    background: colors.primarySoft,
    hoverBackground: colors.primarySoftBorder,
    text: colors.primaryDark,
    hint: colors.primaryDark,
    border: colors.primarySoftBorder,
    hoverBorder: colors.primarySoftBorder,
  },
  outline: {
    background: colors.surface,
    hoverBackground: colors.surfaceAlt,
    text: colors.text,
    hint: colors.textMuted,
    border: colors.borderStrong,
    hoverBorder: colors.primary,
  },
  ghost: {
    background: "transparent",
    hoverBackground: colors.surfaceMuted,
    text: colors.text,
    hint: colors.textMuted,
    border: "transparent",
    hoverBorder: "transparent",
  },
  danger: {
    background: colors.dangerSoft,
    hoverBackground: colors.dangerBorder,
    text: colors.danger,
    hint: colors.danger,
    border: colors.dangerBorder,
    hoverBorder: colors.dangerBorder,
  },
  success: {
    background: colors.successSoft,
    hoverBackground: colors.successBorder,
    text: colors.success,
    hint: colors.success,
    border: colors.successBorder,
    hoverBorder: colors.successBorder,
  },
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fullWidth: { width: "100%" },
  alignStart: { alignItems: "flex-start" },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  labels: { alignItems: "flex-start" },
  label: { fontWeight: weight.semibold, letterSpacing: 0.1 },
  textLeft: { textAlign: "left" },
  hint: { fontSize: 12, marginTop: 2 },
  pressed: { opacity: 0.88, transform: [{ translateY: 1 }] },
  disabled: { opacity: 0.5 },
});
