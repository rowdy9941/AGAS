import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectRuntimes } from "../packages/core/src/runtime-detector.js";

test("runtime detection is deterministic for an empty PATH", async () => {
  const result = await detectRuntimes([
    { id: "codex", command: "codex", versionArgs: ["--version"] },
  ], { pathValue: "" });
  assert.deepEqual(result, [{ runtimeId: "codex", installed: false, version: null }]);
});

test("runtime detection allows a bounded cold start for external CLIs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agas-runtime-detection-"));
  const executable = join(directory, "slow-runtime");
  try {
    await writeFile(executable, "#!/bin/sh\nsleep 2\nprintf 'slow-runtime 1.0.0\\n'\n");
    await chmod(executable, 0o755);

    const result = await detectRuntimes([
      { id: "slow-runtime", command: "slow-runtime", versionArgs: ["--version"] },
    ], { pathValue: directory });

    assert.deepEqual(result, [{ runtimeId: "slow-runtime", installed: true, version: "slow-runtime 1.0.0" }]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
