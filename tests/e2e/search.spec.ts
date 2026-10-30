import { expect, test, type Page } from "@playwright/test";
import { api, gotoHydrated, loadDemo } from "./helpers";

// Ctrl+K, type, Enter, land on the entity (CONVENTIONS section 20). Bank transactions and accounts
// need a SimpleFIN connection, so their destinations are covered by component tests instead.
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await loadDemo(request);
});
test.afterAll(async ({ request }) => {
  await loadDemo(request);
});

async function searchAndOpen(page: Page, query: string, option: string) {
  await page.keyboard.press("Control+k");
  const palette = page.getByTestId("command-palette-dialog");
  await palette.getByTestId("command-palette-input").fill(query);
  const first = palette.getByTestId("command-palette-option").first();
  await expect(first).toContainText(option);
  await expect(first).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(palette).toHaveCount(0);
}

test("a bill result opens its editor on Bills, also when Bills is already open", async ({ page }) => {
  await gotoHydrated(page, "/");
  await searchAndOpen(page, "Demo: Rent", "Demo: Rent");

  await expect(page).toHaveURL(/\/bills$/);
  const dialog = page.getByRole("dialog", { name: "Edit bill" });
  await expect(dialog.getByTestId("bill-name")).toHaveValue("Demo: Rent");
  await expect(page.locator("[data-linked]").filter({ hasText: "Demo: Rent" }).first()).toBeAttached();
  await dialog.getByTestId("dialog-close").click();
  // Focus goes back to the row once the dialog has finished closing.
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId(/^actions-bill-/).filter({ visible: true }).and(page.locator(":focus"))).toHaveCount(1);

  // Same page, another result: the new link is acted on too.
  await searchAndOpen(page, "Demo: Groceries", "Demo: Groceries");
  await expect(page.getByRole("dialog", { name: "Edit bill" }).getByTestId("bill-name")).toHaveValue("Demo: Groceries");
  await expect(page).toHaveURL(/\/bills$/);
});

test("an income result opens its editor, and Quick add opens the add dialog", async ({ page }) => {
  await gotoHydrated(page, "/calendar");
  await searchAndOpen(page, "Demo: Main job", "Demo: Main job paycheck");
  await expect(page).toHaveURL(/\/income$/);
  await expect(page.getByRole("dialog", { name: "Edit income" }).getByTestId("income-name")).toHaveValue("Demo: Main job paycheck");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await searchAndOpen(page, "Add bill", "Add bill");
  await expect(page).toHaveURL(/\/bills$/);
  await expect(page.getByRole("dialog", { name: "Add a bill" })).toBeVisible();
});

test("a savings goal result marks the goal and opens it for editing", async ({ page, request }) => {
  const created = await api(request, "post", "/api/savings-goals", { name: "E2E beach fund", targetAmountCents: 250000, targetDate: "2027-06-01" });
  expect(created.status()).toBe(201);
  const goal = (await created.json()) as { id: string };

  await gotoHydrated(page, "/");
  await searchAndOpen(page, "beach fund", "E2E beach fund");
  await expect(page).toHaveURL(/\/savings-goals$/);
  const dialog = page.getByRole("dialog", { name: "Edit savings goal" });
  await expect(dialog.getByTestId("savings-goal-edit-name")).toHaveValue("E2E beach fund");
  await expect(page.getByTestId(`savings-goal-card-${goal.id}`)).toHaveAttribute("data-linked", "true");

  await dialog.getByTestId("savings-goal-edit-name").fill("E2E beach trip");
  await dialog.getByTestId("savings-goal-save").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId(`savings-goal-card-${goal.id}`)).toContainText("E2E beach trip");
});
