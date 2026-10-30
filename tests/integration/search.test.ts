import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as searchRoute from "@/app/api/search/route";
import type { SearchKind, SearchResponse, SearchResultDTO } from "@/contracts/api";
import { call, expectApiError } from "../helpers/api";
import { testPrisma } from "../setup/integration-setup";

// Local noon: todayLocal reads the machine-local date. The 89-day window then starts 2026-07-28.
const NOW = new Date(2026, 9, 24, 12, 0, 0);

const find = (q: string, extra = "") =>
  call<SearchResponse>(searchRoute.GET as never, "GET", `/api/search?q=${encodeURIComponent(q)}${extra}`);

const ofKind = (res: SearchResponse, kind: SearchKind): SearchResultDTO[] => res.results.filter((r) => r.kind === kind);
const titles = (results: SearchResultDTO[]) => results.map((r) => r.title);

const SECRET_URL = "https://user:hunter2@bridge.simplefin.org/simplefin";

async function seedBank(
  txs: { id: string; date: string; amount: number; description: string; pending?: boolean }[] = [],
  { accountName = "Checking", institutionName = "Demo Bank", currency = "USD", kind = "BANK" } = {},
) {
  const connection = await testPrisma.bankConnection.create({
    data: { accessUrl: SECRET_URL, lastSyncedAt: new Date("2026-10-24T10:00:00Z") },
  });
  const accountId = `${connection.id}:a1`;
  await testPrisma.bankAccount.create({
    data: {
      id: accountId,
      connectionId: connection.id,
      providerAccountId: "a1",
      institutionName,
      name: accountName,
      kind,
      currency,
      balanceCents: 100000,
      balanceDate: "2026-10-24",
    },
  });
  await testPrisma.bankTransaction.createMany({
    data: txs.map((t) => ({
      id: `${accountId}:${t.id}`,
      accountId,
      date: t.date,
      amountCents: t.amount,
      description: t.description,
      pending: t.pending ?? false,
    })),
  });
  return { connectionId: connection.id, accountId };
}

const bill = (name: string, over: Record<string, unknown> = {}) =>
  testPrisma.bill.create({
    data: { name, amountCents: 120000, frequency: "MONTHLY", anchorDate: "2026-01-01", ...over },
  });

const income = (name: string, over: Record<string, unknown> = {}) =>
  testPrisma.incomeSource.create({
    data: { name, amountCents: 250000, frequency: "BIWEEKLY", anchorDate: "2026-01-02", ...over },
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/search validation", () => {
  it("rejects a missing, empty or blank q", async () => {
    for (const path of ["/api/search", "/api/search?q=", "/api/search?q=%20%20"]) {
      const res = await call(searchRoute.GET as never, "GET", path);
      expectApiError(res, 400, "VALIDATION_ERROR", ["q"]);
    }
  });

  it("rejects a q over 100 characters but accepts exactly 100", async () => {
    expectApiError(await find("x".repeat(101)), 400, "VALIDATION_ERROR", ["q"]);
    expect((await find("x".repeat(100))).status).toBe(200);
  });

  it("rejects a limit outside 1-50 or not a whole number", async () => {
    for (const limit of ["0", "51", "-1", "2.5", "abc"]) {
      expectApiError(await find("rent", `&limit=${limit}`), 400, "VALIDATION_ERROR", ["limit"]);
    }
    expect((await find("rent", "&limit=50")).status).toBe(200);
    expect((await find("rent", "&limit=1")).status).toBe(200);
  });
});

