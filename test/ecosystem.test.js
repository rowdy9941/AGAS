import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ControlPlane } from "../packages/core/src/control-plane.js";
import { RuntimeManager } from "../packages/ecosystem/src/runtime-manager.js";

test("versioned Agency sources import with provenance and project to runtimes", async () => {
  const source = JSON.parse(await readFile(new URL("../catalog/agency-personas.v1.json", import.meta.url), "utf8"));
  const controlPlane = new ControlPlane();
  const imported = controlPlane.catalog.importAgency(source);
  assert.equal(imported.imported, 8);
  assert.match(imported.personas[0].provenance.checksum, /^sha256:[a-f0-9]{64}$/);

  const results = controlPlane.catalog.search({ query: "accessibility", kind: "personas", runtimeId: "codex" });
  assert.equal(results.length, 1);
  assert.equal(results[0].id, "frontend-developer");
  const hermes = controlPlane.catalog.projectPersona("software-architect", "hermes");
  assert.equal(hermes.format, "hermes/persona-v1");
  assert.equal(hermes.projection.route.persistent, true);
  const codex = controlPlane.catalog.projectPersona("software-architect", "codex");
  assert.match(codex.projection, /Canonical-ID: software-architect/);
});

test("Hub Builder definitions persist a stable roster and activate compatible specialists", () => {
  const controlPlane = new ControlPlane();
  const hub = controlPlane.catalog.saveHub({
    id: "product-engineering",
    name: "Product Engineering",
    personaIds: ["software-architect", "frontend-developer", "qa-engineer"],
    runtimePreference: ["hermes", "codex", "agas-sim"],
    principalId: "admin",
  });
  assert.equal(hub.roster.length, 3);
  const plan = controlPlane.planHub(hub.id, { workspaceId: "demo", principalId: "admin" });
  assert.equal(plan.assignments.length, 3);
  assert.ok(plan.assignments.every((assignment) => assignment.runtimeId));
});

test("managed runtime installation is allowlisted, idempotent, and persistable", () => {
  let snapshot = [];
  const manager = new RuntimeManager({ onChange: (state) => { snapshot = state; } });
  const installed = manager.install("agas-sim", "admin");
  assert.equal(installed.status, "installed");
  assert.equal(manager.install("agas-sim", "admin").installedAt, installed.installedAt);
  assert.equal(snapshot.length, 1);
  assert.throws(() => manager.install("unknown", "admin"), (error) => error.code === "MANAGED_RUNTIME_NOT_FOUND");
});
