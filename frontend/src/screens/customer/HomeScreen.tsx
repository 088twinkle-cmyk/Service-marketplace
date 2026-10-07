import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeInDown, FadeInRight } from "react-native-reanimated";
import LocationBar from "../../components/LocationBar";
import ServiceListing from "../../components/ServiceListing";
import { useUserLocation } from "../../hooks/useUserLocation";
import { useServiceCatalog } from "../../hooks/useServiceCatalog";
import type { ServiceItem } from "../../services/api/servicesApi";
import { trackSearch, trackServiceView } from "../../utils/activityHistory";
import { getAuth } from "../../auth/auth";
import {
  PRIMARY,
  BACKGROUND,
  TEXT,
  TEXT_MUTED,
  CARD,
  BORDER,
  HERO_BG,
} from "../../theme/colors";

const { width } = Dimensions.get("window");

const POPULAR_SEARCHES = ["Electrician", "Plumber", "AC Installation"];

const BROWSE_CATEGORIES = [
  "All",
  "Home Repairs",
  "Automobile",
  "Tech & Digital",
  "Personal Service",
  "Pet Care",
  "Professional",
  "Home Improvement",
  "Health & Wellness",
  "Trainings",
];

export default function HomeScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const { city, lat, lng, usingGps, setCity, detectGps, cities, loading: locationLoading } =
    useUserLocation();

  const { services, loading, refreshing, error, refresh } = useServiceCatalog({
    lat,
    lng,
    city,
    search,
    category,
    locationReady: !locationLoading,
  });

  const onOpen = (service: ServiceItem) => {
    (async () => {
      const auth = await getAuth();
      if (auth.role?.toLowerCase() === "provider" && service.is_mine) {
        router.replace("/provider-services");
        return;
      }

      trackServiceView({
        id: service.id,
        title: service.title,
        provider_name: service.provider_name,
      });
      router.push(`/service/${service.id}` as never);
    })();
  };

  const applySearch = (term: string) => {
    setSearch(term);
    trackSearch(term);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={PRIMARY}
            colors={[PRIMARY]}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeInDown.duration(600).springify()} style={styles.hero}>
          <View style={styles.heroContent}>
            <Text style={styles.heroLine1}>Book Home Service</Text>
            
            <Text style={styles.heroSub}>
              All provider listings — sorted nearest to your location
            </Text>
          </View>
          <Text style={styles.heroEmoji}>👷</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(500)} style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            placeholder="Search services, providers, location..."
            placeholderTextColor={TEXT_MUTED}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            returnKeyType="search"
            onSubmitEditing={() => trackSearch(search)}
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch("")} style={styles.clearBtn}>
              <Text style={styles.clearText}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </Animated.View>

        <LocationBar
          city={city}
          cities={cities}
          usingGps={usingGps}
          onSelectCity={setCity}
          onUseGps={detectGps}
        />

        <Animated.View entering={FadeInDown.delay(120).duration(450)} style={styles.popularWrap}>
          <Text style={styles.popularLabel}>Popular searches:</Text>
          <View style={styles.popularRow}>
            {POPULAR_SEARCHES.map((term, i) => (
              <Animated.View key={term} entering={FadeInRight.delay(i * 50).springify()}>
                <TouchableOpacity
                  style={styles.popularChip}
                  onPress={() => applySearch(term)}
                >
                  <Text style={styles.popularChipText}>{term}</Text>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        </Animated.View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Browse by Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {BROWSE_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.catChip, category === cat && styles.catChipActive]}
                onPress={() => setCategory(cat)}
              >
                <Text
                  style={[styles.catChipText, category === cat && styles.catChipTextActive]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <ServiceListing
          services={services}
          loading={loading}
          error={error}
          searchQuery={search}
          onBook={onOpen}
          onRetry={refresh}
          title={search.trim() ? "Search results" : "Listed services"}
        />

        <View style={styles.trust}>
          <Text style={styles.trustTitle}>Service Marketplace</Text>
          <Text style={styles.trustBody}>
            Compare providers in Kathmandu, Lalitpur, Bhaktapur & Pokhara. Listings
            are sorted nearest to your location.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BACKGROUND },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: HERO_BG,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 22,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  heroContent: { flex: 1 },
  heroLine1: { fontSize: 24, fontWeight: "800", color: TEXT, lineHeight: 30 },
  heroLine2: { fontSize: 24, fontWeight: "800", color: TEXT, lineHeight: 30 },
  heroLine3: { fontSize: 24, fontWeight: "800", color: TEXT, lineHeight: 30 },
  heroSub: { fontSize: 14, color: TEXT_MUTED, marginTop: 10, lineHeight: 20 },
  heroEmoji: { fontSize: 52 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  searchIcon: { fontSize: 18, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: TEXT, paddingVertical: 12 },
  clearBtn: { padding: 8 },
  clearText: { color: TEXT_MUTED, fontSize: 16 },
  popularWrap: { paddingHorizontal: 16, marginTop: 14 },
  popularLabel: { fontSize: 14, color: TEXT_MUTED, marginBottom: 8 },
  popularRow: { flexDirection: "row", flexWrap: "wrap" },
  popularChip: {
    backgroundColor: CARD,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    marginRight: 8,
    marginBottom: 8,
  },
  popularChipText: { fontSize: 13, fontWeight: "600", color: TEXT },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: TEXT, marginBottom: 12 },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    marginRight: 8,
  },
  catChipActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  catChipText: { fontSize: 13, fontWeight: "600", color: TEXT_MUTED },
  catChipTextActive: { color: "#fff" },
  trust: {
    marginHorizontal: 16,
    marginBottom: 28,
    marginTop: 8,
    padding: 18,
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  trustTitle: { fontSize: 16, fontWeight: "800", color: TEXT, marginBottom: 6 },
  trustBody: { fontSize: 14, color: TEXT_MUTED, lineHeight: 21 },
});
