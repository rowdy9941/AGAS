import test from "node:test";
import assert from "node:assert/strict";
import { detectRuntimes } from "../packages/core/src/runtime-detector.js";

test("runtime detection is deterministic for an empty PATH", async () => {
  const result = await detectRuntimes([
    { id: "codex", command: "codex", versionArgs: ["--version"] },
  ], { pathValue: "" });
  assert.deepEqual(result, [{ runtimeId: "codex", installed: false, version: null }]);
});
