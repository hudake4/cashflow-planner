import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as resetRoute from "@/app/api/data/reset/route";
import * as listRoute from "@/app/api/institutions/route";
import * as itemRoute from "@/app/api/institutions/[id]/route";
import * as syncRoute from "@/app/api/institutions/[id]/sync/route";
import * as kindRoute from "@/app/api/institutions/[id]/accounts/[accountId]/route";
import * as txRoute from "@/app/api/institutions/[id]/transactions/route";
import type { BankAccountDTO, BankTransactionsResponse, InstitutionDTO, InstitutionSyncDTO } from "@/contracts/api";
import { ApiError } from "@/server/http";
import { connect, syncConnection } from "@/server/repositories/institutions";
import * as simplefin from "@/server/simplefin";
import { normalizeAccountSet, type AccountSet } from "@/server/simplefin-mapping";
import { call, expectApiError } from "../helpers/api";
import { testPrisma } from "../setup/integration-setup";

vi.mock("@/server/simplefin", () => ({
  claimSetupToken: vi.fn(),
  fetchAccountSet: vi.fn(),
}));
const mocked = vi.mocked(simplefin);

const SECRET_PASSWORD = "sup3rs3cretpw";
const ACCESS_URL = `https://demouser:${SECRET_PASSWORD}@bridge.simplefin.org/simplefin`;
const SETUP_TOKEN = "SETUPTOKENVALUE123";
const NOW = new Date("2026-10-24T15:00:00Z");
const MIN = 60_000;

/** Epoch seconds for noon UTC on a YYYY-MM-DD date. */
const ep = (date: string) => Date.parse(`${date}T12:00:00Z`) / 1000;

interface RawTx {
  id: string;
  posted: number;
  amount: string;
  description: string;
  pending?: boolean;
}

function accountSet(
  txs: RawTx[],
  { errlist = [], accounts = [] }: { errlist?: unknown[]; accounts?: unknown[] } = {},
): AccountSet {
  return normalizeAccountSet(
    {
      errlist,
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
          transactions: txs,
        },
        ...accounts,
      ],
    },
    "2026-10-24",
  );
}

const tx = (id: string, date: string, amount: string, over: Partial<RawTx> = {}): RawTx => ({
  id,
  posted: ep(date),
  amount,
  description: `Tx ${id}`,
  ...over,
});

const FIRST = [
  tx("t1", "2026-10-20", "-12.34"),
  tx("t2", "2026-10-10", "2500.00", { description: "Payroll" }),
  tx("t5", "2026-10-23", "-3.00", { pending: true, posted: 0 }),
];

const postConnect = (setupToken = SETUP_TOKEN) =>
  call<InstitutionSyncDTO>(listRoute.POST, "POST", "/api/institutions", { body: { setupToken } });
const postSync = (id: string) => call<InstitutionSyncDTO>(syncRoute.POST, "POST", `/api/institutions/${id}/sync`, { params: { id } });
const getTx = (id: string, query: string) =>
  call<BankTransactionsResponse>(txRoute.GET, "GET", `/api/institutions/${id}/transactions?${query}`, { params: { id } });

