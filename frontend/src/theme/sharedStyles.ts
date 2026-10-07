/**
 * Shared style fragments.
 *
 * Kept for the screens that still import them; new code should prefer the
 * components in `src/components/ui`.
 */
import { StyleSheet } from "react-native";

import { colors, radius, shadows, spacing, typography, weight } from "./tokens";

export const sharedStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.giant },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    ...shadows.xs,
  },

  step: {
    fontSize: typography.label.fontSize,
    color: colors.primary,
    fontWeight: weight.semibold,
    letterSpacing: typography.label.letterSpacing,
    textTransform: "uppercase",
  },
  title: { ...typography.h2, color: colors.text, marginTop: spacing.sm, marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.textMuted, marginBottom: spacing.xl },

  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.md,
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.md,
  },
  inputMultiline: { minHeight: 104, textAlignVertical: "top" },

  btnPrimary: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg - 1,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
    flexDirection: "row",
    ...shadows.primary,
  },
  btnPrimaryText: { color: colors.textOnPrimary, fontWeight: weight.bold, fontSize: 15 },

  btnOutline: {
    paddingVertical: spacing.lg - 2,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  btnOutlineText: { color: colors.primaryDark, fontWeight: weight.semibold, fontSize: 15 },

  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontWeight: weight.semibold, color: colors.textMuted, fontSize: 13 },
  chipTextActive: { color: colors.textOnPrimary },

  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: { ...typography.statValue, color: colors.text },
  statLabel: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },

  successBanner: {
    padding: spacing.md,
    backgroundColor: colors.successSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.successBorder,
    marginTop: spacing.md,
  },
  successText: { color: colors.text, fontWeight: weight.semibold },
});
