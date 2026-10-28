import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH, PUT } from "@/app/api/settings/route";
import { GET as projectionGET } from "@/app/api/projection/route";
import { GET as dashboardGET } from "@/app/api/dashboard/route";
import * as incomeList from "@/app/api/income/route";
import * as billList from "@/app/api/bills/route";
import type { DashboardResponse, ProjectionResponse } from "@/contracts/api";
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
      accountsBalanceDate: null,
      accountsStaleCount: 0,
      projectionStartDate: todayLocal(),
      currency: "USD",
      forecastDays: 90,
      weekStartsOn: 0,
      defaultCalendarView: "month",
      desktopNotifications: true,
  balanceFloorCents: 0,
      debtMonthlyPaymentCents: 50000,
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

  it("desktopNotifications defaults to on when omitted, and can be turned off and on again", async () => {
    const first = await call(PUT, "PUT", "/api/settings", { body: valid });
    expect(first.body.desktopNotifications).toBe(true);
    const off = await call(PUT, "PUT", "/api/settings", { body: { ...valid, desktopNotifications: false } });
    expect(off.body.desktopNotifications).toBe(false);
    expect((await call(GET, "GET", "/api/settings")).body.desktopNotifications).toBe(false);
    const on = await call(PUT, "PUT", "/api/settings", { body: { ...valid, desktopNotifications: true } });
    expect(on.body.desktopNotifications).toBe(true);
  });

  describe("debt payoff monthly payment", () => {
    it("PATCH saves it before settings were ever saved, and a fresh GET reads it back", async () => {
      const patch = await call(PATCH, "PATCH", "/api/settings", { body: { debtMonthlyPaymentCents: 123456 } });
      expect(patch.status).toBe(200);
      expect(patch.body).toMatchObject({ debtMonthlyPaymentCents: 123456, startingBalanceCents: 0, currency: "USD" });
      expect((await call(GET, "GET", "/api/settings")).body.debtMonthlyPaymentCents).toBe(123456);
    });

    it("PATCH changes only the payment on saved settings", async () => {
      await call(PUT, "PUT", "/api/settings", { body: { ...valid, weekStartsOn: 3, balanceFloorCents: 7000 } });
      const patch = await call(PATCH, "PATCH", "/api/settings", { body: { debtMonthlyPaymentCents: 0 } });
      expect(patch.body).toMatchObject({ ...valid, weekStartsOn: 3, balanceFloorCents: 7000, debtMonthlyPaymentCents: 0 });
    });

    it("a PUT that leaves the payment out keeps the stored one", async () => {
      await call(PATCH, "PATCH", "/api/settings", { body: { debtMonthlyPaymentCents: 90000 } });
      const put = await call(PUT, "PUT", "/api/settings", { body: valid });
      expect(put.body.debtMonthlyPaymentCents).toBe(90000);
      const withIt = await call(PUT, "PUT", "/api/settings", { body: { ...valid, debtMonthlyPaymentCents: 25000 } });
      expect(withIt.body.debtMonthlyPaymentCents).toBe(25000);
    });

    it.each([{ debtMonthlyPaymentCents: -1 }, { debtMonthlyPaymentCents: 10.5 }, { debtMonthlyPaymentCents: "500" }, { debtMonthlyPaymentCents: 1_000_000_001 }, {}])(
      "PATCH 400 VALIDATION_ERROR for %j",
      async (body) => {
        expectApiError(await call(PATCH, "PATCH", "/api/settings", { body }), 400, "VALIDATION_ERROR", ["debtMonthlyPaymentCents"]);
        expect((await call(GET, "GET", "/api/settings")).body.updatedAt).toBeNull();
      },
    );
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
    ["desktopNotifications", { desktopNotifications: "no" }],
  ])("400 VALIDATION_ERROR for bad %s (%j)", async (field, patch) => {
    const res = await call(PUT, "PUT", "/api/settings", { body: { ...valid, ...patch } });
    expectApiError(res, 400, "VALIDATION_ERROR", [field]);
    // nothing was saved
    expect((await call(GET, "GET", "/api/settings")).body.updatedAt).toBeNull();
  });

  describe("starting balance source", () => {
    const addAccount = async (id: string, balanceCents: number, kind = "BANK", balanceDate = "2026-10-24") => {
      const conn = await testPrisma.bankConnection.create({ data: { accessUrl: "https://u:p@bridge.simplefin.org/simplefin" } });
      await testPrisma.bankAccount.create({
        data: {
          id: `${conn.id}:${id}`, connectionId: conn.id, providerAccountId: id, institutionName: "Bank", name: id,
          kind, currency: "USD", balanceCents, balanceDate,
        },
      });
    };
    const projectionBody = async () => {
      const res = await call<ProjectionResponse>(projectionGET, "GET", "/api/projection");
      expect(res.status).toBe(200);
      return res.body;
    };
    const startingBalance = async () => (await projectionBody()).startingBalanceCents;
    const closing = (p: ProjectionResponse, date: string) => p.days.find((d) => d.date === date)!.closingBalanceCents;

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

    describe("projection start date", () => {
      // Pay +$500 biweekly from 2025-01-03 (01-03, 01-17, ...); Rent -$200 monthly on the 10th.
      const addSchedule = async () => {
        await call(incomeList.POST, "POST", "/api/income", {
          body: { name: "Pay", amountCents: 50000, frequency: "BIWEEKLY", anchorDate: "2025-01-03" },
        });
        await call(billList.POST, "POST", "/api/bills", {
          body: { name: "Rent", amountCents: 20000, frequency: "MONTHLY", anchorDate: "2025-01-10" },
        });
      };
      const accountsSettings = { ...valid, startingBalanceSource: "ACCOUNTS" };

      it("ACCOUNTS starts on the oldest balance date of the summed bank accounts, ignoring other kinds", async () => {
        await addAccount("checking", 500000, "BANK", "2025-01-12");
        await addAccount("savings", 25000, "BANK", "2025-01-08");
        // Older than every bank account, but a credit card is not summed, so it can't move the start date.
        await addAccount("card", -120050, "CREDIT", "2024-12-01");
        await addAccount("mortgage", -30000000, "LOAN", "2024-11-01");
        await addSchedule();

        const put = await call(PUT, "PUT", "/api/settings", { body: accountsSettings });
        // Settings still carry the typed start date; the derived one is exposed next to the accounts total.
        expect(put.body).toMatchObject({ projectionStartDate: "2025-01-01", accountsBalanceDate: "2025-01-08", accountCount: 2 });
        expect((await call(GET, "GET", "/api/settings")).body).toMatchObject({ projectionStartDate: "2025-01-01", accountsBalanceDate: "2025-01-08" });

        const p = await projectionBody();
        expect(p.window).toEqual({ startDate: "2025-01-08", endDate: "2025-04-07", maxEndDate: "2026-01-08" });
        expect(p.days[0].date).toBe("2025-01-08");
        expect(p.startingBalanceCents).toBe(525000);
        // The opening balance is applied on the start date; the 01-03 pay is already in the bank balance.
        expect(p.days[0].openingBalanceCents).toBe(525000);
        expect(closing(p, "2025-01-10")).toBe(525000 - 20000);
        expect(closing(p, "2025-01-17")).toBe(525000 - 20000 + 50000);
        expect(p.events.every((e) => e.date >= "2025-01-08")).toBe(true);
      });

      it("the dashboard reports the effective start date and leaves the stored one alone", async () => {
        await addAccount("checking", 500000, "BANK", "2025-01-08");
        await call(PUT, "PUT", "/api/settings", { body: accountsSettings });
        const dash = (await call<DashboardResponse>(dashboardGET, "GET", "/api/dashboard")).body;
        expect(dash.window.startDate).toBe("2025-01-08");
        expect(dash.settings).toMatchObject({ projectionStartDate: "2025-01-08", startingBalanceCents: 500000 });
        expect(await testPrisma.settings.findFirst()).toMatchObject({ projectionStartDate: "2025-01-01", startingBalanceCents: 100000 });
      });

      it("a newer refresh moves the start date forward without a settings change", async () => {
        await addAccount("checking", 500000, "BANK", "2025-01-08");
        await call(PUT, "PUT", "/api/settings", { body: accountsSettings });
        expect((await projectionBody()).window.startDate).toBe("2025-01-08");
        await testPrisma.bankAccount.updateMany({ data: { balanceDate: "2025-02-01" } });
        expect((await projectionBody()).window.startDate).toBe("2025-02-01");
      });

      it("MANUAL keeps the typed start date whatever the accounts say", async () => {
        await addAccount("checking", 500000, "BANK", "2025-01-08");
        await call(PUT, "PUT", "/api/settings", { body: valid });
        const p = await projectionBody();
        expect(p.window.startDate).toBe("2025-01-01");
        expect(p.startingBalanceCents).toBe(100000);
      });

      it("ACCOUNTS without a bank account keeps the typed start date", async () => {
        await addAccount("card", -120050, "CREDIT", "2024-12-01");
        const put = await call(PUT, "PUT", "/api/settings", { body: accountsSettings });
        expect(put.body).toMatchObject({ projectionStartDate: "2025-01-01", accountsBalanceDate: null });
        const p = await projectionBody();
        expect(p.window.startDate).toBe("2025-01-01");
        expect(p.startingBalanceCents).toBe(100000);
      });

      describe("stale accounts and the clock", () => {
        // Fixed "today" (server-local noon) so the 7-day freshness cutoff and the clamp are deterministic.
        beforeEach(() => {
          vi.useFakeTimers({ toFake: ["Date"] });
          vi.setSystemTime(new Date(2026, 9, 25, 12));
        });
        afterEach(() => {
          vi.useRealTimers();
        });
        const settingsBody = async () => (await call(PUT, "PUT", "/api/settings", { body: accountsSettings })).body;

        it("a stale BANK account is still summed but can't pull the start date back", async () => {
          await addAccount("checking", 300000, "BANK", "2026-10-24");
          await addAccount("savings", 100000, "BANK", "2026-10-24");
          await addAccount("old-savings", 5000, "BANK", "2026-06-15");
          await addSchedule();

          const s = await settingsBody();
          expect(s).toMatchObject({ accountsBalanceCents: 405000, accountCount: 3, accountsBalanceDate: "2026-10-24", accountsStaleCount: 1 });
          const p = await projectionBody();
          expect(p.window.startDate).toBe("2026-10-24");
          expect(p.startingBalanceCents).toBe(405000);
          expect(p.days[0].openingBalanceCents).toBe(405000);
          const dash = (await call<DashboardResponse>(dashboardGET, "GET", "/api/dashboard")).body;
          expect(dash.window.startDate).toBe("2026-10-24");
          expect(dash.settings).toMatchObject({ accountsStaleCount: 1, projectionStartDate: "2026-10-24" });
        });

        it("reports the stale count before settings were ever saved", async () => {
          await addAccount("checking", 300000, "BANK", "2026-10-24");
          await addAccount("old-savings", 5000, "BANK", "2026-06-15");
          expect((await call(GET, "GET", "/api/settings")).body).toMatchObject({
            accountsBalanceDate: "2026-10-24",
            accountsStaleCount: 1,
            updatedAt: null,
          });
        });

        it("an account is fresh up to 7 days old and stale from the 8th", async () => {
          await addAccount("checking", 300000, "BANK", "2026-10-25");
          await addAccount("seven", 1000, "BANK", "2026-10-18");
          expect(await settingsBody()).toMatchObject({ accountsBalanceDate: "2026-10-18", accountsStaleCount: 0 });
          await addAccount("eight", 1000, "BANK", "2026-10-17");
          expect(await settingsBody()).toMatchObject({ accountsBalanceDate: "2026-10-18", accountsStaleCount: 1 });
        });

        it("when every bank account is stale the date is the oldest overall and nothing is reported as left out", async () => {
          await addAccount("checking", 300000, "BANK", "2026-08-01");
          await addAccount("savings", 100000, "BANK", "2026-06-15");
          expect(await settingsBody()).toMatchObject({ accountsBalanceCents: 400000, accountsBalanceDate: "2026-06-15", accountsStaleCount: 0 });
          expect((await projectionBody()).window.startDate).toBe("2026-06-15");
        });

        it("credit, loan and other accounts are never counted as stale", async () => {
          await addAccount("checking", 300000, "BANK", "2026-10-24");
          await addAccount("card", -120050, "CREDIT", "2026-01-01");
          await addAccount("mortgage", -30000000, "LOAN", "2026-01-01");
          await addAccount("misc", 99900, "OTHER", "2026-01-01");
          expect(await settingsBody()).toMatchObject({ accountsBalanceDate: "2026-10-24", accountsStaleCount: 0 });
        });

        it("a balance date after today (a UTC-evening sync) clamps the start date to today", async () => {
          await addAccount("checking", 300000, "BANK", "2026-10-26");
          expect(await settingsBody()).toMatchObject({ accountsBalanceDate: "2026-10-25", accountsStaleCount: 0 });
          const p = await projectionBody();
          expect(p.window.startDate).toBe("2026-10-25");
          expect(p.days[0].date).toBe("2026-10-25");
          expect((await call<DashboardResponse>(dashboardGET, "GET", "/api/dashboard")).body.window.startDate).toBe("2026-10-25");
        });

        it("the clamp does not move a date that is today or earlier, and a future account doesn't hide an older fresh one", async () => {
          await addAccount("checking", 300000, "BANK", "2026-10-26");
          await addAccount("savings", 100000, "BANK", "2026-10-22");
          expect(await settingsBody()).toMatchObject({ accountsBalanceDate: "2026-10-22", accountsStaleCount: 0 });
        });

        it("MANUAL ignores all of it and keeps the typed start date", async () => {
          await addAccount("checking", 300000, "BANK", "2026-10-26");
          await addAccount("old-savings", 5000, "BANK", "2026-06-15");
          await call(PUT, "PUT", "/api/settings", { body: valid });
          expect((await projectionBody()).window.startDate).toBe("2025-01-01");
        });
      });

      it("saving settings in ACCOUNTS mode never stores the derived date", async () => {
        await addAccount("checking", 500000, "BANK", "2025-01-08");
        await call(PUT, "PUT", "/api/settings", { body: accountsSettings });
        // The form sends back what it was given, including after a bank refresh moved the derived date.
        const body = (await call(GET, "GET", "/api/settings")).body;
        await call(PUT, "PUT", "/api/settings", { body: { ...body, forecastDays: 60 } });
        expect(await testPrisma.settings.findFirst()).toMatchObject({ projectionStartDate: "2025-01-01", forecastDays: 60 });
      });
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