beforeEach(() => {
  // Freeze "today": the history window is relative to it, and the fixtures use fixed dates.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.resetAllMocks();
  mocked.claimSetupToken.mockResolvedValue(ACCESS_URL);
  mocked.fetchAccountSet.mockResolvedValue(accountSet(FIRST));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("connecting", () => {
  it("starts empty", async () => {
    expect((await call(listRoute.GET as never, "GET", "/api/institutions")).body).toEqual([]);
  });

  it("claims the token, stores accounts and transactions with signed cents, and never returns the access URL", async () => {
    const res = await postConnect();
    expect(res.status).toBe(201);
    expect(mocked.claimSetupToken).toHaveBeenCalledWith(SETUP_TOKEN);
    expect(res.body).toMatchObject({ name: "Demo Bank", warnings: [], lastSyncedAt: expect.any(String) });
    expect(res.body.accounts).toEqual([
      {
        id: `${res.body.id}:a1`,
        name: "Checking",
        institutionName: "Demo Bank",
        kind: "BANK",
        currency: "USD",
        balanceCents: 123456,
        availableBalanceCents: 100000,
        balanceDate: "2026-10-24",
      },
    ]);

    // The first sync asks for pending transactions in a window of at most 90 days.
    const [accessUrl, opts] = mocked.fetchAccountSet.mock.calls[0];
    expect(accessUrl).toBe(ACCESS_URL);
    expect(opts.pending).toBe(true);
    expect(opts.end.getTime() - opts.start.getTime()).toBeLessThanOrEqual(90 * 86_400_000);

    const rows = await testPrisma.bankTransaction.findMany({ orderBy: { id: "asc" } });
    expect(rows.map((r) => [r.id.split(":").pop(), r.date, r.amountCents, r.pending])).toEqual([
      ["t1", "2026-10-20", -1234, false],
      ["t2", "2026-10-10", 250000, false],
      ["t5", "2026-10-24", -300, true], // pending without a posted time uses the sync date
    ]);
    // The credentials are stored, but only server-side.
    expect((await testPrisma.bankConnection.findUniqueOrThrow({ where: { id: res.body.id } })).accessUrl).toBe(ACCESS_URL);

    const list = await call<InstitutionDTO[]>(listRoute.GET as never, "GET", "/api/institutions");
    expect(list.body).toHaveLength(1);
    expect(list.body[0].accounts).toHaveLength(1);
    expect(mocked.fetchAccountSet).toHaveBeenCalledTimes(1); // listing never calls SimpleFIN
  });

  it("validates the body", async () => {
    expectApiError(await call(listRoute.POST, "POST", "/api/institutions", { body: { setupToken: "  " } }), 400, "VALIDATION_ERROR", ["setupToken"]);
    expectApiError(await call(listRoute.POST, "POST", "/api/institutions", { body: {} }), 400, "VALIDATION_ERROR", ["setupToken"]);
    expectApiError(
      await call(listRoute.POST, "POST", "/api/institutions", { body: { setupToken: "x".repeat(2001) } }),
      400,
      "VALIDATION_ERROR",
      ["setupToken"],
    );
    expect(mocked.claimSetupToken).not.toHaveBeenCalled();
  });

  it("stores nothing when the claim fails", async () => {
    mocked.claimSetupToken.mockRejectedValue(new ApiError(400, "BAD_REQUEST", "That setup token is invalid or has already been used."));
    expectApiError(await postConnect(), 400, "BAD_REQUEST");
    expect(await testPrisma.bankConnection.count()).toBe(0);
    expect(mocked.fetchAccountSet).not.toHaveBeenCalled();
  });

  it("keeps the connection when the claim succeeds but the first sync fails (the token cannot be claimed again)", async () => {
    mocked.fetchAccountSet.mockRejectedValueOnce(new ApiError(502, "UPSTREAM_ERROR", "SimpleFIN Bridge is unavailable (HTTP 500). Try again later."));
    const res = await postConnect();
    expect(res.status).toBe(201);
    expect(res.body.lastSyncedAt).toBeNull();
    expect(res.body.accounts).toEqual([]);
    expect(res.body.name).toBe("SimpleFIN connection");
    expect(res.body.warnings).toHaveLength(1);
    expect(res.body.warnings[0]).toMatch(/first sync failed.*unavailable.*Refresh/);
    expect(await testPrisma.bankConnection.count()).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain(SECRET_PASSWORD);

    // Refresh works right away (nothing synced yet, so no 15 minute wait) and fills in the data.
    const retry = await postSync(res.body.id);
    expect(retry.status).toBe(200);
    expect(retry.body.accounts).toHaveLength(1);
    expect(retry.body.lastSyncedAt).not.toBeNull();
    expect(mocked.claimSetupToken).toHaveBeenCalledTimes(1);
  });

  it("an unexpected error in the first sync also keeps the connection", async () => {
    mocked.fetchAccountSet.mockRejectedValueOnce(new Error(`kaboom ${ACCESS_URL}`));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await postConnect();
    spy.mockRestore();
    expect(res.status).toBe(201);
    expect(res.body.warnings[0]).toMatch(/unexpected error/);
    expect(JSON.stringify(res.body)).not.toMatch(/kaboom|sup3rs3cretpw/);
    expect(await testPrisma.bankConnection.count()).toBe(1);
  });

  it("surfaces SimpleFIN notices as warnings", async () => {
    mocked.fetchAccountSet.mockResolvedValue(
      accountSet(FIRST, { errlist: [{ code: "gen.auth", msg: "Hello from <b>SimpleFIN</b>" }] }),
    );
    const res = await postConnect();
    expect(res.body.warnings).toEqual(["Hello from <b>SimpleFIN</b>"]); // plain text; React escapes it
  });
});

describe("syncing", () => {
  it("replaces the window without duplicating, drops stale pending rows, and keeps older history", async () => {
    const first = await connect({ setupToken: SETUP_TOKEN }, NOW);
    const acc = `${first.id}:a1`;
    const later = new Date(NOW.getTime() + 60 * MIN);

    mocked.fetchAccountSet.mockResolvedValueOnce(
      accountSet([
        // t1 is gone (the bank dropped it), t5 posted for real, t4 is new, t2 is outside the window.
        tx("t5", "2026-10-23", "-3.00"),
        tx("t4", "2026-10-24", "-7.77"),
        tx("t6", "2026-10-24", "-1.00", { pending: true, posted: 0 }),
      ]),
    );
    const synced = await syncConnection(first.id, later);

    const [, opts] = mocked.fetchAccountSet.mock.calls[1];
    expect(opts.start.toISOString()).toBe("2026-10-17T00:00:00.000Z"); // 7 days before the last sync, UTC midnight
    expect(opts.end.getTime()).toBe(later.getTime() + 86_400_000);

    const rows = await testPrisma.bankTransaction.findMany({ where: { accountId: acc }, orderBy: [{ date: "desc" }, { id: "desc" }] });
    expect(rows.map((r) => [r.id.slice(acc.length + 1), r.date, r.amountCents, r.pending])).toEqual([
      ["t6", "2026-10-24", -100, true],
      ["t4", "2026-10-24", -777, false],
      ["t5", "2026-10-23", -300, false], // was pending, now posted: one row, not two
      ["t2", "2026-10-10", 250000, false], // before the window: kept
    ]);
    expect(await testPrisma.bankAccount.count()).toBe(1);
    expect(synced.lastSyncedAt).toBe(later.toISOString());
    expect(synced.warnings).toEqual([]);

    // Syncing the identical data again later changes nothing and never duplicates.
    mocked.fetchAccountSet.mockResolvedValueOnce(
      accountSet([tx("t5", "2026-10-23", "-3.00"), tx("t4", "2026-10-24", "-7.77"), tx("t6", "2026-10-24", "-1.00", { pending: true, posted: 0 })]),
    );
    await syncConnection(first.id, new Date(later.getTime() + 60 * MIN));
    expect(await testPrisma.bankTransaction.count({ where: { accountId: acc } })).toBe(4);
  });

  it("prunes stored transactions older than 89 days, whatever the bank returns", async () => {
    // 2026-07-28 is the oldest day inside the window on 2026-10-24 (89 days, counting today).
    mocked.fetchAccountSet.mockResolvedValue(
      accountSet([tx("old", "2026-07-27", "-1.00"), tx("edge", "2026-07-28", "-2.00"), tx("new", "2026-10-20", "-3.00")]),
    );
    const first = await connect({ setupToken: SETUP_TOKEN }, NOW);
    const acc = `${first.id}:a1`;
    let ids = (await testPrisma.bankTransaction.findMany({ where: { accountId: acc } })).map((r) => r.id.slice(acc.length + 1)).sort();
    expect(ids).toEqual(["edge", "new"]);

    // Rows that age out between syncs are removed on the next sync, even outside the fetched window.
    mocked.fetchAccountSet.mockResolvedValue(accountSet([tx("new", "2026-10-20", "-3.00")]));
    await syncConnection(first.id, new Date(NOW.getTime() + 2 * 86_400_000));
    ids = (await testPrisma.bankTransaction.findMany({ where: { accountId: acc } })).map((r) => r.id.slice(acc.length + 1)).sort();
    expect(ids).toEqual(["new"]);
  });
  it("updates the balance of an existing account", async () => {
    const first = await connect({ setupToken: SETUP_TOKEN }, NOW);
    mocked.fetchAccountSet.mockResolvedValueOnce(
      normalizeAccountSet(
        { accounts: [{ id: "a1", name: "Checking Renamed", conn_id: "c1", balance: "-20.05", "balance-date": ep("2026-10-25"), transactions: [] }] },
        "2026-10-25",
      ),
    );
    const synced = await syncConnection(first.id, new Date(NOW.getTime() + 20 * MIN));
    expect(synced.accounts).toHaveLength(1);
    expect(synced.accounts[0]).toMatchObject({ name: "Checking Renamed", balanceCents: -2005, availableBalanceCents: null, balanceDate: "2026-10-25" });
  });

  it("enforces a 15 minute minimum between syncs with 409 CONFLICT", async () => {
    const first = await connect({ setupToken: SETUP_TOKEN }, NOW);
    expect(mocked.fetchAccountSet).toHaveBeenCalledTimes(1);

    await expect(syncConnection(first.id, new Date(NOW.getTime() + 14 * MIN))).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
    expect(mocked.fetchAccountSet).toHaveBeenCalledTimes(1); // rejected before any request

    await expect(syncConnection(first.id, new Date(NOW.getTime() + 15 * MIN))).resolves.toMatchObject({ id: first.id });
    expect(mocked.fetchAccountSet).toHaveBeenCalledTimes(2);
  });

  it("POST /:id/sync returns 409 right after connecting, then works once 15 minutes have passed", async () => {
    const created = await postConnect();
    const tooSoon = await postSync(created.body.id);
    expectApiError(tooSoon, 409, "CONFLICT");
    expect((tooSoon.body as unknown as { error: { message: string } }).error.message).toMatch(/minute/);

    await testPrisma.bankConnection.update({
      where: { id: created.body.id },
      data: { lastSyncedAt: new Date(Date.now() - 20 * MIN) },
    });
    const ok = await postSync(created.body.id);
    expect(ok.status).toBe(200);
    expect(ok.body.warnings).toEqual([]);
    expect(JSON.stringify(ok.body)).not.toContain(SECRET_PASSWORD);
  });

  it("a failed fetch changes nothing and leaves lastSyncedAt alone so the user can retry", async () => {
    const first = await connect({ setupToken: SETUP_TOKEN }, NOW);
    const before = await testPrisma.bankConnection.findUniqueOrThrow({ where: { id: first.id } });
    mocked.fetchAccountSet.mockRejectedValueOnce(new ApiError(502, "UPSTREAM_ERROR", "SimpleFIN access was revoked or is invalid. Remove this connection and add a new setup token."));

    const res = await syncConnection(first.id, new Date(NOW.getTime() + 30 * MIN)).catch((e: unknown) => e);
    expect(res).toMatchObject({ status: 502, code: "UPSTREAM_ERROR" });
    const after = await testPrisma.bankConnection.findUniqueOrThrow({ where: { id: first.id } });
    expect(after.lastSyncedAt).toEqual(before.lastSyncedAt);
    expect(await testPrisma.bankTransaction.count()).toBe(3);
  });

  it("an error reported for an account keeps its stored transactions", async () => {
    const first = await connect({ setupToken: SETUP_TOKEN }, NOW);
    mocked.fetchAccountSet.mockResolvedValueOnce(
      accountSet([], { errlist: [{ code: "con.auth", msg: "Please re-authenticate at your bank", conn_id: "c1" }] }),
    );
    const synced = await syncConnection(first.id, new Date(NOW.getTime() + 30 * MIN));
    expect(synced.warnings).toEqual(["Please re-authenticate at your bank"]);
    expect(await testPrisma.bankTransaction.count()).toBe(3);
  });

  it("404s for an unknown connection", async () => {
    expectApiError(await postSync("nope"), 404, "NOT_FOUND");
  });

  it("refuses overlapping syncs of one connection", async () => {
    const first = await connect({ setupToken: SETUP_TOKEN }, NOW);
    let release!: () => void;
    mocked.fetchAccountSet.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve(accountSet(FIRST)))));
    const running = syncConnection(first.id, new Date(NOW.getTime() + 30 * MIN));
    await vi.waitFor(() => expect(mocked.fetchAccountSet).toHaveBeenCalledTimes(2));
    await expect(syncConnection(first.id, new Date(NOW.getTime() + 31 * MIN))).rejects.toMatchObject({ status: 409 });
    release();
    await running;
  });
});

