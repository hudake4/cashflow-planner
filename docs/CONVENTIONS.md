# CashFlow Planner — Financial & Engineering Conventions

These rules are the team agreement. The projection engine (`src/domain/`) implements them, the API exposes them, the UI only *displays* their results, and the tests verify them. If you need to change a rule, update this file and tell the other team members.

## 1. Money

- All amounts are **integer cents** (`amountCents`, `balanceCents`). Floats are never used for money arithmetic anywhere: not in the engine, the API, the DB, or the UI.
- The UI converts user input to cents with string parsing (`"12.99"` → `1299`), not `parseFloat(x) * 100`. Formatting uses `Intl.NumberFormat` with the settings currency.
- Bill and income amounts are **positive magnitudes**. The sign comes from the event kind (income `+`, bill `−`).
- Amount limits: `1 ≤ amountCents ≤ 1,000,000,000` ($10M). The starting balance may be zero or negative.
- Currency is display-only (default `USD`). There is no FX conversion. Because amounts are stored in hundredths, the UI offers only currencies with 2 minor-unit digits (zero-decimal currencies such as JPY are not offered).

## 2. Dates

- Calendar dates are **`YYYY-MM-DD` strings** with no time and no timezone. Date math uses UTC-based helpers (`src/domain/dates.ts`) so DST and local timezones can never shift a date.
- "Today" is the server machine's local date (`YYYY-MM-DD`).
- Date ranges are **inclusive** at both ends (`endDate`, `from`/`to`, week ranges).

## 3. Projection window & opening balance

- `startingBalanceCents` is the balance at the **start of `projectionStartDate`, before any event on that date**. Events dated on the start date **are** applied. Throughout this document `projectionStartDate` means the **effective** start date: the typed one, or the one derived from the bank accounts (see Starting balance source below).
- Window = `[projectionStartDate, projectionStartDate + forecastDays − 1]`. `forecastDays` defaults to 90, ranges 7–366, and the UI offers presets up to 12 months.
- **Starting balance source** (`startingBalanceSource`, default `MANUAL`): with `MANUAL` the typed `startingBalanceCents` is used. With `ACCOUNTS` the starting balance is the **sum of `balanceCents` over the connected accounts labelled `BANK`** (section 9, SimpleFIN), as of the last sync. Each account carries a user label, `kind`: `BANK`, `CREDIT`, `LOAN` or `OTHER`; only `BANK` accounts are summed, so a credit card or line of credit never lowers the starting balance. The label is changed on the Institutions page (`PATCH /api/institutions/:id/accounts/:accountId`) and a sync never overwrites it. An account the app has not seen before gets a first guess from its name and first synced balance (`guessAccountKind`: "credit card", "line of credit", "HELOC" give `CREDIT`; card network/issuer words such as "visa", "mastercard", "sapphire", "chase" give `CREDIT`; a negative balance on first sync gives `CREDIT` unless the name says bank/debit/checking/savings; "loan", "mortgage" give `LOAN`; anything else `BANK`); accounts that existed before labels were introduced are `BANK`. The sum is computed server-side when settings are loaded (`effectiveStartingBalanceCents`), so the engine and every view see one value. The typed balance is kept, never overwritten, and is used while no account is labelled `BANK` (`accountsBalanceCents: null`). Accounts are summed as stored, with no currency conversion. The sum moves only when the user refreshes a bank or relabels an account, and it already includes everything that happened up to each account's `balanceDate`. So with `ACCOUNTS` the **projection start date is derived too**: the oldest `balanceDate` among the summed `BANK` accounts that refreshed within the last 7 days of the server's local today (`SettingsDTO.accountsBalanceDate`, `effectiveProjectionStartDate`). Every `BANK` account is still summed into the balance. An account that hasn't refreshed in over a week (a closed account, or a connection that needs signing in again) is left out of the date, so it can't pull the window months into the past; `SettingsDTO.accountsStaleCount` says how many, and Settings and the dashboard tell the user to relabel them as Other or refresh their bank on the Institutions page (that page can only remove a whole connection, fresh accounts included). When no `BANK` account is that fresh, the date is the oldest `balanceDate` overall (`accountsStaleCount: 0`), so a fully stale set still gets one consistent date. The date is never later than today (`min(date, todayLocal)`). Taking the oldest date is a trade-off, not a claim that the total is right from then on: events between the oldest date and a newer account's `balanceDate` are replayed onto that newer account, whose balance already includes them. Refresh all banks together to keep the dates close. Likewise, events dated **on** the start date are still applied (the start date is the balance date itself, not the day after), so a bill or paycheck that already posted that same day, and is therefore in the bank balance, may be counted twice on that day. It is applied server-side next to the balance, and the calendar reads it the same way, so every view sees one start date and a refresh moves it with no settings change. The stored `projectionStartDate` is never overwritten: it is the `MANUAL` value, it is what settings and the data export carry, and it is used again when the source is `MANUAL` or no account is labelled `BANK`. `balanceDate` is the UTC date of SimpleFIN's balance-date, so in the local evening it can be the day after the local date; the clamp to today keeps the window from starting in the future.
- `maxEndDate = projectionStartDate + 365 days`. Requests for `to` beyond the window are honored up to `maxEndDate` so a calendar can browse up to 12 months ahead. Requests before `projectionStartDate` are clamped to it, because no balance is known before the start date.
- Events before `projectionStartDate` or after the computed end are **ignored**. They never affect any balance.
- The engine always computes **from `projectionStartDate` forward** and then slices the requested range. Every view therefore sees identical balances, and changing the range or view can never duplicate or drop events.

