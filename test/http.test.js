import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createApp } from "../apps/control-plane/src/app.js";

const authHeaders = { authorization: "Bearer agas-dev-token" };

async function withServer(callback) {
  const server = createServer(createApp());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("health, planning, execution, transitions, and audit work over HTTP", async () => {
  await withServer(async (baseUrl) => {
    const healthResponse = await fetch(`${baseUrl}/healthz`);
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.equal(health.status, "ok");
    assert.equal(health.registry.runtimes, 5);

    const executionResponse = await fetch(`${baseUrl}/v1/executions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders },
      body: JSON.stringify({ hubId: "engineering", workspaceId: "demo", principalId: "operator", objective: "Verify the vertical slice" }),
    });
    assert.equal(executionResponse.status, 201);
    const execution = await executionResponse.json();
    assert.equal(execution.plan.assignments.length, 4);

    const invalidResponse = await fetch(`${baseUrl}/v1/executions/${execution.id}/transitions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders },
      body: JSON.stringify({ status: "completed", actorId: "operator", result: {} }),
    });
    assert.equal(invalidResponse.status, 409);

    const auditResponse = await fetch(`${baseUrl}/v1/audit`, { headers: authHeaders });
    const audit = await auditResponse.json();
    assert.equal(audit.items.length, 1);
  });
});

test("HTTP errors are structured and carry request ids", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/not-found`, { headers: { "x-request-id": "test-request", ...authHeaders } });
    const body = await response.json();
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("x-request-id"), "test-request");
    assert.equal(body.error.code, "ROUTE_NOT_FOUND");
    assert.equal(body.requestId, "test-request");
  });
});

test("versioned APIs reject unauthenticated requests", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/registry`);
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error.code, "AUTHENTICATION_REQUIRED");
  });
});
