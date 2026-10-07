/**
 * NotFoundScreen — friendly fallback for unknown routes.
 * The title text is asserted by the boot smoke test.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useRouter } from "expo-router";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Icon from "../../components/ui/Icon";
import { Container } from "../../components/ui/Layout";
import { colors, spacing, typography } from "../../theme/tokens";

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <Container width="form" style={styles.content}>
        <Card padding="lg" style={styles.card}>
          <Icon name="search" size={26} color={colors.primary} badge />
          <Text style={styles.title}>Page not found</Text>
          <Text style={styles.body}>
            The page you were looking for does not exist or has moved. Let's get you back to the
            marketplace.
          </Text>

          <View style={styles.actions}>
            <Button
              label="Back to marketplace"
              size="lg"
              fullWidth
              trailingIcon="arrow-right"
              onPress={() => router.replace("/")}
            />
            <Button
              label="Browse services"
              variant="outline"
              size="md"
              fullWidth
              onPress={() => router.replace("/search")}
            />
          </View>
        </Card>
      </Container>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, justifyContent: "center" },
  content: { paddingVertical: spacing.giant },
  card: { alignItems: "center", gap: spacing.md },
  title: { ...typography.h2, color: colors.text, textAlign: "center" },
  body: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  actions: { width: "100%", gap: spacing.sm, marginTop: spacing.lg },
});
