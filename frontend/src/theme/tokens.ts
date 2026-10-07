/**
 * Design tokens — the single source of truth for the Service Marketplace UI.
 *
 * Everything visual (colour, spacing, radius, type scale, shadow, layout) is
 * declared here and consumed through `theme/colors.ts`, `theme/responsive.ts`
 * and the components in `src/components/ui`. Screens should never hard-code a
 * colour or a magic number.
 *
 * Brand promise: "Find trusted professionals. Book services at your price."
 *   indigo primary  → confidence, modern software
 *   neutral greys   → calm, premium, readable
 *   green/amber/red → status only
 */

/* -------------------------------------------------------------------------- */
/* Colour                                                                     */
/* -------------------------------------------------------------------------- */

export const palette = {
  // Primary — refined indigo
  indigo50: "#EEF2FF",
  indigo100: "#E0E7FF",
  indigo200: "#C7D2FE",
  indigo300: "#A5B4FC",
  indigo400: "#818CF8",
  indigo500: "#6366F1",
  indigo600: "#4F46E5",
  indigo700: "#4338CA",
  indigo800: "#3730A3",
  indigo900: "#312E81",

  // Neutrals — slate scale
  white: "#FFFFFF",
  slate50: "#F8FAFC",
  slate100: "#F1F5F9",
  slate200: "#E2E8F0",
  slate300: "#CBD5E1",
  slate400: "#94A3B8",
  slate500: "#64748B",
  slate600: "#475569",
  slate700: "#334155",
  slate800: "#1E293B",
  slate900: "#0F172A",

  // Status
  green50: "#ECFDF5",
  green100: "#D1FAE5",
  green500: "#10B981",
  green600: "#059669",
  green700: "#047857",
  amber50: "#FFFBEB",
  amber100: "#FEF3C7",
  amber500: "#F59E0B",
  amber600: "#D97706",
  amber700: "#B45309",
  red50: "#FEF2F2",
  red100: "#FEE2E2",
  red500: "#EF4444",
  red600: "#DC2626",
  red700: "#B91C1C",
  sky50: "#F0F9FF",
  sky600: "#0284C7",
  sky700: "#0369A1",
} as const;

export const colors = {
  /* Brand */
  primary: palette.indigo600,
  primaryDark: palette.indigo700,
  primaryDarker: palette.indigo800,
  primaryLight: palette.indigo500,
  primarySoft: palette.indigo50,
  primarySoftBorder: palette.indigo100,
  accent: palette.indigo500,

  /* Surfaces */
  background: "#F7F8FC",
  backgroundAlt: palette.slate100,
  surface: palette.white,
  surfaceAlt: palette.slate50,
  surfaceMuted: palette.slate100,
  surfaceInverse: palette.slate900,
  overlay: "rgba(15, 23, 42, 0.55)",

  /* Text */
  text: palette.slate900,
  textMuted: palette.slate500,
  textSubtle: palette.slate400,
  textInverse: palette.white,
  textOnPrimary: palette.white,

  /* Lines */
  border: "#E6E8F0",
  borderStrong: palette.slate300,
  borderFocus: palette.indigo400,

  /* Status */
  success: palette.green600,
  successSoft: palette.green50,
  successBorder: palette.green100,
  warning: palette.amber600,
  warningSoft: palette.amber50,
  warningBorder: palette.amber100,
  danger: palette.red600,
  dangerSoft: palette.red50,
  dangerBorder: palette.red100,
  info: palette.sky600,
  infoSoft: palette.sky50,
  star: palette.amber500,

  /* Legacy aliases kept so unchanged modules keep compiling. */
  navDark: palette.slate900,
  tagBg: palette.slate100,
  heroBg: palette.white,
} as const;

/* -------------------------------------------------------------------------- */
/* Spacing / radius                                                           */
/* -------------------------------------------------------------------------- */

export const spacing = {
  xxs: 1,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  giant: 56,
} as const;

