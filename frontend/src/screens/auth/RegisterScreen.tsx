/**
 * RegisterScreen — step 1 of the shared customer/provider registration.
 *
 * The form submits to `authApi.register`; the backend stores a PENDING
 * registration (no account yet) and sends a WhatsApp OTP to the phone
 * number.  The screen then hands over to the shared OtpScreen
 * (`/otp`) with the registration id — verification completes the account
 * and routes by role (customer → home, provider → provider flow).
 */
import React, { useState } from "react";
import {
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
import { authApi, getApiErrorCode } from "../../services/api/authApi";
import { getApiErrorMessage } from "../../services/api/client";
import { setPendingRegistration } from "../../auth/auth";
import { colors, radius, spacing, typography } from "../../theme/tokens";

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
  }>({});

  // Backend uses CLIENT / FREELANCER.
  const [role, setRole] = useState<"CLIENT" | "FREELANCER">("CLIENT");

  const [submitting, setSubmitting] = useState(false);
  const [usernameTaken, setUsernameTaken] = useState(false);

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

  const normalizeEmail = (value: string) => value.trim().toLowerCase();

  const submitRegistration = async () => {
    const nextErrors: typeof errors = {};
    if (!username.trim()) nextErrors.username = "Choose a username.";
    else if (username.trim().length < 3) nextErrors.username = "Use at least 3 characters.";
    if (!email.trim()) nextErrors.email = "Enter your email for account recovery.";
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) nextErrors.email = "That email looks incomplete.";
    if (!phone.trim()) nextErrors.phone = "Enter the WhatsApp number that should receive your verification code.";
    if (password.length < 6) nextErrors.password = "Use at least 6 characters.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (usernameTaken) {
      setErrors({ username: "That username is already taken." });
      return;
    }

    setSubmitting(true);

    try {
      const res = await authApi.register({
        username: username.trim(),
        email: normalizeEmail(email),
        phone: phone.trim(),
        password,
        role,
      });

      const data = res.data;

      // Keep the registration context for refresh-safety on the OTP screen.
      await setPendingRegistration({
        registrationId: data.registration_id,
        phoneNumber: data.phone_number,
      });

      showPopup(
        "success",
        "WhatsApp code sent",
        data.delivery === "simulated"
          ? "Development mode: WhatsApp delivery is simulated — no real message was sent. Continue with the code below."
          : `We've sent a 6-digit code to your WhatsApp number ${data.phone_number}.`,
        () =>
          router.replace({
            pathname: "/otp",
            params: {
              registration_id: data.registration_id,
              phone: data.phone_number,
              role: data.role_key,
              whatsapp_number: data.whatsapp_number ?? "",
            },
          } as never)
      );
    } catch (err) {
      const code = getApiErrorCode(err);

      if (code === "whatsapp_not_configured" || code === "whatsapp_unavailable") {
        showPopup(
          "error",
          "WhatsApp not available",
          getApiErrorMessage(
            err,
            "WhatsApp verification is not configured on the server yet. Please try again later."
          )
        );
        return;
      }

      showPopup("error", "Registration failed", getApiErrorMessage(err, "Could not start registration."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <AuthLayout
        title="Create your account"
        subtitle="Choose how you want to use the marketplace, then verify your WhatsApp number."
        showBack
        onBack={() => router.back()}
      >
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.trail}>
            <StepTrail steps={["Your details", "Verify WhatsApp"]} current={0} />
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
            label="WhatsApp number"
            placeholder="+977 98XXXXXXXX"
            value={phone}
            onChangeText={(text) => {
              setPhone(text);
              setErrors((prev) => ({ ...prev, phone: undefined }));
            }}
            keyboardType="phone-pad"
            error={errors.phone}
            hint="We'll send your 6-digit verification code to this WhatsApp number."
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

          <Button
            label="Create account & send code"
            size="lg"
            fullWidth
            loading={submitting}
            onPress={submitRegistration}
          />

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
            <Text style={styles.hintTitle}>Why we verify your WhatsApp</Text>
            <Text style={styles.hintText}>
              A verified WhatsApp number keeps fake accounts out of the marketplace. Providers
              additionally submit an identity document (KYC) before they can publish services.
            </Text>
            <View style={styles.chipRow}>
              <Chip label="WhatsApp OTP" size="sm" active />
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
});
