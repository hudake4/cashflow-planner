# AGENTS.md

Instructions for AI coding agents working in this repository.

CashFlow Planner is a local, private Next.js app that projects a running cash balance week by week. The owner uses it every day with real financial data, so protecting that data comes before anything else here.

The money, date, recurrence and projection rules live in [docs/CONVENTIONS.md](docs/CONVENTIONS.md). `src/domain/` implements them and `tests/helpers/invariants.ts` checks them. If a rule changes, change the doc, the code and the tests in the same PR.

## Where to look

- Money, dates, recurrence, projection, bank sync: [docs/CONVENTIONS.md](docs/CONVENTIONS.md).
- Endpoints and error shapes: [docs/API.md](docs/API.md). Types and Zod schemas: `src/contracts/api.ts`.
- UI tokens, theme and components: [DESIGN.md](DESIGN.md).
- Layout, setup and commands: [README.md](README.md).

## Protect the user's data

Real data lives in `prisma/dev.db` in the main checkout and in `cashflow.db` under AppData for the desktop app. The `prisma/dev.db` in your own worktree is yours. Those two files are not.

- Do not run `npm run db:reset`, `prisma migrate reset`, `prisma db push` or `prisma migrate dev` against a database you did not create. Use `npm run db:deploy` to apply migrations.
- Do not run `npm run test:e2e` unless you started the server on port 3000 yourself from your branch. The suite deletes all data behind whatever server it finds, and it refuses to run without `E2E_ALLOW_DATA_RESET=1`.
- Do not call `/api/data/reset` or `/api/data/demo` against a server you did not start.
- Migrations are forward-only and additive. Create one with `npx prisma migrate dev --create-only --name <name>`, read the SQL, then apply it with `npm run db:deploy`. Never edit a migration that has shipped.
- If a table or column must go, copy its data in the same migration first, and say so in the PR. Try every migration on a copy of a database with data before you open the PR.
- The desktop app applies migrations on launch and backs up `cashflow.db` first. If you change a migration or `electron/server.ts`, state in the PR what happens to an existing database.
- Any new action that deletes or replaces data needs a confirmation step in the UI and a **Destructive** mark in `docs/API.md`.

## Working here

- Use Node 24 LTS from `.nvmrc`. Run `nvm use` (or put a portable Node first on `PATH`) before any command, and check with `node --version`.
- Fresh worktree: `npm ci`, `cp .env.example .env`, `npm run db:deploy`.
- Before you finish: `npm run typecheck`, `npm run lint`, `npm test`. Integration tests use their own SQLite file and are safe anywhere. CI runs the same three commands on every PR.
- The app binds port 3000 only. If it is taken, do not start a second server. Report it. For a throwaway UI check, `npx next dev -p <other port>` is fine.
- Adding a package is fine. Use `npm install <pkg>` so `package-lock.json` updates, prefer releases at least two weeks old, run `npm audit`, and name the package and the reason in the PR.
- The app must keep working offline. No runtime network calls and no telemetry, except SimpleFIN on connect and refresh.
- UI changes: look at a screenshot of the result in light and dark mode before you call it done.

## Commits and PRs

- Conventional Commits: `type(scope): description`, for example `fix(calendar): keep week totals aligned`.
- One version bump per PR, not per commit: `npm version patch|minor --no-git-tag-version`, chosen by the largest change in the PR (patch for fixes, docs and refactors; minor for features and visible UI changes; breaking changes are minor while the version is `0.x`). Stage `package.json` and `package-lock.json` with the change. CI rejects a PR whose version matches `main`. Pushing to `main` publishes that version as a Windows release, and the version shows at the bottom of Settings.
- Branch from `main`, open a PR to `main`. One feature or fix per PR.
