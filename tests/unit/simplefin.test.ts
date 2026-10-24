import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/http";
import { claimSetupToken, fetchAccountSet } from "@/server/simplefin";

const token = (url: string) => Buffer.from(url, "utf8").toString("base64");
const CLAIM_TOKEN = token("https://bridge.simplefin.org/simplefin/claim/SECRETCLAIMCODE");
const ACCESS_URL = "https://user%40x:p%40ss%3Aw%2Frd@bridge.simplefin.org/simplefin";

const options = { start: new Date("2026-07-27T00:00:00Z"), end: new Date("2026-10-25T15:00:00Z"), pending: true, today: "2026-10-24" };

function stubFetch(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(async (url: string | URL, init?: RequestInit) => impl(String(url), init ?? {}));
  vi.stubGlobal("fetch", fn);
  return fn;
}

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    return err as ApiError;
  }
  throw new Error("expected a rejection");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("claimSetupToken", () => {
  it("POSTs to the decoded claim URL without following redirects and returns the access URL", async () => {
    const fn = stubFetch(() => new Response(`  ${ACCESS_URL}\n`, { status: 200 }));
    await expect(claimSetupToken(CLAIM_TOKEN)).resolves.toBe(ACCESS_URL);
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://bridge.simplefin.org/simplefin/claim/SECRETCLAIMCODE");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects a foreign host before making any network call", async () => {
    const fn = stubFetch(() => new Response("x"));
    for (const evil of ["https://evilsimplefin.org/c", "https://simplefin.org.evil.com/c", "http://bridge.simplefin.org/c"]) {
      const err = await caught(claimSetupToken(token(evil)));
      expect(err).toMatchObject({ status: 400, code: "BAD_REQUEST" });
    }
    expect(fn).not.toHaveBeenCalled();
  });

  it("claim 403 -> 400, and the message never contains the token", async () => {
    stubFetch(() => new Response("forbidden", { status: 403 }));
    const err = await caught(claimSetupToken(CLAIM_TOKEN));
    expect(err).toMatchObject({ status: 400, code: "BAD_REQUEST" });
    expect(err.message).toMatch(/already been used/);
    expect(err.message).not.toContain("SECRETCLAIMCODE");
    expect(err.message).not.toContain(CLAIM_TOKEN);
  });

  it("network failures and 5xx -> 502 with no URL or token in the message", async () => {
    stubFetch(() => {
      throw new TypeError("fetch failed: https://bridge.simplefin.org/simplefin/claim/SECRETCLAIMCODE");
    });
    const net = await caught(claimSetupToken(CLAIM_TOKEN));
    expect(net).toMatchObject({ status: 502, code: "UPSTREAM_ERROR" });
    expect(net.message).toMatch(/SimpleFIN Bridge is unavailable/);
    expect(net.message).not.toContain("SECRETCLAIMCODE");

    stubFetch(() => new Response("oops", { status: 500 }));
    expect(await caught(claimSetupToken(CLAIM_TOKEN))).toMatchObject({ status: 502, code: "UPSTREAM_ERROR" });
  });

  it("rejects an access URL that is not https on a SimpleFIN host (never stored)", async () => {
    for (const body of ["http://u:p@bridge.simplefin.org/simplefin", "https://u:p@evil.com/simplefin", "not a url", ""]) {
      stubFetch(() => new Response(body, { status: 200 }));
      const err = await caught(claimSetupToken(CLAIM_TOKEN));
      expect(err).toMatchObject({ status: 502, code: "UPSTREAM_ERROR" });
      expect(err.message).not.toContain("evil.com");
    }
  });
});

describe("fetchAccountSet", () => {
  const body = { errlist: [], connections: [], accounts: [{ id: "a", name: "Chk", balance: "10.00", transactions: [] }] };

  it("sends Basic auth in a header, with no credentials in the URL", async () => {
    const fn = stubFetch(() => Response.json(body));
    const set = await fetchAccountSet(ACCESS_URL, options);
    expect(set.accounts).toHaveLength(1);

    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.username).toBe("");
    expect(parsed.password).toBe("");
    expect(url).not.toMatch(/p%40ss|p@ss/);
    expect(parsed.origin + parsed.pathname).toBe("https://bridge.simplefin.org/simplefin/accounts");
    expect(parsed.searchParams.get("start-date")).toBe(String(options.start.getTime() / 1000));
    expect(parsed.searchParams.get("end-date")).toBe(String(Math.floor(options.end.getTime() / 1000)));
    expect(parsed.searchParams.get("pending")).toBe("1");
    expect(parsed.searchParams.get("version")).toBe("2");

    const headers = init.headers as Record<string, string>;
    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("error");
    expect(Buffer.from(headers.Authorization.replace("Basic ", ""), "base64").toString("utf8")).toBe("user@x:p@ss:w/rd");
  });

  it.each([
    [403, /revoked or is invalid/],
    [402, /payment or renewal/],
    [429, /rate limiting/],
    [500, /unavailable/],
  ])("HTTP %d -> 502 UPSTREAM_ERROR without leaking credentials", async (status, message) => {
    stubFetch(() => new Response("nope", { status }));
    const err = await caught(fetchAccountSet(ACCESS_URL, options));
    expect(err).toMatchObject({ status: 502, code: "UPSTREAM_ERROR" });
    expect(err.message).toMatch(message);
    expect(err.message).not.toMatch(/p%40ss|p@ss|user|Basic|bridge\.simplefin/);
  });

  it("network errors never include the URL or Authorization header", async () => {
    stubFetch((url, init) => {
      throw new Error(`boom ${url} ${(init.headers as Record<string, string>).Authorization}`);
    });
    const err = await caught(fetchAccountSet(ACCESS_URL, options));
    expect(err.message).toMatch(/unavailable/);
    expect(err.message).not.toMatch(/boom|Basic|p@ss|simplefin\/accounts/);
    expect(JSON.stringify(err)).not.toMatch(/Basic|p%40ss/);
  });

  it("non-JSON 200 responses -> 502", async () => {
    stubFetch(() => new Response("<html>", { status: 200 }));
    expect(await caught(fetchAccountSet(ACCESS_URL, options))).toMatchObject({ status: 502, code: "UPSTREAM_ERROR" });
  });

  it("refuses a stored access URL on another host without any network call", async () => {
    const fn = stubFetch(() => Response.json(body));
    const err = await caught(fetchAccountSet("https://u:secretpw@evil.example.com/simplefin", options));
    expect(err.status).toBe(502);
    expect(err.message).not.toMatch(/secretpw|evil\.example/);
    expect(fn).not.toHaveBeenCalled();
  });
});
