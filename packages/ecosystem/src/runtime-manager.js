import { invariant } from "../../core/src/errors.js";

const MANAGED_PACKAGES = Object.freeze({
  "agas-sim": { runtimeId: "agas-sim", version: "1.0.1", source: "bundled", checksum: "builtin:agas-sim-1.0.1" },
});

export class RuntimeManager {
  #installs;
  #onChange;

  constructor({ installs = [], onChange } = {}) {
    this.#installs = structuredClone(installs);
    this.#onChange = onChange;
  }

  packages() {
    return Object.values(MANAGED_PACKAGES).map((entry) => ({ ...entry, installed: this.#installs.some((item) => item.runtimeId === entry.runtimeId), install: this.#installs.find((item) => item.runtimeId === entry.runtimeId) ?? null }));
  }

  install(runtimeId, actorId) {
    const packageDefinition = MANAGED_PACKAGES[runtimeId];
    invariant(packageDefinition, "MANAGED_RUNTIME_NOT_FOUND", `No managed package exists for ${runtimeId}`, 404);
    const existing = this.#installs.find((item) => item.runtimeId === runtimeId);
    if (existing) return structuredClone(existing);
    const install = { ...packageDefinition, installedAt: new Date().toISOString(), installedBy: actorId, status: "installed" };
    this.#installs.push(install);
    this.#onChange?.(this.snapshot());
    return structuredClone(install);
  }

  snapshot() {
    return structuredClone(this.#installs);
  }
}
