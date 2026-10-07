/**
 * Tema colours.
 *
 * The values live in `./tokens`; this module exposes the flat, named exports
 * the app has always imported (`PRIMARY`, `BACKGROUND`, `TEXT`, …) so existing
 * modules keep working, plus the newer semantic names used by the UI kit.
 */
import { colors, palette } from "./tokens";

/* ---- legacy names (still imported across the app) ---- */
export const PRIMARY = colors.primary;
export const PRIMARY_DARK = colors.primaryDark;
export const PRIMARY_LIGHT = colors.primarySoft;
export const BACKGROUND = colors.background;
export const PROVIDER_BACKGROUND = colors.background;
export const CARD = colors.surface;
export const TEXT = colors.text;
export const TEXT_MUTED = colors.textMuted;
export const BORDER = colors.border;
export const SUCCESS = colors.success;
export const WARNING = colors.warning;
export const DANGER = colors.danger;
export const STAR = colors.star;
export const HERO_BG = colors.surface;
export const NAV_DARK = colors.surfaceInverse;
export const TAG_BG = colors.surfaceMuted;
export const SURFACE = colors.surface;
export const SHADOW = "rgba(15, 23, 42, 0.08)";

/* ---- semantic names used by the redesigned UI ---- */
export const TEXT_SUBTLE = colors.textSubtle;
export const TEXT_INVERSE = colors.textInverse;
export const BORDER_STRONG = colors.borderStrong;
export const SURFACE_ALT = colors.surfaceAlt;
export const SURFACE_MUTED = colors.surfaceMuted;
export const PRIMARY_SOFT = colors.primarySoft;
export const SUCCESS_SOFT = colors.successSoft;
export const WARNING_SOFT = colors.warningSoft;
export const DANGER_SOFT = colors.dangerSoft;
export const INFO = colors.info;
export const INFO_SOFT = colors.infoSoft;
export const OVERLAY = colors.overlay;

export { colors, palette };
export * from "./tokens";
