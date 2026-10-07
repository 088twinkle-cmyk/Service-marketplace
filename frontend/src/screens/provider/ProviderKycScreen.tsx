/**
 * ProviderKycScreen — identity verification (KYC).
 *
 * Same submission flow as before (profile + record load, document picker,
 * multipart submit, status storage). The redesign makes the verification state
 * unmistakable: a status banner, a progress trail, an upload card with preview
 * and honest guidance for every state (not submitted / under review / rejected /
 * approved).
 */
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";

import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import Badge, { statusMeta } from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Icon from "../../components/ui/Icon";
import Input from "../../components/ui/Input";
import { Chip, Container, StepTrail } from "../../components/ui/Layout";
import PageHeader from "../../components/ui/PageHeader";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { DOCUMENT_TYPES, kycApi, type KycRecord, type ProviderProfile } from "../../services/api/kycApi";
import { getApiErrorMessage } from "../../services/api/client";
import { StorageKeys, setItem } from "../../utils/storage";
import { colors, radius, spacing, typography, weight } from "../../theme/tokens";
import { useResponsive } from "../../theme/responsive";

type PickedDocument = {
  uri: string;
  fileName?: string | null;
  mimeType?: string;
  file?: File | null;
};

export default function ProviderKycScreen() {
  const router = useRouter();
  const { isDesktop } = useResponsive();

  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [kyc, setKyc] = useState<KycRecord | null>(null);

  const [legalName, setLegalName] = useState("");
  const [documentType, setDocumentType] = useState<string>("citizenship");
  const [idNumber, setIdNumber] = useState("");
  const [document, setDocument] = useState<PickedDocument | null>(null);
  const [errors, setErrors] = useState<{ name?: string; number?: string; document?: string }>({});

  const [loading, setLoading] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(true);

  const [popup, setPopup] = useState({
    visible: false,
    type: "info" as FeedbackType,
    title: "",
    message: "",
    onConfirm: undefined as (() => void) | undefined,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const currentProfile = await kycApi.getProfile();
        setProfile(currentProfile);

        const record = await kycApi.getKyc().catch(() => null);
        if (record && record.kyc_status !== "not_submitted") {
          setKyc(record);
          setLegalName(record.legal_name || "");
          setDocumentType(record.document_type || "citizenship");
          setIdNumber(record.document_number || "");
        } else if (record) {
          setKyc(record);
        }
      } catch {
        // Keep the form usable even if the profile cannot be loaded yet.
      } finally {
        setCheckingProfile(false);
      }
    };

    load();
  }, []);

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

  const pickDocument = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showPopup("error", "Permission needed", "Allow photo access to attach your ID document.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    // On the web the shim also hands back the underlying File so the
    // multipart upload keeps a filename.
    const webFile =
      typeof Blob !== "undefined" && asset.uri?.startsWith("blob:")
        ? await fetch(asset.uri).then((r) => r.blob())
        : null;

    setDocument({
      uri: asset.uri,
      fileName: asset.fileName ?? null,
      mimeType: asset.mimeType ?? undefined,
      file: (webFile as File | null) ?? null,
    });
    setErrors((prev) => ({ ...prev, document: undefined }));
  };

  const submit = async () => {
    const cleanedName = legalName.trim();
    const cleanedId = idNumber.trim();
    const alreadySubmitted = Boolean(kyc && kyc.kyc_status !== "not_submitted");

    const nextErrors: typeof errors = {};
    if (!cleanedName) nextErrors.name = "Enter your full legal name exactly as printed on your ID.";
    if (!cleanedId) nextErrors.number = "Enter your national ID or licence number.";
    if (!document && !alreadySubmitted) nextErrors.document = "Attach a photo of your ID document.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      const updated = await kycApi.submitKyc({
        legal_name: cleanedName,
        document_type: documentType,
        document_number: cleanedId,
        document_front: document
          ? document.file ?? {
              uri: document.uri,
              name: document.fileName || "kyc-document.jpg",
              mimeType: document.mimeType || "image/jpeg",
            }
          : undefined,
      });

      setKyc(updated);
      await setItem(StorageKeys.KYC_STATUS, updated.kyc_status);

      showPopup(
        "success",
        "Documents submitted",
        "Our team reviews submitted documents before the verified badge is granted. You will be notified once a decision is made.",
        () => router.replace("/provider-home")
      );
    } catch (err) {
      showPopup(
        "error",
        "Submission failed",
        getApiErrorMessage(err, "KYC submission failed. Please try again.")
      );
    } finally {
      setLoading(false);
    }
  };

  if (checkingProfile) {
    return (
      <Container style={styles.content}>
        <SkeletonBlock height={140} radiusValue={radius.xl} />
        <View style={{ height: spacing.xl }} />
        <SkeletonBlock height={260} radiusValue={radius.xl} />
      </Container>
    );
  }

  const kycStatus = kyc?.kyc_status || profile?.kyc_status || "not_submitted";
  const isApproved = kycStatus === "approved" || Boolean(profile?.is_verified);
  const isSubmitted = kycStatus === "pending";
  const isRejected = kycStatus === "rejected";
  const rejectionReason = kyc?.rejection_reason || profile?.rejection_reason || "";
  const meta = statusMeta(kycStatus);
  const tone = isApproved ? "success" : isRejected ? "danger" : isSubmitted ? "warning" : "neutral";
  const currentStep = isApproved ? 3 : isSubmitted || isRejected ? 2 : 1;
  const editable = !isApproved && !loading;

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Container style={styles.content}>
          <PageHeader
            eyebrow="Verification"
            title="Identity verification"
            subtitle="A reviewed document is what earns the verified badge customers filter for. Documents are only used for this review."
            onBack={() => router.push("/provider-home")}
            actions={
              <Badge label={meta.label} tone={tone} size="md" dot />
            }
          />

          {/* Status banner */}
          <Card padding="lg" tone={tone} style={styles.banner}>
            <View style={styles.bannerRow}>
              <View style={styles.bannerIcon}>
                <Icon
                  name={isApproved ? "check" : isRejected ? "alert" : isSubmitted ? "clock" : "shield"}
                  size={20}
                  color={
                    isApproved
                      ? colors.success
                      : isRejected
                        ? colors.danger
                        : isSubmitted
                          ? colors.warning
                          : colors.textMuted
                  }
                />
              </View>
              <View style={styles.bannerText}>
                <Text style={styles.bannerTitle}>
                  {isApproved
                    ? "Verification approved"
                    : isSubmitted
                      ? "Documents under review"
                      : isRejected
                        ? "Verification rejected"
                        : "Not submitted yet"}
                </Text>
                <Text style={styles.bannerBody}>
                  {isApproved
                    ? "Your identity has been verified. Customers see the verified badge on your listings."
                    : isSubmitted
                      ? "An administrator is reviewing your submission. Publishing services is enabled once it is approved."
                      : isRejected
                        ? rejectionReason
                          ? `Rejected: ${rejectionReason}`
                          : "Your last submission was rejected. Correct the details and submit again."
                        : "Submit your ID document to apply for the verified badge."}
                </Text>
              </View>
            </View>

            <View style={styles.bannerTrail}>
              <StepTrail steps={["Submit documents", "Admin review", "Verified"]} current={currentStep} />
            </View>
          </Card>

          <View style={[styles.layout, isDesktop ? styles.layoutDesktop : null]}>
            {/* Form */}
            <View style={styles.main}>
              <Card padding="lg" style={styles.formCard}>
                <Text style={styles.formTitle}>Identity details</Text>
                <Text style={styles.formSubtitle}>
                  Use the exact details printed on your document — mismatches are the most common
                  reason for rejection.
                </Text>

                <Input
                  label="Full legal name"
                  placeholder="Exactly as printed on your ID"
                  value={legalName}
                  onChangeText={(text) => {
                    setLegalName(text);
                    setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  editable={editable}
                  autoCapitalize="words"
                  error={errors.name}
                  required
                />

                <Text style={styles.fieldLabel}>Document type</Text>
                <View style={styles.chipRow}>
                  {DOCUMENT_TYPES.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      active={option.value === documentType}
                      disabled={!editable || isSubmitted}
                      onPress={() => setDocumentType(option.value)}
                    />
                  ))}
                </View>

                <Input
                  label="Document number"
                  placeholder="National ID or licence number"
                  value={idNumber}
                  onChangeText={(text) => {
                    setIdNumber(text);
                    setErrors((prev) => ({ ...prev, number: undefined }));
                  }}
                  editable={editable}
                  autoCapitalize="characters"
                  error={errors.number}
                  containerStyle={{ marginTop: spacing.lg }}
                  required
                />

                {/* Upload card */}
                <Text style={styles.fieldLabel}>Document photo</Text>
                <Pressable
                  onPress={pickDocument}
                  disabled={!editable || isSubmitted}
                  accessibilityRole="button"
                  accessibilityLabel="Attach a photo of your ID document"
                  style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                    styles.upload,
                    document ? styles.uploadFilled : null,
                    hovered && editable ? styles.uploadHover : null,
                    pressed ? styles.pressed : null,
                    errors.document ? styles.uploadError : null,
                  ]}
                >
                  {document ? (
                    <View style={styles.previewRow}>
                      <Image source={{ uri: document.uri }} style={styles.preview} contentFit="cover" />
                      <View style={styles.previewInfo}>
                        <Text style={styles.previewName} numberOfLines={1}>
                          {document.fileName || "Selected image"}
                        </Text>
                        <Text style={styles.previewHint}>
                          {editable && !isSubmitted
                            ? "Tap to replace this photo"
                            : "This document was already submitted"}
                        </Text>
                      </View>
                      <Icon name="check" size={18} color={colors.success} />
                    </View>
                  ) : (
                    <View style={styles.uploadEmpty}>
                      <Icon name="upload" size={22} color={colors.primary} badge />
                      <Text style={styles.uploadTitle}>Attach a photo of your ID</Text>
                      <Text style={styles.uploadHint}>
                        JPG, PNG, WEBP or GIF · up to 10 MB · details must be readable
                      </Text>
                    </View>
                  )}
                </Pressable>
                {errors.document ? <Text style={styles.errorText}>{errors.document}</Text> : null}

                {isRejected ? (
                  <View style={styles.noteRow}>
                    <Icon name="info" size={15} color={colors.warning} />
                    <Text style={styles.noteText}>
                      Attach a clearer photo and resubmit — approved data can no longer be changed.
                    </Text>
                  </View>
                ) : null}

                {!isApproved ? (
                  <Button
                    label={
                      isSubmitted
                        ? "Waiting for review"
                        : isRejected
                          ? "Resubmit verification"
                          : kyc?.id
                            ? "Update submission"
                            : "Submit for verification"
                    }
                    size="lg"
                    fullWidth
                    loading={loading}
                    disabled={isSubmitted}
                    style={{ marginTop: spacing.lg }}
                    onPress={submit}
                  />
                ) : (
                  <View style={styles.approvedBox}>
                    <Icon name="check" size={16} color={colors.success} />
                    <Text style={styles.approvedText}>Your KYC is approved</Text>
                  </View>
                )}

                <Button
                  label="Back to dashboard"
                  variant="ghost"
                  size="sm"
                  fullWidth
                  style={{ marginTop: spacing.sm }}
                  onPress={() => router.replace("/provider-home")}
                />
              </Card>
            </View>

            {/* Guidance rail */}
            <View style={[styles.rail, isDesktop ? styles.railDesktop : null]}>
              <Card padding="lg" style={styles.railCard}>
                <Text style={styles.railTitle}>Why verification matters</Text>
                <View style={styles.railList}>
                  {[
                    "Customers can filter the marketplace to verified providers only.",
                    "The verified badge appears on every one of your listings.",
                    "Services can only be published after approval.",
                  ].map((line) => (
                    <View key={line} style={styles.railItem}>
                      <Icon name="check" size={15} color={colors.success} />
                      <Text style={styles.railText}>{line}</Text>
                    </View>
                  ))}
                </View>
              </Card>

              <Card padding="lg" style={styles.railCard}>
                <Text style={styles.railTitle}>Tips for a fast review</Text>
                <View style={styles.railList}>
                  {[
                    "Photograph the whole document with all four corners visible.",
                    "Avoid glare, blur and shadows over the text.",
                    "Make sure the name and number match the fields above.",
                  ].map((line) => (
                    <View key={line} style={styles.railItem}>
                      <Icon name="info" size={15} color={colors.primary} />
                      <Text style={styles.railText}>{line}</Text>
                    </View>
                  ))}
                </View>
              </Card>

              {loading ? (
                <Card padding="lg" style={styles.railCard}>
                  <ActivityIndicator color={colors.primary} />
                </Card>
              ) : null}
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
  banner: { gap: spacing.lg, marginBottom: spacing.xxl },
  bannerRow: { flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" },
  bannerIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerText: { flex: 1, minWidth: 200 },
  bannerTitle: { ...typography.h4, color: colors.text },
  bannerBody: { ...typography.small, color: colors.textMuted, marginTop: spacing.xs },
  bannerTrail: { paddingTop: spacing.sm },

  layout: { gap: spacing.xxl },
  layoutDesktop: { flexDirection: "row", alignItems: "flex-start" },
  main: { flex: 1, minWidth: 0 },
  rail: { width: "100%" },
  railDesktop: { width: 340, flexShrink: 0, gap: spacing.xxl },

  formCard: { gap: spacing.xs },
  formTitle: { ...typography.h3, color: colors.text },
  formSubtitle: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: weight.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg },

  upload: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    padding: spacing.lg,
    backgroundColor: colors.surfaceAlt,
  },
  uploadFilled: { borderStyle: "solid", borderColor: colors.successBorder, backgroundColor: colors.successSoft },
  uploadHover: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  uploadError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  uploadEmpty: { alignItems: "center", gap: spacing.sm },
  uploadTitle: { ...typography.bodyStrong, color: colors.text },
  uploadHint: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
  previewRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  preview: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  previewInfo: { flex: 1, gap: 2 },
  previewName: { ...typography.bodyStrong, color: colors.text },
  previewHint: { ...typography.caption, color: colors.textMuted },
  errorText: { color: colors.danger, fontSize: 12.5, marginTop: spacing.sm, fontWeight: weight.medium },
  noteRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", marginTop: spacing.md },
  noteText: { flex: 1, ...typography.caption, color: colors.textMuted },
  approvedBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  approvedText: { ...typography.bodyStrong, color: colors.success },

  railCard: { gap: spacing.md, marginBottom: spacing.xxl },
  railTitle: { ...typography.h4, color: colors.text },
  railList: { gap: spacing.sm },
  railItem: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  railText: { flex: 1, ...typography.small, color: colors.textMuted },
  pressed: { opacity: 0.9 },
});
