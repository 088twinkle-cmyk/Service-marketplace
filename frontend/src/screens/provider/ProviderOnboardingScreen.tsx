/**
 * ProviderOnboardingScreen — provider profile setup (service, phone, location).
 * Submits to the same `kycApi.saveProfile` endpoint as before and then hands
 * over to the KYC step.
 */
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useRouter } from "expo-router";

import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Icon from "../../components/ui/Icon";
import Input from "../../components/ui/Input";
import { Container, StepTrail } from "../../components/ui/Layout";
import PageHeader from "../../components/ui/PageHeader";
import { kycApi } from "../../services/api/kycApi";
import { getApiErrorMessage } from "../../services/api/client";
import { StorageKeys, setItem } from "../../utils/storage";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import { useResponsive } from "../../theme/responsive";

const STEPS = ["Provider profile", "Identity documents", "Getting paid"];

export default function ProviderOnboardingScreen() {
  const router = useRouter();
  const { isDesktop } = useResponsive();

  const [service, setService] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [errors, setErrors] = useState<{ service?: string; phone?: string; location?: string }>({});
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState({
    visible: false,
    type: "info" as FeedbackType,
    title: "",
    message: "",
    onConfirm: undefined as (() => void) | undefined,
  });

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

  const submit = async () => {
    const nextErrors: typeof errors = {};
    if (!service.trim()) nextErrors.service = "Tell customers which service you offer.";
    if (!phone.trim()) nextErrors.phone = "Add a phone number customers can be reached on.";
    if (!location.trim()) nextErrors.location = "Add the city or area you work in.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      const profile = await kycApi.saveProfile({
        service: service.trim(),
        phone: phone.trim(),
        location: location.trim(),
      });
      await setItem(
        StorageKeys.PROFILE_COMPLETED,
        profile.profile_completed ? "true" : "false"
      );
      await setItem(StorageKeys.KYC_STATUS, profile.kyc_status);
      showPopup("success", "Profile saved", "Next step: submit your identity documents.", () =>
        router.replace("/provider-kyc")
      );
    } catch (err) {
      showPopup("error", "Save failed", getApiErrorMessage(err, "Could not save your profile."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Container style={styles.content}>
          <PageHeader
            eyebrow="Provider setup"
            title="Tell us about your work"
            subtitle="This information helps customers find you and appears on your provided-by card."
            onBack={() => router.push("/provider-home")}
          />

          <View style={styles.stepsWrap}>
            <StepTrail steps={STEPS} current={0} />
          </View>

          <View style={[styles.layout, isDesktop ? styles.layoutDesktop : null]}>
            <View style={styles.main}>
              <Card padding="lg" style={styles.card}>
                <Input
                  label="What do you offer?"
                  placeholder="e.g. Home electrical repairs"
                  value={service}
                  onChangeText={(text) => {
                    setService(text);
                    setErrors((prev) => ({ ...prev, service: undefined }));
                  }}
                  error={errors.service}
                  required
                />
                <Input
                  label="Phone number"
                  placeholder="98XXXXXXXX"
                  value={phone}
                  onChangeText={(text) => {
                    setPhone(text);
                    setErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                  keyboardType="phone-pad"
                  error={errors.phone}
                  hint="Shared with a customer only after a booking is agreed."
                  required
                />
                <Input
                  label="Primary service area"
                  placeholder="e.g. Kathmandu"
                  value={location}
                  onChangeText={(text) => {
                    setLocation(text);
                    setErrors((prev) => ({ ...prev, location: undefined }));
                  }}
                  error={errors.location}
                  hint="Used to match you with nearby customers."
                  containerStyle={{ marginBottom: 0 }}
                  required
                />

                <Button
                  label="Save and continue to verification"
                  size="lg"
                  fullWidth
                  trailingIcon="arrow-right"
                  loading={loading}
                  style={{ marginTop: spacing.lg }}
                  onPress={submit}
                />
              </Card>
            </View>

            <View style={[styles.rail, isDesktop ? styles.railDesktop : null]}>
              <Card padding="lg" style={styles.railCard}>
                <Text style={styles.railTitle}>What happens next</Text>
                <View style={styles.list}>
                  {[
                    "Your provider profile is saved to your account.",
                    "Submit an identity document for the verified badge.",
                    "Publish services with photos and a starting price.",
                    "Open time slots so customers can book you.",
                  ].map((line, index) => (
                    <View key={line} style={styles.listRow}>
                      <View style={styles.listDot}>
                        <Text style={styles.listDotText}>{index + 1}</Text>
                      </View>
                      <Text style={styles.listText}>{line}</Text>
                    </View>
                  ))}
                </View>
              </Card>

              <Card padding="lg" style={styles.railCard} tone="primary">
                <View style={styles.tipRow}>
                  <Icon name="shield" size={18} color={colors.primaryDark} />
                  <Text style={styles.tipText}>
                    Providing your details and documents once keeps your profile verified for every
                    future booking.
                  </Text>
                </View>
              </Card>
            </View>
          </View>
        </Container>
      </ScrollView>

      <FeedbackModal
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={closePopup}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing.xxl, paddingBottom: spacing.giant },
  stepsWrap: { marginBottom: spacing.xxl },
  layout: { gap: spacing.xxl },
  layoutDesktop: { flexDirection: "row", alignItems: "flex-start" },
  main: { flex: 1, minWidth: 0 },
  rail: { width: "100%" },
  railDesktop: { width: 340, flexShrink: 0, gap: spacing.xxl },
  card: { gap: spacing.xs },
  railCard: { gap: spacing.md, marginBottom: spacing.xxl },
  railTitle: { ...typography.h4, color: colors.text },
  list: { gap: spacing.md },
  listRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  listDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  listDotText: { fontSize: 11, fontWeight: "800", color: colors.primaryDark },
  listText: { flex: 1, ...typography.small, color: colors.textMuted },
  tipRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  tipText: { flex: 1, ...typography.small, color: colors.textMuted },
  radius: { borderRadius: radius.md },
});
