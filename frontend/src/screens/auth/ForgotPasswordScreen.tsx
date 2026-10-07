/**
 * ForgotPasswordScreen — request a password reset link + token by email.
 */
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { useRouter } from "expo-router";

import AuthLayout from "../../components/AuthLayout";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import Button from "../../components/ui/Button";
import Icon from "../../components/ui/Icon";
import Input from "../../components/ui/Input";
import { authApi } from "../../services/api/authApi";
import { getApiErrorMessage } from "../../services/api/client";
import { colors, radius, spacing, typography } from "../../theme/tokens";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState({
    visible: false,
    type: "info" as FeedbackType,
    title: "",
    message: "",
    onConfirm: undefined as (() => void) | undefined,
  });

  const show = (
    type: FeedbackType,
    title: string,
    message: string,
    onConfirm?: () => void
  ) => setPopup({ visible: true, type, title, message, onConfirm });

  const close = () => {
    const cb = popup.onConfirm;
    setPopup((p) => ({ ...p, visible: false, onConfirm: undefined }));
    cb?.();
  };

  const submit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Enter the email linked to your account.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setError("That email address looks incomplete.");
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.forgotPassword(trimmed);
      show(
        "success",
        "Check your email",
        res.message || "If that email is registered, a reset link and token are on the way.",
        () => router.push({ pathname: "/reset-password", params: { email: trimmed } } as never)
      );
    } catch (err) {
      show("error", "Could not send email", getApiErrorMessage(err, "Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AuthLayout
        title="Forgot your password?"
        subtitle="Enter your email and we will send you a reset link with a user ID and token."
        showBack
        onBack={() => router.back()}
      >
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Input
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setError(undefined);
            }}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            icon="user"
            error={error}
            required
          />

          <Button label="Send reset email" size="lg" fullWidth loading={loading} onPress={submit} />

          <View style={styles.hintBox}>
            <Icon name="info" size={16} color={colors.primaryDark} />
            <Text style={styles.hintText}>
              The reset email contains your user ID and a one-time token. You will need both on the
              next screen.
            </Text>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have a token?</Text>
            <Button
              label="Reset password"
              variant="ghost"
              size="sm"
              onPress={() => router.push("/reset-password")}
            />
          </View>
        </ScrollView>
      </AuthLayout>

      <FeedbackModal
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={close}
        confirmLabel={popup.type === "success" ? "Enter token" : "OK"}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hintBox: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primarySoftBorder,
  },
  hintText: { flex: 1, ...typography.small, color: colors.primaryDark },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.md,
    flexWrap: "wrap",
  },
  footerText: { color: colors.textMuted, fontSize: 13.5 },
});
