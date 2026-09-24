import { UniversalRegistry } from "./registry.js";
import { initialCatalog } from "./catalog.js";
import { MemoryStore } from "./memory-store.js";
import { ExecutionStore } from "./execution-store.js";
import { detectRuntimes } from "./runtime-detector.js";
import { planHub } from "./hub-planner.js";

export class ControlPlane {
  constructor({ registry, memory, executions } = {}) {
    this.registry = registry ?? new UniversalRegistry(initialCatalog);
    this.memory = memory ?? new MemoryStore();
    this.executions = executions ?? new ExecutionStore();
  }

  health() {
    return { status: "ok", service: "agas-control-plane", version: "0.1.0", registry: this.registry.counts() };
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

export { UniversalRegistry } from "./registry.js";
export { MemoryStore } from "./memory-store.js";
export { ExecutionStore } from "./execution-store.js";
export { DomainError } from "./errors.js";