describe("GET /api/search results", () => {
  it("returns an empty list for an empty database", async () => {
    const res = await find("rent");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ query: "rent", results: [] });
  });

  it("finds bills by name, category and notes, with a link and a signed-by-kind amount", async () => {
    const rent = await bill("Rent", { category: "Housing" });
    await bill("Water", { notes: "Paid with the rent check" });
    await bill("Phone");

    const byName = ofKind((await find("rent")).body, "BILL");
    expect(titles(byName)).toEqual(["Rent", "Water"]);
    expect(byName[0]).toEqual({
      id: rent.id,
      kind: "BILL",
      title: "Rent",
      subtitle: "Housing · Monthly",
      amountCents: 120000,
      currency: "USD",
      href: `/bills?edit=${rent.id}`,
    });

    expect(titles(ofKind((await find("housing")).body, "BILL"))).toEqual(["Rent"]);
  });

  it("marks paused bills and income", async () => {
    await bill("Gym", { active: false });
    await income("Side gig", { active: false });
    const body = (await find("g")).body;
    expect(ofKind(body, "BILL")[0].subtitle).toBe("Monthly · Paused");
    expect(ofKind(body, "INCOME")[0].subtitle).toBe("Every 2 weeks · Paused");
  });

  it("finds income by name and notes", async () => {
    const pay = await income("Acme Payroll");
    await income("Refund", { notes: "from acme" });
    const found = ofKind((await find("acme")).body, "INCOME");
    expect(titles(found)).toEqual(["Acme Payroll", "Refund"]);
    expect(found[0]).toMatchObject({ id: pay.id, amountCents: 250000, href: `/income?edit=${pay.id}` });
  });

  it("finds savings goals by name; an unnamed goal reads 'Savings goal'", async () => {
    const trip = await testPrisma.savingsGoal.create({
      data: { name: "Vacation fund", targetAmountCents: 300000, targetDate: "2027-06-01" },
    });
    await testPrisma.savingsGoal.create({ data: { name: null, targetAmountCents: 50000, targetDate: "2027-01-01" } });

    expect((await find("vacation")).body.results).toEqual([
      {
        id: trip.id,
        kind: "GOAL",
        title: "Vacation fund",
        subtitle: "Target date 2027-06-01",
        amountCents: 300000,
        currency: "USD",
        href: "/savings-goals",
      },
    ]);
    expect(titles(ofKind((await find("savings goal")).body, "GOAL"))).toEqual(["Savings goal"]);
  });

  it("finds accounts by name, institution and type, and links to the account", async () => {
    const { connectionId, accountId } = await seedBank([], {
      accountName: "Sapphire Preferred",
      institutionName: "Chase",
      kind: "CREDIT",
    });
    for (const q of ["sapphire", "chase", "credit"]) {
      const found = ofKind((await find(q)).body, "ACCOUNT");
      expect(found, q).toEqual([
        {
          id: accountId,
          kind: "ACCOUNT",
          title: "Sapphire Preferred",
          subtitle: "Chase · Credit",
          amountCents: null,
          currency: null,
          href: `/institutions/${connectionId}?account=${encodeURIComponent(accountId)}`,
        },
      ]);
    }
  });

  it("returns every group in a fixed order", async () => {
    await seedBank([{ id: "t1", date: "2026-10-20", amount: -9900, description: "Rent payment" }], {
      accountName: "Rent account",
    });
    await bill("Rent");
    await income("Rent rebate");
    await testPrisma.savingsGoal.create({ data: { name: "Rent buffer", targetAmountCents: 1, targetDate: "2027-01-01" } });

    const kinds = (await find("rent")).body.results.map((r) => r.kind);
    expect(kinds).toEqual(["BILL", "INCOME", "TRANSACTION", "GOAL", "ACCOUNT"]);
  });

  it("ranks exact, then prefix, then contains, then notes-only matches", async () => {
    await bill("Landlord", { notes: "rent" });
    await bill("Parent loan");
    await bill("Monthly rent");
    await bill("Rent payment");
    await bill("Rent");
    expect(titles(ofKind((await find("rent")).body, "BILL"))).toEqual([
      "Rent",
      "Rent payment",
      "Monthly rent",
      "Parent loan",
      "Landlord",
    ]);
  });

  it("is case and accent insensitive", async () => {
    await bill("Café Rouge");
    expect(titles(ofKind((await find("CAFE")).body, "BILL"))).toEqual(["Café Rouge"]);
    expect(titles(ofKind((await find("café")).body, "BILL"))).toEqual(["Café Rouge"]);
  });

  it("treats % and _ as plain characters", async () => {
    await bill("Rent");
    await bill("50% promo");
    expect(titles(ofKind((await find("%")).body, "BILL"))).toEqual(["50% promo"]);
    expect((await find("_")).body.results).toEqual([]);
  });

  it("caps each group separately and keeps the best matches", async () => {
    for (let i = 0; i < 5; i++) await bill(`Utility ${i}`);
    await bill("Utility");
    for (let i = 0; i < 5; i++) await income(`Utility refund ${i}`);

    const body = (await find("utility", "&limit=3")).body;
    expect(titles(ofKind(body, "BILL"))).toEqual(["Utility", "Utility 0", "Utility 1"]);
    expect(ofKind(body, "INCOME")).toHaveLength(3);
  });

  it("uses the settings currency for bills, income and goals", async () => {
    await testPrisma.settings.create({ data: { projectionStartDate: "2026-10-01", currency: "EUR" } });
    await bill("Rent");
    await income("Rent rebate");
    await testPrisma.savingsGoal.create({ data: { name: "Rent buffer", targetAmountCents: 1, targetDate: "2027-01-01" } });
    const results = (await find("rent")).body.results;
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.currency === "EUR")).toBe(true);
  });
});

