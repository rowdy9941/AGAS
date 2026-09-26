# AGAS composite product map

Status: 26 September 2026. This is the implementation map for the owner's combined AionUI-like workspace, Paperclip-like organization, and historical MANI, ADAMS, ARCHON and FinOS programs. It extends the [native product contract](AGAS_MASTER_REQUIREMENTS_V4.md); a row marked planned is not a shipped service.

## One product, one authority

AGAS owns the organization, goals, hub chiefs, projects, missions, scoped context, task graph, runs, decisions and evidence. Its original interface uses the owner's supplied dragon-eye image. AionUI informs the assistant/workspace interaction and Paperclip informs the organization, goals, delegation, approvals and audit trail. They are product references, not installed dependencies or imported code. The seven hubs share IDs and approved handoffs. There is exactly one AGAS Obsidian-compatible vault projection, with access scope enforced before any agent sees a note. MBAs remains an independent application.

| Recovered program | Where it belongs in AGAS | Concrete object and next acceptance test |
|---|---|---|
| MANI CORE / GSI / SGI | Executive reasoning and planning research; memory and world-state candidates | Versioned plan and evidence references; compare a goal against accepted mission outcomes. Autonomous learning and general intelligence are research claims until evaluated. |
| ADAMS | Execution control plane | Durable runtime registration, queue, leases, restart recovery, audit and receipts. Current Dev run ledger is the first slice; two real adapters and cross-agent handoffs remain required. |
| KEVIN / KEVIN Plus | Governance and reviewed improvement | Proposals, scoped permissions, evaluation, approval and rollback before changing any production rule or skill. |
| ARCHON-1 / Liquid Hive | Media Empire brand, account and niche teams | Scoped brand records and bounded workers; one reviewed campaign across multiple account stages without cross-brand context leakage. |
| ARCHON-2 / creAGI | Media creation and publishing pipeline | Sourced brief → draft → editorial/rights review → approved channel action → receipt → metrics. No claim of live publishing before an adapter and account authorization exist. |
| AGICode | Dev / Software company | Repository-linked project → assigned agent worktree → tests → reviewed artifact → integration → approved release and monitoring. |
| FinOS / Fin AI / Mini Pro | Finance hub | Source-backed research, budgets, reproducible backtests and deterministic ledgers/risk. Live financial effects need a separate approval and reconciliation path. |
| NEXUS / ARCHON-OS / JARVIS concepts | AGAS experience and optional OS layer | Focus, operations and spatial views of the same mission IDs; keyboard first, then voice/gesture with explicit targeting and receipts. |
| MBAs | Separate product outside AGAS | No implicit migration of bookings, customer data or MBAs source; an approved integration may be proposed later. |

## Workspace and agent windows

The base window has the logo and organization switcher at left, a hub/project/goal/mission work surface in the middle, and an inspector for source, context, logs, evidence and approval at right. A direct CEO conversation creates a tracked request that must bind to a ready runtime before it can answer. Mission work has a visible path from goal to dependency to bounded run to inspected artifact to owner review. A real agent cannot label its own response as accepted.

Each supported runtime receives an **agent window** tab in AGAS, with health, assigned tasks, a run log and a link to its own native interface. A local web interface may render inside the AGAS window when its own response policies allow framing and the owner has configured that endpoint. If it rejects framing, the window gives a launch link. A terminal-only runtime uses an AGAS terminal/session surface only after its interactive protocol and process lifecycle are implemented. A separate desktop application cannot be embedded into a browser by AGAS; the launch control opens that native application and preserves the AGAS task/run link. AGAS never reproduces a third-party interface and calls it the native one.

| Runtime | Native interface route | Current executable status |
|---|---|---|
| Codex | CLI and external Codex application; AGAS run/log inspector | First noninteractive Git worktree adapter implemented; local authenticated CLI and GUI integration unverified. |
| Hermes | Hermes dashboard (local web), TUI and desktop app | CLI discovery only; dashboard window/launch and authenticated task adapter pending. |
| OpenClaw | Gateway Control UI (local web) | CLI discovery only; controlled window/launch and scoped Gateway adapter pending. |
| OpenCode | Its local web UI or terminal | Noninteractive 1.x Git worktree adapter and process test; real authenticated provider run and native window framing unverified. |
| Claude Code | CLI or separate native/web application | CLI discovery only; approved CLI adapter and external app launch pending. |
| Other agents | New versioned adapter contract | No assertion that arbitrary agents already work. Add capability probe, authenticated invocation, bounded cancellation, artifacts and receipt verification before reporting ready. |

The selected runtime window is a view, not a permission grant. Third-party credentials remain with that runtime; AGAS stores only references and scoped job evidence. Embedding must not bypass a vendor's frame, origin or authentication policy.

## Practical end-to-end usage

1. Install AGAS locally, unlock the workspace, choose a hub and create a project. Dev software projects link an existing local Git repository.
2. Create a measurable goal and mission with acceptance criteria, then add dependent tasks. Assign a sourced Agency specialist to a supported runtime and confirm its readiness.
3. Start the bounded run from a task. AGAS records the assigned runtime, worktree, process state, logs and changed-file hashes. Other hub workflows follow their own domain adapters and effect approvals.
4. Inspect logs and actual outputs in the right panel; submit a matching artifact to a criterion, review it, accept tasks and then record owner acceptance. Goal achievement requires accepted linked work. Project the authorized record into the single vault.
5. If a run is stopped or AGAS restarts, inspect the partial workspace and reconcile before retrying. Never silently replay a consequential action.

## Release gates before `main`

| Gate | Evidence required | Present state |
|---|---|---|
| Foundation | Seven durable hubs, roles, scoped missions and vault | Implemented with automated persistence/scope checks; vault authoring import still absent. |
| Execution | Two **real** authenticated agent runtimes, cancellation, recovery, receipts | Codex and OpenCode 1.x code paths and process fixture tests, including a second end-to-end worktree/artifact flow; neither live provider is installed or authenticated here. |
| Teamwork | CEO replies and two-runtime acknowledged handoff, permissions and durable approvals | Durable CEO reply route through selected Codex/OpenCode with scope and process fixture checks; live provider replies unverified. Manual cross-hub evidence receipt implemented; automatic two-runtime delivery and effect approvals pending. |
| Domains | Dev integration/release; Media publish receipt; Finance, Business, Health, Security and Maintenance domain tests | Dev worktree run and owner-created local review branch with all changed files reviewed; no merge/deploy. Media planning records exist; full workflows pending. |
| Experience | Actual browser interaction, agent window capability tests, secure access and three clean OS installs | UI exists; automated browser binary and target OS installs unavailable in this workspace. |
| Operations | Consistent database/artifact/vault backup, restore drill and release migration | Offline checksummed snapshot and new-directory restore drill implemented; known note files can import with revision checks. Coordinated online snapshot, other vault imports and release migration pending. |

The owner authorized a merge after a **complete** working system. Until these gates pass, publish reviewable draft commits and keep `main` untouched.
