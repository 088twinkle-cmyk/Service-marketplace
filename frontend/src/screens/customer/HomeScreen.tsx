/**
 * HomeScreen — the public marketplace landing page.
 *
 * Sections: hero + search · trust strip · categories · recommended services ·
 * top rated near you · featured providers · how it works · why choose us ·
 * provider call-to-action · footer.
 *
 * Every dynamic section is rendered from real catalog data; sections with no
 * data are hidden instead of padded with placeholders.
 */
import React, { useMemo, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";

import LocationBar from "../../components/LocationBar";
import ProviderCard, { type ProviderSummary } from "../../components/ProviderCard";
import ServiceCard from "../../components/ServiceCard";
import ServiceListing from "../../components/ServiceListing";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Icon, { type IconName } from "../../components/ui/Icon";
import { Chip, Container, Grid } from "../../components/ui/Layout";
import SectionHeader from "../../components/ui/SectionHeader";
import { EmptyState } from "../../components/ui/States";
import { getAuth } from "../../auth/auth";
import { useServiceCatalog, BROWSE_CATEGORIES } from "../../hooks/useServiceCatalog";
import { useUserLocation } from "../../hooks/useUserLocation";
import type { ServiceItem } from "../../services/api/servicesApi";
import { colors, radius, shadows, spacing, typography, weight } from "../../theme/tokens";
import { useResponsive } from "../../theme/responsive";
import { trackSearch, trackServiceView } from "../../utils/activityHistory";

const POPULAR_SEARCHES = ["Electrician", "Plumber", "AC Installation"];

const TRUST_ITEMS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "shield",
    title: "ID-verified providers",
    body: "Providers pass an identity (KYC) review before their services go live.",
  },
  {
    icon: "pin",
    title: "Nearest first",
    body: "Results are sorted by distance from your chosen city or your GPS position.",
  },
  {
    icon: "calendar",
    title: "Real availability",
    body: "Book a slot from the provider's own calendar — no guessing.",
  },
  {
    icon: "chat",
    title: "One thread per booking",
    body: "Agreed a price? Chat inside the booking to coordinate the details.",
  },
];

const STEPS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "search",
    title: "1 · Search the marketplace",
    body: "Filter by city, category, price, rating or verification.",
  },
  {
    icon: "user",
    title: "2 · Compare professionals",
    body: "Open a provider profile to see their services, reviews and location.",
  },
  {
    icon: "calendar",
    title: "3 · Pick a time slot",
    body: "Choose an available slot and confirm the booking request.",
  },
  {
    icon: "check",
    title: "4 · Get it done",
    body: "Track the booking in your dashboard and review when it's complete.",
  },
];

