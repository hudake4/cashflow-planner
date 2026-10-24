/**
 * Creates the integration-test SQLite schema in prisma/test-integration.db.
 * Never touches prisma/dev.db (used by the dev server and the user's data).
 * Never runs `prisma generate` (the dev server locks the engine DLL on Windows).
 */
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const DB_URL = "file:./test-integration.db";
const DB_FILE = path.join(ROOT, "prisma", "test-integration.db");

export default function setup() {
  for (const f of [DB_FILE, `${DB_FILE}-journal`]) if (existsSync(f)) rmSync(f);
  const prismaCli = path.join(ROOT, "node_modules", "prisma", "build", "index.js");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "pipe",
  });
}
