# AGAS · Accessible General AI System

An original, local-first organization for AI work. AGAS has seven permanent hubs, an executive, hub CEOs, sourced specialist roles, scoped missions and knowledge, and a single Obsidian-compatible vault. The product is **under construction**. Codex and OpenCode Dev execution paths have process fixture coverage, but neither can be verified against an authenticated installation on this host.

## Start

Install Node.js 24 or newer on Windows, macOS or Linux.

```sh
npm ci
npm run check
npm start
```

Open `http://127.0.0.1:4310`. For a private local development session, enter `agas-dev-token`. Set `AGAS_BOOTSTRAP_TOKEN` to a secret token for real use; it is required before binding beyond loopback. Optional: `AGAS_DB_PATH`, `AGAS_VAULT_PATH`, `AGAS_WORKSPACES_PATH`, `AGAS_HOST`, `AGAS_PORT`. State and vault are stored under `data/` by default and are excluded from Git.

## What works now

- Original responsive AGAS workspace and the supplied dragon-eye logo; seven hubs, executive and permanent CEO identities persist in SQLite. Projects organize software products and Media Empire brands. A Media campaign progresses through six owner-reviewed research, strategy, creation, editing, media and editorial stages. The final stage requires a rights and factuality declaration. Accepted stage bodies and references are hashed into a local publication packet scoped to one brand account; no external channel connection or publishing is implied.
- Finance research projects can own an INR paper account. The local ledger accepts manually attributed price marks, simulates cash-only whole-unit buys and sells, caps each buy, accounts for entered fees and cost basis in integer paise, records positions and P&L, and makes repeated order requests idempotent. Marks and fills are simulations, not verified live prices or broker trades. No broker credentials or live execution path exists.
- Mission intake, a durable task board, evidence submissions, owner review, cancellation and a versioned event feed. A mission can record **owner acceptance** only after every task and criterion has reviewed evidence. This is a human decision; no independent runtime verification is connected yet.
- Goals can nest under organization, hub and project ownership, align missions, and be marked achieved only after linked work is accepted. Dev tasks can depend on accepted predecessors. A linked local Git repository, a configured Agency role and a ready Codex or OpenCode CLI allow bounded runs in separate detached worktrees; AGAS persists output, changed-file hashes, stop/restart outcomes and run-attempt quotas. File integrity is checked again during review. The agent does not commit to, deploy, or modify the source checkout. After owner acceptance and reviewed evidence for **every** changed file, the owner may create a local `agas/<mission>/<run>` review branch. AGAS does not merge or push it. OpenCode is launched with read/edit/search permission only; its tool rules do not constitute operating-system isolation.
- The Agent windows view can open a configured local Hermes, OpenClaw or OpenCode web UI in an AGAS panel where that UI permits framing. Its external-tab link stays available. The provider runs independently and handles its own login; Codex/Claude native GUI and interactive terminal integration remain open work.
- An accepted source mission can offer one reviewed evidence record to a named mission in another hub. The receiving owner inspects and acknowledges it before a Dev agent may read it in its scoped prompt. The handoff receipt is durable, projected to the vault, and rechecks evidence integrity.
- A local offline snapshot command copies the SQLite database, projected vault and recorded run workspaces into a checksummed bundle. Restore verifies every byte into a **new empty directory**, relocates run paths and clears links to external Git repositories. A restore drill checks a recorded artifact after relocation. Stop AGAS and its agent processes before taking a snapshot.
- Direct CEO requests save to a durable inbox and surface in the executive feed. If Codex or OpenCode is ready, the owner can choose that runtime for a bounded, read-only reply; response, errors and interrupted state survive restart. The prompt includes only organization and that hub's notes and recent conversation. Other hubs and private notes are excluded. The process fixture is tested, while live provider replies are not verified on this host.
- Twelve exact Agency prompt bodies, with verified upstream Git blob hashes and MIT license; the pinned index contains 295 source references at commit `053ddbbf392a1688fc7043d81529f47ef2cf86c8`. Role assignment is configuration, not activation. Codex and OpenCode readiness checks confirm local CLI login state; other runtimes remain discovery only. A successful login check does not prove a provider run will complete.
- Scoped knowledge records and a one-vault Obsidian Markdown projection. AGAS updates files it previously generated when their bytes are untouched, including mission tasks and evidence summaries. The Knowledge page can import edited AGAS note files with matching IDs, scope and revisions, then project their new revision. Conflicting edits remain untouched. Import of other vault file types is still pending.

To import the complete pinned Agency source, check out [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) at the exact commit above and run:

```sh
npm run import:agency -- /path/to/agency-agents
```

The importer verifies the revision and each Git blob against `catalog/agency-index.json`; no Agency app or server is installed. Source prompt copies and license are in `vendor/agency/`. No AionUI, Paperclip or MBAs code is used in this product.

## Offline snapshot and restore

Stop the AGAS server and agent runs. Use the same `AGAS_DB_PATH`, `AGAS_VAULT_PATH` and `AGAS_WORKSPACES_PATH` values that the server used, then:

```sh
npm run snapshot -- create /path/to/new/snapshot
npm run snapshot -- restore /path/to/snapshot /path/to/new/restored-root
```

The restore destination must not exist. Set the three AGAS path variables to the corresponding files and directories under `restored-root/data/` before starting the restored server. Relink external Git repositories in Projects before any new Dev run. A bundle includes private AGAS records; store it with the same care as the original data. Symbolic links or special files in snapshot sources stop the snapshot rather than following them.

## What is still to build

Live authenticated Codex and OpenCode provider runs and CEO replies, independent semantic verification, automatic two-runtime handoff delivery, effect approvals, Dev integration/release beyond a local review branch, authorized external Media publishing and analytics, FinOS licensed data feeds, reproducible backtests and broker reconciliation, the remaining hub domain workflows, vault import for missions and other records, online coordinated snapshots, desktop installers, voice and spatial UI. Task creation alone does not start a run; the owner launches a configured ready Codex or OpenCode task explicitly. OpenCode's adapter currently supports the 1.x CLI protocol. See the [complete product contract](docs/architecture/AGAS_MASTER_REQUIREMENTS_V4.md) and [composite scope and release gates](docs/architecture/AGAS_COMPOSITE_SCOPE_V5.md).

The old AionUI/Paperclip trial is preserved in another branch. Its prior simulator and the earlier AGAS prototype remain in Git history, outside this native application's boot path.
