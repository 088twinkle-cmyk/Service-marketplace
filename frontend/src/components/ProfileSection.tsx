/**
 * ProfileSection — account card used by the customer dashboard.
 *
 * Keeps every existing capability (upload/remove photo, change password, show
 * role + KYC status) and presents it as a compact, scannable account panel.
 */
import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";

import type { UserProfile } from "../services/api/userApi";
import { userApi } from "../services/api/userApi";
import { getApiErrorMessage } from "../services/api/client";
import { resolveMediaUrl } from "../config/api";
import { colors, radius, spacing, typography, weight } from "../theme/tokens";
import Button from "./ui/Button";
import Card, { Divider } from "./ui/Card";
import FeedbackModal, { type FeedbackType } from "./FeedbackModal";
import Input, { PasswordInput } from "./ui/Input";
import Badge, { statusMeta } from "./ui/Badge";

type Props = {
  profile: UserProfile | null;
  onUpdated: (profile: UserProfile) => void;
};

export default function ProfileSection({ profile, onUpdated }: Props) {
  const [uploading, setUploading] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [showPwForm, setShowPwForm] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});

  const [popup, setPopup] = useState({
    visible: false,
    type: "info" as FeedbackType,
    title: "",
    message: "",
  });

  const show = (type: FeedbackType, title: string, message: string) =>
    setPopup({ visible: true, type, title, message });

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!perm.granted) {
      show("error", "Permission needed", "Allow photo access to set your profile picture.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.75,
    });

    if (result.canceled || !result.assets?.[0]) return;

    setUploading(true);

    try {
      const asset = result.assets[0];
      const formData = new FormData();

      formData.append("profile_photo", {
        uri: asset.uri,
        name: asset.fileName ?? "profile.jpg",
        type: asset.mimeType ?? "image/jpeg",
      } as never);

      const updated = await userApi.uploadPhoto(formData);
      onUpdated(updated);
      show("success", "Photo updated", "Your profile photo was saved.");
    } catch (err) {
      show("error", "Upload failed", getApiErrorMessage(err, "Could not upload photo."));
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    setUploading(true);
    try {
      const updated = await userApi.deletePhoto();
      onUpdated(updated);
      show("success", "Photo removed", "Your profile photo was deleted.");
    } catch (err) {
      show("error", "Failed", getApiErrorMessage(err, "Could not remove photo."));
    } finally {
      setUploading(false);
    }
  };

  const submitPassword = async () => {
    const nextErrors: typeof errors = {};

    if (!currentPw) nextErrors.current = "Enter your current password.";
    if (!newPw) nextErrors.next = "Choose a new password.";
    else if (newPw.length < 6) nextErrors.next = "Use at least 6 characters.";
    if (newPw && newPw !== confirmPw) nextErrors.confirm = "Passwords do not match.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setChangingPw(true);

    try {
      await userApi.changePassword(currentPw, newPw);
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setShowPwForm(false);
      show("success", "Password changed", "Your password was updated.");
    } catch (err) {
      show("error", "Failed", getApiErrorMessage(err, "Could not change password."));
    } finally {
      setChangingPw(false);
    }
  };

  if (!profile) return null;

  const normalizedRole = profile.role?.toUpperCase();
  const roleLabel =
    normalizedRole === "FREELANCER" || normalizedRole === "PROVIDER"
      ? "Service provider"
      : normalizedRole === "ADMIN"
        ? "Administrator"
        : "Customer";
  const isProvider = normalizedRole === "FREELANCER" || normalizedRole === "PROVIDER";
  const kycMeta = profile.kyc_status ? statusMeta(profile.kyc_status) : null;

  return (
    <Card padding="lg" style={styles.wrap}>
      <View style={styles.head}>
        {profile.profile_photo ? (
          <Image
            source={{ uri: resolveMediaUrl(profile.profile_photo) }}
            style={styles.avatar}
            key={profile.profile_photo}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
          />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarLetter}>{profile.username.charAt(0).toUpperCase()}</Text>
          </View>
        )}

        <View style={styles.headText}>
          <Text style={styles.name} numberOfLines={1}>
            {profile.username}
          </Text>
          <Text style={styles.email} numberOfLines={1}>
            {profile.email}
          </Text>
          <View style={styles.badges}>
            <Badge label={roleLabel} tone="primary" />
            {isProvider && kycMeta ? (
              <Badge label={kycMeta.label} tone={kycMeta.tone} dot />
            ) : null}
            {profile.is_verified ? <Badge label="ID verified" tone="success" icon="shield" /> : null}
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          label={profile.profile_photo ? "Change photo" : "Upload photo"}
          variant="outline"
          size="sm"
          icon="upload"
          loading={uploading}
          onPress={pickPhoto}
        />
        {profile.profile_photo ? (
          <Button
            label="Remove"
            variant="ghost"
            size="sm"
            disabled={uploading}
            onPress={removePhoto}
          />
        ) : null}
        <Button
          label={showPwForm ? "Close password form" : "Change password"}
          variant="ghost"
          size="sm"
          onPress={() => setShowPwForm((v) => !v)}
        />
      </View>

      {showPwForm ? (
        <View style={styles.pwForm}>
          <Divider style={{ marginBottom: spacing.lg }} />
          <PasswordInput
            label="Current password"
            placeholder="Enter current password"
            value={currentPw}
            onChangeText={setCurrentPw}
            error={errors.current}
          />
          <PasswordInput
            label="New password"
            placeholder="At least 6 characters"
            value={newPw}
            onChangeText={setNewPw}
            error={errors.next}
          />
          <PasswordInput
            label="Confirm new password"
            placeholder="Repeat the new password"
            value={confirmPw}
            onChangeText={setConfirmPw}
            error={errors.confirm}
          />
          <Button
            label="Save new password"
            onPress={submitPassword}
            loading={changingPw}
            fullWidth
          />
        </View>
      ) : null}

      <FeedbackModal
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={() => setPopup((p) => ({ ...p, visible: false }))}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.xxl },
  head: { flexDirection: "row", gap: spacing.lg, alignItems: "center" },
  avatar: { width: 76, height: 76, borderRadius: 38 },
  avatarPlaceholder: {
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { color: colors.textInverse, fontSize: 30, fontWeight: weight.extrabold },
  headText: { flex: 1, gap: spacing.xs },
  name: { ...typography.h3, color: colors.text },
  email: { ...typography.small, color: colors.textMuted },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  pwForm: { marginTop: spacing.md },
});
