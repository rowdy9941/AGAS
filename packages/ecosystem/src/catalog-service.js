import { invariant } from "../../core/src/errors.js";
import { REGISTRY_KINDS } from "../../core/src/registry.js";
import { convertAgencySource } from "./agency-converter.js";

export class CatalogService {
  constructor(registry) {
    this.registry = registry;
  }

  search({ query = "", kind, runtimeId, permission, limit = 100 } = {}) {
    invariant(!kind || REGISTRY_KINDS.includes(kind), "UNKNOWN_REGISTRY_KIND", `Unknown registry kind: ${kind}`, 404);
    invariant(Number.isInteger(limit) && limit > 0 && limit <= 500, "INVALID_LIMIT", "limit must be between 1 and 500");
    const normalized = query.trim().toLowerCase();
    const kinds = kind ? [kind] : REGISTRY_KINDS;
    return kinds.flatMap((entryKind) => this.registry.list(entryKind).map((entry) => ({ kind: entryKind, ...entry })))
      .filter((entry) => !normalized || JSON.stringify(entry).toLowerCase().includes(normalized))
      .filter((entry) => !runtimeId || entry.compatibleRuntimes?.includes(runtimeId) || (entry.kind === "runtimes" && entry.id === runtimeId))
      .filter((entry) => !permission || entry.permissions?.includes(permission))
      .slice(0, limit);
  }

  importAgency(document) {
    const personas = convertAgencySource(document);
    for (const persona of personas) this.registry.replace("personas", persona);
    return { imported: personas.length, personas };
  }

  projectPersona(personaId, runtimeId) {
    const persona = this.registry.get("personas", personaId);
    const runtime = this.registry.get("runtimes", runtimeId);
    invariant(persona.compatibleRuntimes.includes(runtimeId), "INCOMPATIBLE_PERSONA_RUNTIME", `${personaId} is not compatible with ${runtimeId}`, 422);
    const base = { canonicalId: persona.id, version: persona.version ?? "1.0.0", permissions: persona.permissions, provenance: persona.provenance ?? { sourceId: "agas-core" } };
    if (runtimeId === "hermes") {
      return { format: "hermes/persona-v1", projection: { ...base, name: persona.name, instructions: persona.systemPrompt ?? persona.description, route: { strategy: "specialist", persistent: true } } };
    }
    if (runtimeId === "codex") {
      return { format: "codex/agents-md-v1", projection: `# ${persona.name}\n\n${persona.systemPrompt ?? persona.description}\n\nPermissions: ${persona.permissions.join(", ")}\nCanonical-ID: ${persona.id}\n` };
    }
    if (runtimeId === "opencode") {
      return { format: "opencode/agent-v1", projection: { ...base, name: persona.name, prompt: persona.systemPrompt ?? persona.description, mode: "subagent" } };
    }
    return { format: "agas/persona-v1", projection: { ...base, name: persona.name, instructions: persona.systemPrompt ?? persona.description, runtime: runtime.id } };
  }

  saveHub(input) {
    invariant(input && typeof input.id === "string" && /^[a-z0-9][a-z0-9._-]*$/.test(input.id), "INVALID_HUB_ID", "Hub id must be a lowercase slug");
    invariant(typeof input.name === "string" && input.name.trim(), "HUB_NAME_REQUIRED", "Hub name is required");
    invariant(Array.isArray(input.personaIds) && input.personaIds.length > 0, "HUB_ROSTER_REQUIRED", "Select at least one persona");
    const personaIds = [...new Set(input.personaIds)];
    for (const personaId of personaIds) this.registry.get("personas", personaId);
    const runtimePreference = [...new Set(input.runtimePreference ?? ["hermes", "codex", "opencode", "agas-sim"] )];
    for (const runtimeId of runtimePreference) this.registry.get("runtimes", runtimeId);
    const hub = {
      id: input.id,
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      version: Number.isInteger(input.version) ? input.version : 1,
      runtimePreference,
      roster: personaIds.map((personaId) => ({ personaId, required: true })),
      permissions: [...new Set(input.permissions ?? ["workspace:read"])],
      updatedAt: new Date().toISOString(),
      provenance: { sourceId: "agas-hub-builder", createdBy: input.principalId },
    };
    return this.registry.replace("hubs", hub);
  }
}
