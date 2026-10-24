import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  backupDatabase,
  backupFileName,
  DatabaseBackupError,
  formatBackupTimestamp,
  pendingMigrations,
  pruneBackups,
  selectBackupsToPrune,
} from "../../electron/backup";

// Local-time components, so these hold in any time zone.
const AT = new Date(2026, 9, 24, 9, 5, 3);

describe("formatBackupTimestamp", () => {
  it("formats local time as YYYYMMDD-HHmmss with zero padding", () => {
    expect(formatBackupTimestamp(AT)).toBe("20261024-090503");
    expect(formatBackupTimestamp(new Date(2027, 11, 31, 23, 59, 59))).toBe("20271231-235959");
  });
});

describe("backupFileName", () => {
  it("names the backup after the time and the first pending migration", () => {
    expect(backupFileName(AT, "20261024200000_starting_balance_source")).toBe(
      "cashflow-20261024-090503-pre-20261024200000_starting_balance_source.db"
    );
  });

  it("replaces characters that don't belong in a file name", () => {
    expect(backupFileName(AT, "2026 odd/name.v2")).toBe("cashflow-20261024-090503-pre-2026_odd_name_v2.db");
  });

  it("adds -2, -3… before .db from the second attempt on", () => {
    expect(backupFileName(AT, "m1", 1)).toBe("cashflow-20261024-090503-pre-m1.db");
    expect(backupFileName(AT, "m1", 2)).toBe("cashflow-20261024-090503-pre-m1-2.db");
    expect(backupFileName(AT, "m1", 3)).toBe("cashflow-20261024-090503-pre-m1-3.db");
  });
});

describe("pendingMigrations", () => {
  it("returns the unapplied migrations in name (timestamp) order", () => {
    expect(
      pendingMigrations(["20261024190000_c", "20261023183536_a", "20261024120000_b"], ["20261023183536_a"])
    ).toEqual(["20261024120000_b", "20261024190000_c"]);
  });

  it("is empty when everything is applied, and ignores applied names no longer bundled", () => {
    expect(pendingMigrations(["a", "b"], new Set(["a", "b", "old"]))).toEqual([]);
  });

  it("treats every migration as pending for an untracked database", () => {
    expect(pendingMigrations(["b", "a"], [])).toEqual(["a", "b"]);
  });
});

