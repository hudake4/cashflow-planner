/**
 * Renders a `MonthlySummary` (src/domain/monthly-summary.ts) as a PDF with pdf-lib: pure
 * JavaScript, no network, no font files (it uses the built-in Helvetica). It only lays
 * out numbers the engine already computed.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { todayLocal } from "../domain/dates";
import { formatCents } from "../domain/money";
import type { MonthlySummary, SummaryGroup } from "../domain/monthly-summary";
import { fmtDate } from "../lib/dates";

const PAGE = { width: 612, height: 792 }; // US Letter, in points
const MARGIN = 54;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;
const BOTTOM = MARGIN + 18; // leaves room for the footer

const INK = rgb(0.09, 0.1, 0.12);
const MUTED = rgb(0.38, 0.4, 0.44);
const RULE = rgb(0.72, 0.74, 0.78);
const NEGATIVE = rgb(0.62, 0.1, 0.17);

type Align = "left" | "right";
interface Column {
  header: string;
  width: number;
  align: Align;
}

class Report {
  readonly doc: PDFDocument;
  private page!: PDFPage;
  private y = 0;
  private allowed: Set<number>;

  constructor(
    doc: PDFDocument,
    private readonly font: PDFFont,
    private readonly bold: PDFFont,
    private readonly currency: string,
  ) {
    this.doc = doc;
    this.allowed = new Set(font.getCharacterSet());
    this.newPage();
  }

  private newPage() {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - MARGIN;
  }

  /** Room for `height` more points, else a new page. */
  ensure(height: number) {
    if (this.y - height < BOTTOM) this.newPage();
  }

  gap(points: number) {
    this.y -= points;
  }

  /** Helvetica's built-in encoding can't draw every character; replace the rest with "?". */
  private safe(text: string): string {
    let out = "";
    for (const ch of text.replace(/\s+/g, " ")) out += this.allowed.has(ch.codePointAt(0)!) ? ch : "?";
    return out;
  }

  private fit(text: string, font: PDFFont, size: number, width: number): string {
    const clean = this.safe(text);
    if (font.widthOfTextAtSize(clean, size) <= width) return clean;
    let cut = clean;
    while (cut.length > 1 && font.widthOfTextAtSize(`${cut}...`, size) > width) cut = cut.slice(0, -1);
    return `${cut.trimEnd()}...`;
  }

  private draw(text: string, x: number, width: number, align: Align, opts: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> } = {}) {
    const font = opts.bold ? this.bold : this.font;
    const size = opts.size ?? 10;
    const shown = this.fit(text, font, size, width);
    const left = align === "right" ? x + width - font.widthOfTextAtSize(shown, size) : x;
    this.page.drawText(shown, { x: left, y: this.y, size, font, color: opts.color ?? INK });
  }

  rule(thickness = 0.5, double = false) {
    const line = (y: number) =>
      this.page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_WIDTH, y }, thickness, color: double ? INK : RULE });
    line(this.y);
    if (double) line(this.y - 2.5);
  }

  title(text: string, subtitle: string) {
    this.y -= 22;
    this.draw(text, MARGIN, CONTENT_WIDTH, "left", { bold: true, size: 20 });
    this.y -= 16;
    this.draw(subtitle, MARGIN, CONTENT_WIDTH, "left", { size: 10, color: MUTED });
    this.y -= 10;
    this.rule(1);
    this.y -= 6;
  }

  heading(text: string) {
    this.ensure(48);
    this.y -= 26;
    this.draw(text, MARGIN, CONTENT_WIDTH, "left", { bold: true, size: 12 });
    this.y -= 6;
  }

  note(text: string, color = MUTED) {
    this.ensure(18);
    this.y -= 14;
    this.draw(text, MARGIN, CONTENT_WIDTH, "left", { size: 9.5, color });
  }

  /** A label with its amount right-aligned, one line of the summary block. */
  line(label: string, value: string, opts: { bold?: boolean; negative?: boolean } = {}) {
    this.ensure(20);
    this.y -= 17;
    this.draw(label, MARGIN, CONTENT_WIDTH - 140, "left", { bold: opts.bold, size: 10.5 });
    this.draw(value, MARGIN + CONTENT_WIDTH - 140, 140, "right", { bold: opts.bold, size: 10.5, color: opts.negative ? NEGATIVE : INK });
  }

  table(columns: Column[], rows: { cells: string[]; negative?: boolean[] }[]) {
    const drawHeader = () => {
      this.ensure(40);
      this.y -= 18;
      let x = MARGIN;
      for (const col of columns) {
        this.draw(col.header, x, col.width, col.align, { bold: true, size: 9, color: MUTED });
        x += col.width;
      }
      this.y -= 5;
      this.rule();
    };
    drawHeader();
    for (const row of rows) {
      if (this.y - 18 < BOTTOM) {
        this.newPage();
        drawHeader();
      }
      this.y -= 16;
      let x = MARGIN;
      columns.forEach((col, i) => {
        this.draw(row.cells[i], x, col.width, col.align, { size: 10, color: row.negative?.[i] ? NEGATIVE : INK });
        x += col.width;
      });
    }
  }

  /** "CashFlow Planner ... Page n of N" on every page, once the page count is known. */
  footers(text: string) {
    const pages = this.doc.getPages();
    pages.forEach((page, i) => {
      const size = 8.5;
      page.drawText(this.safe(text), { x: MARGIN, y: MARGIN - 6, size, font: this.font, color: MUTED });
      const label = `Page ${i + 1} of ${pages.length}`;
      page.drawText(label, { x: MARGIN + CONTENT_WIDTH - this.font.widthOfTextAtSize(label, size), y: MARGIN - 6, size, font: this.font, color: MUTED });
    });
  }

  money(cents: number, signed = false): string {
    return formatCents(cents, { currency: this.currency, signDisplay: signed ? "exceptZero" : "auto" });
  }
}

