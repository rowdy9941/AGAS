import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../packages/core/src/control-plane.js";

test("memory search enforces workspace, principal, hub, and organization boundaries", () => {
  const memory = new MemoryStore();
  memory.append({ scope: "personal", visibility: "private", workspaceId: "alpha", principalId: "ada", content: "private note" });
  memory.append({ scope: "hub", visibility: "hub", workspaceId: "alpha", principalId: "ada", hubId: "engineering", content: "hub note" });
  memory.append({ scope: "workspace", visibility: "workspace", workspaceId: "alpha", principalId: "ada", content: "workspace note" });
  memory.append({ scope: "workspace", visibility: "workspace", workspaceId: "beta", principalId: "ada", content: "other workspace" });

  const bob = memory.search({ workspaceId: "alpha", principalId: "bob", hubId: "engineering" });
  assert.deepEqual(bob.map(({ content }) => content), ["hub note", "workspace note"]);
  const ada = memory.search({ workspaceId: "alpha", principalId: "ada" });
  assert.deepEqual(ada.map(({ content }) => content), ["private note", "workspace note"]);
});
