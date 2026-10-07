import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import Animated, { FadeInDown } from "react-native-reanimated";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import { api, getApiErrorMessage } from "../../services/api/client";
import { kycApi, type ProviderProfile } from "../../services/api/kycApi";
import { servicesApi, type ServiceItem } from "../../services/api/servicesApi";
import { uploadImage } from "../../services/api/mediaApi";
import { SERVICE_CITIES } from "../../utils/geo";
import { getAuth } from "../../auth/auth";
import {
  PRIMARY,
  BACKGROUND,
  CARD,
  TEXT,
  TEXT_MUTED,
  BORDER,
  TAG_BG,
  STAR,
} from "../../theme/colors";

export default function ProviderServicesScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [checkingKyc, setCheckingKyc] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [locationCity, setLocationCity] = useState("Kathmandu");
  const [photoUris, setPhotoUris] = useState<
    { uri: string; mimeType?: string; fileName: string; base64?: string | null }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [myServices, setMyServices] = useState<ServiceItem[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [popup, setPopup] = useState({
    visible: false,
    type: "info" as FeedbackType,
    title: "",
    message: "",
    onConfirm: undefined as (() => void) | undefined,
  });

  useEffect(() => {
    kycApi
      .getProfile()
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setCheckingKyc(false));
  }, []);

  const loadMyServices = async () => {
    setServicesLoading(true);
    try {
      // The backend knows who owns which service — never filter by display
      // name on the client.
      const mine = await servicesApi.listMine();
      setMyServices(mine);
    } catch {
      setMyServices([]);
    } finally {
      setServicesLoading(false);
    }
  };

  useEffect(() => {
    loadMyServices();
  }, []);

  const kycVerified = Boolean(profile?.is_verified && profile?.kyc_status === "approved");

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

  const pickPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showPopup("error", "Permission needed", "Allow photo access to upload service images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.75,
      base64: true,
    });
    if (!result.canceled && result.assets?.length) {
      setPhotoUris((prev) =>
        [
          ...prev,
          ...(result.assets ?? []).map((a, idx) => ({
            uri: a.uri,
            mimeType: a.mimeType ?? "image/jpeg",
            fileName: a.fileName ?? `service-${prev.length + idx}.jpg`,
            base64: a.base64,
          })),
        ].slice(0, 10)
      );
    }
  };

  const publish = async () => {
    if (!kycVerified) {
      showPopup(
        "info",
        "KYC pending",
        "Your identity must be verified before you can publish services. Complete KYC and wait for admin approval."
      );
      return;
    }
    if (!title.trim() || !description.trim() || !price.trim()) {
      showPopup("error", "Missing fields", "Fill in title, description, and price.");
      return;
    }
    if (photoUris.length === 0) {
      showPopup("error", "Photos required", "Upload at least one photo of your service.");
      return;
    }

    setLoading(true);
    try {
      const uploaded = await Promise.all(
        photoUris.map((photo, i) =>
          uploadImage(
            photo.uri,
            photo.fileName || "service-" + i + ".jpg",
            photo.mimeType,
            "service",
            photo.base64
          )
        )
      );
      await api.post("services/", {
        title: title.trim(),
        description: description.trim(),
        price: price.trim(),
        location: locationCity,
        image_urls: uploaded.map((u) => u.url),
      });
      setTitle("");
      setDescription("");
      setPrice("");
      setPhotoUris([]);
      await loadMyServices();
      showPopup("success", "Published", "Your service is now active on the marketplace.");
    } catch (err) {
      showPopup("error", "Publish failed", getApiErrorMessage(err, "Could not publish service."));
    } finally {
      setLoading(false);
    }
  };

  if (checkingKyc) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PRIMARY} />
      </View>
    );
  }

  if (!kycVerified) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.duration(400)} style={styles.kycBlock}>
          <Text style={styles.kycIcon}>⏳</Text>
          <Text style={styles.kycTitle}>KYC pending</Text>
          <Text style={styles.kycBody}>
            You can only publish services after your KYC is verified by an admin.
            {profile?.kyc_status === "submitted"
              ? " Your documents are under review."
              : profile?.kyc_status === "rejected"
                ? " Your KYC was rejected — contact support or resubmit."
                : " Complete KYC submission first."}
          </Text>
          <Text style={styles.kycStatus}>Status: {profile?.kyc_status ?? "pending"}</Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={() =>
              router.push(profile?.kyc_status === "pending" ? "/provider-kyc" : "/provider-home")
            }
          >
            <Text style={styles.btnText}>
              {profile?.kyc_status === "pending" ? "Complete KYC" : "Back to dashboard"}
            </Text>
          </TouchableOpacity>
        </Animated.View>
        <FeedbackModal
          visible={popup.visible}
          type={popup.type}
          title={popup.title}
          message={popup.message}
          onClose={closePopup}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Animated.View entering={FadeInDown.springify()} style={styles.card}>
        <Text style={styles.step}>Publish a service</Text>
        <Text style={styles.title}>List on the marketplace</Text>
        <Text style={styles.sub}>Upload your own photos. Customers only see provider images.</Text>

        <Text style={styles.label}>Photos (1–10 required)</Text>
        <View style={styles.photoRow}>
          {photoUris.map((photo) => (
            <Image key={photo.uri} source={{ uri: photo.uri }} style={styles.thumb} />
          ))}
          {photoUris.length < 10 ? (
            <TouchableOpacity style={styles.addPhoto} onPress={pickPhotos}>
              <Text style={styles.addPhotoText}>+ Add</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={styles.label}>Title</Text>
        <TextInput
          placeholder="Expert plumbing in Kathmandu"
          value={title}
          onChangeText={setTitle}
          style={styles.input}
        />
        <Text style={styles.label}>Description</Text>
        <TextInput
          placeholder="Describe what you offer"
          value={description}
          onChangeText={setDescription}
          multiline
          style={[styles.input, styles.multiline]}
        />
        <Text style={styles.label}>Price (Rs)</Text>
        <TextInput
          placeholder="1500"
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
          style={styles.input}
        />
        <Text style={styles.label}>Service area</Text>
        <View style={styles.chips}>
          {SERVICE_CITIES.map((c) => (
            <TouchableOpacity
              key={c}
              onPress={() => setLocationCity(c)}
              style={[styles.chip, locationCity === c && styles.chipActive]}
            >
              <Text style={[styles.chipText, locationCity === c && styles.chipTextActive]}>
                {c}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.btn} onPress={publish} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Publish service</Text>
          )}
        </TouchableOpacity>

        <View style={styles.activeBlock}>
          <Text style={styles.activeTitle}>Your active listings</Text>
          {servicesLoading ? (
            <ActivityIndicator color={PRIMARY} style={{ marginTop: 10 }} />
          ) : myServices.length === 0 ? (
            <Text style={styles.activeEmpty}>No active listings yet.</Text>
          ) : (
            myServices.map((svc) => (
              <View key={svc.id} style={styles.activeCard}>
                <Text style={styles.activeName}>{svc.title}</Text>
                <Text style={styles.activeMeta}>
                  Rs {parseFloat(svc.price).toFixed(0)} · {svc.location}
                </Text>
              </View>
            ))
          )}
        </View>
      </Animated.View>

      <FeedbackModal
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={closePopup}
        confirmLabel={popup.type === "success" ? "Done" : "OK"}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BACKGROUND },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: BACKGROUND },
  card: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: BORDER,
  },
  kycBlock: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 28,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
  },
  kycIcon: { fontSize: 40, marginBottom: 12 },
  kycTitle: { fontSize: 22, fontWeight: "800", color: TEXT, marginBottom: 10 },
  kycBody: { color: TEXT_MUTED, textAlign: "center", lineHeight: 22, marginBottom: 12 },
  kycStatus: { fontSize: 13, fontWeight: "700", color: STAR, marginBottom: 20 },
  step: { fontSize: 12, color: TEXT_MUTED, fontWeight: "600" },
  title: { fontSize: 22, fontWeight: "800", color: TEXT, marginTop: 6 },
  sub: { color: TEXT_MUTED, marginBottom: 20, marginTop: 6, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: "600", color: TEXT, marginBottom: 6 },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: TAG_BG },
  addPhoto: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: TAG_BG,
  },
  addPhotoText: { color: PRIMARY, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
    fontSize: 15,
    backgroundColor: TAG_BG,
    color: TEXT,
  },
  multiline: { minHeight: 96, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  chipText: { color: PRIMARY, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  btn: {
    backgroundColor: PRIMARY,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
    width: "100%",
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  activeBlock: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 16,
  },
  activeTitle: { fontSize: 16, fontWeight: "700", color: TEXT, marginBottom: 10 },
  activeEmpty: { color: TEXT_MUTED, fontSize: 14 },
  activeCard: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 12,
    backgroundColor: TAG_BG,
    marginBottom: 8,
  },
  activeName: { fontSize: 14, fontWeight: "700", color: TEXT },
  activeMeta: { marginTop: 4, fontSize: 13, color: TEXT_MUTED },
});