describe("account labels", () => {
  const rawAccount = (id: string, name: string) => ({
    id,
    name,
    conn_id: "c1",
    currency: "USD",
    balance: "-250.00",
    "balance-date": ep("2026-10-24"),
    transactions: [],
  });
  const patchKind = (connId: string, accountId: string, body: unknown) =>
    call<BankAccountDTO>(kindRoute.PATCH, "PATCH", `/api/institutions/${connId}/accounts/${accountId}`, {
      params: { id: connId, accountId },
      body,
    });

  it("labels new accounts from their name and lets the user change the label", async () => {
    mocked.fetchAccountSet.mockResolvedValue(
      accountSet(FIRST, { accounts: [rawAccount("a2", "Chase Credit Card"), rawAccount("a3", "Auto Loan")] }),
    );
    const created = await postConnect();
    const kinds = Object.fromEntries(created.body.accounts.map((a) => [a.name, a.kind]));
    expect(kinds).toEqual({ Checking: "BANK", "Chase Credit Card": "CREDIT", "Auto Loan": "LOAN" });

    const acc = `${created.body.id}:a1`;
    const res = await patchKind(created.body.id, acc, { kind: "OTHER" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: acc,
      name: "Checking",
      institutionName: "Demo Bank",
      kind: "OTHER",
      currency: "USD",
      balanceCents: 123456,
      availableBalanceCents: 100000,
      balanceDate: "2026-10-24",
    });
    expect((await testPrisma.bankAccount.findUniqueOrThrow({ where: { id: acc } })).kind).toBe("OTHER");
    const list = await call<InstitutionDTO[]>(listRoute.GET as never, "GET", "/api/institutions");
    expect(list.body[0].accounts.find((a) => a.id === acc)?.kind).toBe("OTHER");
  });

  it("a sync never overwrites the user's label, but labels accounts it sees for the first time", async () => {
    const first = await connect({ setupToken: SETUP_TOKEN }, NOW);
    const acc = `${first.id}:a1`;
    expect((await patchKind(first.id, acc, { kind: "CREDIT" })).body.kind).toBe("CREDIT");

    // Same account again (now with a credit-card-like name) plus a new credit card.
    mocked.fetchAccountSet.mockResolvedValueOnce(
      normalizeAccountSet(
        {
          accounts: [
            { id: "a1", name: "Checking", conn_id: "c1", balance: "1.00", "balance-date": ep("2026-10-24"), transactions: [] },
            rawAccount("a9", "Rewards Credit Card"),
          ],
        },
        "2026-10-24",
      ),
    );
    const synced = await syncConnection(first.id, new Date(NOW.getTime() + 20 * MIN));
    expect(Object.fromEntries(synced.accounts.map((a) => [a.id.split(":").pop(), a.kind]))).toEqual({ a1: "CREDIT", a9: "CREDIT" });

    // The name still looks like a credit card, but the user's BANK label stays.
    await patchKind(first.id, `${first.id}:a9`, { kind: "BANK" });
    mocked.fetchAccountSet.mockResolvedValueOnce(
      normalizeAccountSet({ accounts: [rawAccount("a9", "Rewards Credit Card")] }, "2026-10-24"),
    );
    const again = await syncConnection(first.id, new Date(NOW.getTime() + 40 * MIN));
    expect(again.accounts.find((a) => a.id.endsWith(":a9"))?.kind).toBe("BANK");
  });

  it.each([{ kind: "CHECKING" }, { kind: "bank" }, { kind: 1 }, {}, { kind: null }])("400 VALIDATION_ERROR for %j", async (body) => {
    const first = await connect({ setupToken: SETUP_TOKEN }, NOW);
    const acc = `${first.id}:a1`;
    expectApiError(await patchKind(first.id, acc, body), 400, "VALIDATION_ERROR", ["kind"]);
    expect((await testPrisma.bankAccount.findUniqueOrThrow({ where: { id: acc } })).kind).toBe("BANK");
  });

  it("400 BAD_REQUEST for malformed JSON", async () => {
    const first = await connect({ setupToken: SETUP_TOKEN }, NOW);
    expectApiError(await patchKind(first.id, `${first.id}:a1`, "{not json"), 400, "BAD_REQUEST");
  });

  it("404s for an unknown account, an unknown connection, and an account of another connection", async () => {
    const first = await connect({ setupToken: SETUP_TOKEN }, NOW);
    const acc = `${first.id}:a1`;
    expectApiError(await patchKind(first.id, "missing", { kind: "LOAN" }), 404, "NOT_FOUND");
    expectApiError(await patchKind("nope", acc, { kind: "LOAN" }), 404, "NOT_FOUND");

    const other = await testPrisma.bankConnection.create({ data: { accessUrl: "https://u:p@bridge.simplefin.org/simplefin" } });
    const foreign = `${other.id}:z`;
    await testPrisma.bankAccount.create({
      data: {
        id: foreign, connectionId: other.id, providerAccountId: "z", institutionName: "X", name: "Z",
        currency: "USD", balanceCents: 0, balanceDate: "2026-10-24",
      },
    });
    expectApiError(await patchKind(first.id, foreign, { kind: "LOAN" }), 404, "NOT_FOUND");
    expect((await testPrisma.bankAccount.findUniqueOrThrow({ where: { id: foreign } })).kind).toBe("BANK");
  });
});