## 4. Recurrence (anchored, no drift)

The anchor is the configured first/next date (`anchorDate`). Occurrence *k* (k = 0, 1, 2, …) is always computed **from the anchor**, never from the previous occurrence.

| Frequency | Occurrence k |
|---|---|
| `ONE_TIME` | anchor only (k = 0). `endDate` ignored. Never recurs. |
| `WEEKLY` | anchor + 7k days |
| `BIWEEKLY` | anchor + 14k days |
| `MONTHLY` | (anchor month + k) on day `min(anchorDay, daysInMonth)` |
| `QUARTERLY` | (anchor month + 3k) on day `min(anchorDay, daysInMonth)` |
| `YEARLY` | (anchor month + 12k) on day `min(anchorDay, daysInMonth)` |

- **Month-end policy:** if the anchor day doesn't exist in a month, use the **last day of that month**. The anchor day is preserved for later months: Jan 31 → Feb 28 (Feb 29 in leap years) → Mar 31 → Apr 30. This avoids drift. Yearly Feb 29 → Feb 28 in non-leap years, Feb 29 in leap years.
- No occurrences before the anchor. `endDate` is inclusive. Occurrences after `endDate` are not generated.
- **Inactive** income or bills generate nothing.
- Income uses the actual payday. Biweekly pay is **never** split into weekly amounts.

## 5. Occurrence status (bills)

A `BillOccurrence` row, keyed by `(billId, dueDate)`, records the user's status for one scheduled occurrence. No row means `UPCOMING` at the bill's default amount.

| Status | Effect on projection |
|---|---|
| `UPCOMING` | Counted once on its due date. |
| `PAID` | **Counted once on its due date, exactly like UPCOMING.** The status is tracking only. Marking a bill paid never creates a second expense and never removes the original one. (The projection models money leaving the account on the scheduled date. With a `MANUAL` balance, update the starting balance and start date to reflect the real bank balance; with `ACCOUNTS` a bank refresh does that.) |
| `SKIPPED` | **Not counted.** It appears in the ledger with `included: false` and `signedAmountCents: 0` for transparency. Future occurrences are unaffected. |

- `amountOverrideCents` (variable bills) replaces the default amount for that one occurrence only.
- Status is tracking data, separate from the bill definition. Editing a bill (amount, date, frequency) **never rewrites or deletes** occurrence rows. If the schedule moves, old rows simply stop matching a generated date and are kept as history. Deleting a bill cascades and deletes its occurrence rows.
- The API rejects a status update for a date that isn't a scheduled occurrence of that bill (`400 BAD_REQUEST`).

## 6. Ordering within a day

The ledger is sorted by:
1. `date` ascending
2. kind: **income before bills** (paychecks are assumed to land before bills are drafted that day)
3. `name` ascending (case-insensitive, then exact)
4. `sourceId` ascending (a deterministic tiebreak)

`sequence` is the 0-based position in that global order. `balanceAfterCents` is the running balance after each event. Skipped events carry the unchanged balance.

## 7. Days, weeks, totals

- **Day:** `opening` = previous day's closing (or the starting balance on the start date). `closing = opening + income − bills`.
- **Week:** starts on `weekStartsOn` (0 = Sunday, the default; 1 = Monday). The first week is the one containing `projectionStartDate` and may be **partial** (`rangeStart > weekStart`). Its opening is the starting balance. Each subsequent week's opening **equals** the previous week's closing. `closing = opening + income − bills`.
- **Lowest balance** = minimum **end-of-day** balance (including the opening balance) over the period. Using end-of-day balances makes it independent of intra-day ordering.
- **Reconciliation invariants** (tested):
  - `week.closing = week.opening + week.income − week.bills`
  - `weeks[i+1].opening = weeks[i].closing`
  - `opening + Σ(signedAmountCents of events in range) = closing` for every day, week and the whole range
  - the event ids in weeks and days partition the event list exactly (no duplicates, no omissions)

## 8. Dashboard reference date

`referenceDate = max(today, projectionStartDate)`, clamped to the window end. "Current week" is the week containing the reference date, and "next week" is the one after it. The next paycheck is the first income event on or after the reference date. Upcoming bills are non-skipped bill events in `[referenceDate, referenceDate + 13]`, up to 8 of them.

### Safe to spend and savings goals

`DashboardResponse.safeToSpendCents` is the most the user can spend today without a future end-of-day balance dropping below the balance floor, and without putting a savings goal off track. It is computed by `buildDashboard` (with `computeGoalReserve` and `applyGoalReserve` in `src/domain/savings-goals.ts`); the UI only renders it, together with `goalReserve` (what the goals took out).

