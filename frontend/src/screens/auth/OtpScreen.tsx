/**
 * Email OTP verification.
 *
 * Reached from the login screen when the backend answers `otp_required`, or
 * from registration. The access token issued by the login/register call is
 * already stored, and the OTP endpoints are authenticated with it.
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { authApi } from "../../services/api/authApi";
import { getApiErrorMessage } from "../../services/api/client";
import { getAuth, getPostLoginRoute, setAuth } from "../../auth/auth";
import AuthLayout, { authFormStyles as s } from "../../components/AuthLayout";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";

const RESEND_COOLDOWN = 45;

export default function OtpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();

  const [email, setEmail] = useState(params.email ?? "");
  const [otp, setOtp] = useState("");
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
      showPopup(
        "error",
        "Session expired",
        "Sign in again to request a new verification code.",
        () => router.replace("/login")
      );
      return;
    }
    if (code.length !== 6) {
      showPopup("error", "Invalid code", "Enter the 6-digit code from your email.");
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
      showPopup("success", "Email verified", "Your account is ready.", () =>
        router.replace(route)
      );
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
    <AuthLayout
      showBack
      title="Verify your email"
      subtitle={
        email
          ? `Enter the 6-digit code we sent to ${email}.`
          : "Enter the 6-digit code we sent to your email."
      }
    >
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.label}>Verification code</Text>
          <TextInput
            value={otp}
            onChangeText={setOtp}
            placeholder="123456"
            keyboardType="number-pad"
            maxLength={6}
            style={s.input}
            autoComplete="one-time-code"
          />

          <TouchableOpacity
            onPress={verify}
            disabled={verifying}
            style={[s.button, verifying && s.buttonDisabled]}
          >
            {verifying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.buttonText}>Verify & continue</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={resend}
            disabled={sending || cooldown > 0}
            style={s.linkRow}
          >
            {sending ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text style={s.link}>
                {cooldown > 0 ? (
                  `Resend code in ${cooldown}s`
                ) : (
                  <Text style={s.linkBold}>Resend code</Text>
                )}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace("/login")} style={s.linkRow}>
            <Text style={s.link}>
              Back to <Text style={s.linkBold}>sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <FeedbackModal
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={closePopup}
      />
    </AuthLayout>
  );
}
