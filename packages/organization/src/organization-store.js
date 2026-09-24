import { randomUUID } from "node:crypto";
import { invariant } from "../../core/src/errors.js";

const KINDS = Object.freeze(["organizations", "workspaces", "projects", "teams", "conversations"]);
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

const DEFAULT_STATE = Object.freeze({
  organizations: [{ id: "default-org", canonicalId: "urn:agas:organization:default-org", name: "Default organization", createdBy: "system", createdAt: "2026-09-24T00:00:00.000Z" }],
  workspaces: [{ id: "default", canonicalId: "urn:agas:workspace:default", organizationId: "default-org", name: "Default workspace", createdBy: "system", createdAt: "2026-09-24T00:00:00.000Z" }],
  projects: [{ id: "default-project", canonicalId: "urn:agas:project:default-project", workspaceId: "default", name: "AGAS missions", description: "Default governed mission project", createdBy: "system", createdAt: "2026-09-24T00:00:00.000Z" }],
  teams: [{ id: "engineering-team", canonicalId: "urn:agas:team:engineering-team", workspaceId: "default", name: "Engineering team", hubIds: ["command", "engineering"], createdBy: "system", createdAt: "2026-09-24T00:00:00.000Z" }],
  conversations: [{ id: "default-conversation", canonicalId: "urn:agas:conversation:default-conversation", workspaceId: "default", projectId: "default-project", title: "Mission operations", messages: [], createdBy: "system", createdAt: "2026-09-24T00:00:00.000Z", updatedAt: "2026-09-24T00:00:00.000Z" }],
});

function validateId(id) {
  invariant(typeof id === "string" && ID_PATTERN.test(id), "INVALID_RECORD_ID", "id must be a lowercase slug");
}

export class OrganizationStore {
  #state;
  #onChange;

  constructor({ state, onChange } = {}) {
    this.#state = structuredClone(state ?? DEFAULT_STATE);
    for (const kind of KINDS) this.#state[kind] ??= [];
    this.#onChange = onChange;
  }

  list(kind, { workspaceId } = {}) {
    invariant(KINDS.includes(kind), "INVALID_ORGANIZATION_KIND", `Unknown organization record kind: ${kind}`);
    return this.#state[kind]
      .filter((record) => !workspaceId || record.workspaceId === workspaceId || (kind === "workspaces" && record.id === workspaceId))
      .map((record) => structuredClone(record));
  }

  get(kind, id) {
    invariant(KINDS.includes(kind), "INVALID_ORGANIZATION_KIND", `Unknown organization record kind: ${kind}`);
    const record = this.#state[kind].find((item) => item.id === id);
    invariant(record, "ORGANIZATION_RECORD_NOT_FOUND", `${kind} record ${id} was not found`, 404);
    return structuredClone(record);
  }

  create(kind, input, actorId) {
    invariant(KINDS.includes(kind), "INVALID_ORGANIZATION_KIND", `Unknown organization record kind: ${kind}`);
    validateId(input?.id);
    invariant(typeof input.name === "string" && input.name.trim(), "RECORD_NAME_REQUIRED", "name is required");
    invariant(!this.#state[kind].some((record) => record.id === input.id), "DUPLICATE_RECORD", `${kind} record ${input.id} already exists`, 409);
    this.#validateParent(kind, input);
    const now = new Date().toISOString();
    const singular = kind.slice(0, -1);
    const record = {
      id: input.id,
      canonicalId: `urn:agas:${singular}:${input.id}`,
      name: input.name.trim(),
      ...(input.description ? { description: input.description.trim() } : {}),
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(kind === "teams" ? { hubIds: [...new Set(input.hubIds ?? [])] } : {}),
      ...(kind === "conversations" ? { title: input.name.trim(), messages: [] } : {}),
      createdBy: actorId,
      createdAt: now,
      ...(kind === "conversations" ? { updatedAt: now } : {}),
    };
    this.#state[kind].push(record);
    this.#changed();
    return structuredClone(record);
  }

  appendMessage(conversationId, input, actorId) {
    const conversation = this.#state.conversations.find((item) => item.id === conversationId);
    invariant(conversation, "CONVERSATION_NOT_FOUND", `Conversation ${conversationId} was not found`, 404);
    invariant(typeof input?.content === "string" && input.content.trim(), "MESSAGE_CONTENT_REQUIRED", "message content is required");
    const message = {
      id: randomUUID(), canonicalId: `urn:agas:message:${randomUUID()}`,
      role: input.role ?? "user", content: input.content.trim(), createdBy: actorId,
      createdAt: new Date().toISOString(),
    };
    invariant(["user", "assistant", "system"].includes(message.role), "INVALID_MESSAGE_ROLE", "message role must be user, assistant, or system");
    conversation.messages.push(message);
    conversation.updatedAt = message.createdAt;
    this.#changed();
    return structuredClone(message);
  }

  snapshot() {
    return structuredClone(this.#state);
  }

  #validateParent(kind, input) {
    if (kind === "workspaces") this.get("organizations", input.organizationId);
    if (["projects", "teams", "conversations"].includes(kind)) this.get("workspaces", input.workspaceId);
    if (kind === "conversations" && input.projectId) {
      const project = this.get("projects", input.projectId);
      invariant(project.workspaceId === input.workspaceId, "PROJECT_WORKSPACE_MISMATCH", "project must belong to the conversation workspace", 409);
    }
  }

  #changed() {
    this.#onChange?.(this.snapshot());
  }
}

export { KINDS as ORGANIZATION_KINDS };
