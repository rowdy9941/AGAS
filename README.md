# AGAS · Accessible General AI System

An original, local-first organization for AI work. AGAS has seven permanent hubs, an executive, hub CEOs, sourced specialist roles, scoped missions and knowledge, and a single Obsidian-compatible vault. The product is **under construction**. A Codex Dev execution path exists but still needs verification with a real authenticated Codex installation.

## Start

Install Node.js 24 or newer on Windows, macOS or Linux.

```sh
npm ci
npm run check
npm start
```

Open `http://127.0.0.1:4310`. For a private local development session, enter `agas-dev-token`. Set `AGAS_BOOTSTRAP_TOKEN` to a secret token for real use; it is required before binding beyond loopback. Optional: `AGAS_DB_PATH`, `AGAS_VAULT_PATH`, `AGAS_HOST`, `AGAS_PORT`. State and vault are stored under `data/` by default and are excluded from Git.

## What works now

- Original responsive AGAS workspace and the supplied dragon-eye logo; seven hubs, executive and permanent CEO identities persist in SQLite. Projects organize software products and Media Empire brands; content accounts, niches and campaign briefs are durable planning records.
- Mission intake, a durable task board, evidence submissions, owner review, cancellation and a versioned event feed. A mission can record **owner acceptance** only after every task and criterion has reviewed evidence. This is a human decision; no independent runtime verification is connected yet.
- Goals can nest under organization, hub and project ownership, align missions, and be marked achieved only after linked work is accepted. Dev tasks can depend on accepted predecessors. A linked local Git repository, a configured Agency role and a ready Codex CLI allow bounded runs in separate detached worktrees; AGAS persists output, changed-file hashes, stop/restart outcomes and run-attempt quotas. File integrity is checked again during review. The agent does not commit to, deploy, or modify the source checkout.
- The Agent windows view can open a configured local Hermes, OpenClaw or OpenCode web UI in an AGAS panel where that UI permits framing. Its external-tab link stays available. The provider runs independently and handles its own login; Codex/Claude native GUI and interactive terminal integration remain open work.
- Direct CEO requests save to a durable inbox and surface in the executive feed, labelled `awaiting-runtime` until an adapter exists.
- Twelve exact Agency prompt bodies, with verified upstream Git blob hashes and MIT license; the pinned index contains 295 source references at commit `053ddbbf392a1688fc7043d81529f47ef2cf86c8`. Role assignment is configuration, not activation. CLI presence detection is read-only, never marked authenticated/ready.
- Scoped knowledge records and a one-vault Obsidian Markdown projection. AGAS updates files it previously generated when their bytes are untouched, including mission tasks and evidence summaries. User edits in Obsidian remain untouched and are reported as conflicts; there is no vault import yet.

To import the complete pinned Agency source, check out [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) at the exact commit above and run:

```sh
npm run import:agency -- /path/to/agency-agents
```

The importer verifies the revision and each Git blob against `catalog/agency-index.json`; no Agency app or server is installed. Source prompt copies and license are in `vendor/agency/`. No AionUI, Paperclip or MBAs code is used in this product.

## What is still to build

Live Codex authentication check, a second real task adapter, independent semantic verification, typed handoffs, CEO responses, effect approvals, full Dev integration/release and Media publishing, each remaining hub's domain workflows, version-checked Obsidian import and full backup/restore, desktop installers, voice and spatial UI. The CEO inbox is not a conversation with a live agent until an adapter answers it. Task creation alone does not start a run; the owner launches a configured ready Codex task explicitly. See the [complete product contract](docs/architecture/AGAS_MASTER_REQUIREMENTS_V4.md) and [composite scope and release gates](docs/architecture/AGAS_COMPOSITE_SCOPE_V5.md).

The old AionUI/Paperclip trial is preserved in another branch. Its prior simulator and the earlier AGAS prototype remain in Git history, outside this native application's boot path.
