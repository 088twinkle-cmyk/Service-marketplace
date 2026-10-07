/**
 * ResetPasswordScreen — complete a password reset with the emailed user ID and
 * one-time token.
 */
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { useLocalSearchParams, useRouter } from "expo-router";

import AuthLayout from "../../components/AuthLayout";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import Button from "../../components/ui/Button";
import Input, { PasswordInput } from "../../components/ui/Input";
import { authApi } from "../../services/api/authApi";
import { getApiErrorMessage } from "../../services/api/client";
import { colors, spacing } from "../../theme/tokens";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; uid?: string; token?: string }>();

  const [email, setEmail] = useState(params.email?.toString() || "");
  const [uid, setUid] = useState(params.uid?.toString() || "");
  const [token, setToken] = useState(params.token?.toString() || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{
    email?: string;
    uid?: string;
    token?: string;
    password?: string;
    confirm?: string;
  }>({});
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
    const nextErrors: typeof errors = {};
    if (!email.trim()) nextErrors.email = "Enter the email you requested the reset for.";
    if (!uid.trim()) nextErrors.uid = "Paste the user ID from the reset email.";
    if (!token.trim()) nextErrors.token = "Paste the reset token from the email.";
    if (newPassword.length < 6) nextErrors.password = "Use at least 6 characters.";
    if (newPassword && newPassword !== confirmPassword) nextErrors.confirm = "Passwords do not match.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      const res = await authApi.resetPassword({
        email: email.trim().toLowerCase(),
        uid: uid.trim(),
        token: token.trim(),
        new_password: newPassword,
      });
      show("success", "Password reset", res.message || "You can sign in with your new password now.", () =>
        router.replace("/login")
      );
    } catch (err) {
      show("error", "Reset failed", getApiErrorMessage(err, "Invalid or expired token."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AuthLayout
        title="Set a new password"
        subtitle="Paste the user ID and token from your reset email, then choose a new password."
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
              setErrors((prev) => ({ ...prev, email: undefined }));
            }}
            autoCapitalize="none"
            keyboardType="email-address"
            error={errors.email}
            required
          />

          <Input
            label="User ID (from the email)"
            placeholder="e.g. 42"
            value={uid}
            onChangeText={(text) => {
              setUid(text);
              setErrors((prev) => ({ ...prev, uid: undefined }));
            }}
            autoCapitalize="none"
            error={errors.uid}
            required
          />

          <Input
            label="Reset token (from the email)"
            placeholder="Paste the token"
            value={token}
            onChangeText={(text) => {
              setToken(text);
              setErrors((prev) => ({ ...prev, token: undefined }));
            }}
            autoCapitalize="none"
            error={errors.token}
            hint="Tokens are single use and expire quickly."
            required
          />

          <PasswordInput
            label="New password"
            placeholder="At least 6 characters"
            value={newPassword}
            onChangeText={(text) => {
              setNewPassword(text);
              setErrors((prev) => ({ ...prev, password: undefined }));
            }}
            error={errors.password}
            required
          />

          <PasswordInput
            label="Confirm new password"
            placeholder="Repeat the new password"
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text);
              setErrors((prev) => ({ ...prev, confirm: undefined }));
            }}
            error={errors.confirm}
            required
          />

          <Button label="Reset password" size="lg" fullWidth loading={loading} onPress={submit} />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Remembered it after all?</Text>
            <Button label="Back to sign in" variant="ghost" size="sm" onPress={() => router.replace("/login")} />
          </View>
        </ScrollView>
      </AuthLayout>

      <FeedbackModal
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={close}
        confirmLabel={popup.type === "success" ? "Sign in" : "OK"}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
