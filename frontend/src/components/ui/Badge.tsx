/**
 * Badge / StatusBadge / VerifiedBadge.
 *
 * `Badge` is the generic pill; `StatusBadge` maps the marketplace status
 * vocabulary (booking statuses, KYC statuses) to a tone + readable label.
 */
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, radius, spacing, toneColors, weight, type Tone } from "../../theme/tokens";
import Icon, { type IconName } from "./Icon";

type Variant = "soft" | "outline" | "solid";

type Props = {
  label: string;
  tone?: Tone;
  variant?: Variant;
  icon?: IconName;
  /** Leading status dot. */
  dot?: boolean;
  size?: "sm" | "md";
  style?: StyleProp<ViewStyle>;
};

export default function Badge({
  label,
  tone = "neutral",
  variant = "soft",
  icon,
  dot,
  size = "sm",
  style,
}: Props) {
  const palette = toneColors[tone];
  const background = variant === "solid" ? palette.fg : variant === "soft" ? palette.bg : "transparent";
  const textColor = variant === "solid" ? colors.textInverse : palette.fg;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: background,
          borderColor: variant === "solid" ? palette.fg : palette.border,
        },
        size === "md" ? styles.md : null,
        style,
      ]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: textColor }]} /> : null}
      {icon ? <Icon name={icon} size={12} color={textColor} /> : null}
      <Text
        style={[styles.text, { color: textColor }, size === "md" ? styles.textMd : null]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

/** Human label + tone for every status the backend can return. */
const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  // Booking lifecycle
  draft: { label: "Draft", tone: "neutral" },
  pending: { label: "Pending review", tone: "warning" },
  offers: { label: "Offer sent", tone: "info" },
  agreed: { label: "Price agreed", tone: "primary" },
  payment_pending: { label: "Payment pending", tone: "warning" },
  payment_failed: { label: "Payment failed", tone: "danger" },
  confirmed: { label: "Confirmed", tone: "success" },
  in_progress: { label: "In progress", tone: "primary" },
  deliverable_submitted: { label: "Deliverable sent", tone: "info" },
  client_reviewing: { label: "Awaiting your review", tone: "info" },
  revision_requested: { label: "Revision requested", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
  reviewed: { label: "Reviewed", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
  disputed: { label: "Disputed", tone: "danger" },
  // KYC
  not_submitted: { label: "Not submitted", tone: "neutral" },
  submitted: { label: "Under review", tone: "warning" },
  approved: { label: "Verified", tone: "success" },
  // Availability slots
  available: { label: "Available", tone: "success" },
  booked: { label: "Booked", tone: "neutral" },
  blocked: { label: "Blocked", tone: "danger" },
};

export function statusMeta(status: string | null | undefined, fallbackLabel?: string) {
  const key = String(status ?? "").trim().toLowerCase();
  return (
    STATUS_MAP[key] ?? {
      label: fallbackLabel ?? (key ? key.replace(/_/g, " ") : "Unknown"),
      tone: "neutral" as Tone,
    }
  );
}

export function StatusBadge({
  status,
  size = "sm",
  style,
}: {
  status: string | null | undefined;
  size?: "sm" | "md";
  style?: StyleProp<ViewStyle>;
}) {
  const meta = statusMeta(status);
  return (
    <Badge
      label={meta.label}
      tone={meta.tone}
      dot
      size={size}
      style={style}
    />
  );
}

export function VerifiedBadge({ compact }: { compact?: boolean }) {
  return <Badge label={compact ? "Verified" : "ID verified"} tone="success" icon="shield" />;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 1,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  md: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 11.5, fontWeight: weight.semibold, letterSpacing: 0.2 },
  textMd: { fontSize: 13 },
});
