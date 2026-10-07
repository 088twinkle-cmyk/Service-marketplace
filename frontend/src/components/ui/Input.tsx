/**
 * Input / TextArea — labelled form controls with focus, hint and error states.
 *
 * Every field gets: a visible label, a focus ring, an optional hint line and an
 * error message tied to `accessibilityLabel`, so forms stay usable for screen
 * readers as well as at 360px width.
 */
import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

import { colors, radius, spacing, weight } from "../../theme/tokens";
import Icon, { type IconName } from "./Icon";

export type InputProps = Omit<TextInputProps, "style"> & {
  label?: string;
  hint?: string;
  error?: string | null;
  icon?: IconName;
  /** Trailing node (e.g. a "show password" toggle). */
  right?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  /** Renders a 4-line textarea. */
  multilineArea?: boolean;
  required?: boolean;
};

export default function Input({
  label,
  hint,
  error,
  icon,
  right,
  containerStyle,
  multilineArea,
  required,
  multiline,
  editable = true,
  onFocus,
  onBlur,
  ...rest
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const invalid = Boolean(error);

  const borderColor = invalid
    ? colors.danger
    : focused
      ? colors.borderFocus
      : colors.borderStrong;

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          {required ? <Text style={styles.required}>Required</Text> : null}
        </View>
      ) : null}

      <View
        style={[
          styles.field,
          { borderColor },
          focused && styles.fieldFocused,
          invalid && styles.fieldInvalid,
          !editable && styles.fieldDisabled,
        ]}
      >
        {icon ? (
          <View style={styles.icon}>
            <Icon name={icon} size={17} color={focused ? colors.primary : colors.textSubtle} />
          </View>
        ) : null}

        <TextInput
          {...rest}
          editable={editable}
          multiline={multilineArea ? true : multiline}
          placeholderTextColor={colors.textSubtle}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            multilineArea || multiline ? styles.inputMultiline : null,
            icon ? styles.inputWithIcon : null,
          ]}
          accessibilityLabel={label ?? rest.placeholder}
        />

        {right ? <View style={styles.right}>{right}</View> : null}
      </View>

      {error ? (
        <View style={styles.messageRow}>
          <Icon name="alert" size={13} color={colors.danger} />
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Password field with a show/hide toggle. */
export function PasswordInput(props: InputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <Input
      {...props}
      secureTextEntry={!visible}
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? "Hide password" : "Show password"}
          onPress={() => setVisible((v) => !v)}
          style={styles.toggle}
        >
          <Text style={styles.toggleText}>{visible ? "Hide" : "Show"}</Text>
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  label: { fontSize: 13, fontWeight: weight.semibold, color: colors.text },
  required: { fontSize: 11, color: colors.textSubtle, fontWeight: weight.medium },
  field: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radius.md,
    minHeight: 46,
  },
  fieldFocused: {
    // Focus ring (boxShadow renders on web and RN >= 0.76 new architecture).
    boxShadow: "0 0 0 3px rgba(79, 70, 229, 0.16)",
  },
  fieldInvalid: { backgroundColor: colors.dangerSoft },
  fieldDisabled: { backgroundColor: colors.surfaceMuted, opacity: 0.75 },
  icon: { paddingLeft: spacing.md },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.md,
  },
  inputWithIcon: { paddingLeft: spacing.sm },
  inputMultiline: { minHeight: 110, textAlignVertical: "top", paddingTop: spacing.md },
  right: { paddingRight: spacing.md },
  toggle: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  toggleText: { color: colors.primary, fontWeight: weight.semibold, fontSize: 13 },
  messageRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.sm },
  error: { color: colors.danger, fontSize: 12.5, fontWeight: weight.medium, flex: 1 },
  hint: { color: colors.textMuted, fontSize: 12.5, marginTop: spacing.sm, lineHeight: 18 },
});