describe("transactions", () => {
  async function connectMany(count: number) {
    const many = Array.from({ length: count }, (_, i) => {
      const day = String(1 + (i % 28)).padStart(2, "0");
      return tx(`m${String(i).padStart(3, "0")}`, `2026-09-${day}`, i % 2 ? "-1.00" : "1.00");
    });
    mocked.fetchAccountSet.mockResolvedValue(accountSet(many));
    return postConnect();
  }

  it("pages newest first by date then id, 50 per page, with hasMore", async () => {
    const created = await connectMany(120);
    const acc = created.body.accounts[0].id;

    const p1 = await getTx(created.body.id, `accountId=${encodeURIComponent(acc)}`);
    expect(p1.status).toBe(200);
    expect(p1.body.transactions).toHaveLength(50);
    expect(p1.body.hasMore).toBe(true);
    const keys = p1.body.transactions.map((t) => `${t.date}|${t.id}`);
    expect(keys).toEqual([...keys].sort().reverse());
    expect(p1.body.transactions[0]).toEqual(
      expect.objectContaining({ accountId: acc, pending: false, amountCents: expect.any(Number), description: expect.stringMatching(/^Tx m/) }),
    );

    const p2 = await getTx(created.body.id, `accountId=${encodeURIComponent(acc)}&offset=50`);
    const p3 = await getTx(created.body.id, `accountId=${encodeURIComponent(acc)}&offset=100`);
    expect(p2.body).toMatchObject({ hasMore: true });
    expect(p3.body.transactions).toHaveLength(20);
    expect(p3.body.hasMore).toBe(false);

    const all = [...p1.body.transactions, ...p2.body.transactions, ...p3.body.transactions];
    expect(new Set(all.map((t) => t.id)).size).toBe(120); // no overlap between pages
    const beyond = await getTx(created.body.id, `accountId=${encodeURIComponent(acc)}&offset=500`);
    expect(beyond.body).toEqual({ transactions: [], hasMore: false });
  });

  it("returns exactly one full page without hasMore", async () => {
    const created = await connectMany(50);
    const res = await getTx(created.body.id, `accountId=${encodeURIComponent(created.body.accounts[0].id)}`);
    expect(res.body.transactions).toHaveLength(50);
    expect(res.body.hasMore).toBe(false);
  });

  it("only lists the last 89 days, even for rows already stored", async () => {
    const created = await postConnect();
    const acc = created.body.accounts[0].id;
    await testPrisma.bankTransaction.createMany({
      data: [
        { id: `${acc}:old`, accountId: acc, date: "2026-07-27", amountCents: -100, description: "Too old", pending: false },
        { id: `${acc}:edge`, accountId: acc, date: "2026-07-28", amountCents: -200, description: "Oldest shown", pending: false },
      ],
    });
    const res = await getTx(created.body.id, `accountId=${encodeURIComponent(acc)}`);
    const descriptions = res.body.transactions.map((t) => t.description);
    expect(descriptions).toContain("Oldest shown");
    expect(descriptions).not.toContain("Too old");
  });
  it("validates the query and 404s for foreign or unknown accounts and connections", async () => {
    const created = await postConnect();
    const acc = created.body.accounts[0].id;
    expectApiError(await getTx(created.body.id, ""), 400, "VALIDATION_ERROR", ["accountId"]);
    expectApiError(await getTx(created.body.id, `accountId=${encodeURIComponent(acc)}&offset=-1`), 400, "VALIDATION_ERROR", ["offset"]);
    expectApiError(await getTx(created.body.id, `accountId=${encodeURIComponent(acc)}&offset=abc`), 400, "VALIDATION_ERROR", ["offset"]);
    expectApiError(await getTx(created.body.id, "accountId=someone-elses-account"), 404, "NOT_FOUND");
    expectApiError(await getTx("nope", `accountId=${encodeURIComponent(acc)}`), 404, "NOT_FOUND");

    // An account of a different connection is "not part of this connection".
    const other = await testPrisma.bankConnection.create({ data: { accessUrl: "https://u:p@bridge.simplefin.org/simplefin" } });
    await testPrisma.bankAccount.create({
      data: {
        id: `${other.id}:z`, connectionId: other.id, providerAccountId: "z", institutionName: "X", name: "Z",
        currency: "USD", balanceCents: 0, balanceDate: "2026-10-24",
      },
    });
    expectApiError(await getTx(created.body.id, `accountId=${encodeURIComponent(`${other.id}:z`)}`), 404, "NOT_FOUND");
  });
});

