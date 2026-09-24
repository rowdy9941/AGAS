import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { ControlPlane } from "../packages/core/src/control-plane.js";

test("scoped context remains responsive at the MVP single-node target", () => {
  const controlPlane = new ControlPlane();
  const started = performance.now();
  for (let index = 0; index < 1_000; index += 1) {
    controlPlane.memory.append({ scope: "workspace", visibility: "workspace", workspaceId: "benchmark", principalId: "operator", content: `record-${index}` });
  }
  const items = controlPlane.memory.search({ workspaceId: "benchmark", principalId: "operator" });
  const durationMs = performance.now() - started;
  assert.equal(items.length, 1_000);
  assert.ok(durationMs < 2_000, `1,000 writes plus search took ${durationMs.toFixed(1)}ms`);
});
