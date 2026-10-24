import { describe, expect, it } from "vitest";
import {
  buildAccountsUrl,
  decodeSetupToken,
  epochToDate,
  isSimplefinHost,
  isValidAccessUrl,
  mapHttpFailure,
  normalizeAccountSet,
  normalizeCurrency,
  parseAccessUrl,
  parseSignedDecimalToCents,
  planSyncWindow,
} from "@/server/simplefin-mapping";
import { ApiError } from "@/server/http";

const token = (url: string) => Buffer.from(url, "utf8").toString("base64");
const DEMO_TOKEN = "aHR0cHM6Ly9icmlkZ2Uuc2ltcGxlZmluLm9yZy9zaW1wbGVmaW4vY2xhaW0vZGVtbw==";

describe("parseSignedDecimalToCents", () => {
  it.each([
    ["-12.34", -1234],
    ["12.34", 1234],
    ["12", 1200],
    ["12.3", 1230],
    ["+5.00", 500],
    ["0.5", 50],
    [".5", 50],
    ["5.", 500],
    ["0", 0],
    ["-0.00", 0],
    ["  7.25 ", 725],
    ["0.07", 7],
    ["-0.07", -7],
    ["1234567.89", 123456789],
  ])("%s -> %d", (input, cents) => {
    expect(parseSignedDecimalToCents(input)).toBe(cents);
    expect(Object.is(parseSignedDecimalToCents(input), -0)).toBe(false);
  });

  it("rounds more than 2 decimals half away from zero, by string digits", () => {
    expect(parseSignedDecimalToCents("1.004")).toBe(100);
    expect(parseSignedDecimalToCents("1.005")).toBe(101);
    expect(parseSignedDecimalToCents("-1.005")).toBe(-101);
    expect(parseSignedDecimalToCents("-1.004")).toBe(-100);
    expect(parseSignedDecimalToCents("0.999")).toBe(100);
    // A float would give 1.005 * 100 = 100.49999999999999
    expect(parseSignedDecimalToCents("1.005000")).toBe(101);
  });

  it("accepts numbers but only as their plain decimal text", () => {
    expect(parseSignedDecimalToCents(-12.5)).toBe(-1250);
    expect(parseSignedDecimalToCents(1e-7)).toBeNull();
    expect(parseSignedDecimalToCents(Number.NaN)).toBeNull();
  });

  it.each(["", " ", "-", "+", ".", "abc", "1e3", "1,234.00", "$5", "--5", "5-", "1.2.3", "0x10", "NaN", "Infinity"])(
    "rejects %j",
    (input) => {
      expect(parseSignedDecimalToCents(input)).toBeNull();
    },
  );

  it("rejects values that do not fit a 32-bit Int", () => {
    expect(parseSignedDecimalToCents("21474836.47")).toBe(2147483647);
    expect(parseSignedDecimalToCents("21474836.48")).toBeNull();
    expect(parseSignedDecimalToCents("-99999999999999999999")).toBeNull();
  });
});

describe("epochToDate", () => {
  it("uses the UTC calendar date", () => {
    expect(epochToDate(0)).toBeNull();
    expect(epochToDate(1)).toBe("1970-01-01");
    expect(epochToDate(1_700_000_000)).toBe("2023-11-14"); // 22:13:20 UTC
    expect(epochToDate(1_704_067_199)).toBe("2023-12-31"); // 23:59:59 UTC
    expect(epochToDate(1_704_067_200)).toBe("2024-01-01"); // 00:00:00 UTC
    expect(epochToDate("1704067200")).toBe("2024-01-01");
  });

  it.each([null, undefined, "", -5, "abc", Number.NaN, Number.POSITIVE_INFINITY, 1e15])("returns null for %s", (v) => {
    expect(epochToDate(v as never)).toBeNull();
  });
});

describe("normalizeCurrency", () => {
  it("keeps 3-letter codes (upper-cased) and falls back to USD", () => {
    expect(normalizeCurrency("EUR")).toBe("EUR");
    expect(normalizeCurrency("eur")).toBe("EUR");
    expect(normalizeCurrency("https://example.com/points")).toBe("USD");
    expect(normalizeCurrency("US")).toBe("USD");
    expect(normalizeCurrency(undefined)).toBe("USD");
  });
});

