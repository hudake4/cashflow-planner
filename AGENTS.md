# AGENTS.md

Instructions for AI coding agents working in this repository.

CashFlow Planner is a local, private Next.js app that projects a running cash balance week by week. Read [docs/CONVENTIONS.md](docs/CONVENTIONS.md) before changing anything: it defines the money, date, recurrence and projection rules, and the team workflow (portable Node on `PATH`, one shared dev server on port 3000, no package installs without asking the lead).

## Rule: use Conventional Commits

All commit messages must follow Conventional Commits: `<type>[optional scope]: <description>`. Use a type such as `feat`, `fix`, or `docs`, followed by a short description.

Example: `docs(agents): require conventional commit messages`.

## Rule: bump the version with every commit

Every commit must include a version bump. The version lives in `package.json` (and is mirrored in `package-lock.json`). It is shown to users at the bottom of the Settings page, so it's how anyone can tell which build they're running.

Pick the bump by what the commit changes, following [semantic versioning](https://semver.org):

| Bump | When | Example |
|---|---|---|
| Patch (`0.1.0` → `0.1.1`) | Bug fixes, copy or styling tweaks, refactors, tests, docs | Fix a rounding display bug |
| Minor (`0.1.0` → `0.2.0`) | New features or noticeable UI changes, backward compatible | Add a version number to Settings |
| Major (`0.1.0` → `1.0.0`) | Breaking changes: data that no longer loads, removed features, API contract changes | Change the database schema without a migration path |

While the version is `0.x`, treat breaking changes as a minor bump unless the lead says otherwise.

How to bump (updates `package.json` and `package-lock.json` together, without creating a git tag):

```sh
npm version patch --no-git-tag-version   # or minor / major
```

Then stage both files with the rest of the change, so the bump lands in the same commit:

```sh
git add package.json package-lock.json
```

- One bump per commit. If a commit both fixes and adds, use the larger bump.
- Don't edit the version by hand in only one of the two files.
- Bumping the version is the one allowed edit to `package.json` that doesn't need the lead's approval. Dependency changes still do.
