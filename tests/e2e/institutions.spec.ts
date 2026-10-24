import { expect, test } from "@playwright/test";
import { gotoHydrated, resetData } from "./helpers";

// With no bank connected the page shows the empty state, and "Connect a bank" opens the
// setup-token dialog. Nothing here talks to SimpleFIN (the token is never submitted).
test("Institutions shows the empty state and the connect dialog", async ({ page, request }) => {
  await resetData(request);
  await gotoHydrated(page, "/institutions");

  await expect(page.getByRole("heading", { level: 1, name: "Institutions" })).toBeVisible();
  await expect(page.getByTestId("loading")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("institutions-empty")).toBeVisible();

  await page.getByTestId("add-institution-button").first().click();
  const dialog = page.getByTestId("connect-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("simplefin-link")).toHaveAttribute("href", "https://bridge.simplefin.org/simplefin/create");

  // An empty token is rejected in the browser, before any request.
  await dialog.getByTestId("connect-submit").click();
  await expect(dialog.getByTestId("setup-token-error")).toBeVisible();
});