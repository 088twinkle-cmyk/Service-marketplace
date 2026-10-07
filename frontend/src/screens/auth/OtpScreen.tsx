/**
 * OtpScreen — email verification.
 *
 * Reached from login when the backend answers `otp_required`, or from
 * registration. The access token issued by login/register is already stored and
 * authenticates the OTP endpoints.
 */
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { useLocalSearchParams, useRouter } from "expo-router";

import AuthLayout from "../../components/AuthLayout";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import Button from "../../components/ui/Button";
import Icon from "../../components/ui/Icon";
import Input from "../../components/ui/Input";
import { authApi } from "../../services/api/authApi";
import { getApiErrorMessage } from "../../services/api/client";
import { getAuth, getPostLoginRoute, setAuth } from "../../auth/auth";
import { colors, radius, spacing, typography } from "../../theme/tokens";

const RESEND_COOLDOWN = 45;

export default function OtpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();

  const [email, setEmail] = useState(params.email ?? "");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const [popup, setPopup] = useState<{
    visible: boolean;
    type: FeedbackType;
    title: string;
    message: string;
    onConfirm?: () => void;
  }>({ visible: false, type: "info", title: "", message: "" });

  const showPopup = (
    type: FeedbackType,
    title: string,
    message: string,
    onConfirm?: () => void
  ) => setPopup({ visible: true, type, title, message, onConfirm });

  const closePopup = () => {
    const cb = popup.onConfirm;
    setPopup((p) => ({ ...p, visible: false, onConfirm: undefined }));
    cb?.();
  };

  useEffect(() => {
    (async () => {
      const auth = await getAuth();
      setAccessToken(auth.token ?? null);
      if (!params.email && auth.email) setEmail(auth.email);
    })();
  }, [params.email]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const verify = async () => {
    const code = otp.trim();

    if (!accessToken) {
      showPopup("error", "Session expired", "Sign in again to request a new verification code.", () =>
        router.replace("/login")
      );
      return;
    }
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }

    setVerifying(true);
    try {
      const res = await authApi.verifyOtp(accessToken, code);
      const user = res.data.user;

      await setAuth({
        access: res.data.access,
        refresh: res.data.refresh,
        role: user.role,
        username: user.username,
        email: user.email,
      });

      const route = await getPostLoginRoute(user.role);
      showPopup("success", "Email verified", "Your account is ready.", () => router.replace(route));
    } catch (err) {
      showPopup("error", "Verification failed", getApiErrorMessage(err, "Invalid or expired code."));
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    if (!accessToken || cooldown > 0) return;
    setSending(true);
    try {
      const res = await authApi.requestOtp(accessToken);
      setCooldown(RESEND_COOLDOWN);
      const devOtp = res.data.debug_otp;
      if (__DEV__ && devOtp) setOtp(devOtp);
      showPopup(
        "success",
        "Code sent",
        __DEV__ && devOtp
          ? "A new code was generated for local development."
          : "A new code has been sent to your email."
      );
    } catch (err) {
      showPopup("error", "Could not resend", getApiErrorMessage(err, "Try again in a minute."));
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AuthLayout
        showBack
        onBack={() => router.replace("/login")}
        title="Verify your email"
        subtitle={
          email
            ? `Enter the 6-digit code we sent to ${email}.`
            : "Enter the 6-digit code we sent to your email."
        }
      >
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.notice}>
            <Icon name="info" size={16} color={colors.primaryDark} />
            <Text style={styles.noticeText}>
              Codes expire quickly for security. If yours has expired, request a new one below.
            </Text>
          </View>

          <Input
            label="Verification code"
            placeholder="123456"
            value={otp}
            onChangeText={(value) => {
              setOtp(value.replace(/\D/g, "").slice(0, 6));
              setError(undefined);
            }}
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="one-time-code"
            error={error}
            autoFocus
          />

          <Button
            label="Verify & continue"
            size="lg"
            fullWidth
            loading={verifying}
            onPress={verify}
          />

          <Button
            label={cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            variant="ghost"
            size="sm"
            fullWidth
            disabled={sending || cooldown > 0}
            style={{ marginTop: spacing.sm }}
            onPress={resend}
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Wrong account?</Text>
            <Button
              label="Back to sign in"
              variant="ghost"
              size="sm"
              onPress={() => router.replace("/login")}
            />
          </View>
        </ScrollView>
      </AuthLayout>

      <FeedbackModal
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={closePopup}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  notice: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primarySoftBorder,
    marginBottom: spacing.lg,
  },
  noticeText: { flex: 1, ...typography.small, color: colors.primaryDark },
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
