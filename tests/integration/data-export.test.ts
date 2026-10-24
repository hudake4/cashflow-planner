import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import packageJson from "../../package.json";
import * as exportRoute from "@/app/api/data/export/route";
import * as billList from "@/app/api/bills/route";
import * as occItem from "@/app/api/bills/[id]/occurrences/[date]/route";
import * as incomeList from "@/app/api/income/route";
import * as settingsRoute from "@/app/api/settings/route";
import { dataExportSchema, type BillDTO, type DataExportDTO, type IncomeDTO } from "@/contracts/api";
import { todayLocal } from "@/domain/dates";
import { connect } from "@/server/repositories/institutions";
import * as simplefin from "@/server/simplefin";
import { normalizeAccountSet } from "@/server/simplefin-mapping";
import { call } from "../helpers/api";
import { testPrisma } from "../setup/integration-setup";

vi.mock("@/server/simplefin", () => ({
  claimSetupToken: vi.fn(),
  fetchAccountSet: vi.fn(),
}));
const mocked = vi.mocked(simplefin);

const SECRET_USER = "exportuser";
const SECRET_PASSWORD = "exp0rts3cretpw";
const ACCESS_URL = `https://${SECRET_USER}:${SECRET_PASSWORD}@bridge.simplefin.org/simplefin`;
const SETUP_TOKEN = "EXPORTSETUPTOKEN987";
const NOW = new Date("2026-10-24T15:00:00Z");

/** Epoch seconds for noon UTC on a YYYY-MM-DD date. */
const ep = (date: string) => Date.parse(`${date}T12:00:00Z`) / 1000;

const ACCOUNT_SET = normalizeAccountSet(
  {
    errlist: [],
    connections: [{ conn_id: "c1", name: "Demo Bank", org_id: "o", sfin_url: "https://x" }],
    accounts: [
      {
        id: "a1",
        name: "Checking",
        conn_id: "c1",
        currency: "USD",
        balance: "1234.56",
        "available-balance": "1000.00",
        "balance-date": ep("2026-10-24"),
        transactions: [
          { id: "t1", posted: ep("2026-10-20"), amount: "-12.34", description: "Coffee" },
          { id: "t2", posted: ep("2026-10-10"), amount: "2500.00", description: "Payroll" },
        ],
      },
    ],
  },
  "2026-10-24",
);

/** Calls the route directly so headers and the raw body text are visible. */
async function getExport() {
  const res = await exportRoute.GET();
  const text = await res.text();
  return { res, text, body: JSON.parse(text) as DataExportDTO };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.resetAllMocks();
  mocked.claimSetupToken.mockResolvedValue(ACCESS_URL);
  mocked.fetchAccountSet.mockResolvedValue(ACCOUNT_SET);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/data/export", () => {
  it("downloads an attachment named after today's date", async () => {
    const { res } = await getExport();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("content-disposition")).toBe(
      `attachment; filename="cashflow-planner-backup-${todayLocal(NOW)}.json"`,
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("exports an empty database as defaults and empty lists", async () => {
    const { body } = await getExport();
    expect(dataExportSchema.parse(body)).toEqual(body);
    expect(body).toEqual({
      format: "cashflow-planner-export",
      formatVersion: 1,
      appVersion: packageJson.version,
      exportedAt: NOW.toISOString(),
      settings: expect.objectContaining({ startingBalanceCents: 0, accountsBalanceCents: null, updatedAt: null }),
      incomes: [],
      bills: [],
      billOccurrences: [],
      institutions: [],
    });
  });

  it("includes settings, income, bills, every occurrence row and the bank snapshot", async () => {
    await call(settingsRoute.PUT, "PUT", "/api/settings", {
      body: {
        startingBalanceCents: -4000,
        projectionStartDate: "2026-10-01",
        currency: "USD",
        forecastDays: 90,
        weekStartsOn: 1,
        defaultCalendarView: "week",
      },
    });
    const income = (
      await call<IncomeDTO>(incomeList.POST, "POST", "/api/income", {
        body: { name: "Paycheck", amountCents: 250000, frequency: "BIWEEKLY", anchorDate: "2026-10-02" },
      })
    ).body;
    const bill = (
      await call<BillDTO>(billList.POST, "POST", "/api/bills", {
        body: { name: "Rent", amountCents: 120000, frequency: "MONTHLY", anchorDate: "2026-10-01", category: "Housing" },
      })
    ).body;
    for (const [date, status] of [
      ["2026-12-01", "SKIPPED"],
      ["2026-10-01", "PAID"],
    ]) {
      const res = await call(occItem.PUT, "PUT", `/api/bills/${bill.id}/occurrences/${date}`, {
        body: { status, amountOverrideCents: status === "PAID" ? 119999 : null },
        params: { id: bill.id, date },
      });
      expect(res.status).toBe(200);
    }
    const institution = await connect({ setupToken: SETUP_TOKEN }, NOW);

    const { body } = await getExport();
    expect(dataExportSchema.parse(body)).toEqual(body);
    expect(body.settings).toMatchObject({ startingBalanceCents: -4000, weekStartsOn: 1, accountsBalanceCents: 123456, accountCount: 1 });
    expect(body.incomes).toEqual([income]);
    expect(body.bills).toEqual([bill]);
    expect(body.billOccurrences.map((o) => [o.billId, o.dueDate, o.status, o.amountOverrideCents])).toEqual([
      [bill.id, "2026-10-01", "PAID", 119999],
      [bill.id, "2026-12-01", "SKIPPED", null],
    ]);
    expect(body.institutions).toEqual([
      {
        id: institution.id,
        name: "Demo Bank",
        connectedAt: institution.connectedAt,
        lastSyncedAt: NOW.toISOString(),
        accounts: institution.accounts,
        transactions: [
          { id: `${institution.id}:a1:t1`, accountId: `${institution.id}:a1`, date: "2026-10-20", description: "Coffee", amountCents: -1234, pending: false },
          { id: `${institution.id}:a1:t2`, accountId: `${institution.id}:a1`, date: "2026-10-10", description: "Payroll", amountCents: 250000, pending: false },
        ],
      },
    ]);
  });

  it("never contains the access URL, its credentials or the setup token", async () => {
    await connect({ setupToken: SETUP_TOKEN }, NOW);
    // The credentials are stored server-side...
    expect((await testPrisma.bankConnection.findFirstOrThrow()).accessUrl).toBe(ACCESS_URL);

    // ...but nothing in the download reveals them.
    const { text, body } = await getExport();
    expect(body.institutions).toHaveLength(1);
    for (const secret of [ACCESS_URL, SECRET_PASSWORD, `${SECRET_USER}:`, SETUP_TOKEN, "accessUrl", "Authorization"]) {
      expect(text).not.toContain(secret);
    }
    expect(Object.keys(body.institutions[0]).sort()).toEqual(["accounts", "connectedAt", "id", "lastSyncedAt", "name", "transactions"]);
  });
});
