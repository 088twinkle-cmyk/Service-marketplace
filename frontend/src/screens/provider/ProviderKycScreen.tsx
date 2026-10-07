import React, { useEffect, useState } from "react";
import {
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  View,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import ScreenShell from "../../components/ScreenShell";
import FeedbackModal, {
  type FeedbackType,
} from "../../components/FeedbackModal";
import {
  DOCUMENT_TYPES,
  kycApi,
  type KycRecord,
  type ProviderProfile,
} from "../../services/api/kycApi";
import { StorageKeys, setItem } from "../../utils/storage";
import { sharedStyles } from "../../theme/sharedStyles";
import { getApiErrorMessage } from "../../services/api/client";
import {
  PRIMARY,
  CARD,
  TEXT,
  TEXT_MUTED,
  BORDER,
  BACKGROUND,
  TAG_BG,
} from "../../theme/colors";

type PickedDocument = {
  uri: string;
  fileName?: string | null;
  mimeType?: string;
  file?: File | null;
};

export default function ProviderKycScreen() {
  const router = useRouter();

  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [kyc, setKyc] = useState<KycRecord | null>(null);

  const [legalName, setLegalName] = useState("");
  const [documentType, setDocumentType] = useState<string>("citizenship");
  const [idNumber, setIdNumber] = useState("");
  const [document, setDocument] = useState<PickedDocument | null>(null);

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
      showPopup("error", "Permission needed", "Allow photo access to attach your ID.");
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
  };

  const submit = async () => {
    const cleanedName = legalName.trim();
    const cleanedId = idNumber.trim();

    if (!cleanedName) {
      showPopup("error", "Name required", "Enter your full legal name.");
      return;
    }
    if (!cleanedId) {
      showPopup("error", "ID required", "Enter your national ID or licence number.");
      return;
    }

    const alreadySubmitted = Boolean(kyc && kyc.kyc_status !== "not_submitted");
    if (!document && !alreadySubmitted) {
      showPopup("error", "Document required", "Attach a photo of your ID document.");
      return;
    }

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
        "KYC submitted",
        "Your documents were submitted. An admin will review them before your verified badge is granted.",
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
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={PRIMARY} />
      </View>
    );
  }

  const kycStatus = kyc?.kyc_status || profile?.kyc_status || "not_submitted";
  const isApproved = kycStatus === "approved" || Boolean(profile?.is_verified);
  const isSubmitted = kycStatus === "pending";
  const isRejected = kycStatus === "rejected";
  const rejectionReason = kyc?.rejection_reason || profile?.rejection_reason || "";

  return (
    <ScreenShell
      step="Step 6–7 · Verification"
      title="KYC submission"
      subtitle="Submit your ID for admin approval and a verified badge on your profile."
    >
      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Current KYC status</Text>
        <Text style={styles.statusValue}>
          {(kycStatus === "not_submitted" ? "not submitted" : kycStatus).toUpperCase()}
        </Text>

        {isApproved ? (
          <Text style={styles.statusDescription}>
            Your identity has been verified. Customers can see your verified badge.
          </Text>
        ) : isSubmitted ? (
          <Text style={styles.statusDescription}>
            Your documents are waiting for admin review. You will be notified once
            a decision is made.
          </Text>
        ) : isRejected ? (
          <Text style={styles.statusDescription}>
            {rejectionReason
              ? `Your last submission was rejected: ${rejectionReason}`
              : "Your last submission was rejected. Correct it and submit again."}
          </Text>
        ) : (
          <Text style={styles.statusDescription}>
            Your KYC has not been submitted yet.
          </Text>
        )}
      </View>

      <Text style={styles.label}>Full legal name</Text>
      <TextInput
        placeholder="Exactly as printed on your ID"
        placeholderTextColor={TEXT_MUTED}
        value={legalName}
        onChangeText={setLegalName}
        editable={!isApproved && !loading}
        style={[sharedStyles.input, isApproved && styles.disabledInput]}
        autoCapitalize="words"
      />

      <Text style={styles.label}>Document type</Text>
      <View style={styles.chipRow}>
        {DOCUMENT_TYPES.map((option) => {
          const active = option.value === documentType;
          return (
            <TouchableOpacity
              key={option.value}
              disabled={isApproved || loading || isSubmitted}
              onPress={() => setDocumentType(option.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Document number</Text>
      <TextInput
        placeholder="Enter your national ID or licence number"
        placeholderTextColor={TEXT_MUTED}
        value={idNumber}
        onChangeText={setIdNumber}
        editable={!isApproved && !loading}
        style={[sharedStyles.input, isApproved && styles.disabledInput]}
        autoCapitalize="characters"
      />

      <Text style={styles.label}>Document photo</Text>
      <TouchableOpacity
        onPress={pickDocument}
        disabled={isApproved || loading || isSubmitted}
        style={[styles.uploadBox, document && styles.uploadBoxFilled]}
      >
        {document ? (
          <>
            <Image source={{ uri: document.uri }} style={styles.preview} />
            <Text style={styles.uploadHint}>
              {document.fileName || "Selected image"} · tap to replace
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.uploadTitle}>Attach a photo of your ID</Text>
            <Text style={styles.uploadHint}>
              {isSubmitted
                ? "You already submitted a document. It is replaced only when you attach a new one."
                : "JPG, PNG, WEBP or GIF · up to 10 MB"}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {isRejected ? (
        <Text style={styles.helperText}>
          Attach a clearer photo and resubmit — approved data can no longer be changed.
        </Text>
      ) : null}

      {!isApproved ? (
        <TouchableOpacity
          onPress={submit}
          disabled={loading || isSubmitted}
          style={[
            sharedStyles.btnPrimary,
            (loading || isSubmitted) && { opacity: 0.65 },
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={sharedStyles.btnPrimaryText}>
              {isSubmitted
                ? "Waiting for review"
                : isRejected
                  ? "Resubmit KYC"
                  : kyc?.id
                    ? "Update KYC"
                    : "Submit KYC"}
            </Text>
          )}
        </TouchableOpacity>
      ) : (
        <View style={styles.approvedBox}>
          <Text style={styles.approvedText}>✓ Your KYC is approved</Text>
        </View>
      )}

      <TouchableOpacity
        onPress={() => router.replace("/provider-home")}
        style={styles.backButton}
      >
        <Text style={styles.backText}>Back to Dashboard</Text>
      </TouchableOpacity>

      <FeedbackModal
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={closePopup}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: BACKGROUND,
    alignItems: "center",
    justifyContent: "center",
  },
  statusCard: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: TEXT_MUTED,
    marginBottom: 5,
  },
  statusValue: {
    fontSize: 18,
    fontWeight: "800",
    color: PRIMARY,
    marginBottom: 6,
  },
  statusDescription: { fontSize: 13, lineHeight: 20, color: TEXT_MUTED },
  label: { fontSize: 13, fontWeight: "700", color: TEXT, marginBottom: 7 },
  disabledInput: { opacity: 0.6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 14 },
  chip: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: TAG_BG,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: { borderColor: PRIMARY, backgroundColor: "#E8F0FE" },
  chipText: { color: TEXT_MUTED, fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: PRIMARY },
  uploadBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: BORDER,
    borderRadius: 10,
    padding: 18,
    alignItems: "center",
    backgroundColor: CARD,
  },
  uploadBoxFilled: { borderStyle: "solid" },
  uploadTitle: { fontWeight: "700", color: TEXT, marginBottom: 4 },
  uploadHint: { fontSize: 12, color: TEXT_MUTED, textAlign: "center" },
  preview: { width: 140, height: 140, borderRadius: 8, marginBottom: 8 },
  helperText: { fontSize: 12, color: TEXT_MUTED, marginTop: 10 },
  approvedBox: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  approvedText: { color: PRIMARY, fontWeight: "800", fontSize: 15 },
  backButton: { marginTop: 12, padding: 14, alignItems: "center" },
  backText: { color: TEXT_MUTED, fontWeight: "600", fontSize: 14 },
});