const day = (date: string) => fmtDate(date, "MMM d");

export async function renderMonthlySummaryPdf(summary: MonthlySummary, now: Date = new Date()): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Monthly summary, ${summary.label}`);
  doc.setProducer("CashFlow Planner");
  doc.setCreator("CashFlow Planner");
  doc.setCreationDate(now);
  doc.setModificationDate(now);
  const r = new Report(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold), summary.currency);
  const { totals } = summary;

  r.title(`Monthly summary: ${summary.label}`, `Projected from your income and bills (${summary.currency}). Not a bank statement.`);
  if (summary.partial) {
    r.note(`Covers ${fmtDate(summary.range.from, "MMM d, yyyy")} to ${fmtDate(summary.range.to, "MMM d, yyyy")} only: the rest of the month is outside the projection.`);
  }

  r.heading("Summary");
  r.rule();
  r.line(`Opening balance (start of ${day(summary.range.from)})`, r.money(totals.openingBalanceCents), { negative: totals.openingBalanceCents < 0 });
  r.line("Income", r.money(totals.incomeCents, true));
  r.line("Bills", r.money(-totals.billsCents, true));
  r.line("Net change", r.money(totals.netCents, true), { negative: totals.netCents < 0 });
  r.gap(5);
  r.rule(0.75, true);
  r.line(`Closing balance (end of ${day(summary.range.to)})`, r.money(totals.endingBalanceCents), {
    bold: true,
    negative: totals.endingBalanceCents < 0,
  });
  r.gap(4);
  r.line(`Lowest balance (${day(totals.lowestBalanceDate)})`, r.money(totals.lowestBalanceCents), { negative: totals.lowestBalanceCents < 0 });
  if (totals.firstNegativeDate) {
    r.note(
      `Below zero on ${totals.negativeDayCount} ${totals.negativeDayCount === 1 ? "day" : "days"}, first on ${day(totals.firstNegativeDate)}.`,
      NEGATIVE,
    );
  }
  if (summary.skippedBillCount > 0) {
    r.note(
      `${summary.skippedBillCount} skipped ${summary.skippedBillCount === 1 ? "bill" : "bills"} (${r.money(summary.skippedBillsCents)}) not counted.`,
    );
  }

  r.heading("By week");
  r.table(
    [
      { header: "Week", width: CONTENT_WIDTH - 4 * 85, align: "left" },
      { header: "Income", width: 85, align: "right" },
      { header: "Bills", width: 85, align: "right" },
      { header: "Net", width: 85, align: "right" },
      { header: "Closing balance", width: 85, align: "right" },
    ],
    summary.weeks.map((w) => ({
      cells: [
        `${day(w.rangeStart)} - ${day(w.rangeEnd)}${w.partial ? " (partial)" : ""}`,
        r.money(w.incomeCents, true),
        r.money(-w.billsCents, true),
        r.money(w.netCents, true),
        r.money(w.closingBalanceCents),
      ],
      negative: [false, false, false, w.netCents < 0, w.closingBalanceCents < 0],
    })),
  );

  if (summary.incomeBySource.length > 0) groupTable(r, "Income by source", "Source", summary.incomeBySource, 1);
  // A single "Uncategorized" line would only repeat the bills total.
  if (summary.billsByCategory.some((g) => g.label !== null)) groupTable(r, "Bills by category", "Category", summary.billsByCategory, -1);

  r.footers(`CashFlow Planner, generated ${fmtDate(todayLocal(now), "MMM d, yyyy")}`);
  return doc.save();
}

function groupTable(r: Report, heading: string, firstHeader: string, groups: SummaryGroup[], sign: 1 | -1) {
  r.heading(heading);
  r.table(
    [
      { header: firstHeader, width: CONTENT_WIDTH - 85 - 110, align: "left" },
      { header: "Count", width: 85, align: "right" },
      { header: "Amount", width: 110, align: "right" },
    ],
    groups.map((g) => ({ cells: [g.label ?? "Uncategorized", String(g.count), r.money(sign * g.amountCents, true)] })),
  );
}
