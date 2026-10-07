/**
 * ScreenShell — the page frame for inner screens.
 *
 * Provides the responsive content column, the page header (eyebrow + title +
 * description + actions) and a consistent vertical rhythm. `step` is kept for
 * backwards compatibility and rendered as the header eyebrow.
 */
import React from "react";
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { colors, spacing } from "../theme/tokens";
import { Container } from "./ui/Layout";
import PageHeader from "./ui/PageHeader";

type Props = {
  step?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  scroll?: boolean;
  showBack?: boolean;
  /** Right-hand header actions (buttons, filters). */
  actions?: React.ReactNode;
  /** `narrow` for forms, `full` for edge-to-edge dashboards. */
  width?: "content" | "narrow" | "full";
  onBack?: () => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

export default function ScreenShell({
  step,
  title,
  subtitle,
  children,
  scroll = true,
  showBack,
  actions,
  width = "content",
  onBack,
  style,
  contentStyle,
}: Props) {
  const body = (
    <Animated.View entering={FadeInDown.duration(380)}>
      <PageHeader
        eyebrow={step}
        title={title}
        subtitle={subtitle}
        onBack={showBack ? onBack : undefined}
        actions={actions}
      />
      {children}
    </Animated.View>
  );

  if (!scroll) {
    return (
      <View style={[styles.screen, style]}>
        <Container width={width} style={[styles.staticPadding, contentStyle]}>
          {body}
        </Container>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.screen, style]}
      contentContainerStyle={[styles.scrollPadding, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Container width={width}>{body}</Container>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollPadding: { paddingTop: spacing.xxl, paddingBottom: spacing.giant },
  staticPadding: { paddingTop: spacing.xxl, paddingBottom: spacing.giant },
});
