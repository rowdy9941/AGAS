import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { AuthService, ControlPlane, DomainError } from "../../../packages/core/src/control-plane.js";

const JSON_LIMIT = 256 * 1024;

function send(response, status, body, requestId) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "x-request-id": requestId,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  response.end(payload);
}

const staticFiles = new Map([
  ["/", { url: new URL("../../operator-console/index.html", import.meta.url), type: "text/html; charset=utf-8" }],
  ["/assets/app.js", { url: new URL("../../operator-console/app.js", import.meta.url), type: "text/javascript; charset=utf-8" }],
  ["/assets/styles.css", { url: new URL("../../operator-console/styles.css", import.meta.url), type: "text/css; charset=utf-8" }],
]);

async function sendStatic(response, pathname, requestId) {
  const asset = staticFiles.get(pathname);
  if (!asset) return false;
  const payload = await readFile(asset.url);
  response.writeHead(200, {
    "content-type": asset.type,
    "content-length": payload.length,
    "cache-control": "no-cache",
    "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-request-id": requestId,
  });
  response.end(payload);
  return true;
}

async function readJson(request) {
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new DomainError("JSON_CONTENT_TYPE_REQUIRED", "content-type must be application/json", 415);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > JSON_LIMIT) throw new DomainError("BODY_TOO_LARGE", `JSON body exceeds ${JSON_LIMIT} bytes`, 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new DomainError("INVALID_JSON", "Request body is not valid JSON", 400);
  }
}

