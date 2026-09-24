import test from "node:test";
import assert from "node:assert/strict";
import { AuthService } from "../packages/core/src/control-plane.js";

test("API keys are hashed, role-scoped, workspace-scoped, and revocable", () => {
  const snapshots = [];
  const auth = new AuthService({ bootstrapToken: "root-secret", onChange: (state) => snapshots.push(state) });
  const admin = auth.authenticateHeader("Bearer root-secret");
  const issued = auth.createKey({ name: "Alpha operator", role: "operator", workspaceIds: ["alpha"] }, admin);

  assert.match(issued.token, /^agas_/);
  assert.equal(snapshots.at(-1).some((key) => key.tokenHash === issued.token), false);
  const operator = auth.authenticateHeader(`Bearer ${issued.token}`);
  auth.authorize(operator, "execution:create");
  auth.authorizeWorkspace(operator, "alpha");
  assert.throws(() => auth.authorize(operator, "execution:approve"), (error) => error.code === "PERMISSION_DENIED");
  assert.throws(() => auth.authorizeWorkspace(operator, "beta"), (error) => error.code === "WORKSPACE_ACCESS_DENIED");

  auth.revokeKey(issued.id, admin);
  assert.throws(() => auth.authenticateHeader(`Bearer ${issued.token}`), (error) => error.code === "INVALID_API_TOKEN");
});
