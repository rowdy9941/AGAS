import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export class StateDatabase {
  #database;

  constructor(path = ":memory:") {
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
      PRAGMA user_version = 1;
    `);
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

  close() {
    this.#database.close();
  }
}
