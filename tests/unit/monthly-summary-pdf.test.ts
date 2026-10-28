/** PDF renderer: it must always produce a readable file, whatever the data. */
import { PDFArray, PDFDocument, PDFRawStream, StandardFonts, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { formatCents } from "@/domain/money";
import { buildMonthlySummary, monthBounds } from "@/domain/monthly-summary";
import { computeProjection } from "@/domain/projection";
import { CURRENCIES } from "@/lib/format";
import { currencyDisplayFor, renderMonthlySummaryPdf } from "@/server/monthly-summary-pdf";
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

  describe("currency symbols Helvetica cannot draw", () => {
    /** The text the PDF shows: pdf-lib writes each string as hex WinAnsi codes (ASCII for what we use) inside a deflated stream. */
    async function drawnText(over: Parameters<typeof input>[0]) {
      const pdf = await render(over);
      const streams = pdf.getPages().flatMap((page) => {
        const contents = page.node.Contents();
        return contents instanceof PDFArray ? contents.asArray() : [contents];
      });
      let text = "";
      for (const ref of streams) {
        const stream = pdf.context.lookup(ref);
        if (!(stream instanceof PDFRawStream)) continue;
        for (const [, hex] of Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1").matchAll(/<([0-9A-F]+)>\s*Tj/gi)) {
          text += `${Buffer.from(hex, "hex").toString("latin1")}\n`;
        }
      }
      return text;
    }
    const fixture = (currency: string) => ({
      settings: settings({ startingBalanceCents: 123456, currency }),
      incomes: [income("p", 50000, "ONE_TIME", "2025-01-03")],
      bills: [bill("r", 20000, "ONE_TIME", "2025-01-10")],
    });

    it("writes INR amounts with the currency code, never a ? placeholder", async () => {
      const text = await drawnText(fixture("INR"));
      expect(text).toContain("INR 1,234.56");
      expect(text).toContain("INR 500.00");
      expect(text).not.toContain("?");
    });

    it("keeps the symbol where Helvetica can draw it", async () => {
      expect(await drawnText(fixture("USD"))).toContain("$1,234.56");
      expect(await drawnText(fixture("EUR"))).toContain("\u00801,234.56") // WinAnsi puts the euro sign at 0x80;
      expect(await drawnText(fixture("GBP"))).toContain("£1,234.56");
    });

    it("picks symbol or code per currency for every currency Settings offers, and for other won, shekel and peso symbols", async () => {
      const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
      const drawable = new Set(font.getCharacterSet());
      const canDraw = (ch: string) => drawable.has(ch.codePointAt(0)!);
      for (const { code } of CURRENCIES) {
        const display = currencyDisplayFor(code, canDraw);
        const sample = formatCents(-123456, { currency: code, currencyDisplay: display }).replace(/\s+/g, " ");
        expect([...sample].filter((ch) => !canDraw(ch)), code).toEqual([]);
      }
      expect(currencyDisplayFor("INR", canDraw)).toBe("code");
      for (const code of ["KRW", "ILS", "PHP"]) expect(currencyDisplayFor(code, canDraw), code).toBe("code");
      for (const code of ["USD", "EUR", "GBP", "CAD", "AUD", "MXN", "BRL"]) expect(currencyDisplayFor(code, canDraw), code).toBe("symbol");
    });
  });

  it("truncates a very long name and starts a new page when the lists are long", async () => {
    const incomes = Array.from({ length: 70 }, (_, i) => income(`i${i}`, 1000 + i, "ONE_TIME", "2025-01-05", { name: `Source ${i} ${"x".repeat(i === 0 ? 300 : 0)}` }));
    const pdf = await render({ incomes });
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
});