export const radius = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 14,
  xl: 18,
  xxl: 24,
  pill: 999,
} as const;

/* -------------------------------------------------------------------------- */
/* Typography                                                                 */
/* -------------------------------------------------------------------------- */

export const fontFamily = {
  sans: undefined as string | undefined,
  mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};

/** Font weights as strings so react-native-web and native agree. */
export const weight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  extrabold: "800",
} as const;

export const typography = {
  displayXl: { fontSize: 46, lineHeight: 54, fontWeight: weight.bold, letterSpacing: -0.8 },
  display: { fontSize: 38, lineHeight: 46, fontWeight: weight.bold, letterSpacing: -0.6 },
  h1: { fontSize: 30, lineHeight: 38, fontWeight: weight.bold, letterSpacing: -0.4 },
  h2: { fontSize: 24, lineHeight: 32, fontWeight: weight.bold, letterSpacing: -0.3 },
  h3: { fontSize: 19, lineHeight: 26, fontWeight: weight.bold },
  h4: { fontSize: 16, lineHeight: 23, fontWeight: weight.bold },
  body: { fontSize: 15, lineHeight: 23, fontWeight: weight.regular },
  bodyStrong: { fontSize: 15, lineHeight: 23, fontWeight: weight.semibold },
  small: { fontSize: 13, lineHeight: 20, fontWeight: weight.regular },
  smallStrong: { fontSize: 13, lineHeight: 20, fontWeight: weight.semibold },
  caption: { fontSize: 12, lineHeight: 18, fontWeight: weight.medium },
  label: { fontSize: 12, lineHeight: 16, fontWeight: weight.semibold, letterSpacing: 0.6 },
  /* Legacy aliases (sharedStyles / older screens). */
  statValue: { fontSize: 26, lineHeight: 32, fontWeight: weight.extrabold },
  price: { fontSize: 20, lineHeight: 26, fontWeight: weight.extrabold },
} as const;

/* -------------------------------------------------------------------------- */
/* Shadows — `boxShadow` so react-native-web does not warn about legacy props  */
/* -------------------------------------------------------------------------- */

export const shadows = {
  none: undefined,
  xs: { boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)" },
  sm: { boxShadow: "0 2px 6px rgba(15, 23, 42, 0.06)" },
  md: { boxShadow: "0 6px 18px rgba(15, 23, 42, 0.08)" },
  lg: { boxShadow: "0 16px 38px rgba(15, 23, 42, 0.12)" },
  primary: { boxShadow: "0 8px 20px rgba(79, 70, 229, 0.28)" },
} as const;

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

export const layout = {
  /** Content column width on large screens. */
  maxContentWidth: 1200,
  maxNarrowWidth: 760,
  maxFormWidth: 480,
  navbarHeight: 66,
  gutter: { mobile: 16, tablet: 24, desktop: 32 },
  /** Common control heights. */
  control: { sm: 36, md: 44, lg: 52 },
} as const;

export const breakpoints = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
  wide: 1280,
} as const;

/** Status tone vocabulary shared by Badge / StatusBadge / StatCard. */
export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

export const toneColors: Record<
  Tone,
  { fg: string; bg: string; border: string }
> = {
  neutral: { fg: colors.textMuted, bg: colors.surfaceMuted, border: colors.border },
  primary: { fg: colors.primaryDark, bg: colors.primarySoft, border: colors.primarySoftBorder },
  success: { fg: palette.green700, bg: colors.successSoft, border: colors.successBorder },
  warning: { fg: palette.amber700, bg: colors.warningSoft, border: colors.warningBorder },
  danger: { fg: palette.red700, bg: colors.dangerSoft, border: colors.dangerBorder },
  info: { fg: palette.sky700, bg: colors.infoSoft, border: "#BAE6FD" },
};

export const theme = {
  colors,
  palette,
  spacing,
  radius,
  typography,
  weight,
  shadows,
  layout,
  breakpoints,
  toneColors,
} as const;

export type Theme = typeof theme;
