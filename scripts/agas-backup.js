#!/usr/bin/env node
import { StateDatabase } from "../packages/core/src/state-database.js";

const databasePath = process.argv[2] ?? process.env.AGAS_DB_PATH ?? "./data/agas.db";
const targetPath = process.argv[3] ?? `./data/backups/agas-${new Date().toISOString().replaceAll(":", "-")}.db`;

const database = new StateDatabase(databasePath);
try {
  const result = database.backup(targetPath);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  database.close();
}
