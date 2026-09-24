# AGAS Master Architecture Plan

Status: authoritative product and delivery contract  
Target: public, single-node MVP release candidate  
Updated: 2026-09-24

## 1. Product mandate

AGAS is a governed operating environment that composes agent platforms into
stable teams, gives them scoped shared context, and makes their work observable,
controllable, recoverable, and verifiable. It is not a launcher, a source-code
collage, or a claim of artificial general intelligence.

## 2. Foundation map

```text
AionUI foundation      = AGAS desktop/web operator experience
AionCore foundation    = local execution runtime
Paperclip              = organization and durable work
Agency Agents          = specialist persona catalog
Hermes                 = persistent general execution and specialist routing
OpenClaw               = proactive personal/channel/device operations
Codex/Claude/OpenCode  = specialist coding runtimes
Universal Registry     = governed ecosystem catalog
MCP Gateway            = portable tool access with policy
Context Fabric         = shared identity, memory, evidence, and handoffs
Mission Authority      = planning, delegation, verification, and recovery
Hubs                   = stable specialist teams and workflows
Obsidian Vault         = human-readable knowledge projection
```

These names describe product responsibilities. Restricted third-party software
is integrated through detected local installations or documented adapters; it
is never silently vendored or impersonated.

## 3. Architectural principles

1. Local-first, offline-capable, and restart-safe by default.
2. One authoritative data model with projections for runtimes and human tools.
3. Deny-by-default credentials, workspace policy, and external side effects.
4. Plans are data; approval is authority; execution is separately audited.
5. Every mission ends in evidence-backed verification or an explicit failure.
6. Native runtime strengths are preserved behind narrow adapters.
7. A modular monolith comes before distributed services.

## 4. Single-node topology

The MVP ships one Node.js process and one SQLite database. The process contains
the HTTP control plane, operator console, Mission Authority, context and MCP
projections, runtime adapters, and a recoverable background dispatcher. Generated
artifacts and the Obsidian projection live in configured filesystem directories.

## 5. Canonical entities

- Organization, workspace, project, team, conversation, and principal.
- Runtime, model, persona, skill, tool, MCP service, plugin, workflow, and hub.
- Mission, task, dependency, approval, execution, tool action, budget, and report.
- Memory, event, artifact, handoff, checkpoint, provenance, and vault document.

Every entity has a canonical ID, timestamps, workspace boundary, provenance,
and an append-only event representation where recovery requires it.

## 6. Universal Registry

The registry owns versioned definitions, compatibility constraints, provenance,
permission envelopes, and search. Runtime-specific formats are projections from
canonical records, not competing sources of truth.

## 7. Runtime integration

Runtime detection is read-only. Managed installation is limited to explicitly
supported, checksum-verifiable packages. Execution uses fixed binaries and
argument templates without a shell, bounded time/output, scoped working
directories, cancellation, and an opt-in production switch. A deterministic
built-in simulator proves the complete workflow without external credentials.

## 8. Hub model

A hub is a stable, versioned roster of specialist roles with ordered runtime
preferences, MCP grants, budgets, and approval policy. Specialists activate on
demand; they do not consume resources continuously. The first hubs are Command
and Engineering.

## 9. Context Fabric

Context Fabric provides typed memory, identity, provenance, visibility, events,
artifacts, handoffs, checkpoints, and rollback markers. Searches enforce both
workspace and principal policy. Cross-runtime handoffs reference immutable
artifacts and include acceptance criteria.

## 10. MCP Gateway

MCP services register once with transport metadata and secret references.
Per-runtime projections expose only granted tools and never copy raw secrets
into registry or vault records. Projection validation rejects unsupported
transports, unknown runtimes, and permission escalation.

## 11. Mission Authority

Mission Authority turns a user objective into a dependency graph of typed tasks.
It tracks budgets, approval gates, attempts, cancellations, verification, and a
completion report. Sensitive steps cannot enter the dispatcher without approval.

## 12. Paperclip responsibility

The MVP implements the Paperclip responsibility as AGAS-native durable records
for organizations, projects, teams, conversations, missions, and task history.
A future Paperclip adapter may project these records to an external installation.

## 13. Operator experience

The responsive operator console contains overview, catalog, Hub Builder,
missions, executions, context, MCP, projects, conversations, and settings.
Keyboard access and visible focus are required. Hub Builder supports pointer
drag-and-drop and an equivalent keyboard/add-button flow.

## 14. Obsidian projection

The vault projector writes deterministic Markdown with YAML front matter,
canonical IDs, provenance, and backlinks. Import validates schemas and detects
conflicts; authoritative structured state is never overwritten silently.

## 15. Security model

