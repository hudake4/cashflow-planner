import { describe, expect, it } from "vitest";
import { GET, PUT } from "@/app/api/settings/route";
import { todayLocal } from "@/domain/dates";
import { call, expectApiError } from "../helpers/api";

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
  ])("400 VALIDATION_ERROR for bad %s (%j)", async (field, patch) => {
    const res = await call(PUT, "PUT", "/api/settings", { body: { ...valid, ...patch } });
    expectApiError(res, 400, "VALIDATION_ERROR", [field]);
    // nothing was saved
    expect((await call(GET, "GET", "/api/settings")).body.updatedAt).toBeNull();
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
