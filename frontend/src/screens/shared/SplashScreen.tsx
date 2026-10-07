/**
 * SplashScreen — resolves the initial route and shows the brand while loading.
 */
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useRouter } from "expo-router";

import Icon from "../../components/ui/Icon";
import { colors, radius, spacing, typography, weight } from "../../theme/tokens";
import { resolveInitialRoute } from "../../navigation/workflow";

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    const boot = async () => {
      const route = await resolveInitialRoute();
      setTimeout(() => router.replace(route), 200);
    };
    boot();
  }, [router]);

  return (
    <View style={styles.screen}>
      <View style={styles.logo}>
        <Text style={styles.logoLetter}>S</Text>
      </View>
      <Text style={styles.brand}>Service Marketplace</Text>
      <Text style={styles.tagline}>Find trusted professionals. Book services at your price.</Text>
      <View style={styles.spinner}>
        <Icon name="sparkle" size={18} color={colors.primary} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    gap: spacing.md,
    padding: spacing.xxl,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  logoLetter: { color: colors.textInverse, fontSize: 26, fontWeight: weight.extrabold },
  brand: { ...typography.h2, color: colors.text },
  tagline: { ...typography.small, color: colors.textMuted, textAlign: "center" },
  spinner: { marginTop: spacing.lg },
});
