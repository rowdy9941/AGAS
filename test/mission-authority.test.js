import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createPersistentServices } from "../packages/core/src/control-plane.js";
import { RuntimeExecutor } from "../packages/runtime/src/runtime-executor.js";
import { Dispatcher } from "../packages/runtime/src/dispatcher.js";

async function runMission(controlPlane, missionId) {
  const dispatcher = new Dispatcher({ executions: controlPlane.executions, executor: new RuntimeExecutor({ registry: controlPlane.registry, mode: "simulator" }) });
  for (let step = 0; step < 12; step += 1) {
    await controlPlane.missions.reconcile();
    await dispatcher.tick();
    await controlPlane.missions.reconcile();
    const mission = controlPlane.missions.get(missionId);
    if (["completed", "failed", "cancelled"].includes(mission.status)) return mission;
  }
  return controlPlane.missions.get(missionId);
}

test("Mission Authority completes a governed repository mission with handoffs, evidence, report, and vault", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agas-mission-"));
  try {
    const services = createPersistentServices({ databasePath: join(directory, "agas.db"), bootstrapToken: "root", vaultPath: join(directory, "vault") });
    const { controlPlane } = services;
    const mission = controlPlane.missions.create({
      workspaceId: "default", projectId: "default-project", teamId: "engineering-team", conversationId: "default-conversation",
      type: "repository", objective: "Add a verified repository feature", acceptanceCriteria: ["Implementation completed", "Review passed", "Tests passed"],
    }, "bootstrap");
    assert.equal(mission.status, "awaiting-approval");
    assert.equal(mission.tasks.length, 4);
    assert.equal(mission.tasks.find((item) => item.id === "implement").approvalStatus, "pending");
    assert.throws(() => controlPlane.missions.start(mission.id, "bootstrap"), (error) => error.code === "MISSION_NOT_APPROVED");

    controlPlane.missions.approve(mission.id, { reason: "Reviewed plan and sensitive change" }, "bootstrap");
    controlPlane.missions.start(mission.id, "bootstrap");
    const completed = await runMission(controlPlane, mission.id);

    assert.equal(completed.status, "completed");
    assert.equal(completed.verification.passed, true);
    assert.equal(completed.tasks.every((item) => item.status === "completed" && item.artifactId), true);
    assert.equal(completed.budget.usedAttempts, 4);
    assert.ok(completed.finalReportId);
    assert.ok(completed.vaultProjection.files.some((file) => file.endsWith("index.md")));
    assert.equal(controlPlane.context.listHandoffs({ workspaceId: "default" }).every((handoff) => handoff.status === "accepted"), true);
    assert.equal(controlPlane.context.listHandoffs({ workspaceId: "default" }).length, 4);
    assert.equal(controlPlane.context.listArtifacts({ workspaceId: "default" }).length, 5);
    assert.equal(controlPlane.organization.get("conversations", "default-conversation").messages.length, 2);
    assert.deepEqual(controlPlane.missions.events({ workspaceId: "default" }).filter((event) => event.type === "task.completed").map((event) => event.data.taskId), ["analyze", "implement", "review", "verify"]);

    services.database.close();
    const restored = createPersistentServices({ databasePath: join(directory, "agas.db"), bootstrapToken: "ignored", vaultPath: join(directory, "vault") });
    assert.equal(restored.controlPlane.missions.get(mission.id).status, "completed");
    assert.equal(restored.controlPlane.organization.get("conversations", "default-conversation").messages.length, 2);
    restored.database.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Mission Authority enforces task budgets and supports cancellation", () => {
  const services = createPersistentServices({ databasePath: ":memory:", bootstrapToken: "root" });
  try {
    assert.throws(() => services.controlPlane.missions.create({ workspaceId: "default", type: "research", objective: "Research safely", budget: { maxTasks: 2, maxTotalAttempts: 4, maxRuntimeMs: 10_000 } }, "bootstrap"), (error) => error.code === "MISSION_TASK_BUDGET_EXCEEDED");
    const mission = services.controlPlane.missions.create({ workspaceId: "default", type: "research", objective: "Research safely" }, "bootstrap");
    const cancelled = services.controlPlane.missions.cancel(mission.id, "bootstrap", "Operator stopped the mission");
    assert.equal(cancelled.status, "cancelled");
    assert.equal(services.controlPlane.missions.events({ workspaceId: "default" }).at(-1).type, "mission.cancelled");
  } finally {
    services.database.close();
  }
});

test("research evaluation suite completes through the Command Hub", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agas-research-"));
  try {
    const services = createPersistentServices({ databasePath: join(directory, "agas.db"), bootstrapToken: "root", vaultPath: join(directory, "vault") });
    const mission = services.controlPlane.missions.create({ workspaceId: "default", type: "research", objective: "Compare agent governance approaches with sourced evidence" }, "bootstrap");
    assert.equal(mission.hubId, "command");
    assert.deepEqual(mission.tasks.map((item) => item.runtimeId), ["hermes", "codex", "opencode", "hermes"]);
    services.controlPlane.missions.approve(mission.id, { reason: "Research plan accepted" }, "bootstrap");
    services.controlPlane.missions.start(mission.id, "bootstrap");
    const completed = await runMission(services.controlPlane, mission.id);
    assert.equal(completed.status, "completed");
    assert.equal(completed.type, "research");
    assert.equal(completed.verification.artifactIds.length, 4);
    services.database.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Mission Authority stops work when the runtime budget expires", async () => {
  const services = createPersistentServices({ databasePath: ":memory:", bootstrapToken: "root" });
  try {
    const mission = services.controlPlane.missions.create({ workspaceId: "default", type: "repository", objective: "Bounded work", budget: { maxTasks: 4, maxTotalAttempts: 8, maxRuntimeMs: 1 } }, "bootstrap");
    services.controlPlane.missions.approve(mission.id, { reason: "Approve bounded mission" }, "bootstrap");
    services.controlPlane.missions.start(mission.id, "bootstrap");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await services.controlPlane.missions.reconcile();
    const failed = services.controlPlane.missions.get(mission.id);
    assert.equal(failed.status, "failed");
    assert.equal(failed.failure.code, "MISSION_RUNTIME_BUDGET_EXCEEDED");
  } finally {
    services.database.close();
  }
});
