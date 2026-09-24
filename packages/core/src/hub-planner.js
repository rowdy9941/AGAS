import { invariant } from "./errors.js";

export function planHub(registry, hubId, input = {}) {
  const hub = registry.get("hubs", hubId);
  invariant(typeof input.workspaceId === "string" && input.workspaceId, "WORKSPACE_REQUIRED", "workspaceId is required");
  invariant(typeof input.principalId === "string" && input.principalId, "PRINCIPAL_REQUIRED", "principalId is required");
  const available = input.availableRuntimeIds ? new Set(input.availableRuntimeIds) : null;

  const assignments = hub.roster.map(({ agentId, required }) => {
    const agent = registry.get("agents", agentId);
    const persona = registry.get("personas", agent.personaId);
    const runtimeId = hub.runtimePreference.find((candidate) =>
      registry.has("runtimes", candidate)
      && persona.compatibleRuntimes.includes(candidate)
      && (!available || available.has(candidate))
    );
    invariant(runtimeId || !required, "NO_COMPATIBLE_RUNTIME", `No compatible runtime is available for ${agentId}`, 422);
    return {
      agentId,
      personaId: persona.id,
      runtimeId: runtimeId ?? null,
      required,
      permissions: [...persona.permissions],
    };
  });

  return {
    hubId: hub.id,
    workspaceId: input.workspaceId,
    requestedBy: input.principalId,
    strategy: "permanent-roster-on-demand-execution",
    assignments,
    plannedAt: new Date().toISOString(),
  };
}
