import { randomUUID } from "node:crypto";
import { invariant } from "../../core/src/errors.js";

const ARTIFACT_TYPES = new Set(["document", "code", "report", "test-evidence", "dataset", "image", "other"]);
const HANDOFF_STATES = new Set(["pending", "accepted", "rejected"]);

function canonicalId(type) {
  return `urn:agas:${type}:${randomUUID()}`;
}

export class ContextFabric {
  #state;
  #onChange;

  constructor({ state = {}, onChange, registry } = {}) {
    this.registry = registry;
    this.#state = {
      artifacts: structuredClone(state.artifacts ?? []),
      events: structuredClone(state.events ?? []),
      handoffs: structuredClone(state.handoffs ?? []),
      checkpoints: structuredClone(state.checkpoints ?? []),
    };
    this.#onChange = onChange;
  }

  createArtifact(input) {
    invariant(input && typeof input.workspaceId === "string" && input.workspaceId, "WORKSPACE_REQUIRED", "workspaceId is required");
    invariant(typeof input.principalId === "string" && input.principalId, "PRINCIPAL_REQUIRED", "principalId is required");
    invariant(typeof input.name === "string" && input.name.trim(), "ARTIFACT_NAME_REQUIRED", "Artifact name is required");
    invariant(ARTIFACT_TYPES.has(input.type), "INVALID_ARTIFACT_TYPE", `Invalid artifact type: ${input.type}`);
    invariant(typeof input.content === "string", "ARTIFACT_CONTENT_REQUIRED", "Artifact content must be a string");
    const artifact = {
      id: randomUUID(),
      canonicalId: input.canonicalId ?? canonicalId("artifact"),
      version: Number.isInteger(input.version) ? input.version : 1,
      workspaceId: input.workspaceId,
      name: input.name.trim(),
      type: input.type,
      mediaType: input.mediaType ?? "text/plain",
      content: input.content,
      createdBy: input.principalId,
      createdAt: new Date().toISOString(),
      provenance: structuredClone(input.provenance ?? { source: "operator", actorId: input.principalId }),
    };
    invariant(!this.#state.artifacts.some((item) => item.canonicalId === artifact.canonicalId), "DUPLICATE_CANONICAL_ID", `${artifact.canonicalId} already exists`, 409);
    this.#state.artifacts.push(artifact);
    this.recordEvent({ workspaceId: artifact.workspaceId, principalId: input.principalId, type: "artifact.created", subjectId: artifact.canonicalId, data: { name: artifact.name, type: artifact.type } }, false);
    this.#changed();
    return structuredClone(artifact);
  }

  upsertArtifact(input) {
    const index = this.#state.artifacts.findIndex((artifact) => artifact.canonicalId === input.canonicalId);
    if (index < 0) return this.createArtifact(input);
    const previous = this.#state.artifacts[index];
    invariant(previous.workspaceId === input.workspaceId, "CANONICAL_WORKSPACE_MISMATCH", "Imported artifact cannot change workspace", 409);
    const updated = { ...previous, name: input.name, type: input.type, mediaType: input.mediaType ?? previous.mediaType, content: input.content, version: previous.version + 1, provenance: structuredClone(input.provenance), updatedAt: new Date().toISOString() };
    this.#state.artifacts[index] = updated;
    this.recordEvent({ workspaceId: updated.workspaceId, principalId: input.principalId, type: "artifact.updated", subjectId: updated.canonicalId, data: { version: updated.version } }, false);
    this.#changed();
    return structuredClone(updated);
  }

  listArtifacts({ workspaceId } = {}) {
    return this.#state.artifacts.filter((item) => !workspaceId || item.workspaceId === workspaceId).map((item) => structuredClone(item));
  }

  recordEvent(input, notify = true) {
    invariant(typeof input.workspaceId === "string" && input.workspaceId, "WORKSPACE_REQUIRED", "workspaceId is required");
    invariant(typeof input.type === "string" && input.type, "EVENT_TYPE_REQUIRED", "Event type is required");
    const event = { id: randomUUID(), canonicalId: canonicalId("event"), workspaceId: input.workspaceId, principalId: input.principalId ?? "system", type: input.type, subjectId: input.subjectId ?? null, data: structuredClone(input.data ?? {}), occurredAt: new Date().toISOString() };
    this.#state.events.push(event);
    if (notify) this.#changed();
    return structuredClone(event);
  }

  listEvents({ workspaceId, limit = 200 } = {}) {
    return this.#state.events.filter((event) => !workspaceId || event.workspaceId === workspaceId).slice(-limit).map((event) => structuredClone(event));
  }

  createHandoff(input) {
    invariant(input && input.fromRuntimeId !== input.toRuntimeId, "DISTINCT_RUNTIMES_REQUIRED", "A handoff requires two different runtimes");
    this.registry?.get("runtimes", input.fromRuntimeId);
    this.registry?.get("runtimes", input.toRuntimeId);
    invariant(typeof input.workspaceId === "string" && input.workspaceId, "WORKSPACE_REQUIRED", "workspaceId is required");
    invariant(typeof input.principalId === "string" && input.principalId, "PRINCIPAL_REQUIRED", "principalId is required");
    invariant(typeof input.fromAgentId === "string" && input.fromAgentId, "SOURCE_AGENT_REQUIRED", "fromAgentId is required");
    invariant(typeof input.toAgentId === "string" && input.toAgentId, "TARGET_AGENT_REQUIRED", "toAgentId is required");
    invariant(typeof input.summary === "string" && input.summary.trim(), "HANDOFF_SUMMARY_REQUIRED", "Handoff summary is required");
    const artifactIds = [...new Set(input.artifactIds ?? [])];
    invariant(artifactIds.length > 0, "HANDOFF_EVIDENCE_REQUIRED", "At least one artifact is required for a handoff");
    for (const id of artifactIds) {
      const artifact = this.#state.artifacts.find((item) => item.id === id || item.canonicalId === id);
      invariant(artifact && artifact.workspaceId === input.workspaceId, "HANDOFF_ARTIFACT_NOT_FOUND", `Artifact ${id} is not available in this workspace`, 404);
    }
    const handoff = {
      id: randomUUID(), canonicalId: canonicalId("handoff"), version: 1,
      workspaceId: input.workspaceId, fromRuntimeId: input.fromRuntimeId, toRuntimeId: input.toRuntimeId,
      fromAgentId: input.fromAgentId, toAgentId: input.toAgentId, summary: input.summary.trim(),
      acceptanceCriteria: [...new Set(input.acceptanceCriteria ?? [])], artifactIds,
      memoryIds: [...new Set(input.memoryIds ?? [])], status: "pending", createdBy: input.principalId,
      createdAt: new Date().toISOString(), provenance: { source: "context-fabric", actorId: input.principalId },
    };
    this.#state.handoffs.push(handoff);
    this.recordEvent({ workspaceId: handoff.workspaceId, principalId: input.principalId, type: "handoff.created", subjectId: handoff.canonicalId, data: { from: handoff.fromRuntimeId, to: handoff.toRuntimeId } }, false);
    this.#changed();
    return structuredClone(handoff);
  }

  resolveHandoff(id, input) {
    const handoff = this.#state.handoffs.find((item) => item.id === id || item.canonicalId === id);
    invariant(handoff, "HANDOFF_NOT_FOUND", `Handoff ${id} was not found`, 404);
    invariant(handoff.status === "pending", "HANDOFF_ALREADY_RESOLVED", `Handoff is already ${handoff.status}`, 409);
    invariant(HANDOFF_STATES.has(input.status) && input.status !== "pending", "INVALID_HANDOFF_STATUS", "Handoff status must be accepted or rejected");
    invariant(typeof input.principalId === "string" && input.principalId, "PRINCIPAL_REQUIRED", "principalId is required");
    handoff.status = input.status;
    handoff.resolvedBy = input.principalId;
    handoff.resolution = input.resolution?.trim() ?? "";
    handoff.resolvedAt = new Date().toISOString();
    handoff.version += 1;
    this.recordEvent({ workspaceId: handoff.workspaceId, principalId: input.principalId, type: `handoff.${handoff.status}`, subjectId: handoff.canonicalId, data: { resolution: handoff.resolution } }, false);
    this.#changed();
    return structuredClone(handoff);
  }

  listHandoffs({ workspaceId } = {}) {
    return this.#state.handoffs.filter((item) => !workspaceId || item.workspaceId === workspaceId).map((item) => structuredClone(item));
  }

  createCheckpoint(input) {
    invariant(typeof input.workspaceId === "string" && input.workspaceId, "WORKSPACE_REQUIRED", "workspaceId is required");
    const checkpoint = {
      id: randomUUID(), canonicalId: canonicalId("checkpoint"), workspaceId: input.workspaceId,
      name: input.name?.trim() || "Context checkpoint", createdBy: input.principalId,
      createdAt: new Date().toISOString(),
      snapshot: {
        artifacts: this.#state.artifacts.filter((item) => item.workspaceId === input.workspaceId).map((item) => structuredClone(item)),
        handoffs: this.#state.handoffs.filter((item) => item.workspaceId === input.workspaceId).map((item) => structuredClone(item)),
      },
    };
    this.#state.checkpoints.push(checkpoint);
    this.recordEvent({ workspaceId: input.workspaceId, principalId: input.principalId, type: "checkpoint.created", subjectId: checkpoint.canonicalId }, false);
    this.#changed();
    return structuredClone(checkpoint);
  }

  rollback(checkpointId, input) {
    const checkpoint = this.#state.checkpoints.find((item) => item.id === checkpointId || item.canonicalId === checkpointId);
    invariant(checkpoint, "CHECKPOINT_NOT_FOUND", `Checkpoint ${checkpointId} was not found`, 404);
    const workspaceId = checkpoint.workspaceId;
    this.#state.artifacts = [...this.#state.artifacts.filter((item) => item.workspaceId !== workspaceId), ...structuredClone(checkpoint.snapshot.artifacts)];
    this.#state.handoffs = [...this.#state.handoffs.filter((item) => item.workspaceId !== workspaceId), ...structuredClone(checkpoint.snapshot.handoffs)];
    const event = this.recordEvent({ workspaceId, principalId: input.principalId, type: "checkpoint.rolled-back", subjectId: checkpoint.canonicalId, data: { reason: input.reason ?? null } }, false);
    this.#changed();
    return { checkpoint: structuredClone(checkpoint), event };
  }

  listCheckpoints({ workspaceId } = {}) {
    return this.#state.checkpoints.filter((item) => !workspaceId || item.workspaceId === workspaceId).map((item) => structuredClone(item));
  }

  snapshot() {
    return structuredClone(this.#state);
  }

  #changed() {
    this.#onChange?.(this.snapshot());
  }
}
