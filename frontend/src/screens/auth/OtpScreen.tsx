/**
 * OtpScreen — shared WhatsApp OTP verification (the one screen for BOTH
 * customer and provider flows).
 *
 * Three entry modes, resolved on mount:
 *
 *  1. registration — arrived from the register form with a `registration_id`
 *     (or a pending registration restored from storage after a refresh).
 *  2. login — the backend answered `otp_required` after sign-in; the stored
 *     JWT authenticates the OTP endpoints and the code is requested here.
 *  3. phone — no context at all (deep link / refresh): the user re-enters
 *     their WhatsApp number and the backend resumes the pending
 *     registration for that number.
 *
 * After verification the screen routes by role:
 *     customer → customer home      provider → provider home/onboarding
 */
import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { useLocalSearchParams, useRouter } from "expo-router";

import AuthLayout from "../../components/AuthLayout";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import Button from "../../components/ui/Button";
import Icon from "../../components/ui/Icon";
import Input from "../../components/ui/Input";
import {
  authApi,
  getApiErrorCode,
  getApiRetryAfter,
} from "../../services/api/authApi";
import { getApiErrorMessage } from "../../services/api/client";
import {
  clearPendingRegistration,
  getAuth,
  getPendingRegistration,
  getPostLoginRoute,
  setAuth,
  setPendingRegistration,
} from "../../auth/auth";
import { colors, radius, spacing, typography } from "../../theme/tokens";

const DEFAULT_COOLDOWN = 45;

type ScreenMode = "resolving" | "registration" | "login" | "phone";

