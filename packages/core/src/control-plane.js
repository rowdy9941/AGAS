import { UniversalRegistry } from "./registry.js";
import { initialCatalog } from "./catalog.js";
import { MemoryStore } from "./memory-store.js";
import { ExecutionStore } from "./execution-store.js";
import { detectRuntimes } from "./runtime-detector.js";
import { planHub } from "./hub-planner.js";
import { CURRENT_SCHEMA_VERSION, StateDatabase } from "./state-database.js";
import { AuthService } from "./auth-service.js";
import { CatalogService } from "../../ecosystem/src/catalog-service.js";
import { RuntimeManager } from "../../ecosystem/src/runtime-manager.js";
import { ContextFabric } from "../../context/src/context-fabric.js";
import { McpGateway } from "../../mcp/src/mcp-gateway.js";
import { VaultProjector } from "../../vault/src/vault-projector.js";
import { OrganizationStore } from "../../organization/src/organization-store.js";
import { MissionAuthority } from "../../mission/src/mission-authority.js";

export class ControlPlane {
  constructor({ registry, memory, executions, catalog, runtimeManager, contextFabric, mcpGateway, vault, organization, missions, database } = {}) {
    this.registry = registry ?? new UniversalRegistry(initialCatalog);
    this.memory = memory ?? new MemoryStore();
    this.executions = executions ?? new ExecutionStore();
    this.catalog = catalog ?? new CatalogService(this.registry);
    this.runtimeManager = runtimeManager ?? new RuntimeManager();
    this.context = contextFabric ?? new ContextFabric({ registry: this.registry });
    this.mcp = mcpGateway ?? new McpGateway({ registry: this.registry });
    this.vault = vault ?? new VaultProjector({ contextFabric: this.context, memory: this.memory });
    this.organization = organization ?? new OrganizationStore();
    this.missions = missions ?? new MissionAuthority({ registry: this.registry, executions: this.executions, context: this.context, vault: this.vault, organization: this.organization });
    this.database = database ?? null;
  }

  health() {
    return { status: "ok", service: "agas-control-plane", version: "1.0.1", uptimeSeconds: Math.floor(process.uptime()), registry: this.registry.counts(), missions: { total: this.missions.list().length, running: this.missions.list({ status: "running" }).length } };
  }

  diagnostics() {
    return {
      generatedAt: new Date().toISOString(),
      process: { node: process.version, platform: process.platform, architecture: process.arch, uptimeSeconds: Math.floor(process.uptime()), memory: process.memoryUsage() },
      database: this.database?.diagnostics() ?? { path: ":memory:", integrity: { ok: true, result: "ok", schemaVersion: CURRENT_SCHEMA_VERSION }, namespaces: [] },
      registry: this.registry.counts(),
      records: {
        missions: this.missions.list().length,
        executions: this.executions.list({ limit: 500 }).length,
        artifacts: this.context.listArtifacts().length,
        handoffs: this.context.listHandoffs().length,
      },
    };
  }

  detectRuntimes(options) {
    return detectRuntimes(this.registry.list("runtimes"), options);
  }

  planHub(hubId, input) {
    return planHub(this.registry, hubId, input);
  }

  proposeExecution(input) {
    const plan = this.planHub(input.hubId, input);
    return this.executions.propose(plan, input);
  }
}

export function createPersistentServices({ databasePath = "./data/agas.db", bootstrapToken, vaultPath = "./data/vault" } = {}) {
  const database = new StateDatabase(databasePath);
  const savedRegistry = database.read("registry", null);
  const registrySeed = savedRegistry ?? initialCatalog;
  const registry = new UniversalRegistry(registrySeed, { onChange: (state) => database.write("registry", state) });
  if (!savedRegistry) {
    database.write("registry", registry.snapshot());
  } else {
    for (const [kind, entries] of Object.entries(initialCatalog)) {
      for (const entry of entries) registry.replace(kind, entry);
    }
  }

  const memory = new MemoryStore({
    records: database.read("memory", []),
    onChange: (state) => database.write("memory", state),
  });
  const executionState = database.read("executions", { executions: [], audit: [] });
  const executions = new ExecutionStore({
    ...executionState,
    onChange: (state) => database.write("executions", state),
  });
  const auth = new AuthService({
    keys: database.read("apiKeys", []),
    bootstrapToken,
    onChange: (state) => database.write("apiKeys", state),
  });
  const runtimeManager = new RuntimeManager({
    installs: database.read("runtimeInstalls", []),
    onChange: (state) => database.write("runtimeInstalls", state),
  });
  const contextFabric = new ContextFabric({
    registry,
    state: database.read("contextFabric", {}),
    onChange: (state) => database.write("contextFabric", state),
  });
  const mcpGateway = new McpGateway({
    registry,
    grants: database.read("mcpGrants", []),
    onChange: (state) => database.write("mcpGrants", state),
  });
  const vault = new VaultProjector({ rootPath: vaultPath, contextFabric, memory });
  const organization = new OrganizationStore({
    state: database.read("organization", null) ?? undefined,
    onChange: (state) => database.write("organization", state),
  });
  if (database.read("organization", null) == null) database.write("organization", organization.snapshot());
  const missions = new MissionAuthority({
    state: database.read("missions", {}), registry, executions, context: contextFabric, vault, organization,
    onChange: (state) => database.write("missions", state),
  });

  return { controlPlane: new ControlPlane({ registry, memory, executions, runtimeManager, contextFabric, mcpGateway, vault, organization, missions, database }), auth, database };
}

export { UniversalRegistry } from "./registry.js";
export { MemoryStore } from "./memory-store.js";
export { ExecutionStore } from "./execution-store.js";
export { DomainError } from "./errors.js";
export { StateDatabase } from "./state-database.js";
export { AuthService, ROLE_PERMISSIONS } from "./auth-service.js";
export { OrganizationStore } from "../../organization/src/organization-store.js";
export { MissionAuthority, MissionCoordinator } from "../../mission/src/mission-authority.js";