describe("selectBackupsToPrune", () => {
  const backup = (i: number) => `cashflow-20261024-0900${String(i).padStart(2, "0")}-pre-m${i}.db`;

  it("keeps the newest N backups by modified time and prunes the rest, oldest last", () => {
    const files = Array.from({ length: 12 }, (_, i) => ({ name: backup(i), mtimeMs: 1000 + i }));
    const pruned = selectBackupsToPrune(files, 10);
    expect(pruned).toEqual([
      { name: backup(1), files: [backup(1)] },
      { name: backup(0), files: [backup(0)] },
    ]);
  });

  it("prunes nothing at or under the limit", () => {
    const files = Array.from({ length: 10 }, (_, i) => ({ name: backup(i), mtimeMs: i }));
    expect(selectBackupsToPrune(files, 10)).toEqual([]);
  });

  it("goes by modified time, not name, and breaks ties by name", () => {
    const files = [
      { name: backup(1), mtimeMs: 500 },
      { name: backup(2), mtimeMs: 100 },
      { name: backup(3), mtimeMs: 100 },
    ];
    expect(selectBackupsToPrune(files, 1).map((b) => b.name)).toEqual([backup(3), backup(2)]);
  });

  it("removes sidecars with their backup and dates a backup by its newest file", () => {
    const old = backup(1);
    const files = [
      { name: old, mtimeMs: 10 },
      { name: `${old}-journal`, mtimeMs: 11 },
      { name: `${old}-wal`, mtimeMs: 12 },
      { name: `${old}-shm`, mtimeMs: 12 },
      { name: backup(2), mtimeMs: 11.5 },
    ];
    expect(selectBackupsToPrune(files, 1)).toEqual([{ name: backup(2), files: [backup(2)] }]);
    expect(selectBackupsToPrune(files, 0)[0]).toEqual({
      name: old,
      files: [old, `${old}-journal`, `${old}-shm`, `${old}-wal`],
    });
  });

  it("never selects files that aren't backups", () => {
    const files = [
      { name: "notes.txt", mtimeMs: 0 },
      { name: "cashflow.db", mtimeMs: 0 },
      { name: "cashflow-2026-pre-x.db", mtimeMs: 0 },
      { name: `${backup(1)}.bak`, mtimeMs: 0 },
      { name: backup(1), mtimeMs: 0 },
    ];
    expect(selectBackupsToPrune(files, 0)).toEqual([{ name: backup(1), files: [backup(1)] }]);
  });

  it("always keeps the backup just made, even if its clock is behind", () => {
    const files = [
      { name: backup(1), mtimeMs: 300 },
      { name: backup(2), mtimeMs: 200 },
      { name: backup(3), mtimeMs: 100 },
    ];
    expect(selectBackupsToPrune(files, 2, { alwaysKeep: backup(3) }).map((b) => b.name)).toEqual([backup(2)]);
  });

  it("groups -2, -3… backups and their sidecars like any other backup", () => {
    const first = "cashflow-20261024-090503-pre-m1.db";
    const second = "cashflow-20261024-090503-pre-m1-2.db";
    const files = [
      { name: first, mtimeMs: 1 },
      { name: second, mtimeMs: 2 },
      { name: `${second}-wal`, mtimeMs: 2 },
    ];
    expect(selectBackupsToPrune(files, 0)).toEqual([
      { name: second, files: [second, `${second}-wal`] },
      { name: first, files: [first] },
    ]);
  });

  it("never prunes the oldest backup taken before a migration that is still pending", () => {
    // A applied, then B failed on every launch: one pre-A backup, then a pre-B backup per launch.
    const preA = "cashflow-20261024-090000-pre-20261024000000_a.db";
    const preB = (i: number) => `cashflow-20261024-0901${String(i).padStart(2, "0")}-pre-20261025000000_b.db`;
    const preBRetry = "cashflow-20261024-090100-pre-20261025000000_b-2.db";
    const files = [
      { name: preA, mtimeMs: 0 },
      { name: preBRetry, mtimeMs: 1 },
      ...Array.from({ length: 5 }, (_, i) => ({ name: preB(i + 1), mtimeMs: 10 + i })),
    ];
    const pruned = selectBackupsToPrune(files, 2, { pending: ["20261025000000_b"] }).map((b) => b.name);
    // The newest two stay, the oldest pre-B (a -2 retry here) is protected, and pre-A isn't pending.
    expect(pruned).toEqual([preB(3), preB(2), preB(1), preA]);
    expect(selectBackupsToPrune(files, 2, { pending: ["20261024000000_a", "20261025000000_b"] })).not.toContainEqual(
      expect.objectContaining({ name: preA })
    );
  });

  it("does not treat a migration that merely shares a prefix as pending", () => {
    const files = [
      { name: "cashflow-20261024-090000-pre-m1_extra.db", mtimeMs: 0 },
      { name: "cashflow-20261024-090001-pre-m1-x.db", mtimeMs: 1 },
      { name: "cashflow-20261024-090002-pre-m2.db", mtimeMs: 2 },
    ];
    expect(selectBackupsToPrune(files, 1, { pending: ["m1"] }).map((b) => b.name)).toEqual([
      "cashflow-20261024-090001-pre-m1-x.db",
      "cashflow-20261024-090000-pre-m1_extra.db",
    ]);
  });
});

