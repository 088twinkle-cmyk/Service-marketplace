/**
 * Responsive helpers.
 *
 * Screens are written once and adapt to phone, tablet and desktop widths.
 * Everything is derived from `useWindowDimensions()` so it behaves the same in
 * a browser (react-native-web), on a tablet and on a phone.
 *
 * Practical rules used across the app:
 *   mobile  (< 768)   single column, 16px gutters, stacked actions
 *   tablet  (≥ 768)   two columns where a grid exists, 24px gutters
 *   desktop (≥ 1024)  content column max 1200px, 32px gutters, side rails
 *   wide    (≥ 1280)  richer grids (3–4 columns)
 */
import { useWindowDimensions } from "react-native";

import { breakpoints, layout } from "./tokens";

export type Breakpoint = "mobile" | "tablet" | "desktop" | "wide";

export type ResponsiveInfo = {
  width: number;
  breakpoint: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isWide: boolean;
  /** Comfortable number of grid columns for the current width. */
  columns: number;
  /** Horizontal page gutter. */
  gutter: number;
  /** Max width of the main content column. */
  contentWidth: number;
  /** Choose a value per breakpoint. */
  pick: <T>(values: { mobile: T; tablet?: T; desktop?: T; wide?: T }) => T;
};

export function resolveBreakpoint(width: number): Breakpoint {
  if (width >= breakpoints.wide) return "wide";
  if (width >= breakpoints.desktop) return "desktop";
  if (width >= breakpoints.tablet) return "tablet";
  return "mobile";
}

export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions();
  return resolveBreakpoint(width);
}

export function useResponsive(): ResponsiveInfo {
  const { width } = useWindowDimensions();
  const breakpoint = resolveBreakpoint(width);

  const isMobile = breakpoint === "mobile";
  const isTablet = breakpoint === "tablet";
  const isDesktop = breakpoint === "desktop" || breakpoint === "wide";
  const isWide = breakpoint === "wide";

  const columns = isWide ? 4 : isDesktop ? 3 : isTablet ? 2 : 1;

  const gutter =
    breakpoint === "mobile"
      ? layout.gutter.mobile
      : breakpoint === "tablet"
        ? layout.gutter.tablet
        : layout.gutter.desktop;

  const pick = <T,>(values: { mobile: T; tablet?: T; desktop?: T; wide?: T }): T => {
    if (breakpoint === "wide") {
      return values.wide ?? values.desktop ?? values.tablet ?? values.mobile;
    }
    if (breakpoint === "desktop") {
      return values.desktop ?? values.tablet ?? values.mobile;
    }
    if (breakpoint === "tablet") {
      return values.tablet ?? values.mobile;
    }
    return values.mobile;
  };

  return {
    width,
    breakpoint,
    isMobile,
    isTablet,
    isDesktop,
    isWide,
    columns,
    gutter,
    contentWidth: layout.maxContentWidth,
    pick,
  };
}
