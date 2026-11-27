import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { afterEach, vi } from "vitest";
import { useAuth } from "@/shared/api/authStore";

// findBy*/waitFor wait up to 5 s (default 1 s is too tight when the whole suite runs in parallel).
configure({ asyncUtilTimeout: 5000 });

// Animations finish instantly in tests (exit animations would otherwise leave old nodes in the DOM).
MotionGlobalConfig.skipAnimations = true;

// jsdom gaps used by motion (reduced-motion query) and recharts (ResponsiveContainer).
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
if (!("ResizeObserver" in window)) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
// Like current Chrome: scroll methods return a Promise. Catches effects that accidentally return their value
// (React would later call it as a cleanup: "destroy is not a function").
Element.prototype.scrollIntoView = function () {
  return Promise.resolve() as unknown as void;
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  useAuth.setState({ sessions: {}, current: null, accessToken: null, refreshToken: null, user: null });
});