describe("removing", () => {
  const remove = (id: string) => call(itemRoute.DELETE, "DELETE", `/api/institutions/${id}`, { params: { id } });

  it("deletes the connection, its accounts and its transactions locally (no SimpleFIN call)", async () => {
    const created = await postConnect();
    expect(await testPrisma.bankTransaction.count()).toBe(3);
    const res = await remove(created.body.id);
    expect(res.status).toBe(204);
    expect(await testPrisma.bankConnection.count()).toBe(0);
    expect(await testPrisma.bankAccount.count()).toBe(0);
    expect(await testPrisma.bankTransaction.count()).toBe(0);
    expect(mocked.claimSetupToken).toHaveBeenCalledTimes(1);
    expect(mocked.fetchAccountSet).toHaveBeenCalledTimes(1);
  });

  it("404s for an unknown connection and leaves others alone", async () => {
    const created = await postConnect();
    expectApiError(await remove("nope"), 404, "NOT_FOUND");
    expect(await testPrisma.bankConnection.count()).toBe(1);
    expect((await call<InstitutionDTO[]>(listRoute.GET as never, "GET", "/api/institutions")).body[0].id).toBe(created.body.id);
  });

  it("clear all data removes bank connections too", async () => {
    await postConnect();
    const res = await call(resetRoute.POST as never, "POST", "/api/data/reset");
    expect(res.status).toBe(200);
    expect(await testPrisma.bankConnection.count()).toBe(0);
    expect(await testPrisma.bankAccount.count()).toBe(0);
    expect(await testPrisma.bankTransaction.count()).toBe(0);
  });
});

