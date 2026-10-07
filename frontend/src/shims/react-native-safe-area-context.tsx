/**
 * Web shim for `react-native-safe-area-context`.
 *
 * On the web the safe-area insets are zero, except for the top inset when the
 * page is displayed in a full-screen/standalone context.
 */
import React, { createContext, useContext } from "react";

export type EdgeInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type Rect = { x: number; y: number; width: number; height: number };

const zeroInsets: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const zeroFrame: Rect = { x: 0, y: 0, width: 0, height: 0 };

const SafeAreaInsetsContext = createContext<EdgeInsets>(zeroInsets);
const SafeAreaFrameContext = createContext<Rect>(zeroFrame);

const isStandalone =
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches ?? false);

const insets: EdgeInsets = isStandalone
  ? { top: 12, right: 0, bottom: 0, left: 0 }
  : zeroInsets;

export function SafeAreaProvider({ children }: { children?: React.ReactNode }) {
  return (
    <SafeAreaInsetsContext.Provider value={insets}>
      <SafeAreaFrameContext.Provider value={zeroFrame}>
        {children}
      </SafeAreaFrameContext.Provider>
    </SafeAreaInsetsContext.Provider>
  );
}

export function SafeAreaConsumer({
  children,
}: {
  children: (value: EdgeInsets) => React.ReactNode;
}) {
  return <SafeAreaInsetsContext.Consumer>{children}</SafeAreaInsetsContext.Consumer>;
}

export function useSafeAreaInsets(): EdgeInsets {
  return useContext(SafeAreaInsetsContext);
}

export function useSafeAreaFrame(): Rect {
  return useContext(SafeAreaFrameContext);
}

export function SafeAreaView({ children, style }: { children?: React.ReactNode; style?: unknown }) {
  return <div style={style as React.CSSProperties}>{children}</div>;
}

export function withSafeAreaInsets<T>(Component: React.ComponentType<T>) {
  return (props: T) => (
    <Component {...props} insets={useSafeAreaInsets() as never} />
  );
}

export default {
  SafeAreaProvider,
  SafeAreaConsumer,
  SafeAreaView,
  useSafeAreaInsets,
  useSafeAreaFrame,
  withSafeAreaInsets,
};
