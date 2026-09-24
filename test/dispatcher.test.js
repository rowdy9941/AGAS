import test from "node:test";
import assert from "node:assert/strict";
import { ControlPlane } from "../packages/core/src/control-plane.js";
import { RuntimeExecutor } from "../packages/runtime/src/runtime-executor.js";
import { Dispatcher } from "../packages/runtime/src/dispatcher.js";

test("dispatcher completes an approved execution through the governed simulator", async () => {
  const controlPlane = new ControlPlane();
  const execution = controlPlane.proposeExecution({ hubId: "engineering", workspaceId: "demo", principalId: "admin", objective: "Complete the acceptance slice" });
  controlPlane.executions.transition(execution.id, { status: "approved", actorId: "admin" });
  const executor = new RuntimeExecutor({ registry: controlPlane.registry, mode: "simulator" });
  const dispatcher = new Dispatcher({ executions: controlPlane.executions, executor });

  await dispatcher.tick();

  const completed = controlPlane.executions.get(execution.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.result.mode, "simulator");
  assert.equal(completed.result.outputs.length, 4);
  assert.deepEqual(controlPlane.executions.audit().map(({ to }) => to), ["proposed", "approved", "running", "completed"]);
});

test("dispatcher marks work interrupted by restart as retryable failure", () => {
  const controlPlane = new ControlPlane();
  const execution = controlPlane.proposeExecution({ hubId: "engineering", workspaceId: "demo", principalId: "admin", objective: "Recover this work" });
  controlPlane.executions.transition(execution.id, { status: "approved", actorId: "admin" });
  controlPlane.executions.transition(execution.id, { status: "running", actorId: "system:dispatcher" });
  const dispatcher = new Dispatcher({ executions: controlPlane.executions, executor: new RuntimeExecutor({ registry: controlPlane.registry }) });
  dispatcher.start(); dispatcher.stop();
  const recovered = controlPlane.executions.get(execution.id);
  assert.equal(recovered.status, "failed");
  assert.equal(recovered.result.code, "INTERRUPTED_BY_RESTART");
  assert.equal(recovered.result.retryable, true);
});
