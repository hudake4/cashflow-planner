// Starts the dev server for the Playwright E2E suite against its own throwaway database
// (prisma/test-e2e.db), so the suite can never reset prisma/dev.db or the desktop app's data.
// Cross-platform: no shell, no extra packages.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRISMA_DIR = path.join(ROOT, "prisma");
// Relative to prisma/schema.prisma, like the integration DB (test-integration.db).
const DB_URL = "file:./test-e2e.db";
const env = { ...process.env, DATABASE_URL: DB_URL };

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: ROOT, env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Fail fast if port 3000 is taken, before touching any files.
run([path.join(ROOT, "scripts", "check-port.mjs")]);

// Start from an empty database every time (main file plus journal/WAL/SHM sidecars).
if (existsSync(PRISMA_DIR)) {
  for (const name of readdirSync(PRISMA_DIR)) {
    if (name.startsWith("test-e2e.db")) rmSync(path.join(PRISMA_DIR, name), { force: true });
  }
}
run([path.join(ROOT, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"]);

const child = spawn(
  process.execPath,
  [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", "3000"],
  { cwd: ROOT, env, stdio: "inherit" },
);

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
