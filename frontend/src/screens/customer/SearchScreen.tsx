import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import LocationBar from "../../components/LocationBar";
import ServiceListing from "../../components/ServiceListing";
import { useUserLocation } from "../../hooks/useUserLocation";
import { useServiceCatalog } from "../../hooks/useServiceCatalog";
import type { ServiceItem } from "../../services/api/servicesApi";
import { trackSearch, trackServiceView } from "../../utils/activityHistory";
import { PRIMARY, BACKGROUND, CARD, TEXT, TEXT_MUTED, BORDER } from "../../theme/colors";
import { getAuth } from "../../auth/auth";

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const [search, setSearch] = useState(params.q?.toString() || "");
  const [category] = useState("All");

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

  return (
    <View style={styles.screen}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={PRIMARY} />
        }
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
          <Text style={styles.title}>Search services</Text>
          <Text style={styles.sub}>Find providers near you</Text>
        </Animated.View>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            placeholder="Type to search listings..."
            placeholderTextColor={TEXT_MUTED}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => trackSearch(search)}
            returnKeyType="search"
            style={styles.searchInput}
            autoFocus
          />
        </View>

        <LocationBar
          city={city}
          cities={cities}
          usingGps={usingGps}
          onSelectCity={setCity}
          onUseGps={detectGps}
        />

        <ServiceListing
          services={services}
          loading={loading}
          error={error}
          searchQuery={search}
          onBook={onOpen}
          onRetry={refresh}
          title="Search results"
        />

        <TouchableOpacity style={styles.backHome} onPress={() => router.push("/")}>
          <Text style={styles.backHomeText}>← Back to home</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BACKGROUND },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: "800", color: TEXT },
  sub: { fontSize: 14, color: TEXT_MUTED, marginTop: 4 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
  },
  searchIcon: { fontSize: 18, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, color: TEXT, paddingVertical: 14 },
  backHome: { alignItems: "center", paddingVertical: 20, marginBottom: 24 },
  backHomeText: { color: PRIMARY, fontWeight: "700", fontSize: 15 },
});
