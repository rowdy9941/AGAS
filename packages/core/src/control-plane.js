import { UniversalRegistry } from "./registry.js";
import { initialCatalog } from "./catalog.js";
import { MemoryStore } from "./memory-store.js";
import { ExecutionStore } from "./execution-store.js";
import { detectRuntimes } from "./runtime-detector.js";
import { planHub } from "./hub-planner.js";
import { StateDatabase } from "./state-database.js";
import { AuthService } from "./auth-service.js";

export class ControlPlane {
  constructor({ registry, memory, executions } = {}) {
    this.registry = registry ?? new UniversalRegistry(initialCatalog);
    this.memory = memory ?? new MemoryStore();
    this.executions = executions ?? new ExecutionStore();
  }

  health() {
    return { status: "ok", service: "agas-control-plane", version: "0.3.0", registry: this.registry.counts() };
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

export function createPersistentServices({ databasePath = "./data/agas.db", bootstrapToken } = {}) {
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

  return { controlPlane: new ControlPlane({ registry, memory, executions }), auth, database };
}

export { UniversalRegistry } from "./registry.js";
export { MemoryStore } from "./memory-store.js";
export { ExecutionStore } from "./execution-store.js";
export { DomainError } from "./errors.js";
export { StateDatabase } from "./state-database.js";
export { AuthService, ROLE_PERMISSIONS } from "./auth-service.js";
