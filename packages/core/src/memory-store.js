import { randomUUID } from "node:crypto";
import { invariant } from "./errors.js";

export const MEMORY_SCOPES = Object.freeze(["working", "session", "mission", "workspace", "hub", "personal", "organization", "artifact"]);
export const MEMORY_VISIBILITIES = Object.freeze(["private", "workspace", "hub", "organization", "public"]);

export class MemoryStore {
  #records = [];
  #onChange;

  constructor({ records = [], onChange } = {}) {
    this.#records = structuredClone(records);
    this.#onChange = onChange;
  }

  append(input) {
    invariant(input && typeof input === "object", "INVALID_MEMORY", "Memory input must be an object");
    invariant(MEMORY_SCOPES.includes(input.scope), "INVALID_MEMORY_SCOPE", `Invalid memory scope: ${input.scope}`);
    invariant(MEMORY_VISIBILITIES.includes(input.visibility), "INVALID_MEMORY_VISIBILITY", `Invalid memory visibility: ${input.visibility}`);
    invariant(typeof input.workspaceId === "string" && input.workspaceId.length > 0, "WORKSPACE_REQUIRED", "workspaceId is required");
    invariant(typeof input.principalId === "string" && input.principalId.length > 0, "PRINCIPAL_REQUIRED", "principalId is required");
    invariant(typeof input.content === "string" && input.content.trim().length > 0, "CONTENT_REQUIRED", "content is required");
    if (input.visibility === "hub") invariant(typeof input.hubId === "string" && input.hubId, "HUB_REQUIRED", "hubId is required for hub visibility");
    if (input.visibility === "organization") invariant(typeof input.organizationId === "string" && input.organizationId, "ORGANIZATION_REQUIRED", "organizationId is required for organization visibility");

    const record = Object.freeze({
      id: randomUUID(),
      canonicalId: input.canonicalId ?? `urn:agas:memory:${randomUUID()}`,
      type: typeof input.type === "string" && input.type ? input.type : "note",
      scope: input.scope,
      visibility: input.visibility,
      workspaceId: input.workspaceId,
      principalId: input.principalId,
      hubId: input.hubId ?? null,
      organizationId: input.organizationId ?? null,
      content: input.content.trim(),
      tags: [...new Set(Array.isArray(input.tags) ? input.tags.filter((tag) => typeof tag === "string" && tag) : [])],
      createdAt: new Date().toISOString(),
      provenance: structuredClone(input.provenance ?? { source: "operator", actorId: input.principalId }),
    });
    this.#records.push(record);
    this.#onChange?.(this.snapshot());
    return structuredClone(record);
  }

  snapshot() {
    return this.#records.map((record) => structuredClone(record));
  }

  search(context) {
    invariant(context && typeof context === "object", "INVALID_MEMORY_QUERY", "Search context must be an object");
    invariant(typeof context.workspaceId === "string" && context.workspaceId, "WORKSPACE_REQUIRED", "workspaceId is required");
    invariant(typeof context.principalId === "string" && context.principalId, "PRINCIPAL_REQUIRED", "principalId is required");
    const text = typeof context.text === "string" ? context.text.toLowerCase() : "";
    const tags = Array.isArray(context.tags) ? context.tags : [];

    return this.#records.filter((record) => {
      if (record.workspaceId !== context.workspaceId) return false;
      if (!this.#isVisible(record, context)) return false;
      if (text && !record.content.toLowerCase().includes(text)) return false;
      if (tags.length && !tags.every((tag) => record.tags.includes(tag))) return false;
      return true;
    }).map((record) => structuredClone(record));
  }

  #isVisible(record, context) {
    switch (record.visibility) {
      case "private": return record.principalId === context.principalId;
      case "workspace": return true;
      case "hub": return Boolean(context.hubId) && record.hubId === context.hubId;
      case "organization": return Boolean(context.organizationId) && record.organizationId === context.organizationId;
      case "public": return true;
      default: return false;
    }
  }
}
