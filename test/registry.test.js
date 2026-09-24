import test from "node:test";
import assert from "node:assert/strict";
import { UniversalRegistry, DomainError } from "../packages/core/src/control-plane.js";

test("registry validates kinds, ids, duplicates, and immutable copies", () => {
  const registry = new UniversalRegistry();
  const input = { id: "codex", capabilities: ["code"] };
  registry.register("runtimes", input);
  input.capabilities.push("mutated");

  assert.deepEqual(registry.get("runtimes", "codex").capabilities, ["code"]);
  assert.throws(() => registry.register("runtimes", { id: "codex" }), (error) => error instanceof DomainError && error.code === "DUPLICATE_ENTRY");
  assert.throws(() => registry.list("unknown"), (error) => error.code === "UNKNOWN_REGISTRY_KIND");
});