1. `aboveFloor = min(closing balance of every day from referenceDate to the window end) − balanceFloorCents`.
2. Each goal is judged by `evaluateSavingsGoal`, the same test as the Savings Goals page: it is **supported** when the projected balance on its target date is at least its target (a date past the window uses the last projected balance). The goal's `weeksRemaining` is `ceil(days from today to the target date / 7)`.
3. A goal whose target date is **before `today`** (past due) is ignored. A goal due today counts, with 0 weeks left treated as 1.
4. A goal that is **not supported** needs a set-aside: `weeklySetAsideCents = ceil(shortfall / max(1, weeksRemaining))`, which is `weeklyAmountNeededCents` from `evaluateSavingsGoal`. `goalReserve.setAsideCents` is the sum over these goals, listed in `goalReserve.goals` (soonest target date first). That is a per-week amount, subtracted whole from today's figure, whatever day of the week it is.
5. A goal that **is supported** has headroom = projected balance on the target date − target. Spending today lowers that balance, so the tightest headroom caps the figure. `goalReserve.limitedBy` names the goal that does so, and is `null` unless its headroom is below `aboveFloor`.
6. `safeToSpendCents = max(0, min(aboveFloor, tightest supported headroom) − setAsideCents)`. The floor and the goals are separate limits, not stacked: a goal's target is not added to the floor. The set-aside comes out of money above the floor, and the result is clamped at zero.
7. Goals have a target amount and date only (no saved amount, no archive state), so every goal not past due takes part. With no goals the result is the plain floor figure and `goalReserve` is `{ setAsideCents: 0, goals: [], limitedBy: null }`.

A what-if scenario dashboard applies the same rule on the scenario's projection.

## 9. Engineering rules

- One calculation engine: `src/domain/projection.ts`. The UI **never** recomputes balances. It renders `ProjectionResponse` and `DashboardResponse`.
- The domain modules (`src/domain/*`) are pure functions. They have no Prisma, no `Date.now()` (today is passed in) and no I/O.
- All input is validated with the Zod schemas in `src/contracts/api.ts`, shared by server and client.
- Errors use the `ApiErrorBody` shape: `{ error: { code, message, fieldErrors? } }`.
- The data access layer is scoped by `householdId` (always `"local"` in the MVP).
- There are no analytics and no external services except the optional **SimpleFIN Bridge** bank connection (see *SimpleFIN (bank connections)* below). Any other provider must be documented here first; credentials stay server-side and are never exposed to the browser.
- **Only src/server/simplefin.ts touches setup tokens and Access URLs.** It never logs them, never puts them (or the Authorization header) in an error message, and no DTO or API response ever contains an Access URL. Pure parsing lives in src/server/simplefin-mapping.ts (no I/O). Tests mock fetch or the module and never call the network.
- The app runs on port **3000** only. `scripts/check-port.mjs` fails loudly if the port is taken.

### SimpleFIN (bank connections)

SimpleFIN Bridge is the only bank-connection provider. It is read-only, paid by the user directly to SimpleFIN, and optional.

