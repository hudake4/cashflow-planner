import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";

/**
 * Three vitest projects (E2E is Playwright-only, see playwright.config.ts):
 *  - unit:        pure domain modules, node environment
 *  - integration: API route handlers against a SEPARATE SQLite DB (never prisma/dev.db),
 *                 run sequentially with no file parallelism
 *  - component:   React components in jsdom
 */
// Relative to prisma/schema.prisma, i.e. prisma/test-integration.db
const INTEGRATION_DB_URL = "file:./test-integration.db";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    globals: true,
    exclude: ["**/node_modules/**", "**/.next/**", "**/.tools/**", "**/dist-desktop/**", "tests/e2e/**"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          env: { DATABASE_URL: INTEGRATION_DB_URL, NODE_ENV: "test" },
          globalSetup: ["tests/setup/integration-global-setup.ts"],
          setupFiles: ["tests/setup/integration-setup.ts"],
          fileParallelism: false,
          maxWorkers: 1,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          environment: "jsdom",
          include: ["tests/component/**/*.test.{ts,tsx}"],
          setupFiles: ["tests/setup/component-setup.ts"],
        },
      },
    ],
  },
});
