/**
 * AuthLayout — the frame shared by login, register, OTP, forgot and reset.
 *
 * Desktop: brand panel on the left, form card on the right (split screen).
 * Mobile: compact brand header with the form directly underneath, so the first
 * input is reachable without scrolling.
 */
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { getApiBaseUrl } from "../config/api";
import { colors, radius, shadows, spacing, typography, weight } from "../theme/tokens";
import { useResponsive } from "../theme/responsive";
import Icon from "./ui/Icon";
import { Container } from "./ui/Layout";

type Props = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  showBack?: boolean;
  onBack?: () => void;
};

const HIGHLIGHTS = [
  {
    icon: "shield" as const,
    title: "Verified professionals",
    body: "Providers submit identity documents that our team reviews before they can publish services.",
  },
  {
    icon: "calendar" as const,
    title: "Availability you can trust",
    body: "Pick a real time slot from a provider's calendar — no back-and-forth messages needed.",
  },
  {
    icon: "wallet" as const,
    title: "Prices that work for you",
    body: "Every listing shows its starting price, and bookings keep the agreed amount on record.",
  },
];

export default function AuthLayout({ title, subtitle, children, showBack, onBack }: Props) {
  const { isDesktop, gutter } = useResponsive();

  return (
    <View style={styles.root}>
      <Container width="full" style={{ paddingHorizontal: gutter, flex: 1 }}>
        <View style={[styles.split, isDesktop ? styles.splitRow : styles.splitColumn]}>
          {/* Brand / trust panel */}
          <View style={[styles.brandPanel, isDesktop ? styles.brandPanelDesktop : styles.brandPanelMobile]}>
            <View style={styles.brandRow}>
              <View style={styles.logo}>
                <Text style={styles.logoLetter}>S</Text>
              </View>
              <Text style={styles.brand}>Service Marketplace</Text>
            </View>

            <Text style={[styles.brandHeadline, isDesktop ? styles.headlineDesktop : styles.headlineMobile]}>
              Find trusted professionals.{"\n"}Book services at your price.
            </Text>

            {isDesktop ? (
              <View style={styles.highlights}>
                {HIGHLIGHTS.map((item) => (
                  <View key={item.title} style={styles.highlight}>
                    <View style={styles.highlightIcon}>
                      <Icon name={item.icon} size={17} color={colors.primaryDark} />
                    </View>
                    <View style={styles.highlightText}>
                      <Text style={styles.highlightTitle}>{item.title}</Text>
                      <Text style={styles.highlightBody}>{item.body}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.brandSub}>
                Verified professionals · real availability · transparent prices
              </Text>
            )}
          </View>

          {/* Form */}
          <View style={[styles.formPanel, isDesktop ? styles.formPanelDesktop : styles.formPanelMobile]}>
            <View style={styles.formInner}>
              {showBack ? (
                <Pressable
                  onPress={onBack}
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                  style={({ pressed }: { pressed: boolean }) => [styles.back, pressed && styles.pressed]}
                >
                  <Icon name="chevron-left" size={13} color={colors.textMuted} />
                  <Text style={styles.backText}>Back</Text>
                </Pressable>
              ) : null}

              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>

              {children}
            </View>

            <Text style={styles.apiHint} numberOfLines={1}>
              API: {getApiBaseUrl()}
            </Text>
          </View>
        </View>
      </Container>
    </View>
  );
}

/**
 * Shared form styles. The redesigned auth screens use the `ui` components, but
 * the style object is kept exported for compatibility with any screen still
 * importing it.
 */
export const authFormStyles = {
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xxl,
    padding: spacing.xxl,
    ...shadows.xs,
  },
  label: { fontSize: 13, fontWeight: weight.semibold, color: colors.text, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.md,
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  inputFocused: { borderColor: colors.borderFocus },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: spacing.sm,
    ...shadows.primary,
  },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: colors.textInverse, fontWeight: weight.bold, fontSize: 15 },
  linkRow: { marginTop: spacing.lg, alignItems: "center" },
  link: { color: colors.textMuted, fontSize: 14 },
  linkBold: { color: colors.primary, fontWeight: weight.bold },
  roleRow: { flexDirection: "row", marginBottom: spacing.lg, gap: spacing.sm },
  roleChip: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  roleChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  roleText: { fontWeight: weight.semibold, color: colors.textMuted, fontSize: 14 },
  roleTextActive: { color: colors.textInverse },
  stepRow: { flexDirection: "row", marginBottom: spacing.lg, gap: spacing.sm },
  step: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surfaceMuted },
  stepActive: { backgroundColor: colors.primary },
} as const;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingVertical: spacing.xxl },
  split: { flex: 1, gap: spacing.xxl },
  splitRow: { flexDirection: "row", alignItems: "stretch" },
  splitColumn: { flexDirection: "column" },

  brandPanel: { justifyContent: "flex-start" },
  brandPanelDesktop: { flex: 1, paddingVertical: spacing.giant, paddingRight: spacing.giant },
  brandPanelMobile: { gap: spacing.md },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg },
  logo: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  logoLetter: { color: colors.textInverse, fontWeight: weight.extrabold, fontSize: 20 },
  brand: { fontSize: 16, fontWeight: weight.bold, color: colors.text },
  brandHeadline: { color: colors.text },
  headlineDesktop: { ...typography.display, marginBottom: spacing.xxxl },
  headlineMobile: { ...typography.h2, marginBottom: spacing.sm },
  brandSub: { ...typography.small, color: colors.textMuted },

  highlights: { gap: spacing.xl },
  highlight: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  highlightIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  highlightText: { flex: 1 },
  highlightTitle: { ...typography.bodyStrong, color: colors.text },
  highlightBody: { ...typography.small, color: colors.textMuted, marginTop: 2 },

  formPanel: { justifyContent: "center" },
  formPanelDesktop: { flexBasis: 460, flexGrow: 0, flexShrink: 0 },
  formPanelMobile: { flexGrow: 1 },
  formInner: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xxl,
    padding: spacing.xxl,
    ...shadows.sm,
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
    marginBottom: spacing.lg,
  },
  backText: { color: colors.textMuted, fontWeight: weight.semibold, fontSize: 13 },
  pressed: { opacity: 0.7 },
  title: { ...typography.h2, color: colors.text },
  subtitle: { ...typography.small, color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.xxl },
  apiHint: {
    textAlign: "center",
    fontSize: 10.5,
    color: colors.textSubtle,
    marginTop: spacing.md,
  },
});
