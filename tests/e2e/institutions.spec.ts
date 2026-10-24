import { expect, test } from "@playwright/test";
import { gotoHydrated } from "./helpers";

// Depending on the server's environment and data, the page shows setup instructions (Teller
// not configured), the empty state, or the list of connected institutions. All are valid.
test("Institutions sits above Settings in the menu and renders one of its states", async ({ page }) => {
  await gotoHydrated(page, "/institutions");

  const labels = await page.locator("aside nav a").allTextContents();
  expect(labels.map((l) => l.trim())).toEqual(["Dashboard", "Calendar", "Bills", "Income", "Institutions", "Settings"]);

  await expect(page.getByRole("heading", { level: 1, name: "Institutions" })).toBeVisible();
  await expect(page.getByTestId("loading")).toHaveCount(0, { timeout: 15_000 });
  const states = [
    page.getByTestId("institutions-not-configured"),
    page.getByTestId("institutions-empty"),
    page.getByTestId("institutions-list"),
  ];
  await expect(states[0].or(states[1]).or(states[2]).first()).toBeVisible();

  if (await states[1].isVisible()) {
    await expect(page.getByTestId("add-institution-button").first()).toBeVisible();
  }
});
