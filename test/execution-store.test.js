import test from "node:test";
import assert from "node:assert/strict";
import { ControlPlane } from "../packages/core/src/control-plane.js";

test("execution lifecycle is validated and fully audited", () => {
  const controlPlane = new ControlPlane();
  const proposed = controlPlane.proposeExecution({ hubId: "engineering", workspaceId: "demo", principalId: "operator", objective: "Ship the API" });
  assert.equal(proposed.status, "proposed");
  assert.throws(() => controlPlane.executions.transition(proposed.id, { status: "completed", actorId: "operator", result: {} }), (error) => error.code === "INVALID_EXECUTION_TRANSITION");

  controlPlane.executions.transition(proposed.id, { status: "approved", actorId: "reviewer" });
  controlPlane.executions.transition(proposed.id, { status: "running", actorId: "operator" });
  const completed = controlPlane.executions.transition(proposed.id, { status: "completed", actorId: "operator", result: { summary: "done" } });
  assert.equal(completed.status, "completed");
  assert.equal(controlPlane.executions.audit().length, 4);
});
