/**
 * LoginScreen — email + password sign in.
 *
 * Handles the OTP-required branch: the JWT is stored, then the user is
 * routed to `/otp` when the account still needs WhatsApp verification. The
 * verification screen requests the WhatsApp code itself.
 */
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { useRouter } from "expo-router";

import AuthLayout from "../../components/AuthLayout";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import Button from "../../components/ui/Button";
import Input, { PasswordInput } from "../../components/ui/Input";
import { authApi } from "../../services/api/authApi";
import { getApiErrorMessage } from "../../services/api/client";
import { setAuth, getPostLoginRoute } from "../../auth/auth";
import { colors, spacing, typography, weight } from "../../theme/tokens";

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);

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

  const loginUser = async () => {
    const nextErrors: typeof errors = {};
    if (!email.trim()) nextErrors.email = "Enter the email you registered with.";
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) nextErrors.email = "That email address looks incomplete.";
    if (!password.trim()) nextErrors.password = "Enter your password.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);

    try {
      const res = await authApi.login({
        email: email.trim().toLowerCase(),
        password,
      });

      const { access, refresh, user, otp_required } = res.data;

      if (!access || !user) {
        showPopup("error", "Login failed", "The server returned an unexpected response.");
        return;
      }

      /*
       * Save the JWT even when OTP verification is still required — the OTP
       * verification endpoint is authenticated with this access token.
       */
      await setAuth({
        access,
        refresh,
        role: user.role,
        username: user.username,
        email: user.email,
      });

      if (otp_required || !user.is_otp_verified) {
        showPopup("info", "WhatsApp verification required", "We'll send a 6-digit code to your WhatsApp number.", () =>
          router.replace({
            pathname: "/otp",
            params: { email: user.email ?? email.trim().toLowerCase(), auto: "1" },
          } as never)
        );
        return;
      }

      const route = await getPostLoginRoute(user.role);

      showPopup("success", "Signed in", `Welcome back, ${user.username}!`, () =>
        router.replace(route)
      );
    } catch (err) {
      showPopup("error", "Login failed", getApiErrorMessage(err, "Could not sign in."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <AuthLayout
        title="Welcome back"
        subtitle="Sign in to book services, manage bookings, or open your provider dashboard."
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
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            icon="user"
            error={errors.email}
            required
          />

          <PasswordInput
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setErrors((prev) => ({ ...prev, password: undefined }));
            }}
            error={errors.password}
            required
          />

          <Button
            label="Sign In"
            size="lg"
            fullWidth
            loading={loading}
            onPress={loginUser}
          />

          <View style={styles.links}>
            <Button
              label="Forgot password?"
              variant="ghost"
              size="sm"
              onPress={() => router.push("/forgot-password")}
            />

            <View style={styles.newAccount}>
              <Text style={styles.text}>New here?</Text>
              <Button
                label="Create account"
                variant="ghost"
                size="sm"
                onPress={() => router.replace("/register")}
              />
            </View>
          </View>

          <View style={styles.hintBox}>
            <Text style={styles.hintTitle}>Are you a service professional?</Text>
            <Text style={styles.hintText}>
              Create a provider account to publish services, manage availability and receive
              bookings.
            </Text>
            <Button
              label="Become an Expert"
              variant="outline"
              size="sm"
              icon="sparkle"
              style={{ marginTop: spacing.sm, alignSelf: "flex-start" }}
              onPress={() => router.replace("/register")}
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
        confirmLabel={popup.type === "success" ? "Continue" : "OK"}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  links: { marginTop: spacing.md, alignItems: "center", gap: spacing.xs },
  newAccount: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap", justifyContent: "center" },
  text: { color: colors.textMuted, fontSize: 13.5 },
  hintBox: {
    marginTop: spacing.xxl,
    padding: spacing.lg,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hintTitle: { ...typography.bodyStrong, color: colors.text },
  hintText: { ...typography.small, color: colors.textMuted, marginTop: spacing.xs },
  pressed: { opacity: 0.7 },
  weightBold: { fontWeight: weight.bold },
});
