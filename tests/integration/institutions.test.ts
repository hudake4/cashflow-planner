import { beforeEach, describe, expect, it, vi } from "vitest";
import * as configRoute from "@/app/api/institutions/config/route";
import * as listRoute from "@/app/api/institutions/route";
import * as itemRoute from "@/app/api/institutions/[id]/route";
import * as txRoute from "@/app/api/institutions/[id]/transactions/route";
import * as resetRoute from "@/app/api/data/reset/route";
import type { BankTransactionsResponse, InstitutionDTO } from "@/contracts/api";
import { ApiError } from "@/server/http";
import * as teller from "@/server/teller";
import type { TellerAccount, TellerTransaction } from "@/server/teller-mapping";
import { call, expectApiError } from "../helpers/api";
import { testPrisma } from "../setup/integration-setup";

vi.mock("@/server/teller", () => ({
  isConfigured: vi.fn(),
  getPublicConfig: vi.fn(),
  listAccounts: vi.fn(),
  listTransactions: vi.fn(),
  revokeEnrollment: vi.fn(),
}));
const mocked = vi.mocked(teller);

const ACCOUNTS: TellerAccount[] = [
  { id: "acc_2", name: "TD Savings", type: "depository", subtype: "savings", last_four: "5678", currency: "USD", status: "open" },
  { id: "acc_1", name: "TD Checking", type: "depository", subtype: "checking", last_four: "1234", currency: "USD", status: "open" },
];

const connectBody = { accessToken: "tok_secret", enrollmentId: "enr_1", institutionName: "TD Bank" };

const tx = (n: number, over: Partial<TellerTransaction> = {}): TellerTransaction => ({
  id: `txn_${n}`,
  account_id: "acc_1",
  date: "2026-10-20",
  description: `Purchase ${n}`,
  amount: "-1.00",
  status: "posted",
  details: null,
  ...over,
});

async function connect() {
  return call<InstitutionDTO>(listRoute.POST, "POST", "/api/institutions", { body: connectBody });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocked.isConfigured.mockReturnValue(true);
  mocked.getPublicConfig.mockReturnValue({ configured: true, applicationId: "app_123", environment: "sandbox" });
  mocked.listAccounts.mockResolvedValue(ACCOUNTS);
  mocked.revokeEnrollment.mockResolvedValue();
});

describe("institutions", () => {
  it("GET /config returns only the public settings", async () => {
    const res = await call(configRoute.GET as never, "GET", "/api/institutions/config");
    expect(res.body).toEqual({ configured: true, applicationId: "app_123", environment: "sandbox" });
  });

  it("starts empty", async () => {
    expect((await call(listRoute.GET as never, "GET", "/api/institutions")).body).toEqual([]);
  });

  it("POST connects: stores the enrollment and accounts, never returns the token", async () => {
    const res = await connect();
    expect(res.status).toBe(201);
    expect(mocked.listAccounts).toHaveBeenCalledWith("tok_secret");
    expect(res.body).toMatchObject({ id: "enr_1", name: "TD Bank" });
    expect(res.body.accounts.map((a) => a.name)).toEqual(["TD Checking", "TD Savings"]); // sorted by name
    expect(res.body.accounts[0]).toMatchObject({ lastFour: "1234", subtype: "checking" });
    expect(JSON.stringify(res.body)).not.toContain("tok_secret");

    const list = await call<InstitutionDTO[]>(listRoute.GET as never, "GET", "/api/institutions");
    expect(list.body).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain("tok_secret");
    expect((await testPrisma.bankEnrollment.findUniqueOrThrow({ where: { id: "enr_1" } })).accessToken).toBe("tok_secret");
  });

  it("connecting the same enrollment again replaces its accounts instead of duplicating", async () => {
    await connect();
    mocked.listAccounts.mockResolvedValue([ACCOUNTS[1]]);
    const res = await connect();
    expect(res.body.accounts).toHaveLength(1);
    expect(await testPrisma.bankEnrollment.count()).toBe(1);
    expect(await testPrisma.bankAccount.count()).toBe(1);
  });

  it("POST validates the body", async () => {
    const res = await call(listRoute.POST, "POST", "/api/institutions", { body: { accessToken: "" } });
    expectApiError(res, 400, "VALIDATION_ERROR", ["accessToken", "enrollmentId", "institutionName"]);
  });

  it("POST stores nothing when Teller rejects the token", async () => {
    mocked.listAccounts.mockRejectedValue(new ApiError(502, "UPSTREAM_ERROR", "The connection to this bank is no longer valid."));
    expectApiError(await connect(), 502, "UPSTREAM_ERROR");
    expect(await testPrisma.bankEnrollment.count()).toBe(0);
  });

  it("POST is rejected when Teller is not configured", async () => {
    mocked.isConfigured.mockReturnValue(false);
    expectApiError(await connect(), 400, "BAD_REQUEST");
  });

  it("GET /:id returns one institution, 404 otherwise", async () => {
    await connect();
    const ok = await call<InstitutionDTO>(itemRoute.GET, "GET", "/api/institutions/enr_1", { params: { id: "enr_1" } });
    expect(ok.body.name).toBe("TD Bank");
    expectApiError(await call(itemRoute.GET, "GET", "/api/institutions/nope", { params: { id: "nope" } }), 404, "NOT_FOUND");
  });
});