describe("secrets", () => {
  it("no API response ever contains the access URL, its password, or the setup token", async () => {
    const created = await postConnect();
    const id = created.body.id;
    const acc = created.body.accounts[0].id;
    await testPrisma.bankConnection.update({ where: { id }, data: { lastSyncedAt: new Date(Date.now() - 30 * MIN) } });

    const responses = [
      created,
      await call(listRoute.GET as never, "GET", "/api/institutions"),
      await postSync(id),
      await getTx(id, `accountId=${encodeURIComponent(acc)}`),
      await postSync(id), // 409
      await getTx(id, "accountId=missing"), // 404
      await call(listRoute.POST, "POST", "/api/institutions", { body: { setupToken: "" } }), // 400
    ];
    mocked.fetchAccountSet.mockRejectedValueOnce(new Error(`boom ${ACCESS_URL}`));
    await testPrisma.bankConnection.update({ where: { id }, data: { lastSyncedAt: new Date(Date.now() - 30 * MIN) } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    responses.push(await postSync(id)); // unexpected error -> generic 500
    spy.mockRestore();

    const serialized = JSON.stringify(responses);
    expect(serialized).not.toContain(SECRET_PASSWORD);
    expect(serialized).not.toContain("demouser");
    expect(serialized).not.toContain(SETUP_TOKEN);
    expect(serialized).not.toMatch(/accessUrl|bridge\.simplefin\.org/i);
    expect(responses.at(-1)?.status).toBe(500);
  });
});

describe("encryption at rest", () => {
  const g = globalThis as { __cashflowOsKeystore?: unknown };
  // Stand-in for Electron's safeStorage: reversible and opaque, like DPAPI output.
  const fakeKeystore = {
    isAvailable: () => true,
    encrypt: (plain: string) => Buffer.from(`sealed:${plain}`, "utf8").reverse(),
    decrypt: (sealed: Buffer) => Buffer.from(sealed).reverse().toString("utf8").replace(/^sealed:/, ""),
  };
  const storedUrl = async (id: string) => (await testPrisma.bankConnection.findUniqueOrThrow({ where: { id } })).accessUrl;
  const staleSync = (id: string) =>
    testPrisma.bankConnection.update({ where: { id }, data: { lastSyncedAt: new Date(Date.now() - 30 * MIN) } });

  afterEach(() => {
    delete g.__cashflowOsKeystore;
    delete process.env.CASHFLOW_SECRET_KEY;
  });

  it("stores the Access URL encrypted when the desktop keystore is registered, and still syncs with the plain URL", async () => {
    g.__cashflowOsKeystore = fakeKeystore;
    const res = await postConnect();
    const stored = await storedUrl(res.body.id);
    expect(stored.startsWith("enc:v1:os:")).toBe(true);
    expect(stored).not.toContain(SECRET_PASSWORD);
    expect(stored).not.toContain("bridge.simplefin.org");
    expect(mocked.fetchAccountSet.mock.calls[0][0]).toBe(ACCESS_URL);

    await staleSync(res.body.id);
    expect((await postSync(res.body.id)).status).toBe(200);
    expect(mocked.fetchAccountSet.mock.calls[1][0]).toBe(ACCESS_URL);
  });

  it("stores plaintext when there is no keystore and no CASHFLOW_SECRET_KEY (plain dev/prod server)", async () => {
    const res = await postConnect();
    expect(await storedUrl(res.body.id)).toBe(ACCESS_URL);
  });

  it("encrypts with CASHFLOW_SECRET_KEY on the plain server", async () => {
    process.env.CASHFLOW_SECRET_KEY = Buffer.alloc(32, 7).toString("base64");
    const res = await postConnect();
    const stored = await storedUrl(res.body.id);
    expect(stored.startsWith("enc:v1:key:")).toBe(true);
    expect(stored).not.toContain(SECRET_PASSWORD);
    await staleSync(res.body.id);
    expect((await postSync(res.body.id)).status).toBe(200);
    expect(mocked.fetchAccountSet.mock.calls[1][0]).toBe(ACCESS_URL);
  });

  it("keeps reading a legacy plaintext row and upgrades it in place on the next sync", async () => {
    const legacy = await testPrisma.bankConnection.create({ data: { accessUrl: ACCESS_URL } });
    g.__cashflowOsKeystore = fakeKeystore;
    expect((await postSync(legacy.id)).status).toBe(200);
    expect(mocked.fetchAccountSet.mock.calls[0][0]).toBe(ACCESS_URL);
    const stored = await storedUrl(legacy.id);
    expect(stored.startsWith("enc:v1:os:")).toBe(true);
    expect(stored).not.toContain(SECRET_PASSWORD);
  });

  it("leaves a legacy plaintext row untouched when nothing can encrypt it", async () => {
    const legacy = await testPrisma.bankConnection.create({ data: { accessUrl: ACCESS_URL } });
    expect((await postSync(legacy.id)).status).toBe(200);
    expect(await storedUrl(legacy.id)).toBe(ACCESS_URL);
  });

  it("explains, without leaking anything, when an encrypted value cannot be decrypted here", async () => {
    g.__cashflowOsKeystore = fakeKeystore;
    const res = await postConnect();
    delete g.__cashflowOsKeystore; // e.g. the database was restored into a plain server
    await staleSync(res.body.id);
    const failed = await postSync(res.body.id);
    expectApiError(failed, 409, "CONFLICT");
    expect(JSON.stringify(failed.body)).not.toMatch(/enc:v1|demouser|bridge\.simplefin\.org/i);
    expect(JSON.stringify(failed.body)).toMatch(/connect again/i);
    expect(mocked.fetchAccountSet).toHaveBeenCalledTimes(1); // only the connect sync
  });

  it("no API response contains the Access URL or its stored ciphertext when encryption is on", async () => {
    g.__cashflowOsKeystore = fakeKeystore;
    const created = await postConnect();
    const id = created.body.id;
    const ciphertext = await storedUrl(id);
    await staleSync(id);
    const responses = [
      created,
      await call(listRoute.GET as never, "GET", "/api/institutions"),
      await postSync(id),
      await getTx(id, `accountId=${encodeURIComponent(created.body.accounts[0].id)}`),
    ];
    const serialized = JSON.stringify(responses);
    expect(serialized).not.toContain(ciphertext);
    expect(serialized).not.toContain(SECRET_PASSWORD);
    expect(serialized).not.toMatch(/enc:v1|accessUrl|bridge\.simplefin\.org/i);
  });
});
