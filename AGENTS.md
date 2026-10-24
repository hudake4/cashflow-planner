# AGENTS.md

CashFlow Planner is a local, private Next.js app that projects a cash balance week by week. The owner uses it every day with real financial data.

- Use Node from `.nvmrc`. New worktree: `npm ci`, `cp .env.example .env`, `npm run db:deploy`.
- Before you finish: `npm run typecheck`, `npm run lint`, `npm test`. CI runs the same, plus `npm audit`, dependency review and CodeQL.
- The main checkout's `prisma/dev.db` and the desktop app's `cashflow.db` hold real data. Never reset, `migrate dev` or `db push` against them. Your own worktree's `prisma/dev.db` is yours. E2E uses its own throwaway database and needs `E2E_ALLOW_DATA_RESET=1`.
- Migrations are forward-only and additive: `prisma migrate dev --create-only`, read the SQL, `npm run db:deploy`. Try it on a copy with data. Say in the PR what happens to an existing database.
- Domain rules: [docs/CONVENTIONS.md](docs/CONVENTIONS.md). Endpoints: [docs/API.md](docs/API.md). UI: [DESIGN.md](DESIGN.md). Setup and commands: [README.md](README.md). A changed rule changes doc, code and tests together.
- Adding a package is fine: `npm install <pkg>`, commit the lockfile, say why in the PR. The app stays offline except SimpleFIN.
- Conventional Commits. One `npm version patch|minor --no-git-tag-version` per PR; CI requires a version above `main`. Pushing `main` publishes a release.
- UI changes: look at a screenshot in light and dark mode before you call it done.
