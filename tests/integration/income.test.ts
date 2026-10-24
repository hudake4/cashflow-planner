import { describe, expect, it } from "vitest";
import * as list from "@/app/api/income/route";
import * as item from "@/app/api/income/[id]/route";
import { call, expectApiError } from "../helpers/api";

const valid = { name: "Paycheck", amountCents: 150000, frequency: "BIWEEKLY", anchorDate: "2025-01-03" };

const create = (body: object) => call(list.POST, "POST", "/api/income", { body });
const at = (id: string) => ({ params: { id } });

describe("/api/income CRUD", () => {
  it("POST 201 with defaults, GET by id, GET list sorted by name", async () => {
    const res = await create(valid);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ...valid, endDate: null, active: true, notes: null });
    expect(res.body.id).toBeTypeOf("string");
    expect(res.body.createdAt).toBeTypeOf("string");

    await create({ ...valid, name: "alpha side gig", frequency: "WEEKLY" });
    await create({ ...valid, name: "Bonus", frequency: "ONE_TIME" });

    const one = await call(item.GET, "GET", `/api/income/${res.body.id}`, at(res.body.id));
    expect(one.status).toBe(200);
    expect(one.body).toEqual(res.body);

    const all = await call(list.GET, "GET", "/api/income");
    expect(all.status).toBe(200);
    expect(all.body.map((i: { name: string }) => i.name)).toEqual(["alpha side gig", "Bonus", "Paycheck"]);
  });

  it("trims names; empty endDate becomes null", async () => {
    const res = await create({ ...valid, name: "  Pay  ", endDate: "", notes: "  " });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Pay", endDate: null, notes: null });
  });

  it("PUT is a full replacement; DELETE 204 then 404", async () => {
    const { body: created } = await create({ ...valid, notes: "x", endDate: "2025-12-31" });
    const upd = { name: "Renamed", amountCents: 99, frequency: "WEEKLY", anchorDate: "2025-02-01", active: false };
    const put = await call(item.PUT, "PUT", `/api/income/${created.id}`, { body: upd, ...at(created.id) });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ ...upd, id: created.id, endDate: null, notes: null });

    const fresh = await call(item.GET, "GET", `/api/income/${created.id}`, at(created.id));
    expect(fresh.body).toMatchObject(upd);

    const del = await call(item.DELETE, "DELETE", `/api/income/${created.id}`, at(created.id));
    expect(del.status).toBe(204);
    expectApiError(await call(item.GET, "GET", `/api/income/${created.id}`, at(created.id)), 404, "NOT_FOUND");
    expectApiError(await call(item.DELETE, "DELETE", `/api/income/${created.id}`, at(created.id)), 404, "NOT_FOUND");
  });

  it("404 for unknown ids on GET/PUT/DELETE", async () => {
    expectApiError(await call(item.GET, "GET", "/api/income/nope", at("nope")), 404, "NOT_FOUND");
    expectApiError(await call(item.PUT, "PUT", "/api/income/nope", { body: valid, ...at("nope") }), 404, "NOT_FOUND");
    expectApiError(await call(item.DELETE, "DELETE", "/api/income/nope", at("nope")), 404, "NOT_FOUND");
  });
});

describe("/api/income validation (19)", () => {
  it.each([
    ["amountCents", { amountCents: 0 }],
    ["amountCents", { amountCents: -500 }],
    ["amountCents", { amountCents: 12.5 }],
    ["amountCents", { amountCents: "100" }],
    ["amountCents", { amountCents: 1_000_000_001 }],
    ["name", { name: undefined }],
    ["name", { name: "   " }],
    ["name", { name: "x".repeat(81) }],
    ["frequency", { frequency: "QUARTERLY" }], // income allows WEEKLY | BIWEEKLY | MONTHLY | ONE_TIME only
    ["frequency", { frequency: "daily" }],
    ["anchorDate", { anchorDate: "2025-02-30" }],
    ["anchorDate", { anchorDate: "abc" }],
    ["endDate", { endDate: "2025-01-02" }], // before anchor 2025-01-03
    ["endDate", { endDate: "2025-13-01" }],
  ])("400 for bad %s: %j", async (field, patch) => {
    const res = await create({ ...valid, ...patch });
    expectApiError(res, 400, "VALIDATION_ERROR", [field]);
    expect((await call(list.GET, "GET", "/api/income")).body).toEqual([]);
  });

  it("accepts the max amount and an endDate equal to the anchor", async () => {
    expect((await create({ ...valid, amountCents: 1_000_000_000 })).status).toBe(201);
    expect((await create({ ...valid, endDate: valid.anchorDate })).status).toBe(201);
  });

  it("PUT validates too; malformed JSON is BAD_REQUEST", async () => {
    const { body: created } = await create(valid);
    expectApiError(
      await call(item.PUT, "PUT", `/api/income/${created.id}`, { body: { ...valid, amountCents: 0 }, ...at(created.id) }),
      400,
      "VALIDATION_ERROR",
      ["amountCents"],
    );
    expectApiError(await call(list.POST, "POST", "/api/income", { body: "{\"name\":" }), 400, "BAD_REQUEST");
    expectApiError(
      await call(item.PUT, "PUT", `/api/income/${created.id}`, { body: "nope", ...at(created.id) }),
      400,
      "BAD_REQUEST",
    );
  });
});
