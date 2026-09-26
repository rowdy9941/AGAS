# AGAS · Accessible General AI System

An original, local-first organization for AI work. AGAS has seven permanent hubs, an executive, hub CEOs, sourced specialist roles, scoped missions and knowledge, and a single Obsidian-compatible vault. The product is **under construction**: this branch is the native foundation, with no operational agent execution yet.

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
- Direct CEO requests save to a durable inbox and surface in the executive feed, labelled `awaiting-runtime` until an adapter exists.
- Twelve exact Agency prompt bodies, with verified upstream Git blob hashes and MIT license; the pinned index contains 295 source references at commit `053ddbbf392a1688fc7043d81529f47ef2cf86c8`. Role assignment is configuration, not activation. CLI presence detection is read-only, never marked authenticated/ready.
- Scoped knowledge records and a one-vault Obsidian Markdown projection. AGAS updates files it previously generated when their bytes are untouched, including mission tasks and evidence summaries. User edits in Obsidian remain untouched and are reported as conflicts; there is no vault import yet.

To import the complete pinned Agency source, check out [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) at the exact commit above and run:

```sh
npm run import:agency -- /path/to/agency-agents
```

The importer verifies the revision and each Git blob against `catalog/agency-index.json`; no Agency app or server is installed. Source prompt copies and license are in `vendor/agency/`. No AionUI, Paperclip or MBAs code is used in this product.

## What is still to build

Runtime authentication and actual agent adapters; runtime execution, independent verification, typed handoffs, effect approvals and multi-node scheduling; domain workflows and real data for each hub; version-checked Obsidian authoring/import and full backup/restore; desktop installers, voice and spatial UI. Do not interpret the present CEO inbox or persona cards as live agents. Task submissions are stored records; they do not trigger an agent. See [the complete product contract](docs/architecture/AGAS_MASTER_REQUIREMENTS_V4.md) for the plan and release gates.

The old AionUI/Paperclip trial is preserved in another branch. Its prior simulator and the earlier AGAS prototype remain in Git history, outside this native application's boot path.