describe("isSimplefinHost", () => {
  it.each([
    ["simplefin.org", true],
    ["bridge.simplefin.org", true],
    ["beta-bridge.simplefin.org", true],
    ["BRIDGE.SimpleFIN.org", true],
    ["evilsimplefin.org", false],
    ["simplefin.org.evil.com", false],
    ["notsimplefin.org", false],
    ["simplefin.org.", false],
    ["example.com", false],
    ["", false],
  ])("%s -> %s", (host, ok) => {
    expect(isSimplefinHost(host)).toBe(ok);
  });
});

describe("decodeSetupToken", () => {
  it("decodes the documented demo token", () => {
    expect(decodeSetupToken(DEMO_TOKEN)).toBe("https://bridge.simplefin.org/simplefin/claim/demo");
  });

  it("tolerates whitespace, line breaks and URL-safe base64", () => {
    expect(decodeSetupToken(`  ${DEMO_TOKEN.slice(0, 20)}\n${DEMO_TOKEN.slice(20)}  `)).toBe(
      "https://bridge.simplefin.org/simplefin/claim/demo",
    );
    const urlSafe = token("https://bridge.simplefin.org/simplefin/claim/a~b??>>").replace(/\+/g, "-").replace(/\//g, "_");
    expect(decodeSetupToken(urlSafe)).toContain("/simplefin/claim/a~b");
  });

  it.each([
    ["http (not https)", token("http://bridge.simplefin.org/simplefin/claim/x")],
    ["another host", token("https://example.com/simplefin/claim/x")],
    ["evilsimplefin.org", token("https://evilsimplefin.org/claim/x")],
    ["simplefin.org.evil.com", token("https://simplefin.org.evil.com/claim/x")],
    ["userinfo trick", token("https://bridge.simplefin.org@evil.com/claim/x")],
    ["credentials", token("https://u:p@bridge.simplefin.org/claim/x")],
    ["custom port", token("https://bridge.simplefin.org:8443/claim/x")],
    ["localhost", token("https://localhost/claim/x")],
    ["ftp", token("ftp://bridge.simplefin.org/claim/x")],
  ])("rejects a token that points at %s, before any network call", (_label, t) => {
    expect(() => decodeSetupToken(t)).toThrowError(ApiError);
    try {
      decodeSetupToken(t);
    } catch (err) {
      expect(err).toMatchObject({ status: 400, code: "BAD_REQUEST" });
    }
  });

  it.each(["", "   ", "not a token!", "https://bridge.simplefin.org/simplefin/claim/demo", "@@@@", "aGVsbG8="])(
    "rejects non-token text %j",
    (t) => {
      expect(() => decodeSetupToken(t)).toThrowError(ApiError);
    },
  );
});

describe("access URLs", () => {
  it("validates scheme, host and credentials", () => {
    expect(isValidAccessUrl("https://u:p@bridge.simplefin.org/simplefin")).toBe(true);
    expect(isValidAccessUrl("http://u:p@bridge.simplefin.org/simplefin")).toBe(false);
    expect(isValidAccessUrl("https://u:p@evil.com/simplefin")).toBe(false);
    expect(isValidAccessUrl("https://u:p@evilsimplefin.org/simplefin")).toBe(false);
    expect(isValidAccessUrl("https://bridge.simplefin.org/simplefin")).toBe(false);
    expect(isValidAccessUrl("garbage")).toBe(false);
  });

  it("splits credentials into a Basic header and strips them from the URL", () => {
    const { baseUrl, authorization } = parseAccessUrl("https://user123:pass456@bridge.simplefin.org/simplefin/");
    expect(baseUrl).toBe("https://bridge.simplefin.org/simplefin");
    expect(authorization).toBe(`Basic ${Buffer.from("user123:pass456").toString("base64")}`);
    expect(baseUrl).not.toMatch(/user123|pass456|@/);
  });

  it("decodes percent-encoded credentials with special characters", () => {
    const password = "p@ss:w/rd?#%&é ";
    const user = "us:er@x";
    const url = `https://${encodeURIComponent(user)}:${encodeURIComponent(password)}@bridge.simplefin.org/simplefin`;
    const { baseUrl, authorization } = parseAccessUrl(url);
    expect(baseUrl).toBe("https://bridge.simplefin.org/simplefin");
    expect(Buffer.from(authorization.replace("Basic ", ""), "base64").toString("utf8")).toBe(`${user}:${password}`);
  });

  it("copes with raw special characters in the userinfo", () => {
    const { authorization } = parseAccessUrl("https://user:pa@ss!$&'()*+,;=@bridge.simplefin.org/simplefin");
    expect(Buffer.from(authorization.replace("Basic ", ""), "base64").toString("utf8")).toBe("user:pa@ss!$&'()*+,;=");
  });

  it("rejects bad access URLs with a message that does not contain the URL", () => {
    const secretUrl = "https://secretuser:secretpass@evil.example.com/simplefin";
    try {
      parseAccessUrl(secretUrl);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).not.toMatch(/secretuser|secretpass|evil\.example/);
    }
  });

  it("builds the accounts URL with epoch-second window parameters", () => {
    const url = new URL(
      buildAccountsUrl("https://bridge.simplefin.org/simplefin", {
        start: new Date(1_700_000_000_000),
        end: new Date(1_700_086_400_999),
        pending: true,
      }),
    );
    expect(url.pathname).toBe("/simplefin/accounts");
    expect(url.searchParams.get("start-date")).toBe("1700000000");
    expect(url.searchParams.get("end-date")).toBe("1700086400");
    expect(url.searchParams.get("pending")).toBe("1");
    expect(url.searchParams.get("version")).toBe("2");
    expect(url.username).toBe("");
  });
});