export function createApp(controlPlane = new ControlPlane(), { auth = new AuthService({ bootstrapToken: "agas-dev-token" }) } = {}) {
  return async function app(request, response) {
    const requestId = request.headers["x-request-id"]?.slice(0, 128) || randomUUID();
    try {
      const url = new URL(request.url, "http://agas.local");
      const segments = url.pathname.split("/").filter(Boolean);

      if (request.method === "GET" && await sendStatic(response, url.pathname, requestId)) return;

      if (request.method === "GET" && ["/healthz", "/readyz"].includes(url.pathname)) {
        return send(response, 200, controlPlane.health(), requestId);
      }
      const principal = auth.authenticateHeader(request.headers.authorization);

      if (request.method === "GET" && url.pathname === "/v1/session") {
        return send(response, 200, { principal }, requestId);
      }
      if (request.method === "GET" && url.pathname === "/v1/registry") {
        auth.authorize(principal, "registry:read");
        return send(response, 200, controlPlane.registry.snapshot(), requestId);
      }
      if (request.method === "GET" && segments[0] === "v1" && segments[1] === "registry" && segments.length === 3) {
        auth.authorize(principal, "registry:read");
        return send(response, 200, { items: controlPlane.registry.list(segments[2]) }, requestId);
      }
      if (request.method === "POST" && segments[0] === "v1" && segments[1] === "registry" && segments.length === 3) {
        auth.authorize(principal, "registry:write");
        return send(response, 201, controlPlane.registry.register(segments[2], await readJson(request)), requestId);
      }
      if (request.method === "GET" && url.pathname === "/v1/runtimes/detect") {
        auth.authorize(principal, "runtime:read");
        return send(response, 200, { runtimes: await controlPlane.detectRuntimes() }, requestId);
      }
      if (request.method === "GET" && url.pathname === "/v1/runtimes/managed") {
        auth.authorize(principal, "runtime:read");
        return send(response, 200, { items: controlPlane.runtimeManager.packages() }, requestId);
      }
      if (request.method === "POST" && segments[0] === "v1" && segments[1] === "runtimes" && segments[3] === "install" && segments.length === 4) {
        auth.authorize(principal, "runtime:install");
        return send(response, 201, controlPlane.runtimeManager.install(segments[2], principal.id), requestId);
      }
      if (request.method === "GET" && url.pathname === "/v1/catalog/search") {
        auth.authorize(principal, "catalog:read");
        return send(response, 200, { items: controlPlane.catalog.search({
          query: url.searchParams.get("q") ?? "",
          kind: url.searchParams.get("kind") ?? undefined,
          runtimeId: url.searchParams.get("runtimeId") ?? undefined,
          permission: url.searchParams.get("permission") ?? undefined,
          limit: Number.parseInt(url.searchParams.get("limit") ?? "100", 10),
        }) }, requestId);
      }
      if (request.method === "POST" && url.pathname === "/v1/catalog/import/agency") {
        auth.authorize(principal, "registry:write");
        return send(response, 201, controlPlane.catalog.importAgency(await readJson(request)), requestId);
      }
      if (request.method === "GET" && segments[0] === "v1" && segments[1] === "personas" && segments[3] === "projections" && segments.length === 5) {
        auth.authorize(principal, "catalog:read");
        return send(response, 200, controlPlane.catalog.projectPersona(segments[2], segments[4]), requestId);
      }
      if (request.method === "GET" && url.pathname === "/v1/hubs") {
        auth.authorize(principal, "registry:read");
        return send(response, 200, { items: controlPlane.registry.list("hubs") }, requestId);
      }
      if (request.method === "POST" && url.pathname === "/v1/hubs") {
        auth.authorize(principal, "registry:write");
        return send(response, 201, controlPlane.catalog.saveHub({ ...(await readJson(request)), principalId: principal.id }), requestId);
      }
      if (request.method === "POST" && segments[0] === "v1" && segments[1] === "hubs" && segments[3] === "activate" && segments.length === 4) {
        auth.authorize(principal, "plan:create");
        const input = await readJson(request);
        auth.authorizeWorkspace(principal, input.workspaceId);
        return send(response, 200, controlPlane.planHub(segments[2], { ...input, principalId: principal.id }), requestId);
      }
      if (request.method === "POST" && segments[0] === "v1" && segments[1] === "hubs" && segments[3] === "plan" && segments.length === 4) {
        auth.authorize(principal, "plan:create");
        const input = await readJson(request);
        auth.authorizeWorkspace(principal, input.workspaceId);
        return send(response, 200, controlPlane.planHub(segments[2], { ...input, principalId: principal.id }), requestId);
      }
      if (request.method === "POST" && url.pathname === "/v1/memory") {
        auth.authorize(principal, "memory:write");
        const input = await readJson(request);
        auth.authorizeWorkspace(principal, input.workspaceId);
        return send(response, 201, controlPlane.memory.append({ ...input, principalId: principal.id }), requestId);
      }
      if (request.method === "POST" && url.pathname === "/v1/memory/search") {
        auth.authorize(principal, "memory:read");
        const input = await readJson(request);
        auth.authorizeWorkspace(principal, input.workspaceId);
        return send(response, 200, { items: controlPlane.memory.search({ ...input, principalId: principal.id }) }, requestId);
      }
      if (request.method === "POST" && url.pathname === "/v1/executions") {
        auth.authorize(principal, "execution:create");
        const input = await readJson(request);
        auth.authorizeWorkspace(principal, input.workspaceId);
        return send(response, 201, controlPlane.proposeExecution({ ...input, principalId: principal.id }), requestId);
      }
      if (request.method === "GET" && url.pathname === "/v1/executions") {
        auth.authorize(principal, "execution:read");
        const workspaceId = url.searchParams.get("workspaceId") ?? undefined;
        if (workspaceId) auth.authorizeWorkspace(principal, workspaceId);
        const items = controlPlane.executions.list({
          workspaceId,
          status: url.searchParams.get("status") ?? undefined,
          limit: Number.parseInt(url.searchParams.get("limit") ?? "100", 10),
        }).filter((execution) => principal.workspaceIds.includes("*") || principal.workspaceIds.includes(execution.plan.workspaceId));
        return send(response, 200, { items }, requestId);
      }
      if (request.method === "GET" && segments[0] === "v1" && segments[1] === "executions" && segments.length === 3) {
        auth.authorize(principal, "execution:read");
        const execution = controlPlane.executions.get(segments[2]);
        auth.authorizeWorkspace(principal, execution.plan.workspaceId);
        return send(response, 200, execution, requestId);
      }
      if (request.method === "POST" && segments[0] === "v1" && segments[1] === "executions" && segments[3] === "transitions" && segments.length === 4) {
        const input = await readJson(request);
        auth.authorize(principal, input.status === "approved" ? "execution:approve" : "execution:transition");
        const execution = controlPlane.executions.get(segments[2]);
        auth.authorizeWorkspace(principal, execution.plan.workspaceId);
        return send(response, 200, controlPlane.executions.transition(segments[2], { ...input, actorId: principal.id }), requestId);
      }
      if (request.method === "GET" && url.pathname === "/v1/audit") {
        auth.authorize(principal, "audit:read");
        const items = controlPlane.executions.audit().filter((event) => principal.workspaceIds.includes("*") || principal.workspaceIds.includes(event.workspaceId));
        return send(response, 200, { items }, requestId);
      }
      if (request.method === "GET" && url.pathname === "/v1/api-keys") {
        return send(response, 200, { items: auth.listKeys(principal) }, requestId);
      }
      if (request.method === "POST" && url.pathname === "/v1/api-keys") {
        return send(response, 201, auth.createKey(await readJson(request), principal), requestId);
      }
      if (request.method === "DELETE" && segments[0] === "v1" && segments[1] === "api-keys" && segments.length === 3) {
        return send(response, 200, auth.revokeKey(segments[2], principal), requestId);
      }
      throw new DomainError("ROUTE_NOT_FOUND", `${request.method} ${url.pathname} was not found`, 404);
    } catch (error) {
      const known = error instanceof DomainError;
      const status = known ? error.status : 500;
      if (!known) console.error(error);
      return send(response, status, {
        error: {
          code: known ? error.code : "INTERNAL_ERROR",
          message: known ? error.message : "An unexpected error occurred",
          ...(known && error.details ? { details: error.details } : {}),
        },
        requestId,
      }, requestId);
    }
  };
}
