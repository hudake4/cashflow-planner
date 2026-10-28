/** PDF renderer: it must always produce a readable file, whatever the data. */
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildMonthlySummary, monthBounds } from "@/domain/monthly-summary";
import { computeProjection } from "@/domain/projection";
import { renderMonthlySummaryPdf } from "@/server/monthly-summary-pdf";
import { bill, income, input, settings } from "../helpers/fixtures";

const NOW = new Date("2025-01-15T12:00:00Z");
const render = async (over: Parameters<typeof input>[0], month = "2025-01") => {
  const { from, to } = monthBounds(month);
  const bytes = await renderMonthlySummaryPdf(buildMonthlySummary(month, computeProjection({ ...input(over), from, to })), NOW);
  return PDFDocument.load(bytes);
};

describe("renderMonthlySummaryPdf", () => {
  it("renders a one-page report with the title and creation date", async () => {
    const pdf = await render({ incomes: [income("p", 50000, "BIWEEKLY", "2025-01-03")], bills: [bill("r", 20000, "MONTHLY", "2025-01-10")] });
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("Monthly summary, January 2025");
    expect(pdf.getCreationDate()?.toISOString()).toBe(NOW.toISOString());
  });

  it("draws characters Helvetica cannot encode as ? instead of failing", async () => {
    const pdf = await render({
      incomes: [income("p", 50000, "ONE_TIME", "2025-01-03", { name: "給料 \u{1F4B0} Paycheck\nline two" })],
      bills: [bill("r", 20000, "ONE_TIME", "2025-01-10", { name: "Überweisung – Miete", category: "家賃" })],
    });
    expect(pdf.getPageCount()).toBe(1);
  });

  it("handles negative balances, a partial month, skipped bills and a non-USD currency", async () => {
    const pdf = await render({
      settings: settings({ startingBalanceCents: -5000, projectionStartDate: "2025-01-10", currency: "EUR" }),
      bills: [bill("r", 20000, "WEEKLY", "2025-01-10", { category: "Housing" })],
    });
    expect(pdf.getPageCount()).toBe(1);
  });

  it("truncates a very long name and starts a new page when the lists are long", async () => {
    const incomes = Array.from({ length: 70 }, (_, i) => income(`i${i}`, 1000 + i, "ONE_TIME", "2025-01-05", { name: `Source ${i} ${"x".repeat(i === 0 ? 300 : 0)}` }));
    const pdf = await render({ incomes });
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
});
