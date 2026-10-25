import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as billList from "@/app/api/bills/route";
import * as matchesRoute from "@/app/api/bills/matches/route";
import * as occItem from "@/app/api/bills/[id]/occurrences/[date]/route";
import * as projectionRoute from "@/app/api/projection/route";
import * as settingsRoute from "@/app/api/settings/route";
import type { BillMatchesResponse, ProjectionResponse } from "@/contracts/api";
import { call } from "../helpers/api";
import { testPrisma } from "../setup/integration-setup";

// Local noon: todayLocal reads the machine-local date.
const NOW = new Date(2026, 9, 24, 12, 0, 0);

const matches = () => call<BillMatchesResponse>(matchesRoute.GET as never, "GET", "/api/bills/matches");
const projection = async () => (await call<ProjectionResponse>(projectionRoute.GET, "GET", "/api/projection")).body;

async function seedBank(txs: { id: string; date: string; amount: number; description: string; pending?: boolean }[]) {
  const connection = await testPrisma.bankConnection.create({
    data: { accessUrl: "https://u:p@bridge.simplefin.org/simplefin", lastSyncedAt: new Date("2026-10-24T10:00:00Z") },
  });
  const accountId = `${connection.id}:a1`;
  await testPrisma.bankAccount.create({
    data: {
      id: accountId,
      connectionId: connection.id,
      providerAccountId: "a1",
      institutionName: "Demo Bank",
      name: "Checking",
      currency: "USD",
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
  return accountId;
}

async function addBill(body: object) {
  const res = await call(billList.POST, "POST", "/api/bills", { body });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

const markPaid = (id: string, date: string, body: object = { status: "PAID" }) =>
  call(occItem.PUT, "PUT", `/api/bills/${id}/occurrences/${date}`, { body, params: { id, date } });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  const saved = await call(settingsRoute.PUT, "PUT", "/api/settings", {
    body: { startingBalanceCents: 100000, projectionStartDate: "2026-10-01", currency: "USD", forecastDays: 90, weekStartsOn: 0, defaultCalendarView: "month" },
  });
  expect(saved.status).toBe(200);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/bills/matches", () => {
  it("returns no matches when no bank is linked", async () => {
    await addBill({ name: "Netflix", amountCents: 1549, frequency: "MONTHLY", anchorDate: "2026-10-03" });
    const res = await matches();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ matches: [], currency: "USD" });
  });

  it("offers a synced transaction that matches an unpaid occurrence", async () => {
    const id = await addBill({ name: "Netflix", amountCents: 1549, frequency: "MONTHLY", anchorDate: "2026-10-03" });
    await seedBank([
      { id: "n1", date: "2026-10-03", amount: -1549, description: "NETFLIX.COM 1234" },
      { id: "x1", date: "2026-10-12", amount: -4200, description: "One-off hardware store" },
    ]);
    const { body } = await matches();
    expect(body.matches).toHaveLength(1);
    expect(body.matches[0]).toMatchObject({
      billId: id,
      billName: "Netflix",
      dueDate: "2026-10-03",
      expectedCents: 1549,
      transaction: { description: "NETFLIX.COM 1234", date: "2026-10-03", cents: 1549 },
    });
  });

  it("ignores pending transactions and rows older than the 89-day history window", async () => {
    await addBill({ name: "Gym", amountCents: 1000, frequency: "MONTHLY", anchorDate: "2026-03-03" });
    await seedBank([
      { id: "a", date: "2026-10-03", amount: -1000, description: "Gym", pending: true },
      { id: "b", date: "2026-07-03", amount: -1000, description: "Gym" }, // before 2026-07-28
    ]);
    expect((await matches()).body.matches).toEqual([]);
  });

  it("stops offering an occurrence once it is marked paid, and marking it paid leaves the projection untouched", async () => {
    const id = await addBill({ name: "Netflix", amountCents: 1549, frequency: "MONTHLY", anchorDate: "2026-10-03" });
    await seedBank([{ id: "n1", date: "2026-10-03", amount: -1549, description: "NETFLIX.COM 1234" }]);

    const before = await projection();
    const [offer] = (await matches()).body.matches;
    expect(offer).toBeDefined();

    // Exactly what the UI sends when the user confirms an offer.
    const res = await markPaid(offer.billId, offer.dueDate, {
      status: "PAID",
      amountOverrideCents: offer.amountOverrideCents,
      note: offer.note,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ billId: id, dueDate: "2026-10-03", status: "PAID", amountOverrideCents: null });

    expect((await matches()).body.matches).toEqual([]);

    const after = await projection();
    const paid = after.events.find((e) => e.sourceId === id && e.date === "2026-10-03");
    expect(paid).toMatchObject({ status: "PAID", included: true, signedAmountCents: -1549 });
    // Same balances on every day and the same totals: PAID counts once, exactly like UPCOMING.
    expect(after.days).toEqual(before.days);
    expect(after.weeks).toEqual(before.weeks);
    expect(after.totals).toEqual(before.totals);
    expect(after.events.map((e) => [e.id, e.signedAmountCents, e.balanceAfterCents])).toEqual(
      before.events.map((e) => [e.id, e.signedAmountCents, e.balanceAfterCents]),
    );
  });

  it("never offers an occurrence that was marked skipped", async () => {
    const id = await addBill({ name: "Netflix", amountCents: 1549, frequency: "MONTHLY", anchorDate: "2026-10-03" });
    await seedBank([{ id: "n1", date: "2026-10-03", amount: -1549, description: "NETFLIX.COM" }]);
    expect((await markPaid(id, "2026-10-03", { status: "SKIPPED" })).status).toBe(200);
    expect((await matches()).body.matches).toEqual([]);
  });

  it("carries the occurrence's amount override so confirming keeps it", async () => {
    const id = await addBill({ name: "Electric", amountCents: 9000, frequency: "MONTHLY", anchorDate: "2026-10-05" });
    expect((await markPaid(id, "2026-10-05", { status: "UPCOMING", amountOverrideCents: 14200, note: "Heat wave" })).status).toBe(200);
    await seedBank([{ id: "e1", date: "2026-10-06", amount: -14150, description: "CITY ELECTRIC" }]);

    const [offer] = (await matches()).body.matches;
    expect(offer).toMatchObject({ expectedCents: 14200, amountOverrideCents: 14200, note: "Heat wave" });
    const res = await markPaid(id, offer.dueDate, { status: "PAID", amountOverrideCents: offer.amountOverrideCents, note: offer.note });
    expect(res.body).toMatchObject({ status: "PAID", amountOverrideCents: 14200, note: "Heat wave" });
  });

  it("doesn't touch the bank snapshot (read-only)", async () => {
    await addBill({ name: "Netflix", amountCents: 1549, frequency: "MONTHLY", anchorDate: "2026-10-03" });
    await seedBank([{ id: "n1", date: "2026-10-03", amount: -1549, description: "NETFLIX.COM" }]);
    const before = await testPrisma.bankTransaction.findMany({ orderBy: { id: "asc" } });
    await matches();
    expect(await testPrisma.bankTransaction.findMany({ orderBy: { id: "asc" } })).toEqual(before);
    expect(await testPrisma.billOccurrence.count()).toBe(0);
  });
});
