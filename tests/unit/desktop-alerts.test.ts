import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadNotified, saveNotified, selectNewAlerts, type Alert } from "../../electron/alerts";

const alert = (key: string, expiresOn: string): Alert => ({ key, title: `T ${key}`, body: `B ${key}`, expiresOn });

describe("selectNewAlerts", () => {
  it("shows every alert the first time and remembers its key", () => {
    const a = alert("bill:rent:2025-01-10", "2025-01-10");
    const b = alert("low-balance:2025-01-12", "2025-01-15");
    const { fresh, state } = selectNewAlerts([a, b], {}, "2025-01-08");
    expect(fresh).toEqual([a, b]);
    expect(state).toEqual({ [a.key]: "2025-01-10", [b.key]: "2025-01-15" });
  });

  it("does not show an alert again on a later check", () => {
    const a = alert("bill:rent:2025-01-10", "2025-01-10");
    const first = selectNewAlerts([a], {}, "2025-01-08");
    const second = selectNewAlerts([a], first.state, "2025-01-08");
    expect(second.fresh).toEqual([]);
    expect(selectNewAlerts([a], second.state, "2025-01-09").fresh).toEqual([]);
    expect(second.state).toEqual(first.state);
  });

  it("shows only the alerts that are new", () => {
    const a = alert("a", "2025-01-10");
    const b = alert("b", "2025-01-11");
    expect(selectNewAlerts([a, b], { a: "2025-01-10" }, "2025-01-08").fresh).toEqual([b]);
  });

  it("forgets a key after its date, and keeps it on its last day", () => {
    const state = { old: "2025-01-07", edge: "2025-01-08", future: "2025-01-20" };
    expect(selectNewAlerts([], state, "2025-01-08").state).toEqual({ edge: "2025-01-08", future: "2025-01-20" });
  });

  it("shows a repeated key in one response only once", () => {
    const a = alert("a", "2025-01-10");
    expect(selectNewAlerts([a, { ...a }], {}, "2025-01-08").fresh).toEqual([a]);
  });

  it("does not change the state it was given", () => {
    const given = { a: "2025-01-10" };
    selectNewAlerts([alert("b", "2025-01-11")], given, "2025-01-08");
    expect(given).toEqual({ a: "2025-01-10" });
  });
});

describe("notified-alerts file", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cashflow-alerts-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips", () => {
    const file = path.join(dir, "notified-alerts.json");
    saveNotified(file, { a: "2025-01-10" });
    expect(loadNotified(file)).toEqual({ a: "2025-01-10" });
  });

  it("reads a missing, corrupt or wrongly shaped file as empty", () => {
    expect(loadNotified(path.join(dir, "missing.json"))).toEqual({});
    const file = path.join(dir, "bad.json");
    fs.writeFileSync(file, "{not json");
    expect(loadNotified(file)).toEqual({});
    fs.writeFileSync(file, "[1,2]");
    expect(loadNotified(file)).toEqual({});
    fs.writeFileSync(file, JSON.stringify({ ok: "2025-01-10", bad: 5 }));
    expect(loadNotified(file)).toEqual({ ok: "2025-01-10" });
  });
});
