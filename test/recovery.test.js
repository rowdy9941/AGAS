import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { createPersistentServices, StateDatabase } from "../packages/core/src/control-plane.js";
import { Dispatcher } from "../packages/runtime/src/dispatcher.js";
import { RuntimeExecutor } from "../packages/runtime/src/runtime-executor.js";

test("schema migrations, integrity-checked backup, and offline restore preserve authoritative state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agas-recovery-"));
  const databasePath = join(directory, "agas.db");
  const backupPath = join(directory, "backups", "agas.db");
  const restoredPath = join(directory, "restored.db");
  try {
    const database = new StateDatabase(databasePath);
    database.write("acceptance", { status: "verified", artifacts: 5 });
    assert.equal(database.schemaVersion(), 2);
    assert.equal(database.integrity().ok, true);
    const backup = database.backup(backupPath);
    assert.equal(backup.integrity.ok, true);
    database.close();

    const restored = StateDatabase.restore(backupPath, restoredPath);
    assert.equal(restored.integrity.ok, true);
    const restoredDatabase = new StateDatabase(restoredPath);
    assert.deepEqual(restoredDatabase.read("acceptance", null), { status: "verified", artifacts: 5 });
    assert.equal(restoredDatabase.diagnostics().namespaces.some((item) => item.namespace === "acceptance"), true);
    restoredDatabase.close();
    assert.ok((await readFile(restoredPath)).length > 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a version 1 state database migrates forward without losing data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agas-migration-"));
  const databasePath = join(directory, "legacy.db");
  try {
    const legacy = new DatabaseSync(databasePath);
    legacy.exec("CREATE TABLE state (namespace TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL); PRAGMA user_version = 1;");
    legacy.prepare("INSERT INTO state (namespace, payload, updated_at) VALUES (?, ?, ?)").run("legacy", JSON.stringify({ preserved: true }), new Date().toISOString());
    legacy.close();
    const migrated = new StateDatabase(databasePath);
    assert.equal(migrated.schemaVersion(), 2);
    assert.deepEqual(migrated.read("legacy", null), { preserved: true });
    assert.equal(migrated.integrity().ok, true);
    migrated.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a mission interrupted during execution is retried and completes after restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agas-crash-"));
  const databasePath = join(directory, "agas.db");
  const vaultPath = join(directory, "vault");
  try {
    let services = createPersistentServices({ databasePath, bootstrapToken: "root", vaultPath });
    const mission = services.controlPlane.missions.create({ workspaceId: "default", type: "repository", objective: "Recover an interrupted repository mission" }, "bootstrap");
    services.controlPlane.missions.approve(mission.id, { reason: "Recovery scenario approved" }, "bootstrap");
    services.controlPlane.missions.start(mission.id, "bootstrap");
    await services.controlPlane.missions.reconcile();
    const firstExecution = services.controlPlane.executions.get(services.controlPlane.missions.get(mission.id).tasks[0].executionId);
    services.controlPlane.executions.transition(firstExecution.id, { status: "running", actorId: "system:dispatcher", reason: "Simulate work at crash time" });
    services.database.close();

    services = createPersistentServices({ databasePath, bootstrapToken: "ignored", vaultPath });
    const dispatcher = new Dispatcher({ executions: services.controlPlane.executions, executor: new RuntimeExecutor({ registry: services.controlPlane.registry, mode: "simulator" }) });
    dispatcher.start(); dispatcher.stop();
    assert.equal(services.controlPlane.executions.get(firstExecution.id).result.code, "INTERRUPTED_BY_RESTART");
    await services.controlPlane.missions.reconcile();
    const retried = services.controlPlane.missions.get(mission.id);
    assert.equal(retried.tasks[0].attempts, 2);
    assert.notEqual(retried.tasks[0].executionId, firstExecution.id);

    for (let step = 0; step < 12 && services.controlPlane.missions.get(mission.id).status !== "completed"; step += 1) {
      await dispatcher.tick();
      await services.controlPlane.missions.reconcile();
    }
    const completed = services.controlPlane.missions.get(mission.id);
    assert.equal(completed.status, "completed");
    assert.equal(completed.verification.passed, true);
    assert.equal(completed.budget.usedAttempts, 5);
    services.database.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
