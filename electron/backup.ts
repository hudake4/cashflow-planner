/**
 * Database backups taken before the desktop app applies pending migrations.
 *
 * Backups are plain file copies, made while no SQLite connection is open (see
 * applyMigrations in server.ts), so a backup is byte-for-byte the database as it was
 * and restoring is just copying the file back. Sidecar files (-journal, -wal, -shm)
 * are copied with it, so even a database left mid-transaction by a crash is preserved.
 *
 * No Electron imports: the naming, pending and pruning logic is unit-tested.
 */
import fs from "node:fs";
import path from "node:path";

export const BACKUPS_TO_KEEP = 10;

/** SQLite files that can sit next to the database and belong to it. */
export const SIDECAR_SUFFIXES = ["-journal", "-wal", "-shm"] as const;

const BACKUP_NAME = /^(cashflow-\d{8}-\d{6}-pre-[A-Za-z0-9_-]+\.db)(-journal|-wal|-shm)?$/;

/** Thrown when the database can't be backed up; startup must stop before migrating. */
export class DatabaseBackupError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DatabaseBackupError";
  }
}

/** Local time as YYYYMMDD-HHmmss, so backups sort by name and read naturally in Explorer. */
export function formatBackupTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** cashflow-<YYYYMMDD-HHmmss>-pre-<migration>.db; sidecars append their suffix to this. */
export function backupFileName(date: Date, firstPendingMigration: string): string {
  const migration = firstPendingMigration.replace(/[^A-Za-z0-9_-]/g, "_");
  return `cashflow-${formatBackupTimestamp(date)}-pre-${migration}.db`;
}

/** Migrations not yet applied, in apply order (Prisma folders are timestamp-prefixed). */
export function pendingMigrations(available: readonly string[], applied: Iterable<string>): string[] {
  const done = new Set(applied);
  return available.filter((name) => !done.has(name)).sort();
}

export interface BackupFile {
  name: string;
  mtimeMs: number;
}

export interface BackupToPrune {
  /** The backup's .db file name. */
  name: string;
  /** Every file belonging to it: the .db and any sidecars. */
  files: string[];
}

/**
 * Picks the backups to delete so that only the newest `keep` remain. A backup is its
 * .db file plus sidecars, dated by its newest file. Files that aren't backups are never
 * selected. `alwaysKeep` (the backup just made) is kept even if the clock went backwards.
 */
export function selectBackupsToPrune(
  files: readonly BackupFile[],
  keep: number = BACKUPS_TO_KEEP,
  alwaysKeep?: string
): BackupToPrune[] {
  const groups = new Map<string, { files: string[]; mtimeMs: number }>();
  for (const file of files) {
    const match = BACKUP_NAME.exec(file.name);
    if (!match) continue;
    const group = groups.get(match[1]) ?? { files: [], mtimeMs: -Infinity };
    group.files.push(file.name);
    group.mtimeMs = Math.max(group.mtimeMs, file.mtimeMs);
    groups.set(match[1], group);
  }
  const newestFirst = [...groups.entries()].sort(
    ([nameA, a], [nameB, b]) => b.mtimeMs - a.mtimeMs || (nameA < nameB ? 1 : nameA > nameB ? -1 : 0)
  );
  const kept = new Set<string>();
  if (alwaysKeep && groups.has(alwaysKeep) && keep > 0) kept.add(alwaysKeep);
  for (const [name] of newestFirst) {
    if (kept.size >= keep) break;
    kept.add(name);
  }
  return newestFirst
    .filter(([name]) => !kept.has(name))
    .map(([name, group]) => ({ name, files: group.files.sort() }));
}

export interface BackupOptions {
  dbFile: string;
  backupDir: string;
  firstPendingMigration: string;
  now?: Date;
  log?: (line: string) => void;
}

/**
 * Copies the database and its sidecars into backupDir. Returns the backup's .db path, or
 * null when there is nothing to back up (no database yet, or an empty file). Never
 * overwrites an existing file. Throws DatabaseBackupError on any failure, after removing
 * whatever it had copied so a partial backup is never mistaken for a good one.
 */
export function backupDatabase({
  dbFile,
  backupDir,
  firstPendingMigration,
  now = new Date(),
  log = console.log,
}: BackupOptions): string | null {
  const created: string[] = [];
  try {
    const size = fs.statSync(dbFile, { throwIfNoEntry: false })?.size ?? 0;
    if (size === 0) return null;

    fs.mkdirSync(backupDir, { recursive: true });
    const target = path.join(backupDir, backupFileName(now, firstPendingMigration));
    const sources = [
      dbFile,
      ...SIDECAR_SUFFIXES.map((suffix) => dbFile + suffix).filter((file) => fs.existsSync(file)),
    ];
    for (const source of sources) {
      const dest = target + source.slice(dbFile.length);
      fs.copyFileSync(source, dest, fs.constants.COPYFILE_EXCL);
      created.push(dest);
      // Flush to disk before migrating, and date the copy now: Windows' CopyFile keeps
      // the source's modified time, and pruning goes by modified time.
      const fd = fs.openSync(dest, "r+");
      try {
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.utimesSync(dest, now, now);
    }
    const sidecars = created.slice(1).map((file) => path.basename(file));
    log(`[backup] Created ${target}${sidecars.length ? ` (with ${sidecars.join(", ")})` : ""}`);
    return target;
  } catch (err) {
    for (const file of created) fs.rmSync(file, { force: true });
    throw new DatabaseBackupError(
      "CashFlow Planner needs to update its database, but could not back it up first, " +
        "so it stopped without changing anything.\n\n" +
        `Database: ${dbFile}\nBackup folder: ${backupDir}\nNext update: ${firstPendingMigration}\n\n` +
        `Cause: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err }
    );
  }
}

/**
 * Deletes all but the newest `keep` backups in backupDir. Best effort: a failure is
 * logged, not thrown, because the new backup already exists and startup can go on.
 */
export function pruneBackups(
  backupDir: string,
  { keep = BACKUPS_TO_KEEP, alwaysKeep, log = console.log }: { keep?: number; alwaysKeep?: string; log?: (line: string) => void } = {}
): void {
  try {
    const files = fs
      .readdirSync(backupDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => ({ name: entry.name, mtimeMs: fs.statSync(path.join(backupDir, entry.name)).mtimeMs }));
    for (const backup of selectBackupsToPrune(files, keep, alwaysKeep)) {
      for (const file of backup.files) fs.rmSync(path.join(backupDir, file), { force: true });
      log(`[backup] Pruned ${path.join(backupDir, backup.name)}${backup.files.length > 1 ? ` (${backup.files.length} files)` : ""}`);
    }
  } catch (err) {
    log(`[backup] Could not prune old backups in ${backupDir}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
