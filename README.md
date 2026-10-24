# CashFlow Planner

A local, single-user personal cash-flow planner. It answers one question:

> **How much money will I have left each week after accounting for my income and all my upcoming bills?**

You enter a starting balance, your paychecks (weekly, biweekly or one-time) and your bills (one-time, weekly, biweekly, monthly, quarterly, yearly). CashFlow Planner projects your running balance day by day and week by week on a calendar, and explains every number with an event ledger.

- Runs entirely on your machine at **http://localhost:3000**. There are no accounts and no analytics. The only external call is the optional [SimpleFIN Bridge](https://www.simplefin.org) bank connection, and only when you connect or refresh a bank.
- Projections are estimates. They assume every scheduled paycheck arrives and every listed bill is paid on time.

## Features

- **Calendar (main screen):** month and week views. Every week shows the opening balance, income, bills, net change and **projected closing balance**. Every day shows its paychecks and bills, and the end-of-day balance. Select a week to see the ordered breakdown with the running balance after each event. Select an event to mark a bill occurrence paid or skipped, override this occurrence's amount, or edit the underlying bill or income.
- **Dashboard:** starting balance, next paycheck, projected end of this week and next week, lowest projected balance, totals, a negative-balance warning, upcoming bills and a balance trend chart.
- **Income & Bills:** create, edit, delete and deactivate, with optional end dates, categories and notes.
- **Institutions:** optionally connect a bank read-only through SimpleFIN Bridge, see its accounts and balances, browse the transactions saved from your last sync, refresh on demand, and remove it again.
- **Settings:** starting balance, projection start date, currency, forecast length (7–366 days), week start day and default calendar view. Also load demo data or clear everything.

## Prerequisites

- **Node.js 24 LTS** (24.22.1 or newer within Node 24) and npm. `.nvmrc` pins the standard development and CI version to **24.22.1**; run `nvm install` and `nvm use` if you use nvm. npm rejects unsupported Node versions through `.npmrc`.
- No database server is needed. SQLite is stored in a file at `prisma/dev.db`.

> **Windows portable setup:** if using `.tools/node` (git-ignored), install the Node 24 release specified in `.nvmrc` there. Put it first on your PATH in each PowerShell window before running any command below:
> ```powershell
> $env:Path = "$PWD\.tools\node;$env:Path"
> node --version   # v24.22.1
> ```

## Setup

```bash
npm ci                      # installs locked dependencies and generates the Prisma client
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
npm run db:deploy           # creates prisma/dev.db and applies migrations
npm run db:seed             # OPTIONAL: loads clearly labeled demo data ("Demo: …")
```

To start with a clean database, skip the seed step. You can also clear everything later from **Settings → Data**, or with `npm run db:reset`.

## Run

```bash
npm run dev      # development server on http://localhost:3000
# or
npm run build
npm start        # production server on http://localhost:3000
```

The app only runs on port 3000. If the port is busy, `npm run dev` and `npm start` stop with a clear message instead of switching to another port.

## Desktop app (Windows)

```bash
npm run desktop:dist     # builds dist-desktop/CashFlow Planner Setup <version>.exe (NSIS installer)
npm run desktop:start    # builds and runs the desktop app from source (data: %APPDATA%\CashFlow Planner (dev))
```

The installer adds Start menu and desktop shortcuts. The app opens in its own window and runs the Next.js server inside Electron's main process, on `127.0.0.1` at a random free port, so it never conflicts with `npm run dev`. Closing the window quits the app and frees the port. Data lives in `%APPDATA%\CashFlow Planner\cashflow.db`, which is created and migrated on first launch (applied migrations are tracked in `_app_migrations`). The installer is unsigned, so Windows SmartScreen asks once: **More info → Run anyway**.

On pushes to `main`, the workflow publishes the Windows NSIS installer as a GitHub Release tagged `v<package.json version>`, unless that tag or release already exists. `workflow_dispatch` can rerun it manually. The setup filename includes the app version.

> If `ELECTRON_RUN_AS_NODE=1` is set in your shell (some IDE terminals set it), the exe silently runs as plain Node. Run `Remove-Item Env:ELECTRON_RUN_AS_NODE` first.

## Bank connections (optional, SimpleFIN Bridge)

