import test from "node:test";
import assert from "node:assert/strict";
import { ControlPlane } from "../packages/core/src/control-plane.js";
import { RuntimeExecutor } from "../packages/runtime/src/runtime-executor.js";

test("local runtime execution rejects workspace path escape before process start", async () => {
  const controlPlane = new ControlPlane();
  const execution = controlPlane.proposeExecution({ hubId: "engineering", workspaceId: "default", principalId: "admin", objective: "Do not escape", workingDirectory: "../outside" });
  const executor = new RuntimeExecutor({ registry: controlPlane.registry, mode: "local", workspaceRoot: process.cwd() });
  await assert.rejects(() => executor.execute(execution), (error) => error.code === "WORKING_DIRECTORY_DENIED");
});

test("Mission Authority rejects empty acceptance and unrelated approval targets", () => {
  const controlPlane = new ControlPlane();
  assert.throws(() => controlPlane.missions.create({ workspaceId: "default", type: "repository", objective: "Unsafe plan", acceptanceCriteria: [] }, "admin"), (error) => error.code === "MISSION_ACCEPTANCE_REQUIRED");
  const mission = controlPlane.missions.create({ workspaceId: "default", type: "repository", objective: "Governed plan" }, "admin");
  assert.throws(() => controlPlane.missions.approve(mission.id, { taskIds: ["analyze"] }, "admin"), (error) => error.code === "INVALID_APPROVAL_TASK");
});
