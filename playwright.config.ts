import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

if (process.env.E2E_ALLOW_DATA_RESET !== "1") {
  throw new Error(
    [
      "",
      "Refusing to run the E2E suite: it DELETES ALL DATA in the database behind http://localhost:3000",
      "(it calls POST /api/data/reset and POST /api/data/demo before the tests).",
      "",
      "If you are sure that database is disposable, opt in explicitly:",
      "",
      "  bash / zsh:   E2E_ALLOW_DATA_RESET=1 npm run test:e2e",
      "  PowerShell:   $env:E2E_ALLOW_DATA_RESET = \"1\"; npm run test:e2e",
      "",
      "By default a fresh server is started (and fails fast if port 3000 is already in use).",
      "To deliberately reuse a server that is already running on port 3000, also set E2E_REUSE_SERVER=1.",
      "",
    ].join("\n"),
  );
}

/**
 * E2E against http://localhost:3000. Tests mutate that server's database, so they reset
 * state themselves and run serially, and the whole suite requires E2E_ALLOW_DATA_RESET=1.
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
    // Off by default: with `true`, Playwright silently targets whatever is already on port 3000,
    // which may be the owner's real app. A fresh `npm run dev` fails fast via scripts/check-port.mjs
    // if the port is taken. Set E2E_REUSE_SERVER=1 only to intentionally reuse your own dev server.
    reuseExistingServer: !!process.env.E2E_REUSE_SERVER,
    timeout: 120_000,
  },
});
