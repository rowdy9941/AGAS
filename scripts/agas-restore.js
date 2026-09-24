#!/usr/bin/env node
import { StateDatabase } from "../packages/core/src/state-database.js";

const [backupPath, targetPath, flag] = process.argv.slice(2);
if (!backupPath || !targetPath) {
  process.stderr.write("Usage: node scripts/agas-restore.js <backup.db> <target.db> [--force]\n");
  process.exitCode = 2;
} else {
  const result = StateDatabase.restore(backupPath, targetPath, { force: flag === "--force" });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
