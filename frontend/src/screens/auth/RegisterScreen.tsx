/**
 * RegisterScreen — create a customer or provider account.
 *
 * Two steps, exactly like before:
 *   1. details → `authApi.register` (the backend emails the OTP and returns an
 *      access token used to verify it)
 *   2. OTP → `authApi.verifyOtp`, then JWT storage + post-login routing
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useRouter } from "expo-router";

import AuthLayout from "../../components/AuthLayout";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import Button from "../../components/ui/Button";
import Input, { PasswordInput } from "../../components/ui/Input";
import { Chip, StepTrail } from "../../components/ui/Layout";
import { authApi } from "../../services/api/authApi";
import { getApiErrorMessage } from "../../services/api/client";
import { setAuth, getPostLoginRoute } from "../../auth/auth";
import { colors, radius, spacing, typography, weight } from "../../theme/tokens";

const RESEND_COOLDOWN = 30;

export default function RegisterScreen() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{
    username?: string;
    email?: string;
    phone?: string;
    password?: string;
    otp?: string;
  }>({});

  // Backend uses CLIENT / FREELANCER.
  const [role, setRole] = useState<"CLIENT" | "FREELANCER">("CLIENT");

  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [usernameTaken, setUsernameTaken] = useState(false);

  // Access token returned by /api/auth/register/
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;

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
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: otpSent ? 1 : 0,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [otpSent, fadeAnim]);

  const normalizeEmail = (value: string) => value.trim().toLowerCase();

  const sendOtp = async () => {
    const nextErrors: typeof errors = {};
    if (!username.trim()) nextErrors.username = "Choose a username.";
    else if (username.trim().length < 3) nextErrors.username = "Use at least 3 characters.";
    if (!email.trim()) nextErrors.email = "Enter your email to receive the verification code.";
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) nextErrors.email = "That email looks incomplete.";
    if (!phone.trim()) nextErrors.phone = "Enter a phone number customers can reach you on.";
    if (password.length < 6) nextErrors.password = "Use at least 6 characters.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (usernameTaken) {
      setErrors({ username: "That username is already taken." });
      return;
    }
    if (cooldown > 0) return;

    setSendingOtp(true);

    try {
      const res = await authApi.register({
        username: username.trim(),
        email: normalizeEmail(email),
        phone: phone.trim(),
        password,
        role,
      });

      // OTP verification requires this access token.
      setAccessToken(res.data.access);
      setOtpSent(true);
      setCooldown(RESEND_COOLDOWN);

      const devOtp = res.data.debug_otp;
      if (__DEV__ && devOtp) setOtp(devOtp);

      showPopup(
        "success",
        "Account created",
        __DEV__ && devOtp
          ? "Your account was created. Enter the verification code to activate it."
          : "Your account was created. Check your email for the 6-digit code."
      );
    } catch (err) {
      showPopup("error", "Registration failed", getApiErrorMessage(err, "Could not create account."));
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyOtpRegister = async () => {
    if (!accessToken) {
      showPopup(
        "error",
        "Session missing",
        "Please register again to start a new verification session."
      );
      return;
    }

    const code = otp.trim();
    if (!code) {
      setErrors({ otp: "Enter the 6-digit code from your email." });
      return;
    }
    if (code.length !== 6) {
      setErrors({ otp: "The code has 6 digits." });
      return;
    }

    setVerifying(true);

    try {
      const res = await authApi.verifyOtp(accessToken, code);

      if (!res.data.access) {
        showPopup("error", "Verification failed", "No access token returned from the server.");
        return;
      }

      const user = res.data.user;

      await setAuth({
        access: res.data.access,
        refresh: res.data.refresh,
        role: user.role,
        username: user.username,
        email: user.email,
      });

      const route = await getPostLoginRoute(user.role);

      showPopup("success", "Account verified", "Welcome to Service Marketplace.", () =>
        router.replace(route)
      );
    } catch (err) {
      showPopup("error", "Verification failed", getApiErrorMessage(err, "Invalid or expired code."));
    } finally {
      setVerifying(false);
    }
  };

  const resendOtp = async () => {
    if (!accessToken) {
      showPopup("error", "Session missing", "Please register again to request another code.");
      return;
    }
    if (cooldown > 0) return;

    setSendingOtp(true);
    try {
      const res = await authApi.requestOtp(accessToken);
      setCooldown(RESEND_COOLDOWN);
      const devOtp = res.data.debug_otp;
      if (__DEV__ && devOtp) setOtp(devOtp);
      showPopup("success", "Code resent", __DEV__ && devOtp ? "A new code was generated." : "A new code is on its way.");
    } catch (err) {
      showPopup("error", "Could not resend", getApiErrorMessage(err, "Try again in a moment."));
    } finally {
      setSendingOtp(false);
    }
  };

  const step = otpSent ? 2 : 1;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <AuthLayout
        title="Create your account"
        subtitle="Choose how you want to use the marketplace, then verify your email."
        showBack
        onBack={() => router.back()}
      >
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.trail}>
            <StepTrail steps={["Your details", "Verify email"]} current={step - 1} />
          </View>

          <View style={styles.roleRow}>
            <Pressable
              onPress={() => setRole("CLIENT")}
              accessibilityRole="button"
              accessibilityState={{ selected: role === "CLIENT" }}
              style={[styles.roleCard, role === "CLIENT" ? styles.roleCardActive : null]}
            >
              <Text style={[styles.roleTitle, role === "CLIENT" ? styles.roleTitleActive : null]}>
                I need a service
              </Text>
              <Text style={styles.roleBody}>Book and manage local professionals.</Text>
            </Pressable>

            <Pressable
              onPress={() => setRole("FREELANCER")}
              accessibilityRole="button"
              accessibilityState={{ selected: role === "FREELANCER" }}
              style={[styles.roleCard, role === "FREELANCER" ? styles.roleCardActive : null]}
            >
              <Text
                style={[styles.roleTitle, role === "FREELANCER" ? styles.roleTitleActive : null]}
              >
                I offer services
              </Text>
              <Text style={styles.roleBody}>Publish listings and take bookings.</Text>
            </Pressable>
          </View>

          <Input
            label="Username"
            placeholder="Choose a username"
            value={username}
            onChangeText={(text) => {
              setUsername(text);
              setUsernameTaken(false);
              setErrors((prev) => ({ ...prev, username: undefined }));
            }}
            autoCapitalize="none"
            icon="user"
            error={
              errors.username ?? (usernameTaken ? "That username is already taken." : undefined)
            }
            required
          />

          <Input
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setErrors((prev) => ({ ...prev, email: undefined }));
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            error={errors.email}
            required
          />

          <Input
            label="Phone"
            placeholder="98XXXXXXXX"
            value={phone}
            onChangeText={(text) => {
              setPhone(text);
              setErrors((prev) => ({ ...prev, phone: undefined }));
            }}
            keyboardType="phone-pad"
            error={errors.phone}
            required
          />

          <PasswordInput
            label="Password"
            placeholder="At least 6 characters"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setErrors((prev) => ({ ...prev, password: undefined }));
            }}
            error={errors.password}
            required
          />

          {otpSent ? (
            <Animated.View style={{ opacity: fadeAnim }}>
              <Input
                label="Verification code"
                placeholder="123456"
                value={otp}
                onChangeText={(value) => {
                  setOtp(value.replace(/\D/g, "").slice(0, 6));
                  setErrors((prev) => ({ ...prev, otp: undefined }));
                }}
                keyboardType="number-pad"
                maxLength={6}
                autoComplete="one-time-code"
                error={errors.otp}
                hint="The code expires shortly — request a new one if it stops working."
              />
            </Animated.View>
          ) : null}

          {!otpSent ? (
            <Button
              label="Create account & send code"
              size="lg"
              fullWidth
              loading={sendingOtp}
              onPress={sendOtp}
            />
          ) : (
            <>
              <Button
                label="Verify & continue"
                size="lg"
                fullWidth
                loading={verifying}
                onPress={verifyOtpRegister}
              />
              <Button
                label={cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
                variant="ghost"
                size="sm"
                fullWidth
                disabled={sendingOtp || cooldown > 0}
                style={{ marginTop: spacing.sm }}
                onPress={resendOtp}
              />
            </>
          )}

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <Button
              label="Sign in"
              variant="ghost"
              size="sm"
              onPress={() => router.replace("/login")}
            />
          </View>

          <View style={styles.hintBox}>
            <Text style={styles.hintTitle}>Why we verify your email</Text>
            <Text style={styles.hintText}>
              Verification keeps fake accounts out of the marketplace. Providers additionally submit
              an identity document before they can publish services.
            </Text>
            <View style={styles.chipRow}>
              <Chip label="Email OTP" size="sm" active />
              <Chip label="KYC for providers" size="sm" />
            </View>
          </View>
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
  trail: { marginBottom: spacing.lg },
  roleRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.xl, flexWrap: "wrap" },
  roleCard: {
    flex: 1,
    minWidth: 150,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    gap: 2,
  },
  roleCardActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  roleTitle: { ...typography.bodyStrong, color: colors.text },
  roleTitleActive: { color: colors.primaryDark },
  roleBody: { ...typography.caption, color: colors.textMuted },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.md,
    flexWrap: "wrap",
  },
  footerText: { color: colors.textMuted, fontSize: 13.5 },
  hintBox: {
    marginTop: spacing.xxl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hintTitle: { ...typography.bodyStrong, color: colors.text },
  hintText: { ...typography.small, color: colors.textMuted, marginTop: spacing.xs },
  chipRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  weightBold: { fontWeight: weight.bold },
});
