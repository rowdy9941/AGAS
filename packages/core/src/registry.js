import { invariant } from "./errors.js";

export const REGISTRY_KINDS = Object.freeze([
  "runtimes",
  "agents",
  "personas",
  "skills",
  "tools",
  "mcpServers",
  "plugins",
  "workflows",
  "models",
  "hubs",
]);

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export class UniversalRegistry {
  #collections = new Map(REGISTRY_KINDS.map((kind) => [kind, new Map()]));
  #onChange;

  constructor(seed = {}, { onChange } = {}) {
    for (const [kind, entries] of Object.entries(seed)) {
      for (const entry of entries) this.register(kind, entry);
    }
    this.#onChange = onChange;
  }

  register(kind, entry) {
    const collection = this.#collection(kind);
    invariant(entry && typeof entry === "object" && !Array.isArray(entry), "INVALID_ENTRY", "Registry entry must be an object");
    invariant(typeof entry.id === "string" && /^[a-z0-9][a-z0-9._-]*$/.test(entry.id), "INVALID_ENTRY_ID", "Registry entry id must be a lowercase slug");
    invariant(!collection.has(entry.id), "DUPLICATE_ENTRY", `${kind}/${entry.id} already exists`, 409);
    const stored = deepFreeze(clone(entry));
    collection.set(stored.id, stored);
    this.#onChange?.(this.snapshot());
    return clone(stored);
  }

  replace(kind, entry) {
    const collection = this.#collection(kind);
    invariant(entry && typeof entry === "object" && !Array.isArray(entry), "INVALID_ENTRY", "Registry entry must be an object");
    invariant(typeof entry.id === "string" && /^[a-z0-9][a-z0-9._-]*$/.test(entry.id), "INVALID_ENTRY_ID", "Registry entry id must be a lowercase slug");
    const stored = deepFreeze(clone(entry));
    collection.set(stored.id, stored);
    this.#onChange?.(this.snapshot());
    return clone(stored);
  }

  get(kind, id) {
    const entry = this.#collection(kind).get(id);
    invariant(entry, "ENTRY_NOT_FOUND", `${kind}/${id} was not found`, 404);
    return clone(entry);
  }

  has(kind, id) {
    return this.#collection(kind).has(id);
  }

  list(kind) {
    return [...this.#collection(kind).values()].map(clone);
  }

  counts() {
    return Object.fromEntries(REGISTRY_KINDS.map((kind) => [kind, this.#collection(kind).size]));
  }

  snapshot() {
    return Object.fromEntries(REGISTRY_KINDS.map((kind) => [kind, this.list(kind)]));
  }

  #collection(kind) {
    invariant(this.#collections.has(kind), "UNKNOWN_REGISTRY_KIND", `Unknown registry kind: ${kind}`, 404);
    return this.#collections.get(kind);
  }
}
