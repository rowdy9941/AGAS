import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createApp } from "../apps/control-plane/src/app.js";
import { ControlPlane } from "../packages/core/src/control-plane.js";

const authHeaders = { authorization: "Bearer agas-dev-token" };

async function withServer(callback, controlPlane) {
  const server = createServer(createApp(controlPlane));
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
    assert.equal(health.registry.runtimes, 6);

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

test("operator console and readiness endpoint are public and security-hardened", async () => {
  await withServer(async (baseUrl) => {
    const page = await fetch(`${baseUrl}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy"), /default-src 'self'/);
    assert.match(await page.text(), /AGAS Operator Console/);
    const script = await fetch(`${baseUrl}/assets/app.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get("content-type"), /text\/javascript/);
    const ready = await fetch(`${baseUrl}/readyz`);
    assert.equal(ready.status, 200);
    const readiness = await ready.json();
    assert.equal(readiness.status, "ready");
    assert.equal(readiness.checks.database.ok, true);
    const diagnostics = await fetch(`${baseUrl}/v1/diagnostics`, { headers: authHeaders }).then((response) => response.json());
    assert.match(diagnostics.process.node, /^v\d+/);
    assert.equal(diagnostics.database.integrity.schemaVersion, 2);
  });
});

test("organization and mission APIs expose an approval-gated structured plan", async () => {
  const controlPlane = new ControlPlane();
  await withServer(async (baseUrl) => {
    const projects = await fetch(`${baseUrl}/v1/projects?workspaceId=default`, { headers: authHeaders }).then((response) => response.json());
    assert.equal(projects.items[0].id, "default-project");

    const createdResponse = await fetch(`${baseUrl}/v1/missions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders },
      body: JSON.stringify({ workspaceId: "default", projectId: "default-project", teamId: "engineering-team", type: "repository", objective: "Ship a governed API change" }),
    });
    assert.equal(createdResponse.status, 201);
    const mission = await createdResponse.json();
    assert.equal(mission.status, "awaiting-approval");
    assert.equal(mission.tasks.some((item) => item.sensitive && item.approvalStatus === "pending"), true);

    const approvalResponse = await fetch(`${baseUrl}/v1/missions/${mission.id}/approve`, {
      method: "POST", headers: { "content-type": "application/json", ...authHeaders }, body: JSON.stringify({ reason: "Plan reviewed" }),
    });
    assert.equal(approvalResponse.status, 200);
    const startResponse = await fetch(`${baseUrl}/v1/missions/${mission.id}/start`, {
      method: "POST", headers: { "content-type": "application/json", ...authHeaders }, body: "{}",
    });
    assert.equal(startResponse.status, 200);
    assert.equal((await startResponse.json()).status, "running");
  }, controlPlane);
});
