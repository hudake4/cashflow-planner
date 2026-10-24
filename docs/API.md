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
| 409 | `CONFLICT` |
| 502 | `UPSTREAM_ERROR` (Teller or the bank failed, or a connection needs to be removed and re-added; the message says what to do) |
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

## Institutions (read-only bank connections through Teller)
Only the server talks to Teller; access tokens are stored locally and are never returned by any endpoint. Transactions are fetched live and are not stored. Settings come from the environment (see `.env.example`).

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/api/institutions/config` | — | `InstitutionsConfigDTO` `{ configured, applicationId, environment }`. The Application ID is public. `configured` is false until `TELLER_APPLICATION_ID` (and, outside sandbox, `TELLER_CERT_PATH` + `TELLER_KEY_PATH`) are set. |
| GET | `/api/institutions` | — | `InstitutionDTO[]` (with `accounts`, oldest connection first) |
| POST | `/api/institutions` | `{ accessToken, enrollmentId, institutionName, institutionId? }` (the values from Teller Connect's `onSuccess`) | `201 InstitutionDTO`. Lists the accounts at Teller first; nothing is saved if Teller rejects the token. Posting the same `enrollmentId` again replaces its accounts. 400 `BAD_REQUEST` when Teller isn't configured; 502 `UPSTREAM_ERROR` when Teller fails. |
| GET | `/api/institutions/:id` | — | `InstitutionDTO` / 404 |
| DELETE | `/api/institutions/:id` | — | `204` / 404. Revokes the enrollment at Teller (best effort), then deletes it and its accounts locally. A Teller failure does not block the local removal. |
| GET | `/api/institutions/:id/transactions` | `accountId` (required), `fromId?` (returns transactions older than this id) | `BankTransactionsResponse` `{ transactions, hasMore }`, newest first, 50 per page. `amountCents` is signed: money in positive, money out negative. 400 `VALIDATION_ERROR` without `accountId`; 404 for an unknown institution or an account that isn't part of it; 502 `UPSTREAM_ERROR` when Teller or the bank fails. |

## Data management (local only)
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/data/demo` | — | `200 { ok: true }`. **Replaces** all income, bills and occurrences with clearly labeled demo data ("Demo: …" names), and sets the start date to today and the starting balance to $1,250.00. |
| POST | `/api/data/reset` | — | `200 { ok: true }`. Deletes all income, bills and occurrences, revokes and deletes every bank connection (revoking is best effort), and resets settings to defaults. |

The UI must confirm both actions with the user first.
