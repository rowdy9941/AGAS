# Architecture

AGAS begins as a modular monolith so governance rules can stabilize before the
system is split into services.

## Modules

1. **Universal Registry** stores immutable runtime, persona, skill, tool, MCP,
   plugin, workflow, model, and hub definitions.
2. **State Database** atomically persists registry, memory, executions, audit,
   and API-key metadata in SQLite with WAL enabled.
3. **Authentication and Policy** hashes tokens and enforces role/workspace grants.
4. **Runtime Detector** performs local, read-only availability checks.
5. **Context Fabric** stores scoped memory and enforces visibility at query time.
6. **Hub Planner** maps the permanent hub roster to compatible available runtimes.
7. **Execution Ledger** validates lifecycle transitions and emits audit events.
8. **HTTP Control Plane** exposes these capabilities through versioned JSON APIs.

## Trust boundary

Phase 1 never invokes an agent runtime. A hub plan is data, not permission to
execute. Later runtime adapters must preserve that separation by requiring an
approved execution record, a bounded permission grant, and an audit event for
every external side effect.

## Delivery phases

- Phase 1: registry, detection, context, planning, execution ledger, HTTP API. ✅
- Phase 2: durable SQLite storage, authentication, and policy evaluation. ✅
- Phase 3: sandboxed runtime adapters and asynchronous dispatch.
- Phase 4: operator console, telemetry, budgets, and approval workflows.
- Phase 5: distributed workers, organization governance, and extension SDK.
