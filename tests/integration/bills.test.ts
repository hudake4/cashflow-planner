import { describe, expect, it } from "vitest";
import * as list from "@/app/api/bills/route";
import * as item from "@/app/api/bills/[id]/route";
import * as occList from "@/app/api/bills/[id]/occurrences/route";
import * as occItem from "@/app/api/bills/[id]/occurrences/[date]/route";
import { call, expectApiError } from "../helpers/api";
import { testPrisma } from "../setup/integration-setup";

// Monthly on the 31st: scheduled 2025-01-31, 2025-02-28, 2025-03-31, ...
const valid = { name: "Rent", amountCents: 120000, frequency: "MONTHLY", anchorDate: "2025-01-31", category: "Housing" };

const create = (body: object) => call(list.POST, "POST", "/api/bills", { body });
const at = (id: string) => ({ params: { id } });
const occAt = (id: string, date: string) => ({ params: { id, date } });
const putOcc = (id: string, date: string, body: unknown) =>
  call(occItem.PUT, "PUT", `/api/bills/${id}/occurrences/${date}`, { body, ...occAt(id, date) });

describe("/api/bills CRUD", () => {
  it("POST 201, GET, list sorted by name, PUT, DELETE", async () => {
    const res = await create(valid);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ...valid, endDate: null, notes: null, active: true });
    await create({ ...valid, name: "car loan", category: "" });

    const all = await call(list.GET, "GET", "/api/bills");
    expect(all.body.map((b: { name: string }) => b.name)).toEqual(["car loan", "Rent"]);
    expect(all.body[0].category).toBeNull();

    const put = await call(item.PUT, "PUT", `/api/bills/${res.body.id}`, {
      body: { ...valid, amountCents: 125050, frequency: "QUARTERLY", category: null },
      ...at(res.body.id),
    });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ amountCents: 125050, frequency: "QUARTERLY", category: null });
    expect((await call(item.GET, "GET", "", at(res.body.id))).body).toEqual(put.body);

    expect((await call(item.DELETE, "DELETE", "", at(res.body.id))).status).toBe(204);
    expectApiError(await call(item.GET, "GET", "", at(res.body.id)), 404, "NOT_FOUND");
  });

  it("404 for unknown ids", async () => {
    expectApiError(await call(item.GET, "GET", "", at("missing")), 404, "NOT_FOUND");
    expectApiError(await call(item.PUT, "PUT", "", { body: valid, ...at("missing") }), 404, "NOT_FOUND");
    expectApiError(await call(item.DELETE, "DELETE", "", at("missing")), 404, "NOT_FOUND");
    expectApiError(await call(occList.GET, "GET", "", at("missing")), 404, "NOT_FOUND");
    expectApiError(await putOcc("missing", "2025-01-31", { status: "PAID" }), 404, "NOT_FOUND");
  });

  it.each([
    ["amountCents", { amountCents: 0 }],
    ["amountCents", { amountCents: -1 }],
    ["amountCents", { amountCents: 0.5 }],
    ["name", { name: "" }],
    ["name", { name: undefined }],
    ["frequency", { frequency: "BIMONTHLY" }],
    ["frequency", { frequency: undefined }],
    ["anchorDate", { anchorDate: "2025-02-30" }],
    ["anchorDate", { anchorDate: "abc" }],
    ["endDate", { endDate: "2025-01-30" }],
    ["category", { category: "x".repeat(41) }],
    ["active", { active: "yes" }],
  ])("400 VALIDATION_ERROR for bad %s: %j", async (field, patch) => {
    expectApiError(await create({ ...valid, ...patch }), 400, "VALIDATION_ERROR", [field]);
    expect(await testPrisma.bill.count()).toBe(0);
  });

  it("400 BAD_REQUEST for malformed JSON", async () => {
    expectApiError(await call(list.POST, "POST", "/api/bills", { body: "{" }), 400, "BAD_REQUEST");
  });
});

