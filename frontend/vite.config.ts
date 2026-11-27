import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "UpLOAD",
        short_name: "UpLOAD",
        theme_color: "#6D28D9",
        background_color: "#F6F3FF",
        display: "standalone",
        icons: [],
      },
    }),
  ],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // Pre-bundle PDF.js at startup: it is only imported lazily (Print Preview Studio), and discovering it at
  // runtime makes the dev server re-optimise and force a page reload mid-session.
  optimizeDeps: { include: ["pdfjs-dist/legacy/build/pdf.mjs"] },
  // Interaction-heavy tests (typing whole forms) can exceed the 5 s default on slower machines.
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test/setup.ts"], css: false, testTimeout: 20_000, exclude: ["e2e/**", "node_modules/**", "dist/**"] },
  // VITE_API_PROXY lets the Playwright E2E run point at its isolated test API (see playwright.config.ts).
  server: { port: 5173, proxy: { "/api": { target: process.env.VITE_API_PROXY ?? "http://localhost:8000", ws: true } } },
});
