/**
 * ProviderServicesScreen — publish and manage listings.
 *
 * Publishing requires an approved KYC (backend rule), so the screen shows a
 * proper verification gate when that is missing. Photo upload still goes
 * through `/api/media/upload-base64/` and the listing is created on
 * `/api/catalog/services/` (the endpoint the catalog API exposes).
 */
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";

import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import ServiceCard from "../../components/ServiceCard";
import Badge, { statusMeta } from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Icon from "../../components/ui/Icon";
import Input from "../../components/ui/Input";
import { Chip, Container, Grid, StatCard } from "../../components/ui/Layout";
import PageHeader from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/States";
import { ServiceGridSkeleton } from "../../components/ui/Skeleton";
import { servicesApi, type ServiceItem } from "../../services/api/servicesApi";
import { uploadImage } from "../../services/api/mediaApi";
import { kycApi, type ProviderProfile } from "../../services/api/kycApi";
import { getApiErrorMessage } from "../../services/api/client";
import { SERVICE_CITIES } from "../../utils/geo";
import { colors, radius, spacing, typography, weight } from "../../theme/tokens";
import { useResponsive } from "../../theme/responsive";

export default function ProviderServicesScreen() {
  const router = useRouter();
  const { isDesktop } = useResponsive();

  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [checkingKyc, setCheckingKyc] = useState(true);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [locationCity, setLocationCity] = useState("Kathmandu");
  const [photoUris, setPhotoUris] = useState<
    { uri: string; mimeType?: string; fileName: string; base64?: string | null }[]
  >([]);
  const [errors, setErrors] = useState<{ title?: string; description?: string; price?: string; photos?: string }>({});

  const [loading, setLoading] = useState(false);
  const [myServices, setMyServices] = useState<ServiceItem[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);

  const [popup, setPopup] = useState({
    visible: false,
    type: "info" as FeedbackType,
    title: "",
    message: "",
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
  const kycMeta = statusMeta(profile?.kyc_status ?? "not_submitted");

  const showPopup = (type: FeedbackType, title: string, message: string) =>
    setPopup({ visible: true, type, title, message });

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
          ...(result.assets ?? []).map((asset, index) => ({
            uri: asset.uri,
            mimeType: asset.mimeType ?? "image/jpeg",
            fileName: asset.fileName ?? `service-${prev.length + index}.jpg`,
            base64: asset.base64,
          })),
        ].slice(0, 10)
      );
      setErrors((prev) => ({ ...prev, photos: undefined }));
    }
  };

  const publish = async () => {
    if (!kycVerified) {
      showPopup(
        "info",
        "Verification required",
        "Your identity must be verified before you can publish services. Complete KYC and wait for the review."
      );
      return;
    }

    const nextErrors: typeof errors = {};
    if (!title.trim()) nextErrors.title = "Give the service a clear, specific title.";
    if (!description.trim()) nextErrors.description = "Describe what the customer gets.";
    if (!price.trim()) nextErrors.price = "Set a starting price so customers can compare.";
    else if (!Number.isFinite(Number(price))) nextErrors.price = "Price must be a number.";
    if (photoUris.length === 0) nextErrors.photos = "Add at least one photo — listings with photos get booked more.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      const uploaded = await Promise.all(
        photoUris.map((photo, index) =>
          uploadImage(
            photo.uri,
            photo.fileName || `service-${index}.jpg`,
            photo.mimeType,
            "service",
            photo.base64
          )
        )
      );

      await servicesApi.create({
        title: title.trim(),
        description: description.trim(),
        price: price.trim(),
        location: locationCity,
        image_urls: uploaded.map((item) => item.url),
      });

      setTitle("");
      setDescription("");
      setPrice("");
      setPhotoUris([]);
      await loadMyServices();
      showPopup("success", "Service published", "Your listing is now visible on the marketplace.");
    } catch (err) {
      showPopup("error", "Publish failed", getApiErrorMessage(err, "Could not publish the service."));
    } finally {
      setLoading(false);
    }
  };

  if (checkingKyc) {
    return (
      <Container style={styles.content}>
        <ServiceGridSkeleton count={2} />
      </Container>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Verification gate                                                  */
  /* ------------------------------------------------------------------ */
  if (!kycVerified) {
    return (
      <View style={styles.screen}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Container width="narrow" style={styles.content}>
            <PageHeader
              eyebrow="Provider"
              title="Publish a service"
              subtitle="Listings go live as soon as your identity verification is approved."
              onBack={() => router.push("/provider-home")}
            />

            <Card padding="lg" style={styles.gateCard}>
              <Icon name="shield" size={26} color={colors.warning} badge />
              <Text style={styles.gateTitle}>Verification required</Text>
              <Text style={styles.gateBody}>
                Only verified providers can publish listings. That keeps the marketplace trustworthy
                for customers — and it protects your reputation too.
              </Text>

              <View style={styles.gateStatus}>
                <Badge label={kycMeta.label} tone={kycMeta.tone} size="md" dot />
                <Text style={styles.gateStatusText}>
                  {profile?.kyc_status === "pending"
                    ? "Your documents are with the review team."
                    : profile?.kyc_status === "rejected"
                      ? "Your last submission was rejected — resubmit to continue."
                      : "Start your verification to unlock publishing."}
                </Text>
              </View>

              <Button
                label={profile?.kyc_status === "pending" ? "Back to dashboard" : "Continue verification"}
                size="lg"
                fullWidth
                trailingIcon="arrow-right"
                onPress={() =>
                  router.push(profile?.kyc_status === "pending" ? "/provider-home" : "/provider-kyc")
                }
              />
            </Card>
          </Container>
        </ScrollView>

        <FeedbackModal
          visible={popup.visible}
          type={popup.type}
          title={popup.title}
          message={popup.message}
          onClose={() => setPopup((p) => ({ ...p, visible: false }))}
        />
      </View>
    );
  }

  const activeCount = myServices.filter((service) => service.is_active !== false).length;

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Container style={styles.content}>
          <PageHeader
            eyebrow="Provider"
            title="Your services"
            subtitle="Publish listings with your own photos, then manage availability and bookings per service."
            onBack={() => router.push("/provider-home")}
            actions={
              <Badge label="Verified provider" tone="success" icon="shield" size="md" />
            }
          />

          <View style={styles.statsRow}>
            <StatCard label="Live listings" value={activeCount} icon="sparkle" hint={`${myServices.length} total`} />
            <StatCard
              label="With photos"
              value={myServices.filter((service) => (service.images?.length ?? 0) > 0).length}
              icon="upload"
              tone="neutral"
              hint="Listings with images"
            />
            <StatCard
              label="Reviews"
              value={myServices.reduce((total, service) => total + (service.review_count ?? 0), 0)}
              icon="star"
              tone="warning"
              hint="Across your listings"
            />
          </View>

          <View style={[styles.layout, isDesktop ? styles.layoutDesktop : null]}>
            {/* Publish form */}
            <View style={styles.main}>
              <Animated.View entering={FadeInDown.duration(380)}>
                <Card padding="lg" style={styles.formCard}>
                  <Text style={styles.formTitle}>Publish a new service</Text>
                  <Text style={styles.formSubtitle}>
                    Clear titles and real photos convert best. You can publish up to 10 photos per
                    listing.
                  </Text>

                  <Text style={styles.fieldLabel}>
                    Photos{" "}
                    <Text style={styles.fieldHint}>· {photoUris.length}/10 selected</Text>
                  </Text>
                  <View style={styles.photoGrid}>
                    {photoUris.map((photo, index) => (
                      <View key={`${photo.uri}-${index}`} style={styles.photoWrap}>
                        <Image source={{ uri: photo.uri }} style={styles.photo} contentFit="cover" />
                        <Pressable
                          onPress={() =>
                            setPhotoUris((prev) => prev.filter((_, i) => i !== index))
                          }
                          accessibilityRole="button"
                          accessibilityLabel="Remove photo"
                          style={styles.photoRemove}
                        >
                          <Icon name="close" size={10} color={colors.textInverse} />
                        </Pressable>
                      </View>
                    ))}

                    {photoUris.length < 10 ? (
                      <Pressable
                        onPress={pickPhotos}
                        accessibilityRole="button"
                        accessibilityLabel="Add photos"
                        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                          styles.addPhoto,
                          hovered ? styles.addPhotoHover : null,
                          pressed ? styles.pressed : null,
                          errors.photos ? styles.addPhotoError : null,
                        ]}
                      >
                        <Icon name="plus" size={16} color={colors.primary} />
                        <Text style={styles.addPhotoText}>Add</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {errors.photos ? <Text style={styles.errorText}>{errors.photos}</Text> : null}

                  <Input
                    label="Service title"
                    placeholder="e.g. Expert plumbing repairs in Kathmandu"
                    value={title}
                    onChangeText={(text) => {
                      setTitle(text);
                      setErrors((prev) => ({ ...prev, title: undefined }));
                    }}
                    error={errors.title}
                    containerStyle={{ marginTop: spacing.lg }}
                    required
                  />

                  <Input
                    label="Description"
                    placeholder="What is included, how long it takes, anything the customer should prepare…"
                    value={description}
                    onChangeText={(text) => {
                      setDescription(text);
                      setErrors((prev) => ({ ...prev, description: undefined }));
                    }}
                    error={errors.description}
                    multilineArea
                    required
                  />

                  <Input
                    label="Starting price (Rs)"
                    placeholder="e.g. 1500"
                    value={price}
                    onChangeText={(text) => {
                      setPrice(text);
                      setErrors((prev) => ({ ...prev, price: undefined }));
                    }}
                    keyboardType="numeric"
                    error={errors.price}
                    hint="Customers see this as “Starting from”. The final amount is agreed per booking."
                    required
                  />

                  <Text style={styles.fieldLabel}>Service area</Text>
                  <View style={styles.chipRow}>
                    {SERVICE_CITIES.map((city) => (
                      <Chip
                        key={city}
                        label={city}
                        active={locationCity === city}
                        onPress={() => setLocationCity(city)}
                      />
                    ))}
                  </View>

                  <Button
                    label="Publish service"
                    size="lg"
                    fullWidth
                    loading={loading}
                    style={{ marginTop: spacing.lg }}
                    onPress={publish}
                  />
                </Card>
              </Animated.View>
            </View>

            {/* Listings */}
            <View style={[styles.rail, isDesktop ? styles.railDesktop : null]}>
              <View style={styles.railHeader}>
                <Text style={styles.railTitle}>Your listings</Text>
                <Button
                  label="Manage availability"
                  variant="outline"
                  size="sm"
                  icon="calendar"
                  onPress={() => router.push("/provider-availability")}
                />
              </View>

              {servicesLoading ? (
                <ServiceGridSkeleton count={2} />
              ) : myServices.length === 0 ? (
                <EmptyState
                  icon="sparkle"
                  title="No services yet"
                  description="Publish your first service with photos and a starting price — it will appear here."
                />
              ) : (
                <Grid columns={1} gap={spacing.md}>
                  {myServices.map((service, index) => (
                    <ServiceCard
                      key={service.id}
                      service={service}
                      index={index}
                      footerNote="Manage"
                      onPress={() => router.push(`/service/${service.id}` as never)}
                    />
                  ))}
                </Grid>
              )}

              {myServices.length > 0 ? (
                <Card padding="lg" style={styles.tipCard} tone="primary">
                  <Text style={styles.tipTitle}>Next step</Text>
                  <View style={styles.tipRow}>
                    <Icon name="calendar" size={16} color={colors.primaryDark} />
                    <Text style={styles.tipText}>
                      Add time slots to your calendar so customers can book. Providers with open
                      slots receive requests sooner.
                    </Text>
                  </View>
                  <Button
                    label="Open availability"
                    variant="secondary"
                    size="sm"
                    icon="arrow-right"
                    style={{ marginTop: spacing.md }}
                    onPress={() => router.push("/provider-availability")}
                  />
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
        onClose={() => setPopup((p) => ({ ...p, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing.xxl, paddingBottom: spacing.giant },
  statsRow: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap", marginBottom: spacing.xxl },

  layout: { gap: spacing.xxl },
  layoutDesktop: { flexDirection: "row", alignItems: "flex-start" },
  main: { flex: 1, minWidth: 0 },
  rail: { width: "100%" },
  railDesktop: { width: 420, flexShrink: 0, gap: spacing.lg },
  railHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.md,
    flexWrap: "wrap",
  },
  railTitle: { ...typography.h4, color: colors.text },

  formCard: { gap: spacing.xs },
  formTitle: { ...typography.h3, color: colors.text },
  formSubtitle: { ...typography.small, color: colors.textMuted, marginTop: spacing.xs },
  fieldLabel: {
    fontSize: 13,
    fontWeight: weight.semibold,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  fieldHint: { fontWeight: weight.regular, color: colors.textSubtle },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  photoWrap: { position: "relative" },
  photo: { width: 78, height: 78, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  photoRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  addPhoto: {
    width: 78,
    height: 78,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: colors.surfaceAlt,
  },
  addPhotoHover: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  addPhotoError: { borderColor: colors.danger },
  addPhotoText: { fontSize: 11.5, color: colors.primaryDark, fontWeight: weight.semibold },
  errorText: { color: colors.danger, fontSize: 12.5, marginTop: spacing.sm, fontWeight: weight.medium },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  pressed: { opacity: 0.85 },

  gateCard: { alignItems: "flex-start", gap: spacing.md },
  gateTitle: { ...typography.h3, color: colors.text },
  gateBody: { ...typography.body, color: colors.textMuted },
  gateStatus: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" },
  gateStatusText: { flex: 1, minWidth: 180, ...typography.small, color: colors.textMuted },

  tipCard: { marginTop: spacing.lg },
  tipTitle: { ...typography.h4, color: colors.text, marginBottom: spacing.sm },
  tipRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  tipText: { flex: 1, ...typography.small, color: colors.textMuted },
});