describe("backupDatabase and pruneBackups (temp folder)", () => {
  let dir: string;
  let dbFile: string;
  let backupDir: string;
  let lines: string[];
  const log = (line: string) => lines.push(line);

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cashflow-backup-"));
    dbFile = path.join(dir, "cashflow.db");
    backupDir = path.join(dir, "backups");
    lines = [];
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("does nothing when there is no database or it is empty", () => {
    expect(backupDatabase({ dbFile, backupDir, firstPendingMigration: "m1", now: AT, log })).toBeNull();
    fs.writeFileSync(dbFile, "");
    expect(backupDatabase({ dbFile, backupDir, firstPendingMigration: "m1", now: AT, log })).toBeNull();
    expect(fs.existsSync(backupDir)).toBe(false);
    expect(lines).toEqual([]);
  });

  it("copies the database and any sidecars with one name, dated now", () => {
    fs.writeFileSync(dbFile, "main");
    fs.writeFileSync(`${dbFile}-wal`, "wal");
    fs.writeFileSync(`${dbFile}-journal`, "journal");
    const old = new Date(2020, 0, 1);
    fs.utimesSync(dbFile, old, old);

    const target = backupDatabase({ dbFile, backupDir, firstPendingMigration: "m1", now: AT, log });

    expect(target).toBe(path.join(backupDir, "cashflow-20261024-090503-pre-m1.db"));
    expect(fs.readdirSync(backupDir).sort()).toEqual([
      "cashflow-20261024-090503-pre-m1.db",
      "cashflow-20261024-090503-pre-m1.db-journal",
      "cashflow-20261024-090503-pre-m1.db-wal",
    ]);
    expect(fs.readFileSync(target!, "utf8")).toBe("main");
    expect(fs.readFileSync(`${target}-wal`, "utf8")).toBe("wal");
    expect(Math.round(fs.statSync(target!).mtimeMs / 1000)).toBe(Math.round(AT.getTime() / 1000));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`[backup] Created ${target}`);
  });

  it("picks the next free name when a backup from the same second exists", () => {
    fs.writeFileSync(dbFile, "main");
    fs.writeFileSync(`${dbFile}-wal`, "wal");
    fs.mkdirSync(backupDir);
    // A full earlier backup, and a stray sidecar that also claims the -2 name.
    fs.writeFileSync(path.join(backupDir, "cashflow-20261024-090503-pre-m1.db"), "earlier");
    fs.writeFileSync(path.join(backupDir, "cashflow-20261024-090503-pre-m1-2.db-wal"), "someone else's");

    const target = backupDatabase({ dbFile, backupDir, firstPendingMigration: "m1", now: AT, log });

    expect(target).toBe(path.join(backupDir, "cashflow-20261024-090503-pre-m1-3.db"));
    expect(fs.readFileSync(target!, "utf8")).toBe("main");
    expect(fs.readFileSync(`${target}-wal`, "utf8")).toBe("wal");
    expect(fs.readFileSync(path.join(backupDir, "cashflow-20261024-090503-pre-m1.db"), "utf8")).toBe("earlier");
    expect(fs.readFileSync(path.join(backupDir, "cashflow-20261024-090503-pre-m1-2.db-wal"), "utf8")).toBe(
      "someone else's"
    );
  });

  it("throws DatabaseBackupError and leaves no partial copy on failure", () => {
    fs.writeFileSync(dbFile, "main");
    // A sidecar that can't be copied, so the failure comes after the .db was copied.
    fs.mkdirSync(`${dbFile}-wal`);

    expect(() => backupDatabase({ dbFile, backupDir, firstPendingMigration: "m1", now: AT, log })).toThrow(
      DatabaseBackupError
    );
    expect(fs.readdirSync(backupDir)).toEqual([]);
    expect(lines).toEqual([]);
  });

  it("captures a SQLite database mid-transaction so that it opens without the uncommitted change", async () => {
    const url = (file: string) => `file:${file}`;
    const live = new PrismaClient({ datasourceUrl: url(dbFile) });
    let target: string | null = null;
    try {
      await live.$executeRawUnsafe(`CREATE TABLE "t" ("id" INTEGER PRIMARY KEY, "v" TEXT NOT NULL)`);
      await live.$executeRawUnsafe(
        `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 2000)
         INSERT INTO "t" ("v") SELECT 'committed' FROM n`
      );
      await live
        .$transaction(async (tx) => {
          // A tiny page cache makes SQLite overwrite pages of cashflow.db before the commit,
          // so the copied .db alone is corrupt and only its -journal makes it consistent.
          await tx.$queryRawUnsafe(`PRAGMA cache_size = 1`);
          await tx.$executeRawUnsafe(`UPDATE "t" SET "v" = 'uncommitted'`);
          target = backupDatabase({ dbFile, backupDir, firstPendingMigration: "m1", now: AT, log });
          throw new Error("roll back");
        })
        .catch((err: unknown) => {
          if (!(err instanceof Error && err.message === "roll back")) throw err;
        });
    } finally {
      await live.$disconnect();
    }

    expect(target).not.toBeNull();
    expect(fs.existsSync(`${target}-journal`)).toBe(true);
    const restored = new PrismaClient({ datasourceUrl: url(target!) });
    try {
      expect(await restored.$queryRawUnsafe(`PRAGMA integrity_check`)).toEqual([{ integrity_check: "ok" }]);
      expect(await restored.$queryRawUnsafe(`SELECT "v", count(*) AS "n" FROM "t" GROUP BY "v"`)).toEqual([
        { v: "committed", n: 2000n },
      ]);
    } finally {
      await restored.$disconnect();
    }
  });

  it("prunes down to the newest backups, one log line per backup, and leaves other files alone", () => {
    fs.mkdirSync(backupDir);
    for (let i = 0; i < 4; i++) {
      const name = path.join(backupDir, `cashflow-20261024-09000${i}-pre-m.db`);
      const day = new Date(2026, 0, 1 + i);
      for (const file of i === 0 ? [name, `${name}-wal`] : [name]) {
        fs.writeFileSync(file, "x");
        fs.utimesSync(file, day, day);
      }
    }
    fs.writeFileSync(path.join(backupDir, "readme.txt"), "keep me");

    pruneBackups(backupDir, { keep: 2, log });

    expect(fs.readdirSync(backupDir).sort()).toEqual([
      "cashflow-20261024-090002-pre-m.db",
      "cashflow-20261024-090003-pre-m.db",
      "readme.txt",
    ]);
    expect(lines).toEqual([
      `[backup] Pruned ${path.join(backupDir, "cashflow-20261024-090001-pre-m.db")}`,
      `[backup] Pruned ${path.join(backupDir, "cashflow-20261024-090000-pre-m.db")} (2 files)`,
    ]);
  });
});
