import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: the real app in Chromium against an ISOLATED test API (backend/scripts/e2e_server.py:
 * throwaway SQLite + temp file store, seeded sample college and E2E admin). Never touches your real database.
 * Run:  npm run e2e
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command: process.platform === "win32" ? String.raw`.venv\Scripts\python scripts/e2e_server.py` : ".venv/bin/python scripts/e2e_server.py",
      cwd: "../backend",
      url: "http://127.0.0.1:8100/api/v1/health",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npx vite --port 5174 --strictPort",
      url: "http://localhost:5174",
      env: { VITE_API_PROXY: "http://127.0.0.1:8100" },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
