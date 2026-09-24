import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createPersistentServices } from "../packages/core/src/control-plane.js";
import { Dispatcher } from "../packages/runtime/src/dispatcher.js";
import { RuntimeExecutor } from "../packages/runtime/src/runtime-executor.js";

test("the twelve-step public MVP acceptance scenario completes offline", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agas-mvp-"));
  const databasePath = join(directory, "agas.db");
  const vaultPath = join(directory, "vault");
  try {
    // 1-2: one local service owns durable product and Paperclip-responsibility records.
    let services = createPersistentServices({ databasePath, bootstrapToken: "root", vaultPath });
    const { controlPlane } = services;
    assert.equal(controlPlane.organization.get("projects", "default-project").workspaceId, "default");
    assert.equal(controlPlane.organization.get("teams", "engineering-team").hubIds.includes("engineering"), true);
    assert.equal(controlPlane.organization.get("conversations", "default-conversation").messages.length, 0);

    // 3: detect catalogued runtimes and activate the bundled managed simulator.
    assert.ok(controlPlane.registry.get("runtimes", "codex"));
    assert.equal(controlPlane.runtimeManager.install("agas-sim", "bootstrap").status, "installed");

    // 4: browse specialists and compose a stable Engineering Hub.
    assert.ok(controlPlane.catalog.search({ kind: "personas", query: "security" }).length > 0);
    const hub = controlPlane.catalog.saveHub({ id: "acceptance-engineering", name: "Acceptance Engineering", personaIds: ["software-architect", "backend-engineer", "security-reviewer", "reality-checker"], runtimePreference: ["hermes", "codex", "opencode", "agas-sim"], principalId: "bootstrap" });
    assert.equal(controlPlane.planHub(hub.id, { workspaceId: "default", principalId: "bootstrap" }).assignments.length, 4);

    // 5: one MCP registration becomes two least-privilege runtime projections.
    controlPlane.mcp.registerService({ id: "acceptance-tools", name: "Acceptance tools", transport: "http", endpoint: "https://offline.invalid/mcp", tools: ["read", "search", "write"], secretRef: "env:ACCEPTANCE_MCP_TOKEN" }, "bootstrap");
    controlPlane.mcp.grant({ serviceId: "acceptance-tools", runtimeId: "codex", workspaceId: "default", allowedTools: ["read"] }, "bootstrap");
    controlPlane.mcp.grant({ serviceId: "acceptance-tools", runtimeId: "opencode", workspaceId: "default", allowedTools: ["search", "write"] }, "bootstrap");
    assert.deepEqual(controlPlane.mcp.project("codex", { workspaceId: "default" }).services[0].allowedTools, ["read"]);
    assert.deepEqual(controlPlane.mcp.project("opencode", { workspaceId: "default" }).services[0].allowedTools, ["search", "write"]);

    // 6-8: plan a repository mission, review approval, and coordinate logical runtimes through the offline simulator.
    const mission = controlPlane.missions.create({ workspaceId: "default", projectId: "default-project", teamId: "engineering-team", conversationId: "default-conversation", type: "repository", objective: "Implement and verify the public AGAS MVP", acceptanceCriteria: ["Tests pass", "Security review passes", "Final report exists"] }, "bootstrap");
    assert.equal(mission.status, "awaiting-approval");
    assert.equal(mission.tasks.find((item) => item.id === "implement").runtimeId, "codex");
    assert.equal(mission.tasks.find((item) => item.id === "review").runtimeId, "opencode");
    controlPlane.missions.approve(mission.id, { reason: "Sensitive implementation reviewed" }, "bootstrap");
    controlPlane.missions.start(mission.id, "bootstrap");
    const dispatcher = new Dispatcher({ executions: controlPlane.executions, executor: new RuntimeExecutor({ registry: controlPlane.registry, mode: "simulator" }) });
    for (let step = 0; step < 12 && controlPlane.missions.get(mission.id).status !== "completed"; step += 1) {
      await controlPlane.missions.reconcile();
      await dispatcher.tick();
      await controlPlane.missions.reconcile();
    }

    // 9, 11, 12: handoffs, tool actions, artifacts, verification, report, and vault are all inspectable.
    const completed = controlPlane.missions.get(mission.id);
    assert.equal(completed.status, "completed");
    assert.equal(completed.verification.passed, true);
    assert.equal(controlPlane.context.listHandoffs({ workspaceId: "default" }).length, 4);
    assert.equal(controlPlane.context.listHandoffs({ workspaceId: "default" }).every((handoff) => handoff.status === "accepted"), true);
    assert.equal(controlPlane.executions.list({ workspaceId: "default" }).every((execution) => execution.result.toolActions[0].status === "completed"), true);
    const report = controlPlane.context.listArtifacts({ workspaceId: "default" }).find((artifact) => artifact.id === completed.finalReportId);
    assert.match(report.content, /Status: verified/);
    assert.ok(completed.vaultProjection.files.some((file) => file.includes("Artifacts")));

    // 10: authoritative state is unchanged after a full database close/reopen.
    services.database.close();
    services = createPersistentServices({ databasePath, bootstrapToken: "ignored", vaultPath });
    assert.equal(services.controlPlane.missions.get(mission.id).status, "completed");
    assert.equal(services.controlPlane.context.listArtifacts({ workspaceId: "default" }).length, 5);
    assert.equal(services.controlPlane.mcp.project("opencode", { workspaceId: "default" }).services[0].allowedTools.length, 2);
    assert.equal(services.controlPlane.organization.get("conversations", "default-conversation").messages.length, 2);
    services.database.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
