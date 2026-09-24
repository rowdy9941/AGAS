import test from "node:test";
import assert from "node:assert/strict";
import { ControlPlane } from "../packages/core/src/control-plane.js";

test("engineering hub assigns every permanent specialist to a compatible runtime", () => {
  const controlPlane = new ControlPlane();
  const plan = controlPlane.planHub("engineering", { workspaceId: "demo", principalId: "operator" });
  assert.equal(plan.assignments.length, 4);
  assert.ok(plan.assignments.every(({ runtimeId }) => runtimeId));
  assert.equal(plan.strategy, "permanent-roster-on-demand-execution");
});

test("planning rejects a runtime set that cannot cover a required persona", () => {
  const controlPlane = new ControlPlane();
  assert.throws(
    () => controlPlane.planHub("engineering", { workspaceId: "demo", principalId: "operator", availableRuntimeIds: ["openclaw"] }),
    (error) => error.code === "NO_COMPATIBLE_RUNTIME",
  );
});
