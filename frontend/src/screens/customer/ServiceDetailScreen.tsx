import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import Animated, { FadeInDown } from "react-native-reanimated";
import { servicesApi, type ServiceItem } from "../../services/api/servicesApi";
import { reviewsApi, type ReviewItem } from "../../services/api/reviewsApi";
import ReviewList from "../../components/ReviewList";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import { trackServiceView } from "../../utils/activityHistory";
import { getAuth } from "../../auth/auth";
import {
  BACKGROUND,
  CARD,
  TEXT,
  TEXT_MUTED,
  BORDER,
  PRIMARY,
  STAR,
} from "../../theme/colors";

const { width: SCREEN_W } = Dimensions.get("window");

export default function ServiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [service, setService] = useState<ServiceItem | null>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerOwnsService, setProviderOwnsService] = useState(false);
  const [popup, setPopup] = useState({
    visible: false,
    type: "error" as FeedbackType,
    title: "",
    message: "",
  });

  useEffect(() => {
    const load = async () => {
      try {
        const s = await servicesApi.get(Number(id));
        setService(s);
        trackServiceView({
          id: s.id,
          title: s.title,
          provider_name: s.provider_name,
        });
        const r = await reviewsApi.byProvider(s.provider);
        setReviews(r);
      } catch {
        setPopup({
          visible: true,
          type: "error",
          title: "Error",
          message: "Could not load service.",
        });
      } finally {
        setLoading(false);
      }
    };
    if (id) load();
  }, [id]);

  useEffect(() => {
    if (!service) return;
    (async () => {
      const auth = await getAuth();
      const role = auth.role?.toLowerCase();
      if (role === "provider" && service.is_mine) {
        setProviderOwnsService(true);
        router.replace("/provider-services");
      }
    })();
  }, [service, router]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  if (!service) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFoundTitle}>Service not found</Text>
        <Text style={styles.notFoundText}>This listing may have been removed.</Text>
        <TouchableOpacity style={styles.bookBtn} onPress={() => router.replace("/")}>
          <Text style={styles.bookText}>Back to home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const images = service.images ?? [];
  const hasPhotos = images.length > 0;

  return (
    <View style={styles.screen}>
      <ScrollView>
        {hasPhotos ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {images.map((img) => (
              <Image
                key={img.id}
                source={{ uri: img.image_url }}
                style={styles.hero}
                contentFit="cover"
              />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.noPhotoHero}>
            <Text style={styles.noPhotoText}>Provider has not uploaded photos yet</Text>
          </View>
        )}

        <Animated.View entering={FadeInDown.duration(450)} style={styles.body}>
          <Text style={styles.title}>{service.title}</Text>
          <View style={styles.sellerRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {service.provider_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={styles.seller}>{service.provider_name}</Text>
              <View style={styles.ratingRow}>
                <Text style={styles.star}>★</Text>
                <Text style={styles.rating}>
                  {(service.avg_rating ?? 0) > 0
                    ? `${service.avg_rating?.toFixed(1)} (${service.review_count} reviews)`
                    : "New provider"}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.price}>Rs {parseFloat(service.price).toFixed(0)}</Text>
          <Text style={styles.desc}>{service.description}</Text>
          <Text style={styles.loc}>📍 {service.location}</Text>

          <Text style={styles.section}>Reviews & comments</Text>
          <ReviewList reviews={reviews} />
        </Animated.View>
      </ScrollView>

      <View style={styles.footer}>
        {!providerOwnsService ? (
          <TouchableOpacity
            style={styles.bookBtn}
            onPress={() =>
              router.push({
                pathname: "/book",
                params: {
                  serviceId: String(service.id),
                  title: service.title,
                  price: service.price,
                  provider: service.provider_name,
                  providerId: String(service.provider),
                },
              })
            }
          >
            <Text style={styles.bookText}>Continue</Text>
          </TouchableOpacity>
        ) : null}
      </View>

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
  screen: { flex: 1, backgroundColor: BACKGROUND },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: BACKGROUND },
  notFoundTitle: { fontSize: 20, fontWeight: "700", color: TEXT, marginBottom: 8 },
  notFoundText: { color: TEXT_MUTED, marginBottom: 20 },
  hero: { width: SCREEN_W, height: 240 },
  noPhotoHero: {
    width: SCREEN_W,
    height: 200,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  noPhotoText: { color: TEXT_MUTED, fontSize: 14 },
  body: { padding: 20 },
  title: { fontSize: 22, fontWeight: "700", color: TEXT, marginBottom: 14 },
  sellerRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: PRIMARY,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 18 },
  seller: { fontSize: 16, fontWeight: "700", color: TEXT },
  ratingRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  star: { color: STAR, marginRight: 4 },
  rating: { color: TEXT_MUTED, fontSize: 14 },
  price: { fontSize: 24, fontWeight: "800", color: TEXT, marginBottom: 12 },
  desc: { fontSize: 15, color: TEXT, lineHeight: 23, marginBottom: 10 },
  loc: { color: TEXT_MUTED, marginBottom: 24 },
  section: { fontSize: 18, fontWeight: "700", color: TEXT, marginBottom: 12 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
  },
  bookBtn: {
    backgroundColor: PRIMARY,
    paddingVertical: 16,
    borderRadius: 4,
    alignItems: "center",
  },
  bookText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
