/**
 * Test environment setup.
 *
 * jsdom is missing a few browser APIs the app relies on (matchMedia,
 * scrollTo, ResizeObserver, geolocation). They are stubbed here so tests can
 * mount real screens without touching the production code.
 */
import { afterEach, vi } from "vitest";
import { cleanup } from "./render";

// React logs "not configured to support act(...)" unless this global is set.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverStub;
}

if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = () => "blob:mock";
  globalThis.URL.revokeObjectURL = () => {};
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
