import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against the shared dev server on http://localhost:3000 (reused, never restarted).
 * Tests mutate the shared dev DB, so they reset state themselves and run serially.
 */
export default defineConfig({
  testDir: "tests/e2e",
  // Keep traces/screenshots OUTSIDE the project so the dev server's file watcher
  // never sees them (writes inside the project can trigger Fast Refresh rebuilds).
  outputDir: path.join(os.tmpdir(), "cashflow-planner-playwright-results"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
