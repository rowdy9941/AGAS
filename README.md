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
- Goals can nest under organization, hub and project ownership, align missions, and be marked achieved only after linked work is accepted. Tasks can depend on accepted predecessors and an explicitly accepted cross-hub handoff. Dev missions use a linked local Git repository, a sourced Agency role and a ready Codex or OpenCode CLI to run in detached worktrees; AGAS records changed-file hashes, stop/restart outcomes and run-attempt quotas. Other hubs can run bounded **text-only OpenCode or restricted OpenClaw** tasks; the text and its hash are recorded for owner review. These restrictions are runtime tool policies, not operating-system isolation. After owner acceptance and reviewed evidence for **every** changed Dev file, the owner may create a local `agas/<mission>/<run>` review branch. AGAS does not merge or push it.
- The Agent windows view can open a configured local Hermes, OpenClaw or OpenCode web UI in an AGAS panel where that UI permits framing. Its external-tab link stays available. The provider runs independently and handles its own login; Codex/Claude native GUI and interactive terminal integration remain open work.
- An accepted source mission can offer one reviewed evidence record to a named mission in another hub. The receiving owner inspects and acknowledges it before an agent may read it in its scoped prompt. A receiving task may require that exact receipt: it cannot launch while offered, declined, or tampered. A real child-process fixture covers OpenCode text output in Content → hash-backed owner review → accepted handoff → Codex Dev worktree → owner-reviewed file. Live authenticated provider calls remain unverified.
- A local offline snapshot command copies the SQLite database, projected vault and recorded run workspaces into a checksummed bundle. Restore verifies every byte into a **new empty directory**, relocates run paths and clears links to external Git repositories. A restore drill checks a recorded artifact after relocation. Stop AGAS and its agent processes before taking a snapshot.
- Direct CEO requests save to a durable inbox and surface in the executive feed. The owner can choose a ready Codex, OpenCode or restricted OpenClaw runtime for a bounded reply; response, errors and interrupted state survive restart. The prompt includes only organization and that hub's notes and recent conversation. Other hubs and private notes are excluded. Process fixtures are tested, while live provider replies are not verified on this host.
- Twelve exact Agency prompt bodies, with verified upstream Git blob hashes and MIT license; the pinned index contains 295 source references at commit `053ddbbf392a1688fc7043d81529f47ef2cf86c8`. Role assignment is configuration, not activation. Codex and OpenCode readiness checks confirm local CLI login state; OpenClaw checks a live Gateway and its active `agas` policy. Hermes and Claude remain discovery only. A readiness check does not prove a provider run will complete.
- Scoped knowledge records and a one-vault Obsidian Markdown projection. AGAS updates files it previously generated when their bytes are untouched, including mission tasks and evidence summaries. The Knowledge page can import edited AGAS note files with matching IDs, scope and revisions, then project their new revision. Conflicting edits remain untouched. Import of other vault file types is still pending.

To import the complete pinned Agency source, check out [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) at the exact commit above and run:

```sh
npm run import:agency -- /path/to/agency-agents
```

The importer verifies the revision and each Git blob against `catalog/agency-index.json`; no Agency app or server is installed. Source prompt copies and license are in `vendor/agency/`. No AionUI, Paperclip or MBAs code is used in this product.

## Restricted OpenClaw text integration

Install and authenticate OpenClaw on the same machine, then configure a **dedicated** `agas` agent in its Gateway. Its active configuration must include these fields:

```json5
{
  gateway: { mode: "local" },
  agents: {
    entries: {
      agas: {
        workspace: "~/.openclaw/workspace-agas",
        skipBootstrap: true,
        skills: [],
        sandbox: { mode: "all", scope: "agent", workspaceAccess: "none" },
        tools: { deny: ["*"] }
      }
    }
  }
}
```

Keep the Gateway's own authentication and model setup in OpenClaw. AGAS checks `openclaw gateway status --require-rpc --json` and the Gateway's `config.get` revision against `appliedConfigHash` before it reports this adapter ready. A saved but unapplied policy is refused. AGAS sends each request to a fresh session of `--agent agas` with `--message-file` and `--json`, without `--deliver`, and records the returned text for owner review. This adapter does not run Dev code or send to channels. The policy can change between readiness and execution; isolate the Gateway and restrict configuration changes during work. [OpenClaw's per-agent configuration](https://docs.openclaw.ai/gateway/config-agents/entries-and-multi-agent) and [tool policy](https://docs.openclaw.ai/gateway/config-tools/tool-policy) define those controls.

## Offline snapshot and restore

Stop the AGAS server and agent runs. Use the same `AGAS_DB_PATH`, `AGAS_VAULT_PATH` and `AGAS_WORKSPACES_PATH` values that the server used, then:

```sh
npm run snapshot -- create /path/to/new/snapshot
npm run snapshot -- restore /path/to/snapshot /path/to/new/restored-root
```

The restore destination must not exist. Set the three AGAS path variables to the corresponding files and directories under `restored-root/data/` before starting the restored server. Relink external Git repositories in Projects before any new Dev run. A bundle includes private AGAS records; store it with the same care as the original data. Symbolic links or special files in snapshot sources stop the snapshot rather than following them.

## What is still to build

Live authenticated Codex, OpenCode and OpenClaw provider runs and CEO replies, independently verified semantic outcomes, automatic dispatch after an acknowledged handoff, effect approvals, Dev integration/release beyond a local review branch, authorized external Media publishing and analytics, FinOS licensed data feeds, reproducible backtests and broker reconciliation, dedicated workflows for the other hubs, vault import for missions and other records, online coordinated snapshots, desktop installers, voice and spatial UI. Task creation alone does not start a run; the owner launches a configured ready agent explicitly. OpenCode's adapter currently supports the 1.x CLI protocol. Hermes and Claude are discovered and can show their local native UI where available; they have no executable task adapter yet. See the [complete product contract](docs/architecture/AGAS_MASTER_REQUIREMENTS_V4.md) and [composite scope and release gates](docs/architecture/AGAS_COMPOSITE_SCOPE_V5.md).

The old AionUI/Paperclip trial is preserved in another branch. Its prior simulator and the earlier AGAS prototype remain in Git history, outside this native application's boot path.