API tokens are hashed at rest. Roles and workspace grants are enforced on every
versioned endpoint. Runtime processes inherit an allowlisted environment. MCP
credentials use references. Audit events capture authority changes and external
actions. Non-loopback service binding requires an explicit administrator token.

## 16. Reliability and operations

SQLite WAL, schema migrations, atomic backups, restart recovery, stale-running
execution reconciliation, health/readiness endpoints, structured diagnostics,
and bounded logs are release requirements. Restore is tested, not only documented.

## 17. Verification strategy

Unit tests cover domain invariants. API tests cover authentication and workspace
isolation. Scenario tests cover mission planning, approval, dispatch, handoff,
artifact/report creation, restart, and vault projection. CI runs on supported
Node versions and blocks phase merges.

## 18. Delivery phases

### Phase 1 — Control-plane foundation

Registry, detection, scoped memory, hub planning, execution ledger, HTTP API.

**Exit:** a validated Engineering Hub plan and auditable execution proposal. ✅

### Phase 2 — Durable authority

SQLite persistence, API-key authentication, roles, workspace policy, migrations.

**Exit:** restart preserves authoritative state and unauthorized access fails.

Status: ✅ implemented and verified.

### Phase 3 — Runtime execution and operator console

Recoverable dispatcher, simulator and local CLI adapter, status streaming/polling,
responsive operator console, deployment packaging.

**Exit:** an approved execution completes end to end and is visible in the UI.

Status: ✅ implemented and browser-verified.

### Phase 4 — Ecosystem catalog and Hub Builder

Import versioned Agency persona sources and converters. Implement catalog search,
compatibility, provenance, and permissions. Build the drag-and-drop Hub Builder.
Install Hermes routing and runtime-specific persona projections.

**Exit:** users can define a stable hub and activate selected specialists.

### Phase 5 — Context Fabric, MCP Gateway, and vault

Implement canonical IDs, typed memories, provenance, permissions, registry-to-
runtime MCP projections, artifacts, events, handoffs, checkpoints, rollback, and
the bidirectional validated Obsidian vault projection.

**Exit:** two runtimes complete a verified cross-agent handoff with shared,
scoped context and visible evidence.

### Phase 6 — Mission Authority and initial hubs

Implement structured planning, dependency graphs, budgets, approvals, retry,
cancellation, verification, and completion reports. Ship Command and Engineering
hubs and evaluation suites for repository and research missions.

**Exit:** AGAS completes a multi-agent software mission end to end.

### Phase 7 — Hardening and release

Crash recovery, migrations, backup/restore, offline behavior, threat modeling,
supply-chain and credential review, red-team tests, performance, accessibility,
usability, diagnostics, documentation, installers, and release artifacts.

**Exit:** public MVP release candidate with measured reliability.

## 19. MVP acceptance scenario

The MVP succeeds when a user can:

1. Install AGAS without separately configuring core services.
2. See Paperclip responsibilities, Agent UI, missions, teams, projects,
   conversations, and settings in one product.
3. Detect an existing runtime and install at least one managed runtime.
4. Browse Agency specialists and drag selected roles into an Engineering Hub.
5. Register one MCP service centrally and expose it to two compatible runtimes
   under different permissions.
6. Give AGAS a repository mission.
7. Review the structured plan and approve sensitive actions.
8. Have Hermes coordinate and Codex/OpenCode implement or review a task, using
   installed adapters or the deterministic simulator in acceptance tests.
9. Observe typed handoffs, runtime status, tool actions, and generated artifacts.
10. Resume after restart without losing authoritative state.
11. Verify tests and acceptance criteria before completion.
12. Inspect a final report and corresponding Obsidian vault projection.

## 20. Explicit MVP non-goals

- Claiming true AGI or consciousness.
- Trusting every installed plugin.
- Giving agents universal contact or conversation access.
- Running every specialist continuously.
- Letting agents silently rewrite permissions or personas.
- Vendoring restricted products contrary to their terms.
- Completing Omarchy/Hyprland/Quickshell distribution.
- Completing holographic generated UI.
- Autonomous high-risk financial or production operations.

## 21. Work after MVP

Broader connectors, governance audits, evaluation depth, accessibility,
performance, multi-device sync, support operations, distributed workers, mobile
control, holographic visualization, and the optional AGAS operating environment.

Progress language must remain honest: architecture coverage may reach 90–95%
after audits; reusable foundation may reach 60–80%; the entire long-term vision
may reach 25–35%; production reliability must always be measured.

## 22. Definition of done

The release is done only when the twelve-step scenario is automated, local and
hosted checks pass, security and recovery evidence is recorded, documentation
matches behavior, and every phase commit is merged to `main` through a reviewed
GitHub pull request.
