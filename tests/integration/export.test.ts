/**
 * Register CSV and monthly-summary PDF endpoints over real persisted data. Settings: start
 * 2025-01-01 (Wed), $1,000.00, 90 days (window ..2025-03-31, maxEndDate 2026-01-01).
 */
import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it } from "vitest";
import * as settingsRoute from "@/app/api/settings/route";
import * as incomeList from "@/app/api/income/route";
import * as billList from "@/app/api/bills/route";
import * as occItem from "@/app/api/bills/[id]/occurrences/[date]/route";
import * as registerRoute from "@/app/api/export/register/route";
import * as summaryRoute from "@/app/api/export/monthly-summary/route";
import * as projectionRoute from "@/app/api/projection/route";
import type { ProjectionResponse } from "@/contracts/api";
import { CSV_BOM } from "@/domain/register-csv";
import { call, expectApiError } from "../helpers/api";

const SETTINGS = {
  startingBalanceCents: 100000,
  projectionStartDate: "2025-01-01",
  currency: "USD",
  forecastDays: 90,
  weekStartsOn: 0,
  defaultCalendarView: "month",
};

const getRegister = async (qs = "") => {
  const res = await registerRoute.GET(new Request(`http://localhost/api/export/register${qs}`));
  // Read the bytes: res.text() would drop the BOM, which the file must keep.
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { res, bytes, text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes) };
};
const getSummary = (qs = "") => summaryRoute.GET(new Request(`http://localhost/api/export/monthly-summary${qs}`));
const csvRows = (text: string) => text.replace(CSV_BOM, "").split("\r\n").slice(0, -1);
/** Reads RFC 4180 CSV: quoted fields may hold commas, doubled quotes and line breaks. */
const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const body = text.replace(CSV_BOM, "");
  const endRow = () => {
    row.push(field);
    rows.push(row);
    row = [];
    field = "";
  };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted && ch === '"' && body[i + 1] === '"') {
      field += '"';
      i++;
    } else if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === ",") {
      row.push(field);
      field = "";
    } else if (!quoted && ch === "\r" && body[i + 1] === "\n") {
      endRow();
      i++;
    } else field += ch;
  }
  return rows;
};

// A comma and quotes in a name: a naive split(",") would misread the row.
const PAY_NAME = 'Pay, "Acme" Inc';

let rentId: string;

beforeEach(async () => {
  expect((await call(settingsRoute.PUT, "PUT", "/api/settings", { body: SETTINGS })).status).toBe(200);
  await call(incomeList.POST, "POST", "/api/income", {
    body: { name: PAY_NAME, amountCents: 50000, frequency: "BIWEEKLY", anchorDate: "2025-01-03" },
  });
  rentId = (
    await call(billList.POST, "POST", "/api/bills", {
      body: { name: "=Rent", amountCents: 20000, frequency: "MONTHLY", anchorDate: "2025-01-10", category: "Housing" },
    })
  ).body.id;
});

describe("GET /api/export/register", () => {
  it("downloads the whole window as a CSV attachment named after the range", async () => {
    const { res, text, bytes } = await getRegister();
    expect(res.status).toBe(200);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="cashflow-register-2025-01-01-to-2025-03-31.csv"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(text.startsWith(CSV_BOM)).toBe(true);
    const rows = csvRows(text);
    expect(rows[0]).toBe("Date,Name,Type,Category,Frequency,Status,Amount (USD),Balance after (USD)");
    // 7 paychecks + 3 rent payments.
    expect(rows).toHaveLength(1 + 10);
  });

  it("matches /api/projection event for event, with the same running balances", async () => {
    const projection = (await call<ProjectionResponse>(projectionRoute.GET, "GET", "/api/projection?from=2025-01-05&to=2025-02-15")).body;
    const rows = parseCsv((await getRegister("?from=2025-01-05&to=2025-02-15")).text).slice(1);
    expect(rows).toHaveLength(projection.events.length);
    projection.events.forEach((e, i) => {
      expect(rows[i]).toHaveLength(8);
      expect(rows[i][0]).toBe(e.date);
      expect(rows[i][1].replace(/^'/, "")).toBe(e.name);
      expect(Math.round(Number(rows[i][7]) * 100)).toBe(e.balanceAfterCents);
    });
    expect(rows.some((cells) => cells[1] === PAY_NAME)).toBe(true);
  });

  it("neutralizes a formula in a bill name and shows status and overrides", async () => {
    await call(occItem.PUT, "PUT", `/api/bills/${rentId}/occurrences/2025-01-10`, {
      body: { status: "PAID", amountOverrideCents: 19999 },
      params: { id: rentId, date: "2025-01-10" },
    });
    const rows = csvRows((await getRegister("?from=2025-01-10&to=2025-01-10")).text);
    // $1,000 + the 01-03 paycheck $500 - the adjusted rent $199.99.
    expect(rows[1]).toBe("2025-01-10,'=Rent,Bill,Housing,Monthly,Paid,-199.99,1300.01");
  });

  it("clamps the range to the computable window like /api/projection", async () => {
    const { res } = await getRegister("?from=2024-06-01&to=2099-01-01");
    expect(res.headers.get("content-disposition")).toContain("cashflow-register-2025-01-01-to-2026-01-01.csv");
  });

  it("validates from and to", async () => {
    const bad = await getRegister("?from=2025-13-40");
    expect(bad.res.status).toBe(400);
    expectApiError({ status: bad.res.status, body: JSON.parse(bad.text) }, 400, "VALIDATION_ERROR", ["from"]);
    const reversed = await getRegister("?from=2025-02-01&to=2025-01-01");
    expectApiError({ status: reversed.res.status, body: JSON.parse(reversed.text) }, 400, "VALIDATION_ERROR", ["to"]);
  });

  it("treats empty from and to as the full window", async () => {
    const { res } = await getRegister("?from=&to=");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("2025-01-01-to-2025-03-31");
  });
});

describe("GET /api/export/monthly-summary", () => {
  const body = async (res: Response) => ({ status: res.status, body: JSON.parse(await res.text()) });

  it("downloads a valid PDF named after the month", async () => {
    const res = await getSummary("?month=2025-02");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="cashflow-summary-2025-02.pdf"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toBe("Monthly summary, February 2025");
    expect(pdf.getPageCount()).toBe(1);
  });

  it("renders a partial first month and the last allowed month", async () => {
    await call(settingsRoute.PUT, "PUT", "/api/settings", { body: { ...SETTINGS, projectionStartDate: "2025-01-20" } });
    for (const month of ["2025-01", "2026-01"]) {
      const res = await getSummary(`?month=${month}`);
      expect(res.status, month).toBe(200);
      expect((await PDFDocument.load(new Uint8Array(await res.arrayBuffer()))).getPageCount()).toBeGreaterThan(0);
    }
  });

  it("requires a valid month", async () => {
    for (const qs of ["", "?month=", "?month=2025-13", "?month=2025-1", "?month=2025-02-01", "?month=garbage"]) {
      expectApiError(await body(await getSummary(qs)), 400, "VALIDATION_ERROR", ["month"]);
    }
  });

  it("rejects a month before the projection start or beyond the 12-month limit", async () => {
    const before = await body(await getSummary("?month=2024-12"));
    expectApiError(before, 400, "BAD_REQUEST");
    expect(before.body.error.message).toContain("before your projection start");
    const after = await body(await getSummary("?month=2026-02"));
    expectApiError(after, 400, "BAD_REQUEST");
    expect(after.body.error.message).toContain("12-month forecast limit");
  });
});
