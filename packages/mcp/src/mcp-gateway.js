import { randomUUID } from "node:crypto";
import { invariant } from "../../core/src/errors.js";

const TRANSPORTS = new Set(["stdio", "http", "sse"]);
const SECRET_REFERENCE = /^(env|vault):[A-Za-z0-9._/-]+$/;

export class McpGateway {
  #grants;
  #onChange;

  constructor({ registry, grants = [], onChange } = {}) {
    this.registry = registry;
    this.#grants = structuredClone(grants);
    this.#onChange = onChange;
  }

  registerService(input, actorId) {
    invariant(input && typeof input.id === "string" && /^[a-z0-9][a-z0-9._-]*$/.test(input.id), "INVALID_MCP_ID", "MCP service id must be a lowercase slug");
    invariant(typeof input.name === "string" && input.name.trim(), "MCP_NAME_REQUIRED", "MCP service name is required");
    invariant(TRANSPORTS.has(input.transport), "INVALID_MCP_TRANSPORT", `Unsupported MCP transport: ${input.transport}`);
    invariant(Array.isArray(input.tools) && input.tools.length > 0 && input.tools.every((tool) => typeof tool === "string" && tool), "MCP_TOOLS_REQUIRED", "MCP tools must contain non-empty names");
    if (input.secretRef != null) invariant(typeof input.secretRef === "string" && SECRET_REFERENCE.test(input.secretRef), "INVALID_SECRET_REFERENCE", "MCP credentials must use an env: or vault: reference");
    invariant(input.secret == null && input.token == null && input.apiKey == null, "RAW_MCP_SECRET_DENIED", "Raw MCP secrets cannot be registered", 422);
    const service = {
      id: input.id, name: input.name.trim(), description: input.description?.trim() ?? "",
      transport: input.transport, endpoint: input.endpoint ?? null, command: input.command ?? null,
      tools: [...new Set(input.tools)], secretRef: input.secretRef ?? null,
      version: input.version ?? "1.0.0", provenance: structuredClone(input.provenance ?? { sourceId: "operator", actorId }),
      updatedAt: new Date().toISOString(),
    };
    if (service.transport === "stdio") invariant(typeof service.command === "string" && service.command, "MCP_COMMAND_REQUIRED", "stdio MCP services require command");
    if (["http", "sse"].includes(service.transport)) invariant(typeof service.endpoint === "string" && /^https?:\/\//.test(service.endpoint), "MCP_ENDPOINT_REQUIRED", `${service.transport} MCP services require an HTTP(S) endpoint`);
    return this.registry.replace("mcpServers", service);
  }

  grant(input, actorId) {
    const service = this.registry.get("mcpServers", input.serviceId);
    this.registry.get("runtimes", input.runtimeId);
    invariant(Array.isArray(input.allowedTools) && input.allowedTools.length > 0, "MCP_GRANT_TOOLS_REQUIRED", "allowedTools are required");
    invariant(input.allowedTools.every((tool) => service.tools.includes(tool)), "MCP_TOOL_ESCALATION", "Grant requests a tool not declared by the service", 422);
    const existing = this.#grants.find((grant) => grant.serviceId === input.serviceId && grant.runtimeId === input.runtimeId && grant.workspaceId === input.workspaceId);
    const grant = {
      id: existing?.id ?? randomUUID(), serviceId: input.serviceId, runtimeId: input.runtimeId,
      workspaceId: input.workspaceId, allowedTools: [...new Set(input.allowedTools)],
      createdBy: existing?.createdBy ?? actorId, createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedBy: actorId, updatedAt: new Date().toISOString(),
    };
    if (existing) Object.assign(existing, grant); else this.#grants.push(grant);
    this.#changed();
    return structuredClone(grant);
  }

  project(runtimeId, { workspaceId } = {}) {
    const runtime = this.registry.get("runtimes", runtimeId);
    const services = this.#grants
      .filter((grant) => grant.runtimeId === runtimeId && (!workspaceId || grant.workspaceId === workspaceId))
      .map((grant) => {
        const service = this.registry.get("mcpServers", grant.serviceId);
        return {
          id: service.id, transport: service.transport, endpoint: service.endpoint, command: service.command,
          secretRef: service.secretRef, allowedTools: [...grant.allowedTools], workspaceId: grant.workspaceId,
        };
      });
    return { format: `${runtime.id}/mcp-projection-v1`, runtimeId, generatedAt: new Date().toISOString(), services };
  }

  listGrants({ workspaceId } = {}) {
    return this.#grants.filter((grant) => !workspaceId || grant.workspaceId === workspaceId).map((grant) => structuredClone(grant));
  }

  snapshot() {
    return structuredClone(this.#grants);
  }

  #changed() {
    this.#onChange?.(this.snapshot());
  }
}
