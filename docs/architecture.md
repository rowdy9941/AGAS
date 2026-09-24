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
9. **Runtime Executor** offers deterministic simulation and explicitly enabled,
   constrained local CLI invocation.
10. **Dispatcher** recovers interrupted work and claims approved executions.
11. **Operator Console** exposes the governed workflow without bypassing the API.
12. **Ecosystem Catalog** imports versioned Agency personas, tracks provenance,
    searches compatibility, and projects personas into native runtime formats.
13. **Hub Builder** persists stable, compatible specialist rosters.
14. **Context Fabric** owns canonical artifacts, events, handoffs, checkpoints,
    and auditable rollback inside workspace boundaries.
15. **MCP Gateway** registers a service once and emits per-runtime projections
    containing only explicitly granted tools and secret references.
16. **Vault Projector** writes atomic Obsidian-compatible Markdown and validates
    imports before updating authoritative artifacts.

## Trust boundary

A hub plan is data, not permission to execute. Runtime adapters require an
approved execution record, a bounded permission grant, and an audit event for
every external side effect. MCP credentials remain external references and
never enter registry, projection, or vault content as raw secrets.

## Delivery phases

- Phase 1: registry, detection, context, planning, execution ledger, HTTP API. ✅
- Phase 2: durable SQLite storage, authentication, and policy evaluation. ✅
- Phase 3: runtime adapters, recoverable asynchronous dispatch, and console. ✅
- Phase 4: ecosystem catalog, managed runtime, persona projections, Hub Builder. ✅
- Phase 5: Context Fabric, MCP Gateway, and Obsidian vault projection. ✅
- Phase 6: Mission Authority, durable organization records, and initial hubs.
- Phase 7: recovery, security hardening, complete acceptance, and public release.
