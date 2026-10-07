/**
 * ChooseServicesScreen — customer preferences after sign-up.
 * Stores the picked categories and returns to the marketplace feed.
 */
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useRouter } from "expo-router";
import Animated, { FadeInRight } from "react-native-reanimated";

import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Icon from "../../components/ui/Icon";
import { Container } from "../../components/ui/Layout";
import PageHeader from "../../components/ui/PageHeader";
import { StorageKeys, setItem } from "../../utils/storage";
import { colors, radius, spacing, typography, weight } from "../../theme/tokens";
import { useResponsive } from "../../theme/responsive";

const SERVICES = ["Plumbing", "Cleaning", "Electrician", "Carpentry"];

export default function ChooseServicesScreen() {
  const router = useRouter();
  const { isDesktop } = useResponsive();

  const [selected, setSelected] = useState<string[]>([]);
  const [popup, setPopup] = useState({
    visible: false,
    type: "info" as FeedbackType,
    title: "",
    message: "",
  });

  const toggle = (service: string) => {
    setSelected((prev) =>
      prev.includes(service) ? prev.filter((item) => item !== service) : [...prev, service]
    );
  };

  const continueNext = async () => {
    if (selected.length === 0) {
      setPopup({
        visible: true,
        type: "error",
        title: "Pick at least one",
        message: "Select the services you are interested in so we can highlight relevant listings.",
      });
      return;
    }
    await setItem(StorageKeys.SERVICES, JSON.stringify(selected));
    router.replace("/");
  };

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Container width="narrow" style={styles.content}>
          <PageHeader
            eyebrow="Preferences"
            title="What services do you need?"
            subtitle="Choose as many as you like — we use this to highlight relevant listings on your home feed."
          />

          <Card padding="lg" style={styles.card}>
            <View style={[styles.grid, isDesktop ? styles.gridDesktop : null]}>
              {SERVICES.map((service, index) => {
                const active = selected.includes(service);
                return (
                  <Animated.View
                    key={service}
                    entering={FadeInRight.delay(index * 40).duration(280)}
                    style={isDesktop ? styles.gridItemDesktop : styles.gridItem}
                  >
                    <Pressable
                      onPress={() => toggle(service)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={service}
                      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                        styles.option,
                        hovered ? styles.optionHover : null,
                        active ? styles.optionActive : null,
                        pressed ? styles.pressed : null,
                      ]}
                    >
                      <View style={[styles.check, active ? styles.checkActive : null]}>
                        {active ? <Icon name="check" size={13} color={colors.textInverse} /> : null}
                      </View>
                      <Text style={[styles.optionText, active ? styles.optionTextActive : null]}>
                        {service}
                      </Text>
                    </Pressable>
                  </Animated.View>
                );
              })}
            </View>

            <Text style={styles.helper}>
              {selected.length === 0
                ? "No categories selected yet."
                : `${selected.length} selected: ${selected.join(", ")}`}
            </Text>

            <Button
              label="Continue to marketplace"
              size="lg"
              fullWidth
              trailingIcon="arrow-right"
              onPress={continueNext}
            />
            <Button
              label="Skip for now"
              variant="ghost"
              size="sm"
              fullWidth
              style={{ marginTop: spacing.sm }}
              onPress={() => router.replace("/")}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing.giant, paddingBottom: spacing.giant },
  card: { gap: spacing.md },
  grid: { gap: spacing.md },
  gridDesktop: { flexDirection: "row", flexWrap: "wrap" },
  gridItem: { width: "100%" },
  gridItemDesktop: { width: "50%" },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  optionHover: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  checkActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { ...typography.bodyStrong, color: colors.text },
  optionTextActive: { color: colors.primaryDark },
  pressed: { opacity: 0.9 },
  helper: { ...typography.caption, color: colors.textMuted },
  weightNote: { fontWeight: weight.semibold },
});
