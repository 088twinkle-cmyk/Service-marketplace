/**
 * SearchScreen — the marketplace search experience.
 *
 * Filters are limited to what the Django catalog endpoint really supports
 * (`q`/search, city, min_price, max_price, min_rating, verified, available,
 * ordering) plus the keyword categories the marketplace navigation has always
 * used. Results stay on the same responsive card grid as the home page.
 */
import React, { useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";

import LocationBar from "../../components/LocationBar";
import ServiceListing from "../../components/ServiceListing";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Icon from "../../components/ui/Icon";
import Input from "../../components/ui/Input";
import { Chip, Container } from "../../components/ui/Layout";
import PageHeader from "../../components/ui/PageHeader";
import {
  BROWSE_CATEGORIES,
  SORT_OPTIONS,
  useServiceCatalog,
  type SortKey,
} from "../../hooks/useServiceCatalog";
import { useUserLocation } from "../../hooks/useUserLocation";
import { getAuth } from "../../auth/auth";
import type { ServiceItem } from "../../services/api/servicesApi";
import { colors, radius, spacing, typography, weight } from "../../theme/tokens";
import { useResponsive } from "../../theme/responsive";
import { trackSearch, trackServiceView } from "../../utils/activityHistory";

const RATING_OPTIONS = [
  { label: "Any rating", value: null as number | null },
  { label: "3.0+", value: 3 },
  { label: "4.0+", value: 4 },
  { label: "4.5+", value: 4.5 },
];

export default function SearchScreen() {
  const router = useRouter();
  const { isMobile, isDesktop } = useResponsive();
  const params = useLocalSearchParams<{ q?: string }>();

  const [search, setSearch] = useState(params.q?.toString() || "");
  const [category, setCategory] = useState("All");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minRating, setMinRating] = useState<number | null>(null);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("default");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const {
    city,
    lat,
    lng,
    usingGps,
    setCity,
    detectGps,
    cities,
    loading: locationLoading,
  } = useUserLocation();

  const { services, loading, refreshing, error, refresh, totalCount } = useServiceCatalog({
    lat,
    lng,
    city,
    search,
    category,
    locationReady: !locationLoading,
    minPrice: minPrice.trim() ? Number(minPrice) : null,
    maxPrice: maxPrice.trim() ? Number(maxPrice) : null,
    minRating,
    verifiedOnly,
    availableOnly,
    sort,
  });

  const activeFilters = useMemo(() => {
    const chips: { label: string; onRemove: () => void }[] = [];
    if (category !== "All") chips.push({ label: category, onRemove: () => setCategory("All") });
    if (minRating != null)
      chips.push({ label: `Rating ${minRating}+`, onRemove: () => setMinRating(null) });
    if (minPrice.trim())
      chips.push({ label: `Min Rs ${minPrice}`, onRemove: () => setMinPrice("") });
    if (maxPrice.trim())
      chips.push({ label: `Max Rs ${maxPrice}`, onRemove: () => setMaxPrice("") });
    if (verifiedOnly) chips.push({ label: "Verified only", onRemove: () => setVerifiedOnly(false) });
    if (availableOnly)
      chips.push({ label: "Available now", onRemove: () => setAvailableOnly(false) });
    if (sort !== "default")
      chips.push({
        label: SORT_OPTIONS.find((s) => s.key === sort)?.label ?? "Sorted",
        onRemove: () => setSort("default"),
      });
    return chips;
  }, [category, minRating, minPrice, maxPrice, verifiedOnly, availableOnly, sort]);

  const clearAll = () => {
    setCategory("All");
    setMinPrice("");
    setMaxPrice("");
    setMinRating(null);
    setVerifiedOnly(false);
    setAvailableOnly(false);
    setSort("default");
  };

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

  const filtersVisible = !isMobile || filtersOpen;

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
        keyboardShouldPersistTaps="handled"
      >
        <Container style={styles.content}>
          <PageHeader
            eyebrow="Marketplace"
            title="Browse services"
            subtitle={`Search ${city} and nearby areas, then narrow the list by price, rating or verification.`}
          />

          {/* Search bar */}
          <Card padding="md" style={styles.searchCard}>
            <View style={styles.searchRow}>
              <View style={styles.searchBox}>
                <Icon name="search" size={17} color={colors.textSubtle} />
                <TextInput
                  placeholder="Search services, skills or providers…"
                  placeholderTextColor={colors.textSubtle}
                  value={search}
                  onChangeText={setSearch}
                  onSubmitEditing={() => trackSearch(search)}
                  returnKeyType="search"
                  style={styles.searchInput}
                  accessibilityLabel="Search services"
                  autoFocus={!isMobile}
                />
                {search.length > 0 ? (
                  <Pressable
                    onPress={() => setSearch("")}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                    style={styles.clearBtn}
                  >
                    <Icon name="close" size={12} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>

              {isMobile ? (
                <Button
                  label={filtersOpen ? "Hide filters" : "Filters"}
                  variant={filtersOpen ? "secondary" : "outline"}
                  icon="grid"
                  onPress={() => setFiltersOpen((open) => !open)}
                />
              ) : null}
            </View>

            <LocationBar
              city={city}
              cities={cities}
              usingGps={usingGps}
              onSelectCity={setCity}
              onUseGps={detectGps}
            />
          </Card>

          {/* Filters */}
          {filtersVisible ? (
            <Animated.View entering={FadeInDown.duration(320)}>
              <Card padding="lg" style={styles.filtersCard}>
                <View style={styles.filterHeader}>
                  <Text style={styles.filterTitle}>Categories</Text>
                  <Text style={styles.filterHint}>
                    Keyword groups matched against the provider's listing text.
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {BROWSE_CATEGORIES.map((cat) => (
                    <Chip
                      key={cat}
                      label={cat}
                      active={category === cat}
                      onPress={() => setCategory(cat)}
                      size="sm"
                    />
                  ))}
                </ScrollView>

                <View style={styles.filterGrid}>
                  <View style={isDesktop ? styles.filterColumn : styles.filterColumnMobile}>
                    <Input
                      label="Minimum price (Rs)"
                      placeholder="e.g. 500"
                      keyboardType="numeric"
                      value={minPrice}
                      onChangeText={setMinPrice}
                      hint="Uses each listing's starting price."
                    />
                  </View>
                  <View style={isDesktop ? styles.filterColumn : styles.filterColumnMobile}>
                    <Input
                      label="Maximum price (Rs)"
                      placeholder="e.g. 5000"
                      keyboardType="numeric"
                      value={maxPrice}
                      onChangeText={setMaxPrice}
                      hint="Leave empty for no upper limit."
                    />
                  </View>
                </View>

                <Text style={styles.filterTitle}>Minimum rating</Text>
                <View style={styles.wrapRow}>
                  {RATING_OPTIONS.map((option) => (
                    <Chip
                      key={option.label}
                      label={option.label}
                      size="sm"
                      active={minRating === option.value}
                      onPress={() => setMinRating(option.value)}
                    />
                  ))}
                </View>

                <Text style={[styles.filterTitle, styles.filterSpacer]}>Provider filters</Text>
                <View style={styles.wrapRow}>
                  <Chip
                    label="Verified providers only"
                    icon="shield"
                    size="sm"
                    active={verifiedOnly}
                    onPress={() => setVerifiedOnly((v) => !v)}
                  />
                  <Chip
                    label="Open for booking now"
                    icon="calendar"
                    size="sm"
                    active={availableOnly}
                    onPress={() => setAvailableOnly((v) => !v)}
                  />
                </View>

                <Text style={[styles.filterTitle, styles.filterSpacer]}>Sort results</Text>
                <View style={styles.wrapRow}>
                  {SORT_OPTIONS.filter(
                    (option) => option.key !== "distance" || usingGps
                  ).map((option) => (
                    <Chip
                      key={option.key}
                      label={option.label}
                      size="sm"
                      active={sort === option.key}
                      onPress={() => setSort(option.key)}
                    />
                  ))}
                </View>

                {activeFilters.length > 0 ? (
                  <View style={styles.activeWrap}>
                    <View style={styles.activeHeader}>
                      <Text style={styles.filterTitle}>Active filters</Text>
                      <Button label="Clear all" variant="ghost" size="sm" onPress={clearAll} />
                    </View>
                    <View style={styles.wrapRow}>
                      {activeFilters.map((chip) => (
                        <Pressable
                          key={chip.label}
                          onPress={chip.onRemove}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove filter ${chip.label}`}
                        >
                          <Badge label={`${chip.label}  ✕`} tone="primary" size="md" />
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}
              </Card>
            </Animated.View>
          ) : null}

          {/* Results */}
          <View style={styles.results}>
            <ServiceListing
              services={services}
              loading={loading}
              error={error}
              searchQuery={search}
              onBook={onOpen}
              onRetry={refresh}
              title={search.trim() ? `Results for “${search.trim()}”` : `Services in ${city}`}
              headerAction={
                <Text style={styles.resultCount}>
                  {totalCount} {totalCount === 1 ? "result" : "results"}
                </Text>
              }
              emptyTitle="No services match these filters"
              emptyDescription="Try widening the price range, choosing another city, or clearing the filters."
              emptyActionLabel={activeFilters.length > 0 ? "Clear filters" : undefined}
              onEmptyAction={activeFilters.length > 0 ? clearAll : undefined}
            />
          </View>
        </Container>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing.xxl, paddingBottom: spacing.giant },
  searchCard: { gap: spacing.md, marginBottom: spacing.lg },
  searchRow: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: spacing.md },
  clearBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },

  filtersCard: { marginBottom: spacing.xxl, gap: spacing.xs },
  filterHeader: { gap: 2 },
  filterTitle: { ...typography.smallStrong, color: colors.text, marginBottom: spacing.sm },
  filterHint: { ...typography.caption, color: colors.textSubtle, marginBottom: spacing.md },
  chipRow: { gap: spacing.sm, paddingBottom: spacing.lg },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  filterGrid: { flexDirection: "row", gap: spacing.lg, flexWrap: "wrap" },
  filterColumn: { flex: 1, minWidth: 220 },
  filterColumnMobile: { width: "100%" },
  filterSpacer: { marginTop: spacing.sm },
  activeWrap: {
    marginTop: spacing.sm,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  activeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  results: { marginTop: spacing.xs },
  resultCount: { ...typography.smallStrong, color: colors.textMuted },
});
