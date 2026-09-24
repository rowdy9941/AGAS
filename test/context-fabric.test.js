import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ControlPlane, createPersistentServices } from "../packages/core/src/control-plane.js";

test("two distinct runtimes complete a typed cross-agent handoff with evidence", () => {
  const controlPlane = new ControlPlane();
  const artifact = controlPlane.context.createArtifact({ workspaceId: "demo", principalId: "architect", name: "Architecture decision", type: "document", content: "Use a governed modular monolith." });
  const handoff = controlPlane.context.createHandoff({
    workspaceId: "demo", principalId: "architect", fromRuntimeId: "codex", toRuntimeId: "opencode",
    fromAgentId: "architect", toAgentId: "frontend", summary: "Implement the approved interface boundary.",
    acceptanceCriteria: ["Tests pass", "Browser flow works"], artifactIds: [artifact.id],
  });
  const accepted = controlPlane.context.resolveHandoff(handoff.id, { status: "accepted", principalId: "frontend", resolution: "Evidence received and accepted." });
  assert.equal(accepted.status, "accepted");
  assert.notEqual(accepted.fromRuntimeId, accepted.toRuntimeId);
  assert.equal(controlPlane.context.listEvents({ workspaceId: "demo" }).length, 3);
});

test("context checkpoints roll artifacts and handoffs back to a known state", () => {
  const controlPlane = new ControlPlane();
  controlPlane.context.createArtifact({ workspaceId: "demo", principalId: "operator", name: "Before", type: "document", content: "keep" });
  const checkpoint = controlPlane.context.createCheckpoint({ workspaceId: "demo", principalId: "operator", name: "Known good" });
  controlPlane.context.createArtifact({ workspaceId: "demo", principalId: "operator", name: "After", type: "document", content: "remove" });
  assert.equal(controlPlane.context.listArtifacts({ workspaceId: "demo" }).length, 2);
  controlPlane.context.rollback(checkpoint.id, { principalId: "operator", reason: "Regression" });
  assert.deepEqual(controlPlane.context.listArtifacts({ workspaceId: "demo" }).map(({ name }) => name), ["Before"]);
});

test("MCP Gateway projects one service to two runtimes with different tool grants", () => {
  const controlPlane = new ControlPlane();
  controlPlane.mcp.registerService({ id: "knowledge", name: "Knowledge MCP", transport: "http", endpoint: "https://mcp.example.test", tools: ["search", "read", "write"], secretRef: "env:KNOWLEDGE_TOKEN" }, "admin");
  controlPlane.mcp.grant({ serviceId: "knowledge", runtimeId: "codex", workspaceId: "demo", allowedTools: ["search", "read"] }, "admin");
  controlPlane.mcp.grant({ serviceId: "knowledge", runtimeId: "opencode", workspaceId: "demo", allowedTools: ["read"] }, "admin");
  assert.deepEqual(controlPlane.mcp.project("codex", { workspaceId: "demo" }).services[0].allowedTools, ["search", "read"]);
  assert.deepEqual(controlPlane.mcp.project("opencode", { workspaceId: "demo" }).services[0].allowedTools, ["read"]);
  assert.throws(() => controlPlane.mcp.grant({ serviceId: "knowledge", runtimeId: "codex", workspaceId: "demo", allowedTools: ["delete"] }, "admin"), (error) => error.code === "MCP_TOOL_ESCALATION");
  assert.throws(() => controlPlane.mcp.registerService({ id: "unsafe", name: "Unsafe", transport: "http", endpoint: "https://example.test", tools: ["read"], token: "raw-secret" }, "admin"), (error) => error.code === "RAW_MCP_SECRET_DENIED");
});

test("Obsidian projection is deterministic and validated import updates authoritative artifact", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agas-vault-"));
  const services = createPersistentServices({ databasePath: join(directory, "agas.db"), bootstrapToken: "root", vaultPath: join(directory, "vault") });
  try {
    const artifact = services.controlPlane.context.createArtifact({ workspaceId: "demo", principalId: "bootstrap", name: "Mission report", type: "report", content: "Original report" });
    services.controlPlane.memory.append({ scope: "workspace", visibility: "workspace", workspaceId: "demo", principalId: "bootstrap", type: "decision", content: "Use scoped MCP grants" });
    const projected = await services.controlPlane.vault.project({ workspaceId: "demo", principalId: "bootstrap" });
    assert.equal(projected.counts.artifacts, 1);
    assert.equal(projected.counts.memories, 1);
    const artifactFile = projected.files.find((file) => file.includes("Artifacts/"));
    const markdown = await readFile(join(directory, "vault", artifactFile), "utf8");
    assert.match(markdown, new RegExp(artifact.canonicalId));
    const edited = markdown.replace("Original report", "Updated in Obsidian");
    const imported = services.controlPlane.vault.importMarkdown(edited, { workspaceId: "demo", principalId: "bootstrap" });
    assert.equal(imported.version, 2);
    assert.match(imported.content, /Updated in Obsidian/);
  } finally {
    services.database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
