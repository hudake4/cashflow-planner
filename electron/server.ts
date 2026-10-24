/**
 * Runs the Next.js standalone server INSIDE the Electron main process (no child
 * process), so the server and its port can never outlive the app.
 *
 * We don't execute the generated .next/standalone/server.js: it chdirs, calls
 * process.exit on errors and never exposes its http.Server. Instead we own the
 * http.Server (bound to 127.0.0.1 on a random free port) and hand requests to
 * Next's public request handler, built from the same config server.js embeds.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { createRequire } from "node:module";

const HOST = "127.0.0.1";

interface PrismaLike {
  $executeRawUnsafe(sql: string): Promise<number>;
  $queryRawUnsafe<T>(sql: string): Promise<T>;
  $transaction<T>(fn: (tx: PrismaLike) => Promise<T>): Promise<T>;
  $disconnect(): Promise<void>;
}

interface NextApp {
  prepare(): Promise<void>;
  getRequestHandler(): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;
  close?(): Promise<void>;
}

export interface RunningServer {
  url: string;
  stop(): Promise<void>;
}

export interface StartOptions {
  /** Folder containing the Next standalone output (server.js, .next/, node_modules/). */
  serverDir: string;
  /** Folder containing prisma/migrations/<name>/migration.sql. */
  migrationsDir: string;
  /** Absolute path of the SQLite database file. */
  dbFile: string;
}

export async function startServer({ serverDir, migrationsDir, dbFile }: StartOptions): Promise<RunningServer> {
  // Resolve next and @prisma/client from the standalone bundle, not from the app.asar.
  const requireFromServer = createRequire(path.join(serverDir, "server.js"));

  const requiredFiles = JSON.parse(
    fs.readFileSync(path.join(serverDir, ".next", "required-server-files.json"), "utf8")
  ) as { config: Record<string, unknown> };

  // Forward slashes: Prisma's sqlite URL parser is happiest with them on Windows.
  process.env.DATABASE_URL = `file:${dbFile.replace(/\\/g, "/")}`;
  // Cast: Next's type augmentation makes NODE_ENV read-only in the root tsconfig.
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  process.env.NEXT_TELEMETRY_DISABLED = "1";
  process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(requiredFiles.config);
  // Next resolves some paths from cwd; serverDir is a real folder (never inside asar).
  process.chdir(serverDir);

  await applyMigrations(requireFromServer, migrationsDir);

  // Listen first (port 0 = OS picks a free port, no check-then-bind race), then attach Next.
  let handler: ((req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>) | null = null;
  const server = http.createServer((req, res) => {
    if (!handler) {
      res.statusCode = 503;
      res.end("Starting…");
      return;
    }
    void handler(req, res);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, HOST, () => resolve());
  });
  const port = (server.address() as AddressInfo).port;

  const createNext = requireFromServer("next") as (opts: Record<string, unknown>) => NextApp;
  const nextApp = createNext({
    dir: serverDir,
    dev: false,
    hostname: HOST,
    port,
    conf: requiredFiles.config,
  });
  await nextApp.prepare();
  handler = nextApp.getRequestHandler();

  return {
    url: `http://${HOST}:${port}`,
    async stop() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await nextApp.close?.().catch(() => {});
      // The app's PrismaClient singleton (src/server/db.ts) lives on globalThis.
      const prisma = (globalThis as { __cashflowPrisma?: PrismaLike }).__cashflowPrisma;
      await prisma?.$disconnect().catch(() => {});
    },
  };
}

/**
 * The Prisma CLI isn't shipped, so apply the bundled migration.sql files through the
 * Prisma client, recording each applied migration in _app_migrations. Each migration
 * runs in one transaction (SQLite DDL is transactional), so a failure leaves no half-state.
 */
async function applyMigrations(requireFromServer: NodeRequire, migrationsDir: string): Promise<void> {
  const { PrismaClient } = requireFromServer("@prisma/client") as { PrismaClient: new () => PrismaLike };
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "_app_migrations" ("name" TEXT NOT NULL PRIMARY KEY, "appliedAt" TEXT NOT NULL)`
    );
    const applied = new Set(
      (await prisma.$queryRawUnsafe<{ name: string }[]>(`SELECT "name" FROM "_app_migrations"`)).map((r) => r.name)
    );
    const pending = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !applied.has(d.name))
      .map((d) => d.name)
      .sort(); // Prisma migration folders are timestamp-prefixed.

    for (const name of pending) {
      const sql = fs.readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8");
      await prisma.$transaction(async (tx) => {
        for (const statement of splitSql(sql)) await tx.$executeRawUnsafe(statement);
        await tx.$executeRawUnsafe(
          `INSERT INTO "_app_migrations" ("name", "appliedAt") VALUES ('${name.replace(/'/g, "''")}', '${new Date().toISOString()}')`
        );
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

/** Prisma's generated SQL has one statement per `;` and no semicolons inside literals. */
function splitSql(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}