const WHY_ITEMS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "wallet",
    title: "Book at your price",
    body: "Listing prices are public, and each booking keeps the agreed amount on record.",
  },
  {
    icon: "shield",
    title: "Verification you can check",
    body: "Verified badges come from a reviewed KYC submission — not from paid promotion.",
  },
  {
    icon: "clock",
    title: "Cancel with notice",
    body: "Bookings can be cancelled up to 24 hours before the appointment, releasing the slot.",
  },
  {
    icon: "chat",
    title: "Talk inside the booking",
    body: "Conversations stay attached to the booking, so context is never lost.",
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const { isDesktop, isMobile, gutter } = useResponsive();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const searchInput = useRef<TextInput | null>(null);

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

  const { allServices, services, loading, refreshing, error, refresh } = useServiceCatalog({
    lat,
    lng,
    city,
    search,
    category,
    locationReady: !locationLoading,
  });

  const topRated = useMemo(() => {
    return allServices
      .filter((s) => (s.avg_rating ?? 0) >= 4 && (s.review_count ?? 0) > 0)
      .sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0))
      .slice(0, 3);
  }, [allServices]);

  const providers = useMemo<ProviderSummary[]>(() => {
    const map = new Map<number, ProviderSummary>();

    allServices.forEach((service) => {
      const price = Number.parseFloat(String(service.price ?? "0"));
      const rating = service.provider_rating ?? service.avg_rating ?? null;
      const reviews = service.provider_reviews ?? service.review_count ?? null;
      const existing = map.get(service.provider);

      if (!existing) {
        map.set(service.provider, {
          id: service.provider,
          name: service.provider_name,
          verified: service.provider_verified,
          rating,
          reviewCount: reviews,
          location: service.location,
          serviceCount: 1,
          avatarUri: service.provider_avatar ?? null,
          fromPrice: Number.isFinite(price) ? price : null,
        });
        return;
      }

      existing.serviceCount = (existing.serviceCount ?? 0) + 1;
      existing.verified = existing.verified || service.provider_verified;
      if (rating && (existing.rating ?? 0) < rating) existing.rating = rating;
      if (reviews && (existing.reviewCount ?? 0) < reviews) existing.reviewCount = reviews;
      if (!existing.location && service.location) existing.location = service.location;
      if (!existing.avatarUri && service.provider_avatar) existing.avatarUri = service.provider_avatar;
      if (Number.isFinite(price) && (existing.fromPrice == null || price < existing.fromPrice)) {
        existing.fromPrice = price;
      }
    });

    return Array.from(map.values())
      .sort(
        (a, b) =>
          Number(b.verified ?? false) - Number(a.verified ?? false) ||
          (b.rating ?? 0) - (a.rating ?? 0) ||
          (b.serviceCount ?? 0) - (a.serviceCount ?? 0)
      )
      .slice(0, 4);
  }, [allServices]);

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

  const openProvider = (provider: ProviderSummary) => {
    router.push(`/provider/${provider.id}` as never);
  };

  const focusSearch = () => searchInput.current?.focus();

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* ---------------------------------------------------------------- */}
        {/* Hero                                                             */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          <Container>
            <View style={[styles.heroRow, isDesktop ? styles.heroRowDesktop : null]}>
              <Animated.View
                entering={FadeInDown.duration(520)}
                style={[styles.heroCopy, isDesktop ? styles.heroCopyDesktop : null]}
              >
                <View style={styles.heroBadge}>
                  <Icon name="shield" size={13} color={colors.primaryDark} />
                  <Text style={styles.heroBadgeText}>
                    Trusted local professionals · Nepal
                  </Text>
                </View>

                <Text style={[styles.heroTitle, isDesktop ? styles.heroTitleDesktop : null]}>
                  Find the Right Professional for Your Service
                </Text>

                <Text style={styles.heroSubtitle}>
                  Book trusted local professionals for beauty, grooming, wellness, and other
                  services — at a price that works for you.
                </Text>

                <View style={[styles.heroCtas, isMobile ? styles.heroCtasMobile : null]}>
                  <Button
                    label="Book a service"
                    size="lg"
                    icon="search"
                    fullWidth={isMobile}
                    onPress={focusSearch}
                  />
                  <Button
                    label="Become an Expert"
                    variant="outline"
                    size="lg"
                    icon="sparkle"
                    fullWidth={isMobile}
                    onPress={() => router.push("/register")}
                  />
                </View>

                <View style={styles.heroStats}>
                  <HeroFact icon="shield" label="KYC verified providers" />
                  <HeroFact icon="calendar" label="Slot-based booking" />
                  <HeroFact icon="pin" label={`${cities.length} cities covered`} />
                </View>
              </Animated.View>

              {/* Search panel */}
              <Animated.View
                entering={FadeInDown.delay(90).duration(520)}
                style={[styles.searchPanelWrap, isDesktop ? styles.searchPanelWrapDesktop : null]}
              >
                <Card padding="lg" style={styles.searchPanel}>
                  <Text style={styles.searchTitle}>What do you need help with?</Text>
                  <Text style={styles.searchHint}>
                    Search a service, a skill or a provider name.
                  </Text>

                  <View style={styles.searchBox}>
                    <Icon name="search" size={17} color={colors.textSubtle} />
                    <TextInput
                      ref={searchInput}
                      placeholder="e.g. Electrician, deep cleaning…"
                      placeholderTextColor={colors.textSubtle}
                      value={search}
                      onChangeText={setSearch}
                      style={styles.searchInput}
                      returnKeyType="search"
                      onSubmitEditing={() => {
                        trackSearch(search);
                        router.push({ pathname: "/search", params: { q: search } } as never);
                      }}
                      accessibilityLabel="Search services"
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

                  <View style={styles.popularRow}>
                    <Text style={styles.popularLabel}>Popular:</Text>
                    {POPULAR_SEARCHES.map((term) => (
                      <Chip
                        key={term}
                        label={term}
                        size="sm"
                        active={search === term}
                        onPress={() => applySearch(term)}
                      />
                    ))}
                  </View>

                  <View style={styles.locationWrap}>
                    <LocationBar
                      city={city}
                      cities={cities}
                      usingGps={usingGps}
                      onSelectCity={setCity}
                      onUseGps={detectGps}
                    />
                  </View>
                </Card>
              </Animated.View>
            </View>
          </Container>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Trust strip                                                      */}
        {/* ---------------------------------------------------------------- */}
        <Container style={styles.section}>
          <Grid columns={isMobile ? 1 : isDesktop ? 4 : 2} gap={spacing.lg}>
            {TRUST_ITEMS.map((item) => (
              <Card key={item.title} padding="md" style={styles.trustCard}>
                <Icon name={item.icon} size={18} color={colors.primary} badge />
                <Text style={styles.trustTitle}>{item.title}</Text>
                <Text style={styles.trustBody}>{item.body}</Text>
              </Card>
            ))}
          </Grid>
        </Container>

        {/* ---------------------------------------------------------------- */}
        {/* Categories                                                       */}
        {/* ---------------------------------------------------------------- */}
        <Container style={styles.section}>
          <SectionHeader
            eyebrow="Browse"
            title="Browse by category"
            subtitle="Pick a category to narrow the listings instantly, or search for something specific."
            action={
              <Button
                label="Open full search"
                variant="ghost"
                size="sm"
                trailingIcon="arrow-right"
                onPress={() => router.push("/search")}
              />
            }
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryRow}
          >
            {BROWSE_CATEGORIES.map((cat) => (
              <Chip
                key={cat}
                label={cat}
                active={category === cat}
                onPress={() => setCategory(cat)}
              />
            ))}
          </ScrollView>
        </Container>

        {/* ---------------------------------------------------------------- */}
        {/* Recommended services                                             */}
        {/* ---------------------------------------------------------------- */}
        <Container style={styles.section}>
          <ServiceListing
            services={services}
            loading={loading}
            error={error}
            searchQuery={search}
            onBook={onOpen}
            onRetry={refresh}
            title={search.trim() ? `Results for “${search.trim()}”` : `Recommended in ${city}`}
            emptyActionLabel={search.trim() ? "Clear search" : undefined}
            onEmptyAction={search.trim() ? () => setSearch("") : undefined}
            headerAction={
              <Button
                label="View all"
                variant="outline"
                size="sm"
                onPress={() =>
                  router.push(
                    search.trim()
                      ? ({ pathname: "/search", params: { q: search } } as never)
                      : "/search"
                  )
                }
              />
            }
          />
        </Container>

        {/* ---------------------------------------------------------------- */}
        {/* Top rated                                                        */}
        {/* ---------------------------------------------------------------- */}
        {topRated.length > 0 ? (
          <Container style={styles.section}>
            <SectionHeader
              eyebrow="Highly rated"
              title="Top rated near you"
              subtitle="Providers with the strongest review history in this area."
            />
            <Grid columns={topRated.length === 2 ? 2 : 3}>
              {topRated.map((service, index) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  index={index}
                  onPress={() => onOpen(service)}
                />
              ))}
            </Grid>
          </Container>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {/* Featured providers                                               */}
        {/* ---------------------------------------------------------------- */}
        {providers.length > 0 ? (
          <Container style={styles.section}>
            <SectionHeader
              eyebrow="Professionals"
              title="Featured providers"
              subtitle="Independent professionals currently offering services in your city."
            />
            <View style={styles.providerList}>
              {providers.map((provider, index) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  index={index}
                  onPress={() => openProvider(provider)}
                />
              ))}
            </View>
          </Container>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {/* How it works                                                     */}
        {/* ---------------------------------------------------------------- */}
        <Container style={styles.section}>
          <SectionHeader
            eyebrow="How it works"
            title="Booking takes four steps"
            align="center"
          />
          <Grid columns={isMobile ? 1 : isDesktop ? 4 : 2}>
            {STEPS.map((step) => (
              <Card key={step.title} padding="lg" style={styles.stepCard}>
                <Icon name={step.icon} size={19} color={colors.primary} badge />
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepBody}>{step.body}</Text>
              </Card>
            ))}
          </Grid>
        </Container>

        {/* ---------------------------------------------------------------- */}
        {/* Why choose us                                                    */}
        {/* ---------------------------------------------------------------- */}
        <Container style={styles.section}>
          <SectionHeader
            eyebrow="Why customers choose us"
            title="A marketplace built on verified work"
          />
          <Grid columns={isMobile ? 1 : 2} gap={spacing.lg}>
            {WHY_ITEMS.map((item) => (
              <Card key={item.title} padding="lg" style={styles.whyCard}>
                <View style={styles.whyIcon}>
                  <Icon name={item.icon} size={18} color={colors.primaryDark} />
                </View>
                <View style={styles.whyText}>
                  <Text style={styles.whyTitle}>{item.title}</Text>
                  <Text style={styles.whyBody}>{item.body}</Text>
                </View>
              </Card>
            ))}
          </Grid>
        </Container>

        {/* ---------------------------------------------------------------- */}
        {/* Provider CTA                                                     */}
        {/* ---------------------------------------------------------------- */}
        <Container style={styles.section}>
          <View style={styles.ctaBand}>
            <View style={styles.ctaText}>
              <Text style={styles.ctaEyebrow}>For professionals</Text>
              <Text style={styles.ctaTitle}>Turn your skills into bookings</Text>
              <Text style={styles.ctaBody}>
                Publish your services with photos and a starting price, set your weekly
                availability, and manage every request from one dashboard.
              </Text>
            </View>
            <View style={styles.ctaActions}>
              <Button
                label="Become an Expert"
                size="lg"
                icon="sparkle"
                onPress={() => router.push("/register")}
              />
              <Button
                label="Provider sign in"
                variant="outline"
                size="lg"
                onPress={() => router.push("/login")}
              />
            </View>
          </View>
        </Container>

        {/* ---------------------------------------------------------------- */}
        {/* Footer                                                           */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.footer}>
          <Container>
            <View style={[styles.footerGrid, isMobile ? styles.footerGridMobile : null]}>
              <View style={styles.footerBrand}>
                <View style={styles.footerLogoRow}>
                  <View style={styles.footerLogo}>
                    <Text style={styles.footerLogoLetter}>S</Text>
                  </View>
                  <Text style={styles.footerBrandName}>Service Marketplace</Text>
                </View>
                <Text style={styles.footerTagline}>
                  Find trusted professionals. Book services at your price.
                </Text>
              </View>

              <View style={styles.footerColumn}>
                <Text style={styles.footerHeading}>Marketplace</Text>
                <FooterLink label="Home" onPress={() => router.push("/")} />
                <FooterLink label="Browse services" onPress={() => router.push("/search")} />
                <FooterLink
                  label="My account"
                  onPress={() => router.push("/dashboard")}
                />
              </View>

              <View style={styles.footerColumn}>
                <Text style={styles.footerHeading}>For providers</Text>
                <FooterLink label="Become an Expert" onPress={() => router.push("/register")} />
                <FooterLink label="Provider dashboard" onPress={() => router.push("/provider-home")} />
                <FooterLink label="KYC verification" onPress={() => router.push("/provider-kyc")} />
              </View>

              <View style={styles.footerColumn}>
                <Text style={styles.footerHeading}>Service areas</Text>
                {cities.map((c) => (
                  <Text key={c} style={styles.footerText}>
                    {c}
                  </Text>
                ))}
              </View>
            </View>

            <View style={styles.footerBottom}>
              <Text style={styles.footerFine}>
                {city} · Listings sorted nearest to your location
              </Text>
              <Text style={styles.footerFine}>
                Verified badges reflect completed identity (KYC) reviews.
              </Text>
            </View>
          </Container>
        </View>

        {/* Empty-state for the whole feed (defensive: listing handles it too) */}
        {!loading && !error && allServices.length === 0 ? (
          <Container style={styles.section}>
            <EmptyState
              icon="search"
              title="No services in this city yet"
              description={`Nothing is published in ${city} right now. Try another city or check back soon.`}
              actionLabel="Change city"
              onAction={() => router.push("/search")}
            />
          </Container>
        ) : null}
      </ScrollView>
    </View>
  );
}

