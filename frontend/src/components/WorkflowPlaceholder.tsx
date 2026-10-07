/**
 * WorkflowPlaceholder — a styled "next step" card kept for compatibility with
 * screens that describe an upcoming workflow step.
 */
import React from "react";
import { useRouter } from "expo-router";

import Button from "./ui/Button";
import Card from "./ui/Card";
import Icon from "./ui/Icon";
import ScreenShell from "./ScreenShell";
import { colors, spacing, typography } from "../theme/tokens";
import { View } from "react-native";

type Props = {
  title: string;
  step: string;
  description: string;
  nextRoute?: string;
  nextLabel?: string;
};

export default function WorkflowPlaceholder({
  title,
  step,
  description,
  nextRoute,
  nextLabel = "Continue",
}: Props) {
  const router = useRouter();

  return (
    <ScreenShell step={step} title={title} subtitle={description} width="narrow">
      <Card>
        <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "flex-start" }}>
          <Icon name="info" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <View style={{ borderBottomWidth: 0 }}>
              <View
                style={{
                  height: 6,
                  width: 60,
                  borderRadius: 3,
                  backgroundColor: colors.primarySoft,
                  marginBottom: spacing.md,
                }}
              />
            </View>
            <View style={{ gap: spacing.sm }}>
              <View style={{ height: 12, width: "80%", borderRadius: 6, backgroundColor: colors.surfaceMuted }} />
              <View style={{ height: 12, width: "60%", borderRadius: 6, backgroundColor: colors.surfaceMuted }} />
            </View>
          </View>
        </View>
      </Card>

      {nextRoute ? (
        <Button
          label={nextLabel}
          trailingIcon="arrow-right"
          fullWidth
          style={{ marginTop: spacing.lg }}
          onPress={() => router.push(nextRoute as never)}
        />
      ) : null}
    </ScreenShell>
  );
}
