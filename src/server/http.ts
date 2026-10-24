/**
 * HTTP helpers shared by every route handler so all errors use `ApiErrorBody`
 * (docs/API.md). Route handlers wrap their logic in `handle(...)` and throw
 * `ApiError` (or let Zod/unknown errors propagate) to produce error responses.
 */
import { NextResponse } from "next/server";
import { ZodError, type ZodType, type ZodTypeDef } from "zod";
import type { ApiErrorBody, ApiErrorCode } from "../contracts/api";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound = (what: string) => new ApiError(404, "NOT_FOUND", `${what} not found.`);
export const badRequest = (message: string) => new ApiError(400, "BAD_REQUEST", message);

/** Zod issues → `fieldErrors` keyed by dot-joined path ("_root" for object-level issues). */
export function zodFieldErrors(error: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_root";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export function errorResponse(err: unknown): NextResponse<ApiErrorBody> {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}) } },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Please fix the highlighted fields.", fieldErrors: zodFieldErrors(err) } },
      { status: 400 },
    );
  }
  // Unexpected: log details server-side only; the client gets a generic message.
  console.error("[api] unexpected error", err);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } },
    { status: 500 },
  );
}

/** Runs a route body and converts any thrown error into an `ApiErrorBody` response. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    return errorResponse(err);
  }
}

export const json = <T>(data: T, status = 200) => NextResponse.json(data, { status });
export const noContent = () => new Response(null, { status: 204 });

/** Reads the request body as JSON; malformed JSON → 400 BAD_REQUEST. */
export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  try {
    return JSON.parse(text);
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
}

/** Parses the JSON body with a Zod schema (ZodError → 400 VALIDATION_ERROR via `handle`). */
export async function parseBody<T>(req: Request, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  return schema.parse(await readJson(req));
}