describe("planSyncWindow", () => {
  const now = new Date("2026-10-24T15:30:00Z");
  const DAY = 86_400_000;

  it("first sync covers the maximum span, ending one day after now (exclusive end)", () => {
    const w = planSyncWindow(null, now);
    expect(w.end.getTime()).toBe(now.getTime() + DAY);
    expect(w.start.getTime() % DAY).toBe(0); // UTC midnight
    expect(w.end.getTime() - w.start.getTime()).toBeLessThanOrEqual(90 * DAY);
    expect(w.end.getTime() - w.start.getTime()).toBeGreaterThan(87 * DAY);
    expect(w.startDate).toBe(w.start.toISOString().slice(0, 10));
  });

  it("later syncs start 7 days before the last sync", () => {
    const last = new Date("2026-10-20T12:00:00Z");
    const w = planSyncWindow(last, now);
    expect(w.startDate).toBe("2026-10-13");
    expect(w.end.getTime()).toBe(now.getTime() + DAY);
  });

  it("never reaches back more than 90 days, however old the last sync is", () => {
    const w = planSyncWindow(new Date("2025-01-01T00:00:00Z"), now);
    expect(w.end.getTime() - w.start.getTime()).toBeLessThanOrEqual(90 * DAY);
    expect(w).toEqual(planSyncWindow(null, now));
  });

  it("stays within 90 days for any time of day", () => {
    for (let h = 0; h < 24; h++) {
      const n = new Date(Date.UTC(2026, 9, 24, h, 59, 59));
      const w = planSyncWindow(null, n);
      expect(w.end.getTime() - w.start.getTime()).toBeLessThanOrEqual(90 * DAY);
    }
  });

  it("a last sync in the future still yields a non-empty window", () => {
    const w = planSyncWindow(new Date(now.getTime() + 30 * DAY), now);
    expect(w.end.getTime()).toBeGreaterThan(w.start.getTime());
  });
});

describe("mapHttpFailure", () => {
  it("claim 403 means the token is invalid or used (400)", () => {
    const err = mapHttpFailure("claim", 403);
    expect(err).toMatchObject({ status: 400, code: "BAD_REQUEST" });
    expect(err.message).toMatch(/invalid or has already been used/);
    expect(err.message).toMatch(/new one/);
  });

  it("fetch 403 means access was revoked (502)", () => {
    const err = mapHttpFailure("fetch", 403);
    expect(err).toMatchObject({ status: 502, code: "UPSTREAM_ERROR" });
    expect(err.message).toMatch(/revoked or is invalid.*Remove this connection and add a new setup token/);
  });

  it("402 payment, 429 rate limit, and other failures", () => {
    expect(mapHttpFailure("fetch", 402).message).toMatch(/payment or renewal/);
    expect(mapHttpFailure("fetch", 429).message).toMatch(/rate limiting/);
    expect(mapHttpFailure("claim", 429).status).toBe(502);
    for (const status of [400, 500, 503]) {
      const err = mapHttpFailure("fetch", status);
      expect(err).toMatchObject({ status: 502, code: "UPSTREAM_ERROR" });
      expect(err.message).toMatch(/SimpleFIN Bridge is unavailable/);
    }
  });
});

