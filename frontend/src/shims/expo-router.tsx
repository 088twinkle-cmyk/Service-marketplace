/**
 * Web shim for `expo-router`.
 *
 * The real `expo-router` package is used when the app runs on native
 * (`npx expo start`). For the browser build (`npm run dev` -> Vite) this
 * module implements the small part of the expo-router API the app uses on
 * top of `react-router-dom`, so every existing screen keeps working
 * unchanged.
 *
 * Supported API: useRouter, usePathname, useLocalSearchParams, useFocusEffect,
 * Link, Redirect, Stack, router (imperative singleton).
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useResolvedPath,
} from "react-router-dom";

type Href =
  | string
  | {
      pathname: string;
      params?: Record<string, string | number | undefined>;
    };

export type Router = {
  push: (href: Href) => void;
  replace: (href: Href) => void;
  back: () => void;
  canGoBack: () => boolean;
  navigate: (href: Href) => void;
  setParams: (params: Record<string, string | number | undefined>) => void;
  dismissAll: () => void;
};

function buildPath(href: Href): string {
  if (typeof href === "string") return href;

  let path = href.pathname;
  const params = href.params ?? {};
  const query: string[] = [];

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const token = `[${key}]`;
    if (path.includes(token)) {
      path = path.replace(token, encodeURIComponent(String(value)));
    } else {
      query.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  });

  return query.length ? `${path}?${query.join("&")}` : path;
}

/** Navigation context so screens (and Navbar) share one history stack view. */
type FocusListener = () => void;
const FocusContext = createContext<{ subscribe: (fn: FocusListener) => () => void }>(
  { subscribe: () => () => {} }
);

export function useRouter(): Router {
  const navigate = useNavigate();
  const location = useLocation();
  const canGoBackRef = useRef(false);

  useEffect(() => {
    if (location.key !== "default") canGoBackRef.current = true;
  }, [location.key]);

  return useMemo<Router>(
    () => ({
      push: (href) => navigate(buildPath(href)),
      navigate: (href) => navigate(buildPath(href)),
      replace: (href) => navigate(buildPath(href), { replace: true }),
      back: () => {
        if (window.history.length > 1) navigate(-1);
        else navigate("/");
      },
      canGoBack: () => window.history.length > 1,
      setParams: (params) => {
        const search = new URLSearchParams(window.location.search);
        Object.entries(params).forEach(([k, v]) => {
          if (v === undefined || v === null) search.delete(k);
          else search.set(k, String(v));
        });
        navigate(`${window.location.pathname}?${search.toString()}`, {
          replace: true,
        });
      },
      dismissAll: () => navigate("/"),
    }),
    [navigate]
  );
}

export function usePathname(): string {
  return useLocation().pathname;
}

export function useSegments(): string[] {
  return useLocation().pathname.split("/").filter(Boolean);
}

/** expo-router style params: route params + query string, all as strings. */
export function useLocalSearchParams<
  T extends Record<string, string | string[] | undefined> = Record<
    string,
    string | undefined
  >
>(): T {
  const params = useParams();
  const location = useLocation();

  return useMemo(() => {
    const search = new URLSearchParams(location.search);
    const merged: Record<string, string | undefined> = {};
    search.forEach((value, key) => {
      merged[key] = value;
    });
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) merged[key] = value;
    });
    return merged as T;
  }, [params, location.search]);
}

export const useGlobalSearchParams = useLocalSearchParams;

/**
 * `useFocusEffect` re-runs the callback whenever the route becomes the
 * active one (mount + every location change, like expo-router on web).
 */
export function useFocusEffect(effect: () => void | (() => void)): void {
  const location = useLocation();
  const effectRef = useRef(effect);
  effectRef.current = effect;

  useEffect(() => {
    const cleanup = effectRef.current();
    return typeof cleanup === "function" ? cleanup : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, location.key]);
}

type LinkProps = {
  href: Href;
  children?: React.ReactNode;
  style?: unknown;
  asChild?: boolean;
  onPress?: () => void;
  replace?: boolean;
  [key: string]: unknown;
};

export function Link({ href, children, onPress, replace, ...rest }: LinkProps) {
  const router = useRouter();
  const to = buildPath(href);

  const handleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    onPress?.();
    if (replace) router.replace(to);
    else router.push(to);
  };

  return (
    <a href={to} onClick={handleClick} {...(rest as object)}>
      {children}
    </a>
  );
}

export function Redirect({ href }: { href: Href }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(href);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildPath(href)]);

  return null;
}

type NavigatorProps = {
  children?: React.ReactNode;
  /** Accepted for API compatibility with expo-router; unused on the web. */
  screenOptions?: Record<string, unknown>;
  initialRouteName?: string;
};

export function Stack({ children }: NavigatorProps) {
  return <>{children ?? <Outlet />}</>;
}

export function Tabs({ children }: NavigatorProps) {
  return <>{children ?? <Outlet />}</>;
}

export function Slot({ children }: NavigatorProps) {
  return <>{children ?? <Outlet />}</>;
}

/** Imperative singleton: `router.push("/login")` from non-component code. */
export const router: Router = {
  push: (href) => navigateTo(buildPath(href), false),
  navigate: (href) => navigateTo(buildPath(href), false),
  replace: (href) => navigateTo(buildPath(href), true),
  back: () => window.history.back(),
  canGoBack: () => window.history.length > 1,
  setParams: () => {},
  dismissAll: () => navigateTo("/", true),
};

let navigateTo = (to: string, replace: boolean) => {
  if (replace) window.location.replace(to);
  else window.location.assign(to);
};

/** Called once by main.tsx so the singleton can use the router instance. */
export function __setImperativeNavigator(fn: (to: string, replace: boolean) => void) {
  navigateTo = fn;
}

export { FocusContext };

export function useNavigation() {
  return { navigate: useRouter().push };
}
