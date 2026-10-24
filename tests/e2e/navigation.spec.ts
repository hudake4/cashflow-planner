import { expect, test } from "@playwright/test";
import { gotoHydrated, loadDemo, resetData } from "./helpers";

test.describe.configure({ mode: "serial" });

const PAGES = [
  { path: "/", heading: "Dashboard", nav: "nav-dashboard" },
  { path: "/calendar", heading: "Calendar", nav: "nav-calendar" },
  { path: "/spending", heading: "Spend Analyzer", nav: "nav-spending" },
  { path: "/bills", heading: "Bills", nav: "nav-bills" },
  { path: "/income", heading: "Income", nav: "nav-income" },
  { path: "/institutions", heading: "Institutions", nav: "nav-institutions" },
  { path: "/settings", heading: "Settings", nav: "nav-settings" },
];

test.afterAll(async ({ request }) => {
  await loadDemo(request);
});

for (const dataset of ["demo", "empty"] as const) {
  test(`all pages load without errors (${dataset} data)`, async ({ page, request }) => {
    if (dataset === "demo") await loadDemo(request);
    else await resetData(request);

    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });

    for (const p of PAGES) {
      const res = await page.request.get(p.path);
      expect(res.status(), p.path).toBe(200);
      await gotoHydrated(page, p.path);
      await expect(page.getByRole("heading", { level: 1, name: p.heading })).toBeVisible();
      await expect(page.getByTestId("error-state"), `${p.path} error state`).toHaveCount(0);
      await expect(page.getByTestId("loading"), `${p.path} still loading`).toHaveCount(0, { timeout: 15_000 });
      if (p.path === "/") {
        await expect(page.getByTestId(dataset === "empty" ? "dashboard-empty" : "summary-card-ending-balance")).toBeVisible();
      }
    }

    // client-side navigation through the nav links
    await gotoHydrated(page, "/");
    for (const p of PAGES) {
      await page.getByTestId(p.nav).first().click();
      await expect(page).toHaveURL(new RegExp(`${p.path === "/" ? "/$" : p.path}`));
      await expect(page.getByRole("heading", { level: 1, name: p.heading })).toBeVisible();
    }

    expect(errors, errors.join("\n")).toEqual([]);
  });
}
