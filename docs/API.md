# CashFlow Planner — API Contract

Base URL: `http://localhost:3000/api`. JSON in and out. Types and Zod schemas are in [`src/contracts/api.ts`](../src/contracts/api.ts). Rules are in [`CONVENTIONS.md`](CONVENTIONS.md).

Errors always use this shape (`ApiErrorBody`):
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Please fix the highlighted fields.", "fieldErrors": { "amountCents": ["Amount must be greater than zero"] } } }
```
| Status | code |
|---|---|
| 400 | `VALIDATION_ERROR` (Zod failure, with `fieldErrors`) or `BAD_REQUEST` (malformed JSON, bad occurrence date, …) |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` (e.g. a bank refresh within 15 minutes of the last one) |
| 502 | `UPSTREAM_ERROR` (SimpleFIN Bridge failed, was revoked, needs payment or is rate limiting; the message says what to do) |
| 500 | `INTERNAL_ERROR` (generic message; details only in the server log) |

`fieldErrors` keys are dot-joined Zod paths (e.g. `endDate`, `to`). An object-level issue with no path uses the key `_root`.

## Settings
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/settings` | — | `SettingsDTO`. Returns defaults when never saved: balance 0, start = today, USD, 90 days, Sunday, month, `updatedAt: null`. |
| PUT | `/api/settings` | `SettingsInput` (full object) | `SettingsDTO` |

## Income
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/income` | — | `IncomeDTO[]` (sorted by name) |
| POST | `/api/income` | `IncomeInput` | `201 IncomeDTO` |
| GET | `/api/income/:id` | — | `IncomeDTO` / 404 |
| PUT | `/api/income/:id` | `IncomeInput` (full replacement) | `IncomeDTO` / 404 |
| DELETE | `/api/income/:id` | — | `204` / 404 |

## Bills
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/bills` | — | `BillDTO[]` (sorted by name) |
| POST | `/api/bills` | `BillInput` | `201 BillDTO` |
| GET | `/api/bills/:id` | — | `BillDTO` / 404 |
| PUT | `/api/bills/:id` | `BillInput` (full replacement; never touches occurrence rows) | `BillDTO` / 404 |
| DELETE | `/api/bills/:id` | — | `204` / 404 (cascades occurrence rows) |
| GET | `/api/bills/:id/occurrences` | — | `BillOccurrenceDTO[]` (recorded statuses, sorted by `dueDate`) / 404 |
| PUT | `/api/bills/:id/occurrences/:date` | `OccurrenceUpdateInput` | `BillOccurrenceDTO` (upsert). 404 for an unknown bill. 400 `BAD_REQUEST` if `:date` isn't a valid YYYY-MM-DD date or isn't a scheduled occurrence of the bill. |
| DELETE | `/api/bills/:id/occurrences/:date` | — | `204` (resets to UPCOMING at the default amount; idempotent, so it also returns 204 when nothing was recorded) / 404 for an unknown bill |

## Projection & dashboard
| Method | Path | Query | Response |
|---|---|---|---|
| GET | `/api/projection` | `from?`, `to?` (YYYY-MM-DD). The default is the full window. `from` is clamped to `projectionStartDate`, and `to` is clamped to `maxEndDate`. | `ProjectionResponse` |
| GET | `/api/dashboard` | — | `DashboardResponse` |

Projection slicing details:
- An empty `from`/`to` value is treated as missing. `from > to` (as requested) → 400 `VALIDATION_ERROR` on `to`. If clamping leaves `from` after `to` (e.g. only `from` is given and it is past the window end), the range becomes the single day `from`.
- `weeks` are clipped to the returned `range`. A week's `rangeStart`/`rangeEnd` are its first and last dates inside `range`, `partial` is true when the week is cut on either side, and its opening is the closing balance of the day before `rangeStart`. So the week and day `eventIds` partition `events` exactly. To show whole calendar weeks, request a `from`/`to` aligned to week boundaries.
- `sequence` and `balanceAfterCents` are global (computed from `projectionStartDate`), so they are identical across different slices.
- `totals.lowestBalanceDate`: the range's opening balance counts as the first day's value, and ties pick the earliest date. `firstNegativeDate` is the first day of the range when the opening balance is already negative.

## Institutions (read-only bank connections through SimpleFIN Bridge)
Only the server talks to SimpleFIN (`src/server/simplefin.ts`). The setup token and the Access URL (which embeds credentials) are never returned by any endpoint. The app keeps a local snapshot (accounts, balances, transactions) and contacts SimpleFIN only on connect and on an explicit refresh, because SimpleFIN allows about 24 requests a day. Bank amounts are **signed**: money in is positive, money out is negative.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/api/institutions` | — | `InstitutionDTO[]` (`{ id, name, connectedAt, lastSyncedAt, accounts: BankAccountDTO[] }`, oldest connection first). Reads the local snapshot only; no SimpleFIN call. |
| POST | `/api/institutions` | `{ setupToken }` (trimmed, 1–2000 characters) | `201 InstitutionSyncDTO` (`InstitutionDTO` plus `warnings: string[]`). Claims the token (single use) at SimpleFIN, saves the connection and runs the first sync (up to the last ~90 days). 400 `BAD_REQUEST` for a malformed token, a token that doesn't point at an https `simplefin.org` host (rejected before any network call), or one that is invalid or already used; 502 `UPSTREAM_ERROR` when SimpleFIN fails. If the claim succeeds but the first sync fails, the connection is **kept** (the token can't be claimed again) and the failure is reported in `warnings`. |
| POST | `/api/institutions/:id/sync` | — | `InstitutionSyncDTO`. Fetches from SimpleFIN and replaces the stored pending transactions and those in the fetched window. 404 unknown id; 409 `CONFLICT` if the last successful sync was under 15 minutes ago (or one is running); 502 `UPSTREAM_ERROR` when access was revoked, the subscription needs payment, SimpleFIN rate limits or is unavailable. `warnings` carries SimpleFIN's own notices (plain text). |
| DELETE | `/api/institutions/:id` | — | `204` / 404. Deletes the connection, its accounts and its stored transactions locally. SimpleFIN has no revoke API, so the token must be disabled in the user's SimpleFIN account. |
| GET | `/api/institutions/:id/transactions` | `accountId` (required), `offset?` (default 0) | `BankTransactionsResponse` `{ transactions, hasMore }` from the local snapshot, newest first (date, then id), 50 per page. `amountCents` is signed. 400 `VALIDATION_ERROR` without `accountId`; 404 for an unknown connection or an account that isn't part of it. |

## Data management (local only)
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/data/demo` | — | `200 { ok: true }`. **Replaces** all income, bills and occurrences with clearly labeled demo data ("Demo: …" names), and sets the start date to today and the starting balance to $1,250.00. |
| POST | `/api/data/reset` | — | `200 { ok: true }`. Deletes all income, bills and occurrences, deletes every bank connection with its stored accounts and transactions (locally only; SimpleFIN has no revoke call), and resets settings to defaults. |

The UI must confirm both actions with the user first.
