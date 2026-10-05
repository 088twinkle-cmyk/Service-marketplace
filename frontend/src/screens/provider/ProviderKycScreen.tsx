import React, { useEffect, useState } from "react";
import {
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  View,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import ScreenShell from "../../components/ScreenShell";
import FeedbackModal, {
  type FeedbackType,
} from "../../components/FeedbackModal";
import { kycApi, type ProviderProfile } from "../../services/api/kycApi";
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
} from "../../theme/colors";

export default function ProviderKycScreen() {
  const router = useRouter();

  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [idNumber, setIdNumber] = useState("");
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
    const loadProfile = async () => {
      try {
        const currentProfile = await kycApi.getProfile();

        setProfile(currentProfile);

        if (currentProfile.id_number) {
          setIdNumber(currentProfile.id_number);
        }
      } catch {
        // If profile cannot be loaded, keep the form usable.
      } finally {
        setCheckingProfile(false);
      }
    };

    loadProfile();
  }, []);

  const showPopup = (
    type: FeedbackType,
    title: string,
    message: string,
    onConfirm?: () => void
  ) => {
    setPopup({
      visible: true,
      type,
      title,
      message,
      onConfirm,
    });
  };

  const closePopup = () => {
    const cb = popup.onConfirm;

    setPopup((p) => ({
      ...p,
      visible: false,
      onConfirm: undefined,
    }));

    cb?.();
  };

  const submit = async () => {
    const cleanedId = idNumber.trim();

    if (!cleanedId) {
      showPopup(
        "error",
        "ID required",
        "Enter your national ID or license number."
      );
      return;
    }

    setLoading(true);

    try {
      const updatedProfile = await kycApi.submitKyc(cleanedId);

      setProfile(updatedProfile);

      await setItem(
        StorageKeys.KYC_STATUS,
        updatedProfile.kyc_status
      );

      showPopup(
        "success",
        "KYC submitted",
        "Your KYC has been submitted successfully. Admin will review it before verification.",
        () => router.replace("/provider-home")
      );
    } catch (err) {
      showPopup(
        "error",
        "Submission failed",
        getApiErrorMessage(
          err,
          "KYC submission failed. Please try again."
        )
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

  const kycStatus = profile?.kyc_status || "pending";

  const isApproved =
    profile?.is_verified || kycStatus === "approved";

  const isSubmitted =
    kycStatus === "submitted";

  return (
    <ScreenShell
      step="Step 6–7 · Verification"
      title="KYC submission"
      subtitle="Submit your ID for admin approval and a verified badge on your profile."
    >
      {/* Current KYC status */}
      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>
          Current KYC status
        </Text>

        <Text style={styles.statusValue}>
          {kycStatus.toUpperCase()}
        </Text>

        {isApproved ? (
          <Text style={styles.statusDescription}>
            Your identity has been verified. You can now publish
            services.
          </Text>
        ) : isSubmitted ? (
          <Text style={styles.statusDescription}>
            Your KYC has been submitted and is waiting for admin
            approval.
          </Text>
        ) : kycStatus === "rejected" ? (
          <Text style={styles.statusDescription}>
            Your KYC was rejected. You can update your information
            and submit it again.
          </Text>
        ) : (
          <Text style={styles.statusDescription}>
            Your KYC has not been submitted yet.
          </Text>
        )}
      </View>

      {/* ID input */}
      <Text style={styles.label}>
        National ID / License Number
      </Text>

      <TextInput
        placeholder="Enter your national ID or license number"
        placeholderTextColor={TEXT_MUTED}
        value={idNumber}
        onChangeText={setIdNumber}
        editable={!isApproved && !loading}
        style={[
          sharedStyles.input,
          isApproved && styles.disabledInput,
        ]}
        autoCapitalize="characters"
      />

      {/* Submit / Resubmit */}
      {!isApproved ? (
        <TouchableOpacity
          onPress={submit}
          disabled={loading}
          style={[
            sharedStyles.btnPrimary,
            loading && { opacity: 0.65 },
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={sharedStyles.btnPrimaryText}>
              {kycStatus === "rejected"
                ? "Resubmit KYC"
                : isSubmitted
                  ? "Update KYC"
                  : "Submit KYC"}
            </Text>
          )}
        </TouchableOpacity>
      ) : (
        <View style={styles.approvedBox}>
          <Text style={styles.approvedText}>
            ✓ Your KYC is approved
          </Text>
        </View>
      )}

      {/* Back to dashboard */}
      <TouchableOpacity
        onPress={() => router.replace("/provider-home")}
        style={styles.backButton}
      >
        <Text style={styles.backText}>
          Back to Dashboard
        </Text>
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

  statusDescription: {
    fontSize: 13,
    lineHeight: 20,
    color: TEXT_MUTED,
  },

  label: {
    fontSize: 13,
    fontWeight: "700",
    color: TEXT,
    marginBottom: 7,
  },

  disabledInput: {
    opacity: 0.6,
  },

  approvedBox: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },

  approvedText: {
    color: PRIMARY,
    fontWeight: "800",
    fontSize: 15,
  },

  backButton: {
    marginTop: 12,
    padding: 14,
    alignItems: "center",
  },

  backText: {
    color: TEXT_MUTED,
    fontWeight: "600",
    fontSize: 14,
  },
});