function HeroFact({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.heroFact}>
      <Icon name={icon} size={14} color={colors.primaryDark} />
      <Text style={styles.heroFactText}>{label}</Text>
    </View>
  );
}

function FooterLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={({ pressed }: { pressed: boolean }) => pressed && styles.footerPressed}
    >
      <Text style={styles.footerLink}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  hero: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.giant,
    overflow: "hidden",
    position: "relative",
  },
  heroGlow: {
    position: "absolute",
    top: -160,
    right: -120,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: colors.primarySoft,
    opacity: 0.9,
  },
  heroRow: { gap: spacing.xxl },
  heroRowDesktop: { flexDirection: "row", alignItems: "center" },
  heroCopy: { gap: spacing.lg },
  heroCopyDesktop: { flex: 1.05 },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primarySoftBorder,
  },
  heroBadgeText: { fontSize: 12, fontWeight: weight.semibold, color: colors.primaryDark },
  heroTitle: { ...typography.h1, color: colors.text, letterSpacing: -0.5 },
  heroTitleDesktop: { ...typography.display, letterSpacing: -0.9 },
  heroSubtitle: { ...typography.body, color: colors.textMuted, maxWidth: 560, fontSize: 16, lineHeight: 26 },
  heroCtas: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  heroCtasMobile: { flexDirection: "column" },
  heroStats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg, marginTop: spacing.sm },
  heroFact: { flexDirection: "row", alignItems: "center", gap: spacing.xs + 1 },
  heroFactText: { fontSize: 12.5, color: colors.textMuted, fontWeight: weight.medium },

  searchPanelWrap: { width: "100%" },
  searchPanelWrapDesktop: { flex: 0.95 },
  searchPanel: { gap: spacing.md, ...shadows.md },
  searchTitle: { ...typography.h4, color: colors.text },
  searchHint: { ...typography.small, color: colors.textMuted, marginTop: -spacing.xs },
  searchBox: {
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
  popularRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  popularLabel: { fontSize: 12.5, color: colors.textMuted, fontWeight: weight.medium },
  locationWrap: { marginTop: spacing.xs },

  section: { marginTop: spacing.giant },
  trustCard: { gap: spacing.sm, minHeight: 168 },
  trustTitle: { ...typography.h4, color: colors.text },
  trustBody: { ...typography.small, color: colors.textMuted },

  categoryRow: { gap: spacing.sm, paddingRight: spacing.lg, paddingBottom: spacing.xs },

  providerList: { gap: spacing.md },

  stepCard: { gap: spacing.sm, minHeight: 178 },
  stepTitle: { ...typography.h4, color: colors.text },
  stepBody: { ...typography.small, color: colors.textMuted },

  whyCard: { flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" },
  whyIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  whyText: { flex: 1 },
  whyTitle: { ...typography.h4, color: colors.text },
  whyBody: { ...typography.small, color: colors.textMuted, marginTop: spacing.xs },

  ctaBand: {
    backgroundColor: colors.primary,
    borderRadius: radius.xxl,
    padding: spacing.xxxl,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xxl,
    ...shadows.primary,
  },
  ctaText: { flex: 1, minWidth: 260 },
  ctaEyebrow: {
    fontSize: 12,
    fontWeight: weight.semibold,
    color: "rgba(255,255,255,0.8)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  ctaTitle: { ...typography.h2, color: colors.textInverse, marginTop: spacing.sm },
  ctaBody: {
    ...typography.body,
    color: "rgba(255,255,255,0.88)",
    marginTop: spacing.sm,
    maxWidth: 520,
  },
  ctaActions: { gap: spacing.sm, minWidth: 220 },

  footer: {
    marginTop: spacing.giant,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.huge,
  },
  footerGrid: { flexDirection: "row", gap: spacing.xxxl, flexWrap: "wrap" },
  footerGridMobile: { flexDirection: "column", gap: spacing.xxl },
  footerBrand: { flex: 1, minWidth: 240, gap: spacing.sm },
  footerLogoRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  footerLogo: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  footerLogoLetter: { color: colors.textInverse, fontWeight: weight.extrabold, fontSize: 17 },
  footerBrandName: { fontSize: 15, fontWeight: weight.bold, color: colors.text },
  footerTagline: { ...typography.small, color: colors.textMuted, maxWidth: 320 },
  footerColumn: { gap: spacing.sm, minWidth: 160 },
  footerHeading: {
    fontSize: 12,
    fontWeight: weight.bold,
    color: colors.text,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  footerLink: { fontSize: 13.5, color: colors.textMuted, fontWeight: weight.medium },
  footerText: { fontSize: 13.5, color: colors.textMuted },
  footerPressed: { opacity: 0.6 },
  footerBottom: {
    marginTop: spacing.xxxl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  footerFine: { fontSize: 12, color: colors.textSubtle },
  pressedClear: { opacity: 0.6 },
});
