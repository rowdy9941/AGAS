import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { invariant } from "./errors.js";

export const ROLE_PERMISSIONS = Object.freeze({
  viewer: Object.freeze([
    "registry:read", "catalog:read", "runtime:read", "plan:read", "memory:read", "context:read", "mcp:read", "vault:read", "execution:read", "audit:read",
  ]),
  operator: Object.freeze([
    "registry:read", "catalog:read", "runtime:read", "plan:read", "plan:create", "memory:read", "memory:write", "context:read", "context:write", "mcp:read", "vault:read", "vault:write",
    "execution:read", "execution:create", "execution:transition", "audit:read",
  ]),
  admin: Object.freeze(["*"]),
});

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function hashesMatch(left, right) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export class AuthService {
  #keys;
  #onChange;

  constructor({ keys = [], bootstrapToken, onChange } = {}) {
    this.#keys = structuredClone(keys);
    this.#onChange = onChange;
    if (this.#keys.length === 0 && bootstrapToken) {
      this.#keys.push({
        id: "bootstrap",
        name: "Bootstrap administrator",
        tokenHash: hashToken(bootstrapToken),
        role: "admin",
        workspaceIds: ["*"],
        createdBy: "system",
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      });
      this.#changed();
    }
  }

  authenticateHeader(header) {
    invariant(typeof header === "string" && header.startsWith("Bearer "), "AUTHENTICATION_REQUIRED", "A Bearer API token is required", 401);
    const token = header.slice(7).trim();
    invariant(token, "AUTHENTICATION_REQUIRED", "A Bearer API token is required", 401);
    const tokenHash = hashToken(token);
    const key = this.#keys.find((candidate) => hashesMatch(candidate.tokenHash, tokenHash));
    invariant(key, "INVALID_API_TOKEN", "The API token is invalid", 401);
    key.lastUsedAt = new Date().toISOString();
    this.#changed();
    return {
      id: key.id,
      name: key.name,
      role: key.role,
      permissions: [...ROLE_PERMISSIONS[key.role]],
      workspaceIds: [...key.workspaceIds],
    };
  }

  authorize(principal, permission) {
    invariant(principal.permissions.includes("*") || principal.permissions.includes(permission), "PERMISSION_DENIED", `Permission required: ${permission}`, 403);
  }

  authorizeWorkspace(principal, workspaceId) {
    invariant(typeof workspaceId === "string" && workspaceId, "WORKSPACE_REQUIRED", "workspaceId is required");
    invariant(principal.workspaceIds.includes("*") || principal.workspaceIds.includes(workspaceId), "WORKSPACE_ACCESS_DENIED", `Access to workspace ${workspaceId} is denied`, 403);
  }

  createKey(input, actor) {
    this.authorize(actor, "api-key:write");
    invariant(input && typeof input.name === "string" && input.name.trim(), "KEY_NAME_REQUIRED", "API key name is required");
    invariant(Object.hasOwn(ROLE_PERMISSIONS, input.role), "INVALID_ROLE", `Invalid role: ${input.role}`);
    const workspaceIds = Array.isArray(input.workspaceIds) && input.workspaceIds.length ? [...new Set(input.workspaceIds)] : ["*"];
    invariant(workspaceIds.every((value) => typeof value === "string" && value), "INVALID_WORKSPACES", "workspaceIds must contain non-empty strings");
    const secret = `agas_${randomBytes(24).toString("base64url")}`;
    const key = {
      id: randomUUID(),
      name: input.name.trim(),
      tokenHash: hashToken(secret),
      role: input.role,
      workspaceIds,
      createdBy: actor.id,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    };
    this.#keys.push(key);
    this.#changed();
    return { ...this.#publicKey(key), token: secret };
  }

  listKeys(actor) {
    this.authorize(actor, "api-key:read");
    return this.#keys.map((key) => this.#publicKey(key));
  }

  revokeKey(id, actor) {
    this.authorize(actor, "api-key:write");
    invariant(id !== actor.id, "CANNOT_REVOKE_CURRENT_KEY", "The current API key cannot revoke itself", 409);
    const index = this.#keys.findIndex((key) => key.id === id);
    invariant(index >= 0, "API_KEY_NOT_FOUND", `API key ${id} was not found`, 404);
    const [removed] = this.#keys.splice(index, 1);
    this.#changed();
    return this.#publicKey(removed);
  }

  snapshot() {
    return structuredClone(this.#keys);
  }

  #publicKey(key) {
    const { tokenHash: _tokenHash, ...publicKey } = key;
    return structuredClone(publicKey);
  }

  #changed() {
    this.#onChange?.(this.snapshot());
  }
}
