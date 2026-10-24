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
      "By default it starts its own server on a throwaway database (prisma/test-e2e.db), so your real",
      "data is not touched. Opt in explicitly to confirm you want the suite to run:",
      "",
      "  bash / zsh:   E2E_ALLOW_DATA_RESET=1 npm run test:e2e",
      "  PowerShell:   $env:E2E_ALLOW_DATA_RESET = \"1\"; npm run test:e2e",
      "",
      "The fresh server fails fast if port 3000 is already in use.",
      "To reuse a server that is already running on port 3000, also set E2E_REUSE_SERVER=1. That server's",
      "database is NOT prisma/test-e2e.db: only do this if you accept losing everything in it.",
      "",
    ].join("\n"),
  );
}

/**
 * E2E against http://localhost:3000. Tests mutate that server's database, so they reset
 * state themselves and run serially, and the whole suite requires E2E_ALLOW_DATA_RESET=1.
 * The server comes from scripts/e2e-server.mjs, which points it at its own prisma/test-e2e.db.
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
    command: "node scripts/e2e-server.mjs",
    url: "http://localhost:3000",
    // Off by default: with `true`, Playwright silently targets whatever is already on port 3000,
    // which may be the owner's real app, with its real database. A fresh e2e-server.mjs uses
    // prisma/test-e2e.db and fails fast via scripts/check-port.mjs if the port is taken.
    // Exactly "1" enables reuse (so E2E_REUSE_SERVER=0 stays off). Doing so points the suite at a
    // server whose database you accept losing.
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
    timeout: 120_000,
  },
});
