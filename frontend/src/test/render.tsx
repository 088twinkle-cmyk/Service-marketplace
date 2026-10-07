/**
 * Minimal render helper (react-dom/client + jsdom) so tests do not need an
 * extra testing-library dependency.
 */
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

export type RenderResult = {
  container: HTMLElement;
  root: Root;
  text: () => string;
  query: (selector: string) => HTMLElement | null;
  queryAll: (selector: string) => HTMLElement[];
  unmount: () => void;
};

export function renderAt(
  ui: React.ReactElement,
  route = "/"
): RenderResult {
  const container = document.createElement("div");
  document.body.appendChild(container);

  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
  });

  const entry = { root, container };
  mounted.push(entry);

  return {
    container,
    root,
    text: () => container.textContent ?? "",
    query: (selector) => container.querySelector(selector) as HTMLElement | null,
    queryAll: (selector) =>
      Array.from(container.querySelectorAll(selector)) as HTMLElement[],
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

export function cleanup() {
  while (mounted.length) {
    const entry = mounted.pop();
    if (!entry) break;
    try {
      act(() => entry.root.unmount());
    } catch {
      /* already unmounted */
    }
    entry.container.remove();
  }
}

export { act };
