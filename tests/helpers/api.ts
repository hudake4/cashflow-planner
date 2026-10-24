/** Helpers for calling Next.js route handlers directly in integration tests. */
import { expect } from "vitest";
import type { ApiErrorBody } from "@/contracts/api";

// Route handlers use Next 15 typed params (Promise<{ id: string }> etc.); params are contravariant, so accept any.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (req: Request, ctx: { params: Promise<any> }) => Promise<Response> | Response;

export interface CallResult<T = unknown> {
  status: number;
  body: T;
}

/**
 * Calls a route handler. `body` objects are JSON-encoded; strings are sent raw
 * (for malformed-JSON tests).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function call<T = any>(
  handler: Handler,
  method: string,
  path: string,
  { body, params = {} }: { body?: unknown; params?: Record<string, string> } = {},
): Promise<CallResult<T>> {
  const init: RequestInit = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  const res = await handler(new Request(`http://localhost${path}`, init), { params: Promise.resolve(params) });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

/** Asserts a 400 ApiErrorBody, optionally with the given fieldErrors keys. */
export function expectApiError(
  res: CallResult,
  status: number,
  code: ApiErrorBody["error"]["code"],
  fieldKeys: string[] = [],
) {
  expect(res.status, JSON.stringify(res.body)).toBe(status);
  const body = res.body as ApiErrorBody;
  expect(body.error.code).toBe(code);
  expect(typeof body.error.message).toBe("string");
  expect(body.error.message.length).toBeGreaterThan(0);
  if (code === "VALIDATION_ERROR") {
    expect(body.error.fieldErrors).toBeTypeOf("object");
    for (const k of fieldKeys) {
      expect(body.error.fieldErrors![k], `fieldErrors.${k} in ${JSON.stringify(body.error.fieldErrors)}`).toBeDefined();
      expect(body.error.fieldErrors![k].length).toBeGreaterThan(0);
    }
  }
}
