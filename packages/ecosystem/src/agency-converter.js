import { createHash } from "node:crypto";
import { invariant } from "../../core/src/errors.js";

const ALLOWED_PERMISSIONS = new Set([
  "workspace:read", "workspace:write", "plan:write", "process:test",
  "security:scan", "research:read",
]);

export function convertAgencySource(document) {
  invariant(document && typeof document === "object", "INVALID_AGENCY_SOURCE", "Agency source must be an object");
  invariant(document.schemaVersion === "agency.personas/v1", "UNSUPPORTED_AGENCY_SCHEMA", `Unsupported Agency schema: ${document.schemaVersion}`);
  invariant(document.source && typeof document.source.id === "string" && typeof document.source.version === "string", "INVALID_AGENCY_PROVENANCE", "Agency source id and version are required");
  invariant(Array.isArray(document.personas) && document.personas.length > 0, "AGENCY_PERSONAS_REQUIRED", "Agency source must contain personas");
  const checksum = createHash("sha256").update(JSON.stringify(document)).digest("hex");
  const seen = new Set();

  return document.personas.map((persona) => {
    invariant(persona && typeof persona.id === "string" && /^[a-z0-9][a-z0-9._-]*$/.test(persona.id), "INVALID_PERSONA_ID", "Agency persona id must be a lowercase slug");
    invariant(!seen.has(persona.id), "DUPLICATE_PERSONA", `Duplicate Agency persona: ${persona.id}`);
    seen.add(persona.id);
    invariant(typeof persona.name === "string" && persona.name.trim(), "PERSONA_NAME_REQUIRED", `Name is required for ${persona.id}`);
    invariant(typeof persona.systemPrompt === "string" && persona.systemPrompt.trim(), "PERSONA_PROMPT_REQUIRED", `systemPrompt is required for ${persona.id}`);
    invariant(Array.isArray(persona.compatibleRuntimes) && persona.compatibleRuntimes.length > 0, "PERSONA_RUNTIMES_REQUIRED", `compatibleRuntimes are required for ${persona.id}`);
    invariant(Array.isArray(persona.permissions) && persona.permissions.every((permission) => ALLOWED_PERMISSIONS.has(permission)), "INVALID_PERSONA_PERMISSION", `Persona ${persona.id} requests an unsupported permission`);
    return {
      id: persona.id,
      name: persona.name.trim(),
      description: persona.description?.trim() ?? "",
      systemPrompt: persona.systemPrompt.trim(),
      tags: [...new Set(persona.tags ?? [])],
      compatibleRuntimes: [...new Set(persona.compatibleRuntimes)],
      permissions: [...new Set(persona.permissions)],
      version: document.source.version,
      provenance: {
        sourceId: document.source.id,
        sourceName: document.source.name ?? document.source.id,
        sourceVersion: document.source.version,
        license: document.source.license ?? "unknown",
        checksum: `sha256:${checksum}`,
        importedAt: new Date().toISOString(),
      },
    };
  });
}
