/**
 * Core user flow against the shared dev server. Deterministic: fixed start date
 * 2025-01-01 (Wed), $1,000.00 opening, weeks start Sunday.
 *
 * Data created through the UI:
 *   Income "Paycheck"  $500.00 every 2 weeks from 2025-01-03 -> 01-03, 01-17, 01-31
 *   Bill   "Rent"    $1,234.56 monthly from 2025-01-10       -> 01-10
 *
 * Expected week closings (January 2025 month view, hand-computed):
 *   2024-12-29 (partial, from 01-01): 1,000.00 + 500.00              = 1,500.00
 *   2025-01-05: 1,500.00 - 1,234.56                                  =   265.44
 *   2025-01-12: 265.44 + 500.00                                       =   765.44
 *   2025-01-19: no events                                             =   765.44
 *   2025-01-26: 765.44 + 500.00 (01-31)                               = 1,265.44
 * After marking rent PAID: unchanged. After SKIPPED: +1,234.56 from 01-10 on
 *   -> 1,500.00 / 1,500.00 / 2,000.00 / 2,000.00 / 2,500.00
 */
import { expect, test, type Page } from "@playwright/test";
import { api, gotoHydrated, loadDemo, resetData } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await resetData(request);
});

test.afterAll(async ({ request }) => {
  await loadDemo(request); // leave the dev DB in the demo state
});

const WEEKS = ["2024-12-29", "2025-01-05", "2025-01-12", "2025-01-19", "2025-01-26"];

async function expectWeekClosings(page: Page, values: string[]) {
  for (let i = 0; i < WEEKS.length; i++) {
    await expect(page.getByTestId(`week-closing-${WEEKS[i]}`)).toHaveText(values[i]);
  }
}

async function openJanuary2025(page: Page) {
  await gotoHydrated(page, "/calendar");
  await page.getByTestId("calendar-view-month").click();
  await page.getByTestId("calendar-jump").fill("2025-01-01");
  await expect(page.getByTestId("calendar-title")).toHaveText("January 2025");
  await expect(page.getByTestId("week-closing-2024-12-29")).toBeVisible();
}

test("settings -> income -> bill -> calendar balances -> paid -> skipped -> reload", async ({ page, request }) => {
  // 1. Settings through the UI
  await gotoHydrated(page, "/settings");
  await page.getByTestId("settings-starting-balance").fill("1,000.00");
  await page.getByTestId("settings-start-date").fill("2025-01-01");
  await page.getByTestId("settings-forecast-preset").selectOption("90");
  await page.getByTestId("settings-week-start").selectOption("0");
  await page.getByTestId("settings-default-view").selectOption("month");
  await page.getByTestId("settings-save").click();
  await expect(page.getByText("Settings saved. Projections now use these values.")).toBeVisible();
  const s = await (await api(request, "get", "/api/settings")).json();
  expect(s).toMatchObject({ startingBalanceCents: 100000, projectionStartDate: "2025-01-01", forecastDays: 90, weekStartsOn: 0 });

  // 2. Income through the UI
  await gotoHydrated(page, "/income");
  await page.getByTestId("add-income-button").first().click();
  await page.getByTestId("income-name").fill("Paycheck");
  await page.getByTestId("income-amount").fill("500");
  await page.getByTestId("income-frequency").selectOption("BIWEEKLY");
  await page.getByTestId("income-anchor-date").fill("2025-01-03");
  await page.getByTestId("income-form-submit").click();
  await expect(page.getByTestId("income-form")).toBeHidden();
  const incomes = await (await api(request, "get", "/api/income")).json();
  expect(incomes).toHaveLength(1);
  expect(incomes[0]).toMatchObject({ name: "Paycheck", amountCents: 50000, frequency: "BIWEEKLY", anchorDate: "2025-01-03" });

  // 3. Bill through the UI (decimal amount with a thousands separator)
  await gotoHydrated(page, "/bills");
  await page.getByTestId("add-bill-button").first().click();
  await page.getByTestId("bill-name").fill("Rent");
  await page.getByTestId("bill-amount").fill("1,234.56");
  await page.getByTestId("bill-frequency").selectOption("MONTHLY");
  await page.getByTestId("bill-anchor-date").fill("2025-01-10");
  await page.getByTestId("bill-form-submit").click();
  await expect(page.getByTestId("bill-form")).toBeHidden();
  const bills = await (await api(request, "get", "/api/bills")).json();
  expect(bills).toHaveLength(1);
  expect(bills[0]).toMatchObject({ name: "Rent", amountCents: 123456, frequency: "MONTHLY", anchorDate: "2025-01-10" });
  const rentId: string = bills[0].id;

  // 4. Calendar weekly closing balances
  await openJanuary2025(page);
  await expectWeekClosings(page, ["$1,500.00", "$265.44", "$765.44", "$765.44", "$1,265.44"]);
  await expect(page.getByTestId("week-opening-2025-01-05")).toContainText("$1,500.00");
  await expect(page.getByTestId("day-balance-2025-01-10")).toHaveText("$265.44");
  // UI agrees with the API (the UI never recomputes balances)
  const proj = await (await api(request, "get", "/api/projection?from=2025-01-01&to=2025-02-01")).json();
  expect(proj.weeks.map((w: { closingBalanceCents: number }) => w.closingBalanceCents)).toEqual([150000, 26544, 76544, 76544, 126544]);

  // 5. Mark the rent PAID: balance unchanged
  const rentChip = page.getByTestId(`event-BILL:${rentId}:2025-01-10`);
  await rentChip.click();
  const detail = page.getByTestId("event-detail");
  await expect(detail).toBeVisible();
  await detail.getByTestId("occurrence-mark-paid").click();
  await expect(detail.getByTestId("event-detail-status")).toContainText("Paid");
  await expect(rentChip).toHaveAttribute("data-status", "PAID");
  await expectWeekClosings(page, ["$1,500.00", "$265.44", "$765.44", "$765.44", "$1,265.44"]);

  // 6. Mark it SKIPPED: balance increases by $1,234.56 from 01-10 on
  await detail.getByTestId("occurrence-mark-skipped").click();
  await expect(detail.getByTestId("event-detail-status")).toContainText("Skipped");
  await expect(rentChip).toHaveAttribute("data-status", "SKIPPED");
  await expectWeekClosings(page, ["$1,500.00", "$1,500.00", "$2,000.00", "$2,000.00", "$2,500.00"]);
  await detail.getByTestId("dialog-close").click();
  await expect(detail).toBeHidden();

  // 7. Reload: everything persists
  await page.reload();
  await openJanuary2025(page);
  await expectWeekClosings(page, ["$1,500.00", "$1,500.00", "$2,000.00", "$2,000.00", "$2,500.00"]);
  await expect(page.getByTestId(`event-BILL:${rentId}:2025-01-10`)).toHaveAttribute("data-status", "SKIPPED");
});

test("form validation errors are shown in the UI and nothing is saved", async ({ page, request }) => {
  await gotoHydrated(page, "/bills");
  await page.getByTestId("add-bill-button").first().click();
  await page.getByTestId("bill-name").fill("Bad");
  await page.getByTestId("bill-amount").fill("12.999");
  await page.getByTestId("bill-form-submit").click();
  await expect(page.getByTestId("bill-amount-error")).toBeVisible();
  await page.getByTestId("bill-amount").fill("0");
  await page.getByTestId("bill-form-submit").click();
  await expect(page.getByTestId("bill-amount-error")).toBeVisible();
  expect(await (await api(request, "get", "/api/bills")).json()).toEqual([]);
});
