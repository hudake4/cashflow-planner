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
| POST | `/api/institutions/:id/sync` | — | `InstitutionSyncDTO`. Fetches from SimpleFIN and replaces the stored pending transactions and those in the fetched window, then deletes transactions older than 89 days. 404 unknown id; 409 `CONFLICT` if the last successful sync was under 15 minutes ago (or one is running); 502 `UPSTREAM_ERROR` when access was revoked, the subscription needs payment, SimpleFIN rate limits or is unavailable. `warnings` carries SimpleFIN's own notices (plain text). |
| DELETE | `/api/institutions/:id` | — | `204` / 404. Deletes the connection, its accounts and its stored transactions locally. SimpleFIN has no revoke API, so the token must be disabled in the user's SimpleFIN account. |
| PATCH | `/api/institutions/:id/accounts/:accountId` | `{ kind }`: `BANK`, `CREDIT`, `LOAN` or `OTHER` | `BankAccountDTO` with the new `kind`. Only `BANK` accounts are summed into the starting balance (`SettingsDTO.accountsBalanceCents` / `accountCount`). Syncs never change `kind`. 400 `VALIDATION_ERROR` for another value; 404 for an unknown connection or an account that isn't part of it. |
| GET | `/api/institutions/:id/transactions` | `accountId` (required), `offset?` (default 0) | `BankTransactionsResponse` `{ transactions, hasMore }` from the local snapshot, limited to the last 89 days (counting today), newest first (date, then id), 50 per page. `amountCents` is signed. 400 `VALIDATION_ERROR` without `accountId`; 404 for an unknown connection or an account that isn't part of it. |

## Recurring-payment scan (from bank history)
Finds repeating payments and deposits in the stored bank transactions and suggests them as bills or income. Rules are in [`CONVENTIONS.md`](CONVENTIONS.md) section 12. The scan reads the local snapshot only and never calls SimpleFIN.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/api/recurring` | — | `RecurringScanResponse` `{ suggestions, currency, connectionCount, transactionCount, lastSyncedAt }`. Each suggestion is a `RecurringSuggestionDTO`: `key`, `kind` (`INCOME` or `BILL`), `name`, `amountCents` (positive, latest occurrence), `frequency` (`WEEKLY`, `BIWEEKLY` or `MONTHLY`), `nextDate` (YYYY-MM-DD, first expected date on or after today), `occurrences`, `seenDates` and `amountVaries`. Suggestions already tracked as bills or income are left out. |

Adding a suggestion uses the existing `POST /api/bills` or `POST /api/income`, with the notes "Found in your bank history."

## Bill payment matches (from bank history)
Synced bank transactions that look like the payment of a bill occurrence that is not yet marked paid. Rules are in [`CONVENTIONS.md`](CONVENTIONS.md) section 14. The endpoint reads the local database only, never calls SimpleFIN and changes nothing.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/api/bills/matches` | — | `BillMatchesResponse` `{ matches, currency }`. Each match is a `BillPaymentMatchDTO`: `billId`, `billName`, `dueDate` (the scheduled occurrence), `expectedCents` (the occurrence's override, else the bill amount), `amountOverrideCents` and `note` (the occurrence's recorded values, or `null`), and `transaction` `{ id, date, description, cents }` (`cents` is the positive magnitude of the money out). Sorted by `dueDate`, then bill name. `matches` is empty when no bank is connected. |

To accept a match, the client calls the existing `PUT /api/bills/:id/occurrences/:date` with `{ status: "PAID", amountOverrideCents, note }` copied from the match, so the override and note are kept. Marking paid is tracking only and never changes the projection.

## Spend analyzer (from bank history)
Last month's and this month's spending by category. Rules are in [`CONVENTIONS.md`](CONVENTIONS.md) section 13. Both endpoints read and write the local database only and never call SimpleFIN.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/api/spending` | — | `SpendingResponse` `{ thisMonth, lastMonth, lastMonthToDateCents, coverageStart, currency, connectionCount, transactionCount, lastSyncedAt }`. Each period is a `SpendingPeriodDTO`: `from`, `to`, `totalCents`, `transactionCount`, `transfersCents`, `categories`, `topMerchants` and `transactions` (every money-out transaction of the period, transfers included, newest first: `id`, `date`, `name`, `description`, `cents`, `category`, `source` (`AUTO`, `MERCHANT` or `MANUAL`) and `merchantLearnable`). |
| PUT | `/api/spending/transactions/:id/category` | `{ category, applyToMerchant? }` | The refreshed `SpendingResponse`. `category` is a `SpendingCategory` (including `TRANSFERS`) or `null` to go back to the automatic category. `applyToMerchant` defaults to `true`: the choice is remembered for the transaction's merchant, replacing any per-transaction choices for it; `false` changes only this transaction. 404 for a transaction that isn't a settled one in the 89-day history; 400 `BAD_REQUEST` for money in, or for `applyToMerchant` on a description with no merchant name (`merchantLearnable: false`); 400 `VALIDATION_ERROR` for an unknown category or extra fields. |

## Data management (local only)
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/data/export` | — | `200 DataExportDTO`, sent as a download: `Content-Type: application/json`, `Content-Disposition: attachment; filename="cashflow-planner-backup-<YYYY-MM-DD>.json"` (the server's local today) and `Cache-Control: no-store`. Body: `{ format: "cashflow-planner-export", formatVersion: 1, appVersion, exportedAt, settings, incomes, bills, billOccurrences, institutions }`. `settings` is the stored `SettingsDTO` (the typed balance), `billOccurrences` holds every recorded status row for every bill, and each institution is `{ id, name, connectedAt, lastSyncedAt, accounts: BankAccountDTO[], transactions: BankTransactionDTO[] }` with every stored transaction, newest first. The Zod schema is `dataExportSchema`. It **never** contains an Access URL, setup token, Authorization header or any other bank-connection field. Read only; changes nothing. |
| POST | `/api/data/demo` | — | **Destructive.** `200 { ok: true }`. **Replaces** all income, bills and occurrences with clearly labeled demo data ("Demo: …" names), and sets the start date to today and the starting balance to $1,250.00. |
| POST | `/api/data/reset` | — | **Destructive.** `200 { ok: true }`. Deletes all income, bills and occurrences, deletes every bank connection with its stored accounts and transactions (locally only; SimpleFIN has no revoke call), and resets settings to defaults. |

The UI must confirm both destructive actions with the user first. The export needs no confirmation.
