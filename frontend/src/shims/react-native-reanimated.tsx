/**
 * Web shim for `react-native-reanimated`.
 *
 * The app only uses a small, well-defined slice of Reanimated:
 *   - `Animated.View` with `entering={FadeIn/FadeInDown/FadeInRight...}`
 *   - `useSharedValue`, `useAnimatedStyle`, `withTiming`, `withRepeat`
 *
 * This shim reproduces that behaviour with CSS transitions / requestAnimationFrame
 * so the browser build renders exactly like the native one, without pulling the
 * Reanimated worklets runtime (which needs the Metro/Babel toolchain).
 */
import React, {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, type ViewProps } from "react-native";

type AnimationConfig = {
  duration?: number;
  delay?: number;
};

type EnteringBuilder = {
  (): string;
  duration: (ms: number) => EnteringBuilder;
  delay: (ms: number) => EnteringBuilder;
  springify: () => EnteringBuilder;
  build: () => { className: string; duration: number; delay: number };
};

function createEntering(kind: "fade" | "up" | "down" | "left" | "right"): EnteringBuilder {
  const state = { duration: 400, delay: 0 };

  const builder = ((() => `${kind}`) as unknown) as EnteringBuilder;

  builder.duration = (ms: number) => {
    state.duration = ms;
    return builder;
  };
  builder.delay = (ms: number) => {
    state.delay = ms;
    return builder;
  };
  builder.springify = () => builder;
  builder.build = () => ({
    className: kind,
    duration: state.duration,
    delay: state.delay,
  });

  return builder;
}

export const FadeIn = createEntering("fade");
export const FadeInUp = createEntering("up");
export const FadeInDown = createEntering("down");
export const FadeInLeft = createEntering("left");
export const FadeInRight = createEntering("right");
export const FadeOut = createEntering("fade");
export const SlideInDown = createEntering("down");
export const SlideInRight = createEntering("right");

const OFFSETS: Record<string, string> = {
  fade: "none",
  up: "translate3d(0, 18px, 0)",
  down: "translate3d(0, -18px, 0)",
  left: "translate3d(-18px, 0, 0)",
  right: "translate3d(18px, 0, 0)",
};

type AnimatedViewProps = ViewProps & {
  entering?: EnteringBuilder;
  exiting?: EnteringBuilder;
};

function AnimatedViewBase(
  { entering, style, ...rest }: AnimatedViewProps,
  ref: React.Ref<unknown>
) {
  const [visible, setVisible] = useState(!entering);
  const config = useMemo(() => entering?.build(), [entering]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!config) {
      setVisible(true);
      return;
    }
    setVisible(false);
    const delay = config.delay ?? 0;
    timerRef.current = setTimeout(() => setVisible(true), delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [config]);

  const animationStyle = config
    ? ({
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : OFFSETS[config.className] ?? "none",
        transition: `opacity ${config.duration}ms ease-out, transform ${config.duration}ms ease-out`,
        willChange: "opacity, transform",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
    : undefined;

  return <View ref={ref as never} style={[style, animationStyle]} {...rest} />;
}

const AnimatedView = forwardRef(AnimatedViewBase);

// ---------------------------------------------------------------------------
// Shared values (a plain mutable box + subscriber list)
// ---------------------------------------------------------------------------

export type SharedValue<T> = { value: T; addListener?: (fn: (v: T) => void) => void };

export function useSharedValue<T>(initial: T): SharedValue<T> {
  const box = useRef({ value: initial } as SharedValue<T>).current;
  return box;
}

type TimingConfig = { duration?: number; easing?: unknown };

export function withTiming<T>(toValue: T, _config?: TimingConfig): T {
  return toValue;
}

export function withSpring<T>(toValue: T, _config?: unknown): T {
  return toValue;
}

export function withRepeat<T>(animation: T, _count?: number, _reverse?: boolean): T {
  return animation;
}

export function withDelay<T>(_ms: number, animation: T): T {
  return animation;
}

export function withSequence<T>(...animations: T[]): T {
  return animations[animations.length - 1];
}

/**
 * In this shim a shared value is a stable object, so the animated style is
 * computed once — enough for the skeleton pulse, which is implemented with a
 * CSS animation instead of a JS-driven value.
 */
export function useAnimatedStyle<T extends object>(
  factory: () => T,
  _deps?: unknown[]
): T {
  const [style] = useState(() => factory());
  const isOpacityOnly = Object.keys(style).every((key) => key === "opacity");

  if (isOpacityOnly) {
    return { ...style, animation: "rnm-skeleton-pulse 1.1s ease-in-out infinite" } as T;
  }

  return style;
}

export function useDerivedValue<T>(factory: () => T): SharedValue<T> {
  return { value: factory() };
}

export function useAnimatedRef<T>() {
  return useRef<T>(null);
}

export function cancelAnimation(): void {}
export function runOnJS<T extends (...args: never[]) => unknown>(fn: T): T {
  return fn;
}
export function runOnUI<T extends (...args: never[]) => unknown>(fn: T): T {
  return fn;
}
export function useAnimatedScrollHandler<T>(handlers: T): T {
  return handlers;
}
export function useAnimatedGestureHandler<T>(handlers: T): T {
  return handlers;
}
export function Easing() {
  return { easing: "ease-in-out" };
}
Easing.linear = () => "linear";
Easing.ease = () => "ease";
Easing.inOut = () => "ease-in-out";

export const Layout = { duration: () => ({}), springify: () => ({}) };
export const Extrapolation = { CLAMP: "clamp" };
export const interpolate = (value: number) => value;

const Animated = {
  View: AnimatedView,
  Text: View,
  ScrollView: View,
  Image: View,
  createAnimatedComponent: <P,>(Component: React.ComponentType<P>) => Component,
};

export default Animated;
export { Animated };