- **Setup token and Access URL.** The user pastes a *setup token* (base64 of a claim URL). The server decodes it and POSTs to the claim URL once; the response body is the *Access URL* (`https://user:password@host/simplefin`), which is stored in `BankConnection.accessUrl` and used only by `simplefin.ts`. The claim URL comes from user input, so it is POSTed to only if it is `https` on `simplefin.org` or a subdomain (not `evilsimplefin.org`, not `simplefin.org.evil.com`, no credentials or port); anything else is a `400` before any network call. The returned Access URL is validated by the same host rule and must carry credentials. `fetch` rejects credentials in URLs, so requests strip them and send `Authorization: Basic base64(user:pass)`, with redirects disabled and a 20 second timeout.
- **The Access URL is encrypted at rest** (`src/server/secret-box.ts`). A stored value is self-describing: `enc:v1:os:<base64>` (desktop app, Electron `safeStorage`, i.e. Windows DPAPI, tied to that Windows account), `enc:v1:key:<base64>` (AES-256-GCM under `CASHFLOW_SECRET_KEY`, 32 bytes base64, for the plain `next dev` / `next start` server), or a legacy plaintext `https://...`. New writes use the desktop keystore if the app registered one, else `CASHFLOW_SECRET_KEY` if set, else **plaintext** (the plain server with no key configured). A legacy plaintext value is still read and is re-encrypted in place on its next sync once a sealer exists; no schema migration is involved. Decryption happens only in the institutions repository, right before the request; the URL and its ciphertext are never in a DTO, response, log or error message. A value that cannot be decrypted (database restored on another computer or Windows account, key missing or changed) makes Refresh fail with `409 CONFLICT` asking the user to remove the connection and connect again with a new setup token. Backups and the database file hold only the encrypted value; a database containing `enc:v1:os:` values is readable only by the desktop app of the same Windows account.
- **Amounts** are decimal strings converted to integer cents by **string parsing**, never floats (`"-12.34"` becomes `-1234`, `"12.3"` becomes `1230`). More than two decimals round half away from zero. Values outside the signed 32-bit range are treated as unreadable.
- **Sign convention: money in is positive, money out is negative**, exactly as SimpleFIN reports it (`BankTransaction.amountCents`). This is the opposite of bills, which are positive magnitudes whose sign comes from their kind. The UI shows the sign and an arrow, not color alone.
- **Dates:** SimpleFIN timestamps are epoch seconds; they become the **UTC calendar date** (`YYYY-MM-DD`) of that instant. A transaction with no `posted` time (pending) uses `transacted_at`, else the sync date (the server's local today, passed in). A missing balance date uses the sync date.
- **Currency:** stored as given when it is a 3-letter code; a non-ISO value (SimpleFIN allows a URL) is stored as `USD`. Display only, no conversion.
- **Stored snapshot, explicit sync.** SimpleFIN allows **24 requests per day** (abuse gets the token disabled) and refreshes bank data about once a day. The app therefore never fetches while a page is viewed: it fetches on *connect* and on the user's *Refresh*. A refresh needs **at least 15 minutes** since the last successful sync (`409 CONFLICT` otherwise); `lastSyncedAt` moves only after a successful fetch.
- **Window:** each request covers at most 90 days. The first sync fetches the last ~90 days; later syncs start 7 days before `lastSyncedAt` (late-posting items), never earlier than the cap, floored to a UTC midnight; `end-date` (exclusive) is now plus one day.
- **History window:** only the last **89 days, counting today** (dates >= today - 88 days, HISTORY_DAYS / historyCutoff in simplefin-mapping.ts) are shown or kept. The transactions endpoint filters by it, so rows age out of view even without a sync, and every sync deletes older rows. SimpleFIN returns at most 90 days per request anyway, so there is no backfill.
- **Replace-in-window:** in one database transaction, accounts are upserted and, per account, all stored *pending* transactions and all non-pending ones dated inside the fetched window are deleted and replaced by the fetched rows (no duplicates, stale pending rows disappear). After each sync, transactions older than the history window (below) are deleted. An account that SimpleFIN reports an error for keeps its stored transactions.
- **Warnings** (`errlist` messages, or the deprecated `errors` strings) are plain display text, rendered as text only. If the claim succeeds but the first sync fails, the connection is kept (a token can't be claimed twice) and the failure is returned as a warning.
- Removing a connection is local only (SimpleFIN has no revoke API); the UI tells the user to disable the token in their SimpleFIN account.

## 10. Domain module API (pure, unit-testable)

The domain modules are the contract that the tests are written against. Their exported signatures are the source of truth, so this file does not repeat them: read the module.

| Module | Owns |
|---|---|
| `src/domain/money.ts` | parsing input to cents, formatting cents, summing |
| `src/domain/dates.ts` | `YYYY-MM-DD` arithmetic (add days or clamped months, diff, week start, clamp, machine-local today) |
| `src/domain/recurrence.ts` | `Schedule` and anchored occurrence generation (section 4) |
| `src/domain/projection.ts` | window and range resolution, `computeProjection`, same-day ordering (sections 3, 6, 7) |
| `src/domain/dashboard.ts` | `buildDashboard` (section 8) |
| `src/domain/savings-goals.ts` | `evaluateSavingsGoal`, `computeGoalReserve`, `applyGoalReserve` (section 8, safe to spend and savings goals) |
| `src/domain/starting-balance.ts` | `effectiveStartingBalanceCents`, `effectiveProjectionStartDate`, `startDateFromAccounts` (section 3) |
| `src/domain/account-kind.ts` | `guessAccountKind`, the first label for a new bank account (section 3) |
| `src/domain/card-payments.ts` | `matchCardPayments`, the bank debits that pay a credit account (section 13) |
| `src/domain/recurring.ts` | `detectRecurring` and merchant-name normalisation (section 12) |
| `src/domain/subscriptions.ts` | `buildSubscriptionAudit`, `annualCostCents`, `isCancelCandidate`, the Subscriptions page's rows, annual cost and cancel candidates (section 12) |
| `src/domain/spending.ts` | `categorize`, `merchantKey` and `buildSpending` (section 13) |
| `src/domain/card-bill.ts` | `estimateCardBill` credit-card bill estimator (issue #61) |
| `src/domain/debt-payoff.ts` | `planDebtPayoff` debt payoff planner, snowball vs. avalanche (issue #50) |
| `src/domain/bill-match.ts` | `matchBillPayments`, bank transactions to unpaid bill occurrences (section 14) |
| `src/domain/estimate.ts` | `estimateBillAmount`, the suggested amount for a variable bill (section 15) |
| `src/domain/alerts.ts` | `buildAlerts`, the desktop notifications' content (section 16) |
| `src/domain/low-point.ts` | `findLowPointBills`, bills before the next payday that raise the dashboard's full-window low when moved (section 17) |
| `src/domain/register-csv.ts` | `registerToCsv`, CSV escaping and formula neutralizing (section 18) |
| `src/domain/monthly-summary.ts` | `buildMonthlySummary`, month bounds and labels (section 18) |

Rules for every module: pure functions, no Prisma, no I/O, no `Date.now()` (today is passed in). ESLint enforces this (`eslint.config.mjs`, the `src/domain` block), and bans `parseFloat` across `src/` because money is parsed from strings. If you change an exported signature, update its callers and tests in the same PR and mention it in the PR description.

## 11. Team workflow rules

- Node.js **24 LTS** is the project standard. Use the version pinned in `.nvmrc` (currently **24.22.1**); `package.json` permits newer Node 24 releases but excludes other major versions, and npm enforces this through `.npmrc`. Keep `.nvmrc` current with Node 24 LTS patch releases. With nvm, run `nvm install` and `nvm use` from the repository root. With a portable Node in `.tools/node` (git-ignored), put it first on `PATH` (`$env:Path = "$PWD\.tools\node;$env:Path"` in PowerShell, `export PATH="$PWD/.tools/node/bin:$PATH"` on macOS/Linux). Verify with `node --version`.
- **Port 3000 only.** `scripts/check-port.mjs` fails loudly if the port is taken. Do not start a second `next dev` on 3000, and do not run `next build` in a checkout where a dev server is running (they share `.next/`). Worktrees have their own `.next/` and their own `prisma/dev.db`.
- **Protecting data.** Real data lives in the main checkout's `prisma/dev.db` and the desktop app's `cashflow.db`. Never run `db:reset`, `prisma migrate reset`, `prisma db push` or `prisma migrate dev` against either. Apply migrations with `npm run db:deploy`. The E2E suite resets the database behind port 3000 and requires `E2E_ALLOW_DATA_RESET=1`; run it only against a server you started from your branch.
- **Migrations** are forward-only, additive and hand-reviewed SQL files. Create with `prisma migrate dev --create-only`, read the SQL, apply with `db:deploy`. Never edit a shipped migration. Dropping a table or column needs a data copy in the same migration and a note in the PR. The desktop app applies pending migrations on launch after backing up `cashflow.db` (`<userData>/backups/`). On Windows, schema changes need the dev server stopped (the engine DLL is locked).
- **Dependencies.** Anyone may add a package with `npm install <pkg>` (the lockfile updates with it). Prefer releases at least two weeks old, run `npm audit`, keep the app offline-capable (no runtime network calls or telemetry beyond SimpleFIN), and justify the package in the PR.
- **Version and commits.** Conventional Commits: `fix` → patch release, `feat` → minor release, `!`/`BREAKING CHANGE` → minor while 0.x; other types release nothing. Don't edit the version by hand. Release-please opens a Release PR; merging it publishes the release. See [AGENTS.md](../AGENTS.md).
- **Checks.** `npm run typecheck`, `npm run lint` and `npm test` must pass before a PR is opened. CI runs the same on every PR.

## 12. Recurring-payment scan

Finds repeating payments and deposits in the stored bank history (section 9, SimpleFIN) and suggests them as bills or income. Pure rules in `src/domain/recurring.ts`. The scan reads the local snapshot only and **never calls SimpleFIN**.

- **Input:** settled (non-pending) transactions in the 89-day history window, from accounts labelled `BANK` only (section 3, the same rule as the starting balance). A bill or income has to move money through a bank account: a card's purchases are paid for by the card payment (which this scan can suggest from the bank side), and the payment received on a card would otherwise look like a monthly income. A single account can be scanned by passing its id.
- **Grouping:** by direction (money in = income, money out = bill) and a normalised merchant name. Reference numbers and bank boilerplate (`POS`, `DEBIT`, `ACH`, …) are dropped; the first 3 words form the key. Several charges on the same day are one sighting, with amounts summed.
- **Cadences:**

| Frequency | Gap between sightings | Min. sightings | Amount tolerance (vs. median) | Stopped if last sighting is older than |
|---|---|---|---|---|
| `WEEKLY` | 6–8 days | 3 | 15% | 14 days |
| `BIWEEKLY` | 13–15 days | 3 | 15% | 28 days |
| `MONTHLY` | 26–35 days | 2 | 10% (2 sightings), 40% (3+) | 45 days |

- Quarterly and yearly payments are **not detectable**: they don't repeat inside 89 days.
- **Amount:** the latest occurrence. `amountVaries` is true when amounts differ by more than 2% of the median.
- **Next date:** the first expected date on or after today. Weekly and biweekly step 7 or 14 days from the last sighting. Monthly uses the usual day of month; a clamped month-end does not override a 31st (section 4).
- **Already tracked (left out of the suggestions):** an existing bill or income of the same kind that is not one-time and not ended (paused counts) when any of these hold:
  1. one name's words (ignoring bank boilerplate) are all in the other name;
  2. same first word (5+ letters) and amount within 25%;
  3. same frequency, amount within 3%, and a scheduled date within 3 days (monthly) or 1 day (weekly, biweekly) of the suggested next date.
- **Order:** next date, then income before bills, then name.
- **Skip is per scan.** Nothing is stored, so skipped suggestions reappear on the next scan.
- **Adding** a suggestion uses the normal `POST /api/bills` or `POST /api/income`, with the notes "Found in your bank history."

### Subscription audit (the Subscriptions page)

The same history also drives the subscription audit, which shows the user's subscriptions as a whole. It reads the local snapshot only and never calls SimpleFIN.

- **Scope:** detected recurring charges **and** the bills the user already tracks. Income is left out — this view is about money out. Detected rows show the number of sightings and a "Not a subscription" action; tracked rows are marked "Tracked" (or "Paused" when inactive). One-time bills are not subscriptions, so they are not listed.
- **Annual cost:** amount × cadence (weekly 52, every-2-weeks 26, monthly 12, quarterly 4, yearly 1). Paused bills count 0. The header total is the detected charges plus the active tracked bills.
- **Cancel candidate (cadence-aware):** a detected charge is a cancel candidate when it has been idle longer than its interval plus a grace period — weekly 7 + 4 days, every-2-weeks 14 + 7 days, monthly 30 + 7 days. A monthly bill on its due date is never flagged, and tracked bills are never candidates.
- **Not a subscription:** the user can mark a detected charge as "not a subscription". The suggestion's `key` is stored (`DismissedRecurring`) and the audit stops showing it; nothing else is changed. Marking something tracked as a bill is the existing `POST /api/bills`.

## 13. Spend analyzer

Shows where money went last month and so far this month, grouped by category. Pure rules in `src/domain/spending.ts`. It reads the local bank snapshot only and **never calls SimpleFIN**.

- **Input:** settled (non-pending) transactions in the 89-day history window, from accounts labelled `BANK` or `CREDIT` (section 3). Card purchases count where they happen; accounts labelled `LOAN` or `OTHER` are left out. That window always covers last month and this month, because last month's first day is at most about 61 days back. The page shows the earliest transaction date (`coverageStart`) so a newly connected bank with thin history isn't mistaken for low spending.
- **What counts as spending:** money out only (`amountCents < 0`), counted as a positive magnitude. Money in (income, refunds) is ignored and refunds are **not** netted against purchases.
- **Periods** are calendar months by the transaction's `YYYY-MM-DD` date (section 9 dates). *This month* runs from the 1st through today; *last month* is the whole previous month. `lastMonthToDateCents` is last month's spending from the 1st through today's day number (clamped to that month's length, so on Mar 30 it covers Feb 1-28/29), for a like-for-like comparison.
- **Categories** (`SPENDING_CATEGORIES`): Groceries, Dining, Gas, Utilities, Bills, Shopping, Transport, Entertainment, Health, Transfers, Other. A transaction gets the **first** category whose keyword list matches the lower-cased description, tried in a fixed priority order so overlaps are deterministic (a gas station is Gas, not Shopping). Nothing matching is `OTHER`. Keyword matching is whole-word or word-prefix on tokens, never an arbitrary substring.
- **Transfers** (payments to a card, transfers between accounts, peer-to-peer apps, cash withdrawals) are summed separately in `transfersCents` and are **excluded** from `totalCents`, `categories` and `topMerchants`, so moving money around doesn't look like spending. The UI still shows Transfers as a row in "By category", sorted in by amount and marked "not in total", so a large card payment is visible; it has no percentage and the bar is grey.
- **Card payments** are found by matching, not by words (`matchCardPayments`, `src/domain/card-payments.ts`): a money-out transaction on a `BANK` account is a transfer (`source: AUTO`) when a `CREDIT` account received exactly the same amount within 5 days, either side first. Each receipt pairs with one debit, the closest dates first, so two equal payments in two months each find their own. The user's choice and the learned merchant rule still win over the match, and the keywords above still catch payments whose other side isn't in the history (a card that isn't connected, or a receipt older than 89 days). An unrelated debit that happens to equal a card refund to the cent within 5 days would be read as a transfer; the category can be changed like any other.
- **Merchants:** transactions are grouped by the same normalised name used by the recurring scan (section 12); the top 5 by total are returned per period. Bank prefixes that only say how a purchase was made (`POS`, `DDA PUR AP`, …) are dropped from the name; otherwise they would put every purchase in one merchant.
- **The user's choices.** A transaction's category is the first of: (1) the user's choice for that transaction (`TransactionCategory`, `source: MANUAL`), (2) the category the analyzer learned for its merchant (`MerchantCategoryRule`, `source: MERCHANT`), (3) the keyword match (`source: AUTO`). Any category, `TRANSFERS` included, can be chosen, so a misread transfer can be counted as spending and the other way round. Only money out can be categorized.
- **Learning.** Changing a category in the UI remembers it for the merchant by default (`applyToMerchant`). The merchant key is the first 3 words of the normalised name (`merchantKey` in `src/domain/spending.ts`, the same words the merchant list groups by), so "KROGER #1234" and "POS DEBIT KROGER 5678" are one merchant. The rule applies to every transaction with that key, in history and in later syncs, and the **latest choice wins**. Setting a merchant rule deletes the per-transaction choices for that merchant. A null category undoes a choice the same way, back to automatic. A description with no usable name has an empty key and can only be changed one transaction at a time.
- **Storage.** Choices live in two tables, not on `BankTransaction`, because a sync deletes and re-inserts transactions with the same id. `TransactionCategory` keeps the transaction's date and its rows are pruned when it leaves the 89-day history window; merchant rules are kept until reset. Stored categories that are no longer in `SPENDING_CATEGORIES` are ignored. Everything else is derived on every request, so improving the keyword lists re-categorizes whatever the user hasn't decided. "Reset all data" deletes both tables; the JSON backup does not include them yet, and restoring a backup leaves them untouched.

## 14. Bill payment matches

Offers to mark a bill occurrence paid when a synced bank transaction looks like its payment. Pure rules in `src/domain/bill-match.ts`. It reads the local bank snapshot only and **never calls SimpleFIN**.

- **Offer, never auto-apply.** Matching only suggests. An occurrence becomes `PAID` only when the user confirms, through the normal `PUT /api/bills/:id/occurrences/:date`. Marking paid is tracking only (section 5): the bill still counts once on its due date and no balance, week or total changes. A test compares the projection before and after.
- **Input:** settled (non-pending) transactions in the 89-day history window (section 9), all accounts, and the occurrences of **active** bills generated by the normal recurrence rules (section 4) for the dates those transactions cover. Only money out (`amountCents < 0`) counts, and only transactions dated on or before today.
- **A transaction matches an occurrence when all three hold:**
  1. **Merchant:** the bill name and the bank description (after the cleanup of section 12: reference numbers and bank boilerplate dropped) have one name's words all in the other, or share a first word of 5+ letters. These are the same helpers (`namesOverlap`, `sharesLeadWord`) the recurring scan uses to decide a payment is already tracked.
  2. **Date:** posted within **3 days** either side of the due date (late posting, early autopay).
  3. **Amount:** within **10%** of the expected amount, measured against the larger of the two. The expected amount is the occurrence's `amountOverrideCents` when set, else the bill's amount.
- **Unpaid only:** occurrences with a `PAID` or `SKIPPED` row are never offered. `UPCOMING` rows (for example an amount override) and no row at all are.
- **One to one.** Each transaction and each occurrence is used at most once. Pairs are taken closest date first, then closest amount, then bill name and id. If one transaction fits occurrences of two *different* bills equally well (same date gap and amount gap) it is ambiguous and is offered for neither.
- **Order:** due date, then bill name.
- **Confirming** keeps the occurrence's existing amount override and note (they are in the offer), so only the status changes. Dismissing ("Not this one") is per page view: nothing is stored, so the offer returns on reload until the occurrence is marked paid or skipped.

## 15. Variable-bill estimate

Suggests an amount for a variable bill (electric, groceries) from the stored bank history. Pure rules in `src/domain/estimate.ts`. It reads the local bank snapshot only and **never calls SimpleFIN**.

- **A suggestion, nothing more.** The estimate is shown on request in the occurrence dialog ("Suggest from bank history"). Using it only fills the "Amount for this date only" field; the user still presses Save, which is the existing per-occurrence override (section 5). The bill's stored amount, existing overrides and the projection are never changed by an estimate, and it is never applied automatically.
- **Input:** settled (non-pending) transactions in the 89-day history window (section 9), money out only, dated on or before today. Amounts are summed as positive magnitudes in integer cents; refunds are ignored, not netted.
- **Matching:** a transaction belongs to a bill when one name's words are all in the other's, using the same normalised words as the recurring scan's "already tracked" rule (section 12, `nameTokens` and `namesOverlap`). So a bill named "City Electric" matches "POS DEBIT CITY ELECTRIC #8841". Rename the bill if the bank's description differs.
- **Periods:** payments are summed per billing period: a week (`WEEKLY`) or two weeks (`BIWEEKLY`), both counted from the bill's anchor date, or a calendar month (`MONTHLY`). Quarterly, yearly and one-time bills are not estimated (`UNSUPPORTED_FREQUENCY`). A period with no matching payment is not counted as zero.
- **Complete periods only:** a period counts only if it ended before today and started on or after the oldest day of the history window, so a month in progress or cut off by the window never lowers the average.
- **Rolling average (the default):** the mean of the latest 4 complete periods, rounded half up to whole cents. With 3 or more periods, one under half or over double the median is left out as an outlier (a catch-up payment, a refund-sized dip) if at least 2 remain.
- **Seasonal average:** for a `MONTHLY` bill, when the history holds the same calendar month as the occurrence's due date in an **earlier year**, the estimate is the mean of those months and `method` is `SEASONAL`. With the 89-day window this never happens; it only applies if history is ever kept longer. Seasonal data is never mixed with the rolling average.
- **No suggestion** (`estimate: null`, with a `reason`): `NO_BANK_DATA` (no stored transactions), `NO_MATCHES`, `TOO_FEW_PERIODS` (fewer than 2 complete periods with a match) or `UNSUPPORTED_FREQUENCY`. The UI says why and offers nothing to apply.

## 16. Desktop notifications

The Windows app shows native notifications (Electron `Notification`) for a projected negative balance, for bills due soon, and for an expected paycheck that never arrived. What to say is decided by the pure `buildAlerts` in `src/domain/alerts.ts` (from the normal projection, so it always agrees with the dashboard) and by `findMissingPaychecks` in `src/domain/missing-paycheck.ts` (from the income sources and the stored bank transactions). The app asks its own local server (`GET /api/alerts`, `127.0.0.1` only) and shows what is new. No network call leaves the machine.

- **Reference date** is the dashboard's (section 8): `max(today, projectionStartDate)`. Nothing is reported once today is past the projection window.
- **Low balance:** the first day in `[reference, reference + 13]` whose end-of-day balance (section 7) is below zero. Title "Balance goes negative today / tomorrow / Friday / Nov 20" (a weekday within the coming 6 days, else the date); the body gives that day's projected balance. A negative stretch that began before today (or a negative starting balance) reads "Balance is negative". One alert at most.
- **Bills due soon:** bills in `[reference, reference + 3]` that are included in the projection (not skipped) and not marked `PAID`. Title "Rent due in 3 days / tomorrow / today"; the body gives the amount (override applied) and the date.
- **Missing paycheck:** for each active `WEEKLY`/`BIWEEKLY` income source, each expected payday (`anchorDate` + 7k/14k days, capped by `endDate`) that is late by the 3-day grace period but still within a 14-day lookback of today is reported once, unless a matching deposit was seen. Only transactions in `BANK` (depository) accounts count — a credit-card, loan or "other" account can't receive a paycheck. A bank transaction matches when it is money in (`amountCents > 0`), its name overlaps the income name (`namesOverlap`, amount within 25% of the larger) or shares its leading word of 5+ letters (`sharesLeadWord`, amount within 10%), and it is dated within ±3 days of the expected payday. `ONE_TIME` income is not a paycheck and is ignored; `MONTHLY` income is ignored because the short lookback window suits paydays that repeat inside it. Nothing is reported when there is no bank history at all (we cannot tell "no deposit" from "no bank sync").
- **Once per event.** Every alert has a stable key: `low-balance:<first day of the negative stretch>` (an ongoing stretch keeps its key, a new one gets a new key), `bill:<billId>:<dueDate>` and `missed-paycheck:<incomeId>:<expected payday>`. The app records shown keys in `notified-alerts.json` in its user data folder (not in the database, so no migration) and forgets a key after its `expiresOn` (the last day of the stretch, the due date, or the expected payday + the 14-day lookback). A bill whose date is edited, a negative stretch that moves, or a distinct missed payday is a new event and is announced again. Deleting that file repeats the current alerts once.
- **When:** about 10 seconds after launch, then every 30 minutes while the app is open. Closing the window quits the app, so nothing is shown while it is closed.
- **Off switch:** Settings → Notifications → "Desktop notifications" (`Settings.desktopNotifications`, on by default, so a database from before the setting keeps its notifications). `GET /api/alerts` returns `enabled: false` and no alerts when it is off, and the app then shows nothing and does not touch `notified-alerts.json`, so turning it on again announces whatever is still relevant. The app reads the setting on every check, so a change applies by the next check (within 30 minutes) without a restart. Only the desktop app uses it; the web app has no notifications. Windows' own notification settings can still mute "CashFlow Planner".

## 17. Low-point bills

The dashboard analyzes the same full-window low shown by its “Lowest point” metric: the minimum end-of-day balance, including the opening balance, with the earliest date winning a tie (section 7). The next payday is the first included income event strictly after that date. If there is none, there are no suggestions. The cycle starts on the last included payday on or before the low, or at the projection window start when there is no earlier income event.

Candidates are included bill events (never `SKIPPED`) dated from cycle start through the low date, inclusive, and on or after the dashboard reference date. A bill on payday is included because income is applied before bills that day (section 6). To evaluate moving one occurrence, raise every end-of-day balance from its due date up to but not including the next payday by that bill's amount, then recompute the low over the entire window using section 7. Keep only moves that strictly raise the low. Sort by moved low descending, due date ascending, then name, and show at most five. The dashboard reports the original and moved low and notes that a due date can be changed only if the biller allows it. This is an estimate for one occurrence; later recurring occurrences remain unchanged.


## 18. Exports (register CSV, monthly summary PDF)

Two downloads from the Calendar's Export menu, built on the server from the one projection engine (section 9): `registerToCsv` and `buildMonthlySummary` only reformat and regroup what `computeProjection` returned, and never recompute a balance. Endpoints: [API.md](API.md). Issue #52 left the scope open; these are the decisions.

- **Register CSV.** One row per ledger event in the requested range, in ledger order (section 6), with the engine's running `balanceAfterCents`. Range, clamping and defaults are exactly the projection's (section 3). The Calendar's menu exports the month on screen (week view: the week), cut to the projection window; the API defaults to the whole window.
- **Money in files.** The same exact decimal string as everywhere (`centsToDecimalString`, never floats): `-1199.99`, no symbol and no thousands separator, so a spreadsheet reads a number. The currency is in the column headers (`Amount (USD)`). Dates stay `YYYY-MM-DD`. `Amount` is signed like the register (income `+`, bills `-`, override applied). A skipped bill (section 5) keeps its amount, is marked `Skipped` and leaves the balance unchanged.
- **CSV safety.** RFC 4180 quoting (comma, quote, CR or LF), CRLF line ends, a UTF-8 byte-order mark for Excel. Name and category cells that a spreadsheet would run as a formula (first non-space character `=`, `+`, `-`, `@`, or a tab, CR or LF) get a leading `'`. Amount and balance cells are our own numbers and are never prefixed.
- **Monthly summary PDF.** One calendar month (`YYYY-MM`) from the same projection, cut to the window: a month the window only partly covers (the start date falls inside it, or the 12-month limit does) is reported for the dates it covers and says so; a month wholly outside is a `400`. Contents: opening balance (before the first covered day's events), counted income, counted bills, net change, closing balance, the lowest end-of-day balance and its date (section 7), the days below zero, skipped bills (listed as not counted), the engine's weeks clipped to the month, income grouped by source name, and bills grouped by their free-text category (blank is "Uncategorized"; the table is left out when no bill has a category). Skipped bills are in no total or group. Groups are largest first, then by label. Bank transactions and accounts are **not** used: the report is a projection, and it says "not a bank statement".
- **PDF engine.** `pdf-lib` (pure JavaScript, no network, no font files; Helvetica built in). Characters Helvetica cannot encode are drawn as `?`. Layout is US Letter and lives in `src/server/monthly-summary-pdf.ts`.
- **Not included (yet):** XLSX, other page sizes, a custom date range in the UI, charts, and a spending-by-category report from bank history (section 13).
