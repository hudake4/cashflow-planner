import { describe, expect, it } from "vitest";
import { tellerError } from "@/server/teller";

const body = (code: string) => JSON.stringify({ error: { code, message: "x" } });

describe("tellerError", () => {
  it.each([
    [404, "enrollment.disconnected.credentials_invalid", /login details changed.*Remove this institution/],
    [404, "enrollment.disconnected.user_action.mfa_required", /security check.*Remove this institution/],
    [404, "enrollment.disconnected", /no longer valid.*Remove this institution/],
    [403, "forbidden", /no longer valid.*Remove this institution/],
  ])("%d %s → reconnect-or-remove message", (status, code, message) => {
    const err = tellerError(status, body(code));
    expect(err.status).toBe(502);
    expect(err.code).toBe("UPSTREAM_ERROR");
    expect(err.message).toMatch(message);
  });

  it("maps rate limiting, missing certificate, unknown accounts and outages", () => {
    expect(tellerError(429, "").message).toMatch(/limiting requests/);
    expect(tellerError(400, body("bad_request")).message).toMatch(/certificate/);
    expect(tellerError(404, body("not_found"))).toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(tellerError(502, "<html>").message).toMatch(/unavailable/);
  });
});
