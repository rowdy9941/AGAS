import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createPersistentServices } from "../packages/core/src/control-plane.js";

test("registry, memory, executions, audit, and API keys survive restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agas-persistence-"));
  const databasePath = join(directory, "agas.db");
  try {
    let services = createPersistentServices({ databasePath, bootstrapToken: "root-token" });
    const admin = services.auth.authenticateHeader("Bearer root-token");
    const issued = services.auth.createKey({ name: "Viewer", role: "viewer", workspaceIds: ["demo"] }, admin);
    services.controlPlane.runtimeManager.install("agas-sim", admin.id);
    services.controlPlane.registry.register("skills", { id: "persistent-skill", name: "Persistent Skill" });
    services.controlPlane.memory.append({ scope: "workspace", visibility: "workspace", workspaceId: "demo", principalId: "bootstrap", content: "remember me" });
    const execution = services.controlPlane.proposeExecution({ hubId: "engineering", workspaceId: "demo", principalId: "bootstrap", objective: "Persist this execution" });
    services.database.close();

    services = createPersistentServices({ databasePath, bootstrapToken: "ignored-after-initialization" });
    assert.equal(services.controlPlane.registry.get("skills", "persistent-skill").name, "Persistent Skill");
    assert.equal(services.controlPlane.memory.search({ workspaceId: "demo", principalId: "bootstrap" }).length, 1);
    assert.equal(services.controlPlane.executions.get(execution.id).objective, "Persist this execution");
    assert.equal(services.controlPlane.executions.audit().length, 1);
    assert.equal(services.auth.authenticateHeader(`Bearer ${issued.token}`).role, "viewer");
    assert.equal(services.controlPlane.runtimeManager.packages()[0].installed, true);
    assert.throws(() => services.auth.authenticateHeader("Bearer ignored-after-initialization"), (error) => error.code === "INVALID_API_TOKEN");
    services.database.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