describe("institution transactions", () => {
  const get = (query: string, id = "enr_1") =>
    call<BankTransactionsResponse>(txRoute.GET, "GET", `/api/institutions/${id}/transactions?${query}`, { params: { id } });

  beforeEach(async () => {
    await connect();
  });

  it("fetches live from Teller with the stored token and maps to signed cents", async () => {
    mocked.listTransactions.mockResolvedValue([
      tx(2, { amount: "2500.00", details: { category: "income", counterparty: { name: "ACME PAYROLL" } } }),
      tx(1, { amount: "-12.34", status: "pending" }),
    ]);
    const res = await get("accountId=acc_1");
    expect(res.status).toBe(200);
    expect(mocked.listTransactions).toHaveBeenCalledWith("tok_secret", "acc_1", { count: 50, fromId: undefined });
    expect(res.body.hasMore).toBe(false);
    expect(res.body.transactions).toEqual([
      expect.objectContaining({ id: "txn_2", amountCents: 250000, counterparty: "ACME PAYROLL", category: "income", pending: false }),
      expect.objectContaining({ id: "txn_1", amountCents: -1234, pending: true }),
    ]);
    // Live only: no transaction table exists, and the token is never returned.
    expect(JSON.stringify(res.body)).not.toContain("tok_secret");
  });

  it("pages back with fromId and reports hasMore for a full page", async () => {
    mocked.listTransactions.mockResolvedValue(Array.from({ length: 50 }, (_, i) => tx(100 - i)));
    const first = await get("accountId=acc_1");
    expect(first.body.hasMore).toBe(true);

    mocked.listTransactions.mockResolvedValue([tx(50), tx(49)]);
    const next = await get("accountId=acc_1&fromId=txn_51");
    expect(mocked.listTransactions).toHaveBeenLastCalledWith("tok_secret", "acc_1", { count: 50, fromId: "txn_51" });
    expect(next.body.hasMore).toBe(false);
    expect(next.body.transactions.map((t) => t.id)).toEqual(["txn_50", "txn_49"]);
  });

  it("requires an account that belongs to the institution", async () => {
    expectApiError(await get(""), 400, "VALIDATION_ERROR", ["accountId"]);
    expectApiError(await get("accountId=acc_other"), 404, "NOT_FOUND");
    expectApiError(await get("accountId=acc_1", "nope"), 404, "NOT_FOUND");
    expect(mocked.listTransactions).not.toHaveBeenCalled();
  });

  it("passes through a clear message when the enrollment is disconnected", async () => {
    mocked.listTransactions.mockRejectedValue(
      new ApiError(502, "UPSTREAM_ERROR", "The bank login details changed. Remove this institution and add it again to reconnect."),
    );
    const res = await get("accountId=acc_1");
    expectApiError(res, 502, "UPSTREAM_ERROR");
    expect((res.body as unknown as { error: { message: string } }).error.message).toMatch(/Remove this institution/);
  });
});

describe("removing institutions", () => {
  const remove = () => call(itemRoute.DELETE, "DELETE", "/api/institutions/enr_1", { params: { id: "enr_1" } });

  it("revokes at Teller, then deletes the institution and its accounts", async () => {
    await connect();
    const res = await remove();
    expect(res.status).toBe(204);
    expect(mocked.revokeEnrollment).toHaveBeenCalledWith("tok_secret");
    expect(await testPrisma.bankEnrollment.count()).toBe(0);
    expect(await testPrisma.bankAccount.count()).toBe(0);
  });

  it("still removes locally when Teller fails or the token is already invalid", async () => {
    await connect();
    mocked.revokeEnrollment.mockRejectedValue(new ApiError(502, "UPSTREAM_ERROR", "down"));
    expect((await remove()).status).toBe(204);
    expect(await testPrisma.bankEnrollment.count()).toBe(0);
  });

  it("404s for an unknown institution", async () => {
    expectApiError(await remove(), 404, "NOT_FOUND");
    expect(mocked.revokeEnrollment).not.toHaveBeenCalled();
  });

  it("clear all data revokes every enrollment (best effort) and deletes the bank rows", async () => {
    await connect();
    mocked.revokeEnrollment.mockRejectedValue(new ApiError(502, "UPSTREAM_ERROR", "down"));
    const res = await call(resetRoute.POST as never, "POST", "/api/data/reset");
    expect(res.status).toBe(200);
    expect(mocked.revokeEnrollment).toHaveBeenCalledWith("tok_secret");
    expect(await testPrisma.bankEnrollment.count()).toBe(0);
    expect(await testPrisma.bankAccount.count()).toBe(0);
  });
});