describe("GET /api/search bank transactions", () => {
  it("finds a transaction by description, newest first, with the signed amount and account detail", async () => {
    const { accountId } = await seedBank([
      { id: "old", date: "2026-10-01", amount: -4520, description: "Kroger #1234" },
      { id: "new", date: "2026-10-20", amount: -1999, description: "KROGER FUEL" },
      { id: "other", date: "2026-10-21", amount: -500, description: "Starbucks" },
    ]);
    const found = ofKind((await find("kroger")).body, "TRANSACTION");
    expect(found.map((r) => r.id)).toEqual([`${accountId}:new`, `${accountId}:old`]);
    expect(found[0]).toEqual({
      id: `${accountId}:new`,
      kind: "TRANSACTION",
      title: "KROGER FUEL",
      subtitle: "Checking · Demo Bank · 2026-10-20",
      amountCents: -1999,
      currency: "USD",
      href: "/spending",
    });
  });

  it("ranks a description match above one found only through the account name", async () => {
    await seedBank([
      { id: "a", date: "2026-10-22", amount: -100, description: "Coffee" },
      { id: "b", date: "2026-10-20", amount: -100, description: "Checking transfer" },
    ]);
    const found = ofKind((await find("checking")).body, "TRANSACTION");
    expect(titles(found)).toEqual(["Checking transfer", "Coffee"]);
  });

  it("finds a transaction by amount, whatever the sign the user types", async () => {
    await seedBank([
      { id: "debit", date: "2026-10-10", amount: -4520, description: "Hardware store" },
      { id: "credit", date: "2026-10-11", amount: 4520, description: "Refund" },
      { id: "other", date: "2026-10-12", amount: -4521, description: "Gas" },
    ]);
    for (const q of ["45.20", "$45.20", "-45.20", "45.2"]) {
      expect(titles(ofKind((await find(q)).body, "TRANSACTION")).sort(), q).toEqual(["Hardware store", "Refund"]);
    }
    expect(ofKind((await find("45")).body, "TRANSACTION")).toEqual([]);
  });

  it("finds a transaction by date and by institution", async () => {
    await seedBank(
      [
        { id: "a", date: "2026-10-10", amount: -100, description: "One" },
        { id: "b", date: "2026-10-11", amount: -100, description: "Two" },
      ],
      { institutionName: "Credit Union" },
    );
    expect(titles(ofKind((await find("2026-10-11")).body, "TRANSACTION"))).toEqual(["Two"]);
    expect(titles(ofKind((await find("credit union")).body, "TRANSACTION"))).toEqual(["Two", "One"]);
  });

  it("only searches the 89-day history window (today counts as day one)", async () => {
    const { accountId } = await seedBank([
      { id: "edge", date: "2026-07-28", amount: -100, description: "Windowed charge" },
      { id: "gone", date: "2026-07-27", amount: -100, description: "Windowed charge" },
    ]);
    expect(ofKind((await find("windowed")).body, "TRANSACTION").map((r) => r.id)).toEqual([`${accountId}:edge`]);
  });

  it("includes pending transactions and says so", async () => {
    await seedBank([{ id: "p", date: "2026-10-23", amount: -2500, description: "Pending diner", pending: true }]);
    expect(ofKind((await find("diner")).body, "TRANSACTION")[0].subtitle).toBe(
      "Checking · Demo Bank · 2026-10-23 · Pending",
    );
  });

  it("carries the account currency", async () => {
    await seedBank([{ id: "e", date: "2026-10-23", amount: -2500, description: "Café" }], { currency: "EUR" });
    expect(ofKind((await find("cafe")).body, "TRANSACTION")[0].currency).toBe("EUR");
  });

  it("caps the transactions group", async () => {
    await seedBank(
      Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, date: `2026-10-${10 + i}`, amount: -100, description: "Bus fare" })),
    );
    const found = ofKind((await find("bus", "&limit=2")).body, "TRANSACTION");
    expect(found.map((r) => r.subtitle)).toEqual([
      "Checking · Demo Bank · 2026-10-15",
      "Checking · Demo Bank · 2026-10-14",
    ]);
  });
});

describe("GET /api/search is local and private", () => {
  it("never makes a network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await seedBank([{ id: "t", date: "2026-10-20", amount: -100, description: "Kroger" }]);
    await bill("Kroger club");
    expect((await find("kroger")).status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never exposes the SimpleFIN access URL", async () => {
    await seedBank([{ id: "t", date: "2026-10-20", amount: -100, description: "simplefin hunter2" }]);
    const text = JSON.stringify((await find("simplefin")).body);
    expect(text).toContain("simplefin hunter2");
    expect(text).not.toContain("bridge.simplefin.org");
    expect(text).not.toContain("accessUrl");
  });

  it("only reads: nothing is written", async () => {
    await bill("Rent");
    await seedBank([{ id: "t", date: "2026-10-20", amount: -100, description: "Rent" }]);
    const before = await testPrisma.bill.findMany();
    await find("rent");
    expect(await testPrisma.bill.findMany()).toEqual(before);
    expect(await testPrisma.bankTransaction.count()).toBe(1);
  });
});