describe("normalizeAccountSet", () => {
  const TODAY = "2026-10-24";
  const raw = {
    errlist: [{ code: "con.auth", msg: "Please log in to your bank at SimpleFIN", conn_id: "c2" }],
    connections: [
      { conn_id: "c1", name: "First Bank", org_id: "o1", sfin_url: "https://x" },
      { conn_id: "c2", name: "Second Bank", org_id: "o2", sfin_url: "https://x" },
    ],
    accounts: [
      {
        id: "a1",
        name: "Checking",
        conn_id: "c1",
        currency: "usd",
        balance: "1234.56",
        "available-balance": "1000.00",
        "balance-date": 1_700_000_000,
        transactions: [
          { id: "t1", posted: 1_699_900_000, amount: "-12.34", description: "  Coffee   Shop " },
          { id: "t2", posted: 1_699_800_000, amount: "2500", description: "Payroll" },
          { id: "t3", posted: 0, amount: "-5.5", description: "Pending thing", pending: true, transacted_at: 1_699_990_000 },
          { id: "t4", posted: 0, amount: "-1", description: "", pending: true },
          { id: "t1", posted: 1_699_900_000, amount: "-99", description: "duplicate id" },
          { id: "bad", posted: 1_699_900_000, amount: "twelve", description: "bad amount" },
        ],
      },
      { id: "a2", name: "Savings", conn_id: "c2", currency: "https://x.example/points", balance: "-3.1", transactions: [] },
      { id: "broken", name: "No balance", conn_id: "c1", balance: "n/a" },
    ],
  };

  it("maps amounts, signs, dates, names and currency", () => {
    const set = normalizeAccountSet(raw, TODAY);
    expect(set.accounts).toHaveLength(2);
    const [a1, a2] = set.accounts;
    expect(a1).toMatchObject({
      providerAccountId: "a1",
      institutionName: "First Bank",
      name: "Checking",
      currency: "USD",
      balanceCents: 123456,
      availableBalanceCents: 100000,
      balanceDate: "2023-11-14",
      incomplete: false,
    });
    expect(a1.transactions).toEqual([
      { providerTransactionId: "t1", date: "2023-11-13", amountCents: -1234, description: "Coffee Shop", pending: false },
      { providerTransactionId: "t2", date: "2023-11-12", amountCents: 250000, description: "Payroll", pending: false },
      { providerTransactionId: "t3", date: "2023-11-14", amountCents: -550, description: "Pending thing", pending: true },
      { providerTransactionId: "t4", date: TODAY, amountCents: -100, description: "(no description)", pending: true },
    ]);
    expect(a2).toMatchObject({
      institutionName: "Second Bank",
      currency: "USD",
      balanceCents: -310,
      availableBalanceCents: null,
      balanceDate: TODAY,
      incomplete: true, // its connection is named in errlist
    });
  });

  it("collects warnings from errlist and from skipped data", () => {
    const { warnings } = normalizeAccountSet(raw, TODAY);
    expect(warnings).toContain("Please log in to your bank at SimpleFIN");
    expect(warnings.some((w) => /Skipped 1 account/.test(w))).toBe(true);
    expect(warnings.some((w) => /Skipped 1 transaction /.test(w))).toBe(true);
  });

  it("falls back to the deprecated errors strings only when there is no errlist", () => {
    expect(normalizeAccountSet({ errors: ["Old style message"], accounts: [] }, TODAY).warnings).toEqual(["Old style message"]);
    expect(normalizeAccountSet({ errlist: [{ msg: "New" }], errors: ["Old"], accounts: [] }, TODAY).warnings).toEqual(["New"]);
  });

  it("is lenient about missing optional fields and unknown fields", () => {
    const set = normalizeAccountSet({ accounts: [{ id: "x", balance: "1", extra: { a: 1 }, weird: true }] }, TODAY);
    expect(set.accounts[0]).toMatchObject({ name: "Account", institutionName: "Unknown institution", currency: "USD", balanceDate: TODAY });
    expect(normalizeAccountSet({}, TODAY)).toEqual({ accounts: [], warnings: [] });
  });

  it("keeps warning text as plain text (no markup interpretation here, React escapes it)", () => {
    const { warnings } = normalizeAccountSet({ errlist: [{ msg: "<img src=x onerror=alert(1)>" }], accounts: [] }, TODAY);
    expect(warnings).toEqual(["<img src=x onerror=alert(1)>"]);
  });

  it("throws a 502 when the body is not an Account Set", () => {
    for (const bad of [null, "text", 5, { accounts: "nope" }]) {
      expect(() => normalizeAccountSet(bad, TODAY)).toThrowError(ApiError);
    }
  });
});