describe("occurrences", () => {
  it("PUT records status/override on a scheduled date (month-end clamped) and GET lists it", async () => {
    const { body: b } = await create(valid);
    const res = await putOcc(b.id, "2025-02-28", { status: "PAID", amountOverrideCents: 119999, note: "paid early" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ billId: b.id, dueDate: "2025-02-28", status: "PAID", amountOverrideCents: 119999, note: "paid early" });

    // upsert, not duplicate
    const again = await putOcc(b.id, "2025-02-28", { status: "SKIPPED" });
    expect(again.body).toMatchObject({ status: "SKIPPED", amountOverrideCents: null });
    const occs = await call(occList.GET, "GET", "", at(b.id));
    expect(occs.status).toBe(200);
    expect(occs.body).toHaveLength(1);
    expect(occs.body[0]).toMatchObject({ dueDate: "2025-02-28", status: "SKIPPED" });
  });

  it("400 BAD_REQUEST for a non-scheduled or invalid date", async () => {
    const { body: b } = await create(valid);
    for (const date of ["2025-02-27", "2025-01-30", "2024-12-31"]) {
      expectApiError(await putOcc(b.id, date, { status: "PAID" }), 400, "BAD_REQUEST");
    }
    for (const date of ["2025-02-30", "abc"]) {
      expectApiError(await putOcc(b.id, date, { status: "PAID" }), 400, "BAD_REQUEST");
    }
    expect(await testPrisma.billOccurrence.count()).toBe(0);
  });

  it("400 for an invalid status or override", async () => {
    const { body: b } = await create(valid);
    expectApiError(await putOcc(b.id, "2025-01-31", { status: "DONE" }), 400, "VALIDATION_ERROR", ["status"]);
    expectApiError(await putOcc(b.id, "2025-01-31", { status: "PAID", amountOverrideCents: 0 }), 400, "VALIDATION_ERROR", [
      "amountOverrideCents",
    ]);
    expectApiError(await putOcc(b.id, "2025-01-31", "{"), 400, "BAD_REQUEST");
  });

  it("DELETE resets to UPCOMING (204, idempotent)", async () => {
    const { body: b } = await create(valid);
    await putOcc(b.id, "2025-01-31", { status: "PAID" });
    const del = await call(occItem.DELETE, "DELETE", "", occAt(b.id, "2025-01-31"));
    expect(del.status).toBe(204);
    expect((await call(occList.GET, "GET", "", at(b.id))).body).toEqual([]);
    expect((await call(occItem.DELETE, "DELETE", "", occAt(b.id, "2025-01-31"))).status).toBe(204);
  });

  it("12. editing a bill never deletes or rewrites occurrence rows", async () => {
    const { body: b } = await create(valid);
    await putOcc(b.id, "2025-01-31", { status: "PAID", amountOverrideCents: 100 });
    await putOcc(b.id, "2025-02-28", { status: "SKIPPED" });
    const before = await testPrisma.billOccurrence.findMany({ orderBy: { dueDate: "asc" } });

    // move the schedule so the old dates no longer match, change amount & frequency
    const put = await call(item.PUT, "PUT", "", {
      body: { ...valid, amountCents: 1, frequency: "WEEKLY", anchorDate: "2025-01-06" },
      ...at(b.id),
    });
    expect(put.status).toBe(200);
    const after = await testPrisma.billOccurrence.findMany({ orderBy: { dueDate: "asc" } });
    expect(after).toEqual(before);
  });

  it("deleting a bill cascades its occurrence rows", async () => {
    const { body: b } = await create(valid);
    const { body: other } = await create({ ...valid, name: "Other" });
    await putOcc(b.id, "2025-01-31", { status: "PAID" });
    await putOcc(other.id, "2025-01-31", { status: "PAID" });
    expect((await call(item.DELETE, "DELETE", "", at(b.id))).status).toBe(204);
    expect(await testPrisma.billOccurrence.count({ where: { billId: b.id } })).toBe(0);
    expect(await testPrisma.billOccurrence.count({ where: { billId: other.id } })).toBe(1);
  });
});