The **Institutions** page connects your bank read-only through [SimpleFIN Bridge](https://beta-bridge.simplefin.org). SimpleFIN is a paid service run by SimpleFIN, not by this app: **$1.50 per month or $15 per year**, paid to SimpleFIN.

1. Make an account at SimpleFIN Bridge and link your bank there. Your bank login stays with SimpleFIN and never touches this app.
2. Create a **Setup Token** at <https://bridge.simplefin.org/simplefin/create>. It is shown once and can be claimed only once.
3. In the app, open **Institutions**, choose **Connect a bank**, and paste the token.

The app claims the token on the server, saves the connection and loads your accounts, balances and recent transactions (the last 89 days on the first sync).

- **Sync is explicit.** SimpleFIN allows about 24 requests per day and refreshes bank data roughly once a day, and a token that goes over the limit can be disabled. So the app never fetches while you browse: it fetches when you connect and when you press **Refresh**, and refuses a second refresh within 15 minutes.
- **Transactions are stored locally this time.** Because live fetching isn't practical, the accounts, balances and transactions from the last sync are saved in the local database (`prisma/dev.db`) so the pages work offline and don't spend your daily requests. Each refresh re-reads the last week or so and replaces what it covers. Only the last 89 days are ever shown or kept: older transactions are deleted on each refresh.
- **The Access URL is a secret.** SimpleFIN's Access URL contains the credentials for your connection. It is stored unencrypted in the local database, like the rest of your data, is used only by the server, and is never sent to the browser or included in any API response or log.
- **Removing a connection** deletes it, its accounts and its stored transactions from this app only. SimpleFIN has no revoke call, so to fully revoke access also disable the token in your SimpleFIN Bridge account.
- Bank data never changes your projection.

## Test & quality checks

```bash
npm run typecheck          # TypeScript
npm run lint               # ESLint
npm run test:unit          # projection engine, recurrence, dates, money
npm run test:integration   # API route handlers against a separate test SQLite DB
npm test                   # all Vitest suites (unit + integration + component)
npx playwright install chromium   # once, to download the E2E browser
npm run test:e2e           # Playwright end-to-end (reuses or starts the server on :3000; resets app data)
```

Integration tests use their own database file and never touch `prisma/dev.db`. E2E tests drive the real app and **reset the data in `prisma/dev.db`**, so run them against a dev database you don't mind losing.

## How projections work (key assumptions)

The full rules are in [docs/CONVENTIONS.md](docs/CONVENTIONS.md). In short:

- **Money** is stored and calculated as integer cents. Floating-point is never used for money.
- **Starting balance** is your balance at the start of the projection start date, *before* any paycheck or bill dated that day. Events on the start date are included.
- **Forecast window** runs from the start date for `forecastDays` days (default 90). The calendar can browse up to 12 months past the start date. Nothing before the start date affects balances.
- **Recurrence is anchored** to the date you enter. Weekly is every 7 days and biweekly every 14 days from the first payday; biweekly pay is never split into weekly amounts. Monthly, quarterly and yearly keep the original day of the month. When a month is too short, they use its last day (Jan 31 → Feb 28/29 → Mar 31). End dates are inclusive.
- **Same-day order:** income first, then bills, each alphabetically. Daily and weekly totals don't depend on this order. The "lowest balance" uses end-of-day balances.
- **Weeks** start on Sunday by default (Monday is available). The first week may be partial. Each week's opening balance equals the previous week's closing balance.
- **Paid vs. skipped:**
  - Marking an occurrence **paid** is tracking only. It is still counted exactly once on its due date, never twice.
  - **Skipped** occurrences don't count at all, and later occurrences are unaffected.
  - Per-occurrence amount overrides support variable bills.
  - Editing a bill never rewrites past paid or skipped records.
- To line projections up with your real bank balance, update the starting balance and start date in Settings.

## Architecture

```
src/
  contracts/api.ts      Zod schemas + typed API contract shared by server, UI and tests
  domain/               Pure, deterministic engine (no I/O): money, dates, recurrence, projection, dashboard
  server/               Prisma client, repositories (scoped by householdId), error helpers, demo data
  app/api/              Next.js route handlers (REST API, see docs/API.md)
  app/                  Pages: / (dashboard), /calendar, /bills, /income, /institutions, /settings
  components/, lib/     UI components and typed API client
prisma/                 schema.prisma, migrations, seed.ts
tests/                  unit, integration, component, e2e
docs/                   CONVENTIONS.md (financial rules), API.md (endpoints)
```

The UI never calculates balances itself. It renders what the projection engine returns through `/api/projection` and `/api/dashboard`, so every view shows the same numbers.

## Privacy

All data lives in `prisma/dev.db` on this computer. The only external network call is the optional SimpleFIN Bridge bank connection (when you connect or refresh a bank on the Institutions page), and Next.js telemetry is disabled through `NEXT_TELEMETRY_DISABLED=1` in `.env`.

## Known dependency advisories

`npm audit` reports a high-severity advisory in `deepmerge-ts`, which is pulled in by Prisma 6's dev-time config loader. The only fix is the breaking Prisma 7 upgrade. The issue requires merging attacker-controlled recursive objects into Prisma config, which doesn't happen in this local app, so it is accepted for now. PostCSS is pinned to a patched version through `overrides` in `package.json`.
