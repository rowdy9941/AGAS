import { copyFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { invariant } from "./errors.js";

const CURRENT_SCHEMA_VERSION = 2;
const MIGRATIONS = Object.freeze([
  { version: 1, name: "state-namespace", sql: "SELECT 1;" },
  { version: 2, name: "state-updated-at-index", sql: "CREATE INDEX IF NOT EXISTS state_updated_at_idx ON state(updated_at);" },
]);

export class StateDatabase {
  #database;

  constructor(path = ":memory:") {
    this.path = path;
    if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
    this.#database = new DatabaseSync(path);
    this.#database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS state (
        namespace TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
    this.#migrate();
  }

  read(namespace, fallback) {
    const row = this.#database.prepare("SELECT payload FROM state WHERE namespace = ?").get(namespace);
    return row ? JSON.parse(row.payload) : structuredClone(fallback);
  }

  write(namespace, value) {
    this.#database.prepare(`
      INSERT INTO state (namespace, payload, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(namespace) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at
    `).run(namespace, JSON.stringify(value), new Date().toISOString());
  }

  transaction(callback) {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  integrity() {
    const row = this.#database.prepare("PRAGMA quick_check").get();
    const result = Object.values(row)[0];
    return { ok: result === "ok", result, schemaVersion: this.schemaVersion() };
  }

  schemaVersion() {
    return Number(Object.values(this.#database.prepare("PRAGMA user_version").get())[0]);
  }

  diagnostics() {
    const namespaces = this.#database.prepare("SELECT namespace, length(payload) AS bytes, updated_at AS updatedAt FROM state ORDER BY namespace").all();
    return { path: this.path === ":memory:" ? ":memory:" : basename(resolve(this.path)), integrity: this.integrity(), namespaces };
  }

  backup(targetPath) {
    invariant(this.path !== ":memory:", "BACKUP_UNAVAILABLE", "In-memory databases cannot be backed up", 409);
    const target = resolve(targetPath);
    invariant(target !== resolve(this.path), "BACKUP_PATH_CONFLICT", "Backup path must differ from the active database path", 409);
    invariant(!existsSync(target), "BACKUP_ALREADY_EXISTS", `Backup already exists: ${target}`, 409);
    mkdirSync(dirname(target), { recursive: true });
    this.#database.exec("PRAGMA wal_checkpoint(FULL)");
    this.#database.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
    const integrity = StateDatabase.verify(target);
    invariant(integrity.ok, "BACKUP_INTEGRITY_FAILED", `Backup integrity check failed: ${integrity.result}`, 500);
    return { path: target, createdAt: new Date().toISOString(), integrity };
  }

  static verify(path) {
    invariant(existsSync(path), "DATABASE_NOT_FOUND", `Database does not exist: ${path}`, 404);
    const database = new DatabaseSync(path);
    try {
      const row = database.prepare("PRAGMA quick_check").get();
      const result = Object.values(row)[0];
      return { ok: result === "ok", result, schemaVersion: Number(Object.values(database.prepare("PRAGMA user_version").get())[0]) };
    } finally {
      database.close();
    }
  }

  static restore(backupPath, targetPath, { force = false } = {}) {
    const backup = resolve(backupPath);
    const target = resolve(targetPath);
    invariant(backup !== target, "RESTORE_PATH_CONFLICT", "Backup and restore target must differ", 409);
    const integrity = StateDatabase.verify(backup);
    invariant(integrity.ok, "RESTORE_INTEGRITY_FAILED", `Backup integrity check failed: ${integrity.result}`, 422);
    invariant(force || !existsSync(target), "RESTORE_TARGET_EXISTS", `Restore target already exists: ${target}`, 409);
    mkdirSync(dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.restore`;
    const previous = `${target}.${randomUUID()}.previous`;
    try {
      copyFileSync(backup, temporary);
      const copiedIntegrity = StateDatabase.verify(temporary);
      invariant(copiedIntegrity.ok, "RESTORE_COPY_INTEGRITY_FAILED", `Restored copy failed integrity: ${copiedIntegrity.result}`, 500);
      if (force && existsSync(target)) renameSync(target, previous);
      try {
        renameSync(temporary, target);
      } catch (error) {
        if (existsSync(previous) && !existsSync(target)) renameSync(previous, target);
        throw error;
      }
      if (existsSync(previous)) unlinkSync(previous);
      for (const suffix of ["-wal", "-shm"]) if (existsSync(`${target}${suffix}`)) unlinkSync(`${target}${suffix}`);
      return { path: target, restoredAt: new Date().toISOString(), integrity: copiedIntegrity };
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
      if (existsSync(previous) && !existsSync(target)) renameSync(previous, target);
    }
  }

  close() {
    this.#database.close();
  }

  #migrate() {
    let current = this.schemaVersion();
    invariant(current <= CURRENT_SCHEMA_VERSION, "DATABASE_SCHEMA_TOO_NEW", `Database schema ${current} is newer than supported version ${CURRENT_SCHEMA_VERSION}`, 409);
    for (const migration of MIGRATIONS.filter((item) => item.version > current)) {
      this.transaction(() => {
        this.#database.exec(migration.sql);
        this.#database.prepare("INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(migration.version, migration.name, new Date().toISOString());
        this.#database.exec(`PRAGMA user_version = ${migration.version}`);
      });
      current = migration.version;
    }
  }
}

export { CURRENT_SCHEMA_VERSION };