export default function OtpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    registration_id?: string;
    phone?: string;
    role?: string;
    email?: string;
    whatsapp_number?: string;
    auto?: string;
  }>();

  const [mode, setMode] = useState<ScreenMode>("resolving");

  // Shared state
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Registration mode
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState(params.phone ?? "");
  const [roleKey, setRoleKey] = useState(params.role ?? "");
  const [businessNumber, setBusinessNumber] = useState<string>("");

  // Login mode
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [email, setEmail] = useState(params.email ?? "");

  // Phone recovery mode
  const [recoveryPhone, setRecoveryPhone] = useState("");
  const [recoveryError, setRecoveryError] = useState<string | undefined>();

  const didAutoRequest = useRef(false);

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

  // -------------------------------------------------------------
  // Mode resolution
  // -------------------------------------------------------------
  useEffect(() => {
    (async () => {
      // 1. Explicit registration context (navigation params first, then the
      //    copy persisted for refresh-safety).
      const stored = await getPendingRegistration();
      const regId = params.registration_id || stored.registrationId || null;
      const phone = params.phone || stored.phoneNumber || "";

      if (regId) {
        setRegistrationId(regId);
        setPhoneNumber(phone);
        if (params.role) setRoleKey(params.role);
        if (params.whatsapp_number) setBusinessNumber(params.whatsapp_number);
        setMode("registration");
        return;
      }

      // 2. Authenticated user needing re-verification (login flow).
      const auth = await getAuth();
      if (auth.token) {
        setAccessToken(auth.token);
        if (!params.email && auth.email) setEmail(auth.email);
        setMode("login");
        return;
      }

      // 3. Nothing to resume — ask for the WhatsApp number.
      setMode("phone");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.registration_id, params.phone]);

  // -------------------------------------------------------------
  // Cooldown countdown
  // -------------------------------------------------------------
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // -------------------------------------------------------------
  // Login mode: request the first WhatsApp OTP on arrival
  // -------------------------------------------------------------
  const requestLoginOtp = async (announce: boolean) => {
    if (!accessToken) return;
    setSending(true);
    try {
      const res = await authApi.requestOtp(accessToken);
      setCooldown(res.data.resend_cooldown || DEFAULT_COOLDOWN);
      setBusinessNumber(res.data.whatsapp_number || "");
      const devOtp = res.data.debug_otp;
      if (__DEV__ && devOtp) setOtp(devOtp);
      if (announce) {
        showPopup(
          "success",
          "Code sent",
          __DEV__ && devOtp
            ? "Development mode: WhatsApp delivery is simulated — no real message was sent."
            : "A 6-digit code has been sent to your WhatsApp."
        );
      }
    } catch (err) {
      showPopup("error", "Could not send code", describeOtpError(err));
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (mode !== "login" || !accessToken || didAutoRequest.current) return;
    didAutoRequest.current = true;
    requestLoginOtp(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, accessToken]);

  // -------------------------------------------------------------
  // Error helpers
  // -------------------------------------------------------------
  const describeOtpError = (err: unknown, fallback = "Something went wrong. Please try again."): string => {
    const code = getApiErrorCode(err);
    switch (code) {
      case "whatsapp_not_configured":
        return getApiErrorMessage(
          err,
          "WhatsApp verification is not configured on the server yet. Please contact the administrator."
        );
      case "whatsapp_unavailable":
        return getApiErrorMessage(
          err,
          "WhatsApp verification is unavailable on the server right now. Please try again later."
        );
      case "otp_rate_limited":
        return "Too many code requests. Please wait a few minutes and try again.";
      default:
        return getApiErrorMessage(err, fallback);
    }
  };

  // -------------------------------------------------------------
  // Verify (registration + login)
  // -------------------------------------------------------------
  const applyAuthAndRoute = async (data: {
    access: string;
    refresh: string;
    user: { role: string; username: string; email: string };
  }) => {
    await setAuth({
      access: data.access,
      refresh: data.refresh,
      role: data.user.role,
      username: data.user.username,
      email: data.user.email,
    });
    await clearPendingRegistration();
    return getPostLoginRoute(data.user.role);
  };

  const verify = async () => {
    const code = otp.trim();

    if (mode === "registration" && !registrationId) {
      showPopup("error", "Session lost", "Please register again to start a new verification.", () =>
        router.replace("/register")
      );
      return;
    }
    if (mode === "login" && !accessToken) {
      showPopup("error", "Session expired", "Sign in again to request a new verification code.", () =>
        router.replace("/login")
      );
      return;
    }
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your WhatsApp message.");
      return;
    }

    setVerifying(true);
    setError(undefined);
    try {
      const res =
        mode === "registration" && registrationId
          ? await authApi.whatsappVerifyOtp(registrationId, code)
          : await authApi.verifyOtp(accessToken as string, code);

      if (!res.data.access) {
        showPopup("error", "Verification failed", "No access token returned from the server.");
        return;
      }

      const route = await applyAuthAndRoute(res.data);
      showPopup("success", "WhatsApp verified", "Your number is verified and your account is ready.", () =>
        router.replace(route)
      );
    } catch (err) {
      const code = getApiErrorCode(err);

      if (code === "registration_expired") {
        showPopup(
          "error",
          "Verification expired",
          "Your verification session has expired. Please register again.",
          () => router.replace("/register")
        );
        return;
      }

      if (code === "email_taken" || code === "username_taken" || code === "phone_taken" || code === "account_exists") {
        showPopup(
          "error",
          "Account problem",
          getApiErrorMessage(err, "An account with these details already exists."),
          () => router.replace("/login")
        );
        return;
      }

      if (code === "otp_cooldown") {
        setCooldown(getApiRetryAfter(err, DEFAULT_COOLDOWN));
        setError("Please wait for the cooldown before requesting another code.");
        return;
      }

      // Invalid / expired / attempts exhausted → inline message under the input.
      setError(describeOtpError(err, "Invalid or expired code."));
    } finally {
      setVerifying(false);
    }
  };

  // -------------------------------------------------------------
  // Resend (registration + login)
  // -------------------------------------------------------------
  const resend = async () => {
    if (cooldown > 0 || sending) return;

    if (mode === "registration" && registrationId) {
      setSending(true);
      try {
        const res = await authApi.otpResend(registrationId);
        setCooldown(res.data.resend_cooldown || DEFAULT_COOLDOWN);
        setBusinessNumber(res.data.whatsapp_number || businessNumber);
        const devOtp = res.data.debug_otp;
        if (__DEV__ && devOtp) setOtp(devOtp);
        showPopup(
          "success",
          "Code resent",
          __DEV__ && devOtp
            ? "Development mode: WhatsApp delivery is simulated — no real message was sent."
            : "A new code has been sent to your WhatsApp."
        );
      } catch (err) {
        const code = getApiErrorCode(err);
        if (code === "registration_expired") {
          showPopup(
            "error",
            "Verification expired",
            "Your verification session has expired. Please register again.",
            () => router.replace("/register")
          );
        } else if (code === "otp_cooldown") {
          setCooldown(getApiRetryAfter(err, DEFAULT_COOLDOWN));
        } else {
          showPopup("error", "Could not resend", describeOtpError(err, "Try again in a minute."));
        }
      } finally {
        setSending(false);
      }
      return;
    }

    if (mode === "login" && accessToken) {
      await requestLoginOtp(true);
    }
  };

  // -------------------------------------------------------------
  // Phone recovery (no context — resume by number)
  // -------------------------------------------------------------
  const sendByPhone = async () => {
    const trimmed = recoveryPhone.trim();
    if (!trimmed) {
      setRecoveryError("Enter the WhatsApp number you registered with.");
      return;
    }
    setSending(true);
    setRecoveryError(undefined);
    try {
      const res = await authApi.whatsappSendOtp(trimmed);
      const data = res.data as { registration_id?: string; phone_number?: string; message?: string; resend_cooldown?: number; whatsapp_number?: string; debug_otp?: string };

      if (!data.registration_id) {
        // Enumeration-safe response — no pending registration for that number.
        showPopup(
          "info",
          "No verification found",
          "There is no pending WhatsApp verification for that number. Create an account first.",
          () => router.replace("/register")
        );
        return;
      }

      setRegistrationId(data.registration_id);
      setPhoneNumber(data.phone_number ?? trimmed);
      if (data.whatsapp_number) setBusinessNumber(data.whatsapp_number);
      setMode("registration");
      setCooldown(data.resend_cooldown || DEFAULT_COOLDOWN);
      const devOtp = data.debug_otp;
      if (__DEV__ && devOtp) setOtp(devOtp);
    } catch (err) {
      const code = getApiErrorCode(err);
      if (code === "otp_cooldown") {
        showPopup("info", "Code recently sent", getApiErrorMessage(err, "A code was recently sent. Please wait before requesting another."));
      } else {
        setRecoveryError(describeOtpError(err, "Could not send the code. Please try again."));
      }
    } finally {
      setSending(false);
    }
  };

  // -------------------------------------------------------------
  // Render
  // -------------------------------------------------------------
  const roleLabel = roleKey === "provider" ? "provider" : "customer";
  const subtitle =
    mode === "login"
      ? email
        ? `Enter the 6-digit WhatsApp code to finish signing in as ${email}.`
        : "Enter the 6-digit WhatsApp code to finish signing in."
      : phoneNumber
        ? `We've sent a verification code to your WhatsApp number ${phoneNumber}.`
        : "We've sent a verification code to your WhatsApp.";

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AuthLayout
        showBack
        onBack={() => router.replace(mode === "login" ? "/login" : "/register")}
        title="Verify your WhatsApp"
        subtitle={mode === "phone" ? "Enter the WhatsApp number you registered with." : subtitle}
      >
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {mode === "phone" ? (
            <>
              <View style={styles.notice}>
                <Icon name="info" size={16} color={colors.primaryDark} />
                <Text style={styles.noticeText}>
                  Lost your verification screen? Enter your WhatsApp number and we'll resend the
                  code for your pending registration.
                </Text>
              </View>

              <Input
                label="WhatsApp number"
                placeholder="+977 98XXXXXXXX"
                value={recoveryPhone}
                onChangeText={(value) => {
                  setRecoveryPhone(value);
                  setRecoveryError(undefined);
                }}
                keyboardType="phone-pad"
                autoCapitalize="none"
                error={recoveryError}
                required
              />

              <Button
                label={sending ? "Sending…" : "Send OTP"}
                size="lg"
                fullWidth
                loading={sending}
                onPress={sendByPhone}
              />
            </>
          ) : (
            <>
              {mode === "registration" ? (
                <View style={styles.roleBanner}>
                  <Icon name="shield" size={16} color={colors.primaryDark} />
                  <Text style={styles.roleBannerText}>
                    Verifying your {roleLabel} account. Your choice stays locked during
                    verification.
                  </Text>
                </View>
              ) : null}

              <View style={styles.notice}>
                <Icon name="info" size={16} color={colors.primaryDark} />
                <Text style={styles.noticeText}>
                  {businessNumber
                    ? `Check WhatsApp for a message from ${businessNumber}. `
                    : ""}
                  Codes expire quickly for security — if yours has expired, request a new one
                  below.
                </Text>
              </View>

              <Input
                label="Verification code"
                placeholder="• • • • • •"
                value={otp}
                onChangeText={(value) => {
                  setOtp(value.replace(/\D/g, "").slice(0, 6));
                  setError(undefined);
                }}
                keyboardType="number-pad"
                maxLength={6}
                autoComplete="one-time-code"
                error={error}
                hint={cooldown > 0 ? `Resend available in ${cooldown}s` : undefined}
                autoFocus
              />

              <Button
                label="Verify"
                size="lg"
                fullWidth
                loading={verifying}
                onPress={verify}
              />

              <Button
                label={
                  sending
                    ? "Sending…"
                    : cooldown > 0
                      ? `Resend OTP in ${cooldown}s`
                      : "Resend OTP"
                }
                variant="ghost"
                size="sm"
                fullWidth
                disabled={sending || cooldown > 0}
                style={{ marginTop: spacing.sm }}
                onPress={resend}
              />

              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  {mode === "login" ? "Wrong account?" : "Wrong number?"}
                </Text>
                <Button
                  label={mode === "login" ? "Back to sign in" : "Back to register"}
                  variant="ghost"
                  size="sm"
                  onPress={() => router.replace(mode === "login" ? "/login" : "/register")}
                />
              </View>
            </>
          )}
        </ScrollView>
      </AuthLayout>

      <FeedbackModal
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={closePopup}
        confirmLabel={popup.type === "success" ? "Continue" : "OK"}
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
  roleBanner: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  roleBannerText: { flex: 1, ...typography.small, color: colors.textMuted },
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
