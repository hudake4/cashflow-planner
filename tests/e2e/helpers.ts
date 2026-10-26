import { expect, test, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";

const isHydrated = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector("[data-testid=nav-dashboard]");
    return !!el && Object.keys(el).some((k) => k.startsWith("__reactFiber"));
  });

/**
 * page.goto that waits for React hydration. The shared `next dev` server
 * intermittently serves a page that never hydrates (all chunks 200, no errors,
 * observed while other agents were editing/hot-reloading). We reload up to twice
 * and record each occurrence as a test annotation so it is visible, not hidden.
 */
export async function gotoHydrated(page: Page, path: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt === 0) await page.goto(path);
    else await page.reload();
    try {
      await expect.poll(() => isHydrated(page), { timeout: 10_000 }).toBe(true);
      return;
    } catch {
      test.info().annotations.push({ type: "warning", description: `${path} did not hydrate (attempt ${attempt + 1}); reloading` });
      console.warn(`[e2e] ${path} did not hydrate on attempt ${attempt + 1}`);
    }
  }
  throw new Error(`${path} never hydrated after 3 attempts`);
}

/**
 * API call with a retry for the dev server's intermittent non-JSON 500
 * (a Next manifest race while routes recompile, before route code runs).
 */
export async function api(
  request: APIRequestContext,
  method: "get" | "post" | "put" | "delete",
  path: string,
  data?: unknown,
): Promise<APIResponse> {
  let res: APIResponse | undefined;
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await request[method](path, data === undefined ? undefined : { data });
    const isHtml500 = res.status() >= 500 && !(res.headers()["content-type"] ?? "").includes("application/json");
    if (!isHtml500) return res;
    await new Promise((r) => setTimeout(r, 500));
  }
  return res!;
}

export const E2E_SETTINGS = {
  startingBalanceCents: 100000,
  projectionStartDate: "2025-01-01",
  currency: "USD",
  forecastDays: 90,
  weekStartsOn: 0,
  defaultCalendarView: "month",
  desktopNotifications: true,
};

/** Second guard (the first is in playwright.config.ts) in case a spec runs with a different config. */
function assertDataResetAllowed() {
  if (process.env.E2E_ALLOW_DATA_RESET !== "1") {
    throw new Error(
      "Refusing to reset app data: E2E_ALLOW_DATA_RESET=1 is not set. " +
        "The E2E suite deletes all data in the database behind http://localhost:3000.",
    );
  }
}

export async function resetData(request: APIRequestContext) {
  assertDataResetAllowed();
  const res = await api(request, "post", "/api/data/reset");
  expect(res.status()).toBe(200);
}

export async function loadDemo(request: APIRequestContext) {
  assertDataResetAllowed();
  await resetData(request);
  const res = await api(request, "post", "/api/data/demo");
  expect(res.status()).toBe(200);
}
