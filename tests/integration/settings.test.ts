import { describe, expect, it } from "vitest";
import { GET, PUT } from "@/app/api/settings/route";
import { GET as projectionGET } from "@/app/api/projection/route";
import type { ProjectionResponse } from "@/contracts/api";
import { todayLocal } from "@/domain/dates";
import { call, expectApiError } from "../helpers/api";
import { testPrisma } from "../setup/integration-setup";

const valid = {
  startingBalanceCents: 100000,
  projectionStartDate: "2025-01-01",
  currency: "USD",
  forecastDays: 90,
  weekStartsOn: 0,
  defaultCalendarView: "month",
};

describe("/api/settings", () => {
  it("GET returns defaults when never saved", async () => {
    const res = await call(GET, "GET", "/api/settings");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      startingBalanceCents: 0,
      startingBalanceSource: "MANUAL",
      accountsBalanceCents: null,
      accountCount: 0,
      projectionStartDate: todayLocal(),
      currency: "USD",
      forecastDays: 90,
      weekStartsOn: 0,
      defaultCalendarView: "month",
      updatedAt: null,
    });
  });

  it("PUT saves and a fresh GET reads it back (persistence)", async () => {
    const put = await call(PUT, "PUT", "/api/settings", { body: { ...valid, currency: "eur", weekStartsOn: 1 } });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ ...valid, currency: "EUR", weekStartsOn: 1 });
    expect(typeof put.body.updatedAt).toBe("string");
    const get = await call(GET, "GET", "/api/settings");
    expect(get.body).toEqual(put.body);
  });

  it("allows zero and negative starting balances", async () => {
    for (const b of [0, -50000]) {
      const res = await call(PUT, "PUT", "/api/settings", { body: { ...valid, startingBalanceCents: b } });
      expect(res.status).toBe(200);
      expect(res.body.startingBalanceCents).toBe(b);
    }
  });

  it("defaultCalendarView defaults to month when omitted", async () => {
    const rest: Partial<typeof valid> = { ...valid };
    delete rest.defaultCalendarView;
    const res = await call(PUT, "PUT", "/api/settings", { body: rest });
    expect(res.status).toBe(200);
    expect(res.body.defaultCalendarView).toBe("month");
  });

  it.each([
    ["projectionStartDate", { projectionStartDate: "2025-02-30" }],
    ["projectionStartDate", { projectionStartDate: "abc" }],
    ["projectionStartDate", { projectionStartDate: "2025-1-5" }],
    ["forecastDays", { forecastDays: 6 }],
    ["forecastDays", { forecastDays: 367 }],
    ["forecastDays", { forecastDays: 30.5 }],
    ["weekStartsOn", { weekStartsOn: 7 }],
    ["currency", { currency: "US" }],
    ["startingBalanceCents", { startingBalanceCents: 10.5 }],
    ["startingBalanceCents", { startingBalanceCents: "1000" }],
    ["startingBalanceCents", { startingBalanceCents: undefined }],
    ["defaultCalendarView", { defaultCalendarView: "year" }],
    ["startingBalanceSource", { startingBalanceSource: "BANK" }],
  ])("400 VALIDATION_ERROR for bad %s (%j)", async (field, patch) => {
    const res = await call(PUT, "PUT", "/api/settings", { body: { ...valid, ...patch } });
    expectApiError(res, 400, "VALIDATION_ERROR", [field]);
    // nothing was saved
    expect((await call(GET, "GET", "/api/settings")).body.updatedAt).toBeNull();
  });

  describe("starting balance source", () => {
    const addAccount = async (id: string, balanceCents: number, kind = "BANK") => {
      const conn = await testPrisma.bankConnection.create({ data: { accessUrl: "https://u:p@bridge.simplefin.org/simplefin" } });
      await testPrisma.bankAccount.create({
        data: {
          id: `${conn.id}:${id}`, connectionId: conn.id, providerAccountId: id, institutionName: "Bank", name: id,
          kind, currency: "USD", balanceCents, balanceDate: "2026-10-24",
        },
      });
    };
    const startingBalance = async () => (await call<ProjectionResponse>(projectionGET, "GET", "/api/projection")).body.startingBalanceCents;

    it("defaults to manual and ignores connected accounts", async () => {
      await addAccount("checking", 500000);
      const put = await call(PUT, "PUT", "/api/settings", { body: valid });
      expect(put.body).toMatchObject({ startingBalanceSource: "MANUAL", accountsBalanceCents: 500000, accountCount: 1 });
      expect(await startingBalance()).toBe(100000);
    });

    it("ACCOUNTS projects from the sum of the bank accounts and keeps the typed balance", async () => {
      await addAccount("checking", 500000);
      await addAccount("card", -120050);
      const put = await call(PUT, "PUT", "/api/settings", { body: { ...valid, startingBalanceSource: "ACCOUNTS" } });
      expect(put.body).toMatchObject({
        startingBalanceCents: 100000,
        startingBalanceSource: "ACCOUNTS",
        accountsBalanceCents: 379950,
        accountCount: 2,
      });
      expect(await startingBalance()).toBe(379950);
      // Switching back uses the typed balance again.
      await call(PUT, "PUT", "/api/settings", { body: valid });
      expect(await startingBalance()).toBe(100000);
    });

    it("only BANK accounts are counted: credit, loan and other accounts are left out", async () => {
      await addAccount("checking", 500000);
      await addAccount("savings", 25000);
      await addAccount("creditline", -120050, "CREDIT");
      await addAccount("mortgage", -30000000, "LOAN");
      await addAccount("misc", 99900, "OTHER");
      const put = await call(PUT, "PUT", "/api/settings", { body: { ...valid, startingBalanceSource: "ACCOUNTS" } });
      expect(put.body).toMatchObject({ accountsBalanceCents: 525000, accountCount: 2 });
      expect((await call(GET, "GET", "/api/settings")).body).toMatchObject({ accountsBalanceCents: 525000, accountCount: 2 });
      // A negative credit-line balance does not reduce the effective starting balance.
      expect(await startingBalance()).toBe(525000);
    });

    it("ACCOUNTS falls back to the typed balance when no account is labelled as a bank account", async () => {
      await addAccount("creditline", -120050, "CREDIT");
      await addAccount("auto", -800000, "LOAN");
      const put = await call(PUT, "PUT", "/api/settings", { body: { ...valid, startingBalanceSource: "ACCOUNTS" } });
      expect(put.body).toMatchObject({ startingBalanceSource: "ACCOUNTS", accountsBalanceCents: null, accountCount: 0 });
      expect(await startingBalance()).toBe(100000);
    });

    it("ACCOUNTS falls back to the typed balance while no account is connected", async () => {
      const put = await call(PUT, "PUT", "/api/settings", { body: { ...valid, startingBalanceSource: "ACCOUNTS" } });
      expect(put.body).toMatchObject({ accountsBalanceCents: null, accountCount: 0 });
      expect(await startingBalance()).toBe(100000);
    });
  });

  it("accepts forecastDays at the 7 and 366 bounds", async () => {
    for (const forecastDays of [7, 366]) {
      expect((await call(PUT, "PUT", "/api/settings", { body: { ...valid, forecastDays } })).status).toBe(200);
    }
  });

  it("400 BAD_REQUEST for malformed JSON", async () => {
    expectApiError(await call(PUT, "PUT", "/api/settings", { body: "{not json" }), 400, "BAD_REQUEST");
    expectApiError(await call(PUT, "PUT", "/api/settings", { body: "" }), 400, "BAD_REQUEST");
  });
});
