# AGAS · Accessible General AI System

An original, local-first organization for AI work. AGAS has seven permanent hubs, an executive, hub CEOs, sourced specialist roles, scoped missions and knowledge, and a single Obsidian-compatible vault. The product is **under construction**. Codex and OpenCode Dev execution paths have process fixture coverage, but neither can be verified against an authenticated installation on this host.

## Start

Install Node.js 24 or newer on Windows, macOS or Linux.

GitHub Actions runs the automated checks on all three hosted operating systems and an interactive Chrome smoke flow on hosted Linux. A clean user installation and live authenticated agent runs on each platform still need separate verification. On Windows, supported npm-generated Node `.cmd` shims are resolved to their Node entry file and launched without a command shell; unknown batch shims are reported as unavailable.

```sh
npm ci
npm run check
npm run doctor
npm start
```

Open `http://127.0.0.1:4310`. For a private local development session, enter `agas-dev-token`. Set `AGAS_BOOTSTRAP_TOKEN` to a secret token for real use; it is required before binding beyond loopback. Optional: `AGAS_DB_PATH`, `AGAS_VAULT_PATH`, `AGAS_WORKSPACES_PATH`, `AGAS_HOST`, `AGAS_PORT`. State and vault are stored under `data/` by default and are excluded from Git.

`npm run doctor` performs read-only CLI version/login/policy probes and prints a redacted JSON readiness report. It does not start an agent task or prove a live provider response. Run it again after installing and signing in to your chosen local runtimes.

## What works now

- Original responsive AGAS workspace and the supplied dragon-eye logo; seven hubs, executive and permanent CEO identities persist in SQLite. Projects organize software products and Media Empire brands. A Media campaign progresses through six owner-reviewed research, strategy, creation, editing, media and editorial stages. The final stage requires a rights and factuality declaration. Accepted stage bodies and references are hashed into a local publication packet scoped to one brand account. A separate owner decision approves the unchanged packet with a recorded review note; no external channel connection or publishing is implied.
- Finance research projects can own an INR paper account. The local ledger accepts manually attributed price marks, simulates cash-only whole-unit buys and sells, caps each buy, accounts for entered fees and cost basis in integer paise, records positions and P&L, and makes repeated order requests idempotent. A separate historical manual-mark replay uses a prior-mark moving-average signal with a next-observed-mark simulated fill, cap and fees; its immutable input snapshot and outcome are hashed, with idempotent request IDs and no change to account holdings. Its sources and fill prices are unverified; there is no spread, liquidity, tax or corporate-action model, licensed feed, broker credential or live execution path.
- Business projects can track opportunities with a target segment and hypothesis. The owner can choose to continue or discard an idea only after an accepted mission in the same project supplies reviewed evidence; AGAS records its hash and flags later source changes. This decision does not contact customers, commit money or import MBAs records.
- Authorized Security projects can record an asset, scope, authorizing person, basis and expiry as an owner attestation. A finding needs reviewed evidence from an accepted Security mission in that project and a currently valid recorded assessment. Owner verification of a fix needs separate accepted Security mission evidence; both source hashes are checked and later changes flagged. This records owner review, not an independent retest. Recording an assessment grants no runtime permission or active scanner access.
- Family Health projects can hold one alias-only profile each, with an owner-recorded consent purpose, expiry, revocation and renewal history. Within current consent, the owner can track an appointment, document or question for a clinician; marking an administrative item reviewed requires accepted, evidence-backed work in that person's project. Expired or revoked consent blocks new items and owner review; previously recorded bytes and offline snapshots remain. This does not authenticate a patient's consent, make clinical decisions or contact a provider. Health content is stored locally without application-level encryption or person-specific login; use only with appropriate access to the machine and backups.
- Failed or interrupted agent runs and stopped active runs open a durable Management incident and a dedicated response mission. The owner can acknowledge the incident, inspect partial work and resolve it only after the linked Management mission has accepted, reviewed evidence. Later source changes are flagged; AGAS does not automatically retry the original run.
- Mission intake, a durable task board, evidence submissions, owner review, cancellation and a versioned event feed. A mission can record **owner acceptance** only after every task and criterion has reviewed evidence. This is a human decision; no independent runtime verification is connected yet.
- Goals can nest under organization, hub and project ownership, align missions, and be marked achieved only after linked work is accepted. Tasks can depend on accepted predecessors and an explicitly accepted cross-hub handoff. Dev missions use a linked local Git repository, a sourced Agency role and a ready Codex or OpenCode CLI to run in detached worktrees; AGAS records changed-file hashes, stop/restart outcomes and run-attempt quotas. Other hubs can run bounded **text-only OpenCode, restricted OpenClaw or restricted Claude Code** tasks; the text and its hash are recorded for owner review. These restrictions are runtime tool policies, not operating-system isolation. After owner acceptance and reviewed evidence for **every** changed Dev file, the owner may create a local `agas/<mission>/<run>` review branch. AGAS does not merge or push it.
- The Agent windows view has tabs for Hermes, OpenClaw, OpenCode, Codex and Claude Code, with runtime status, assigned specialists, CEO reply status and AGAS run receipts. It can open configured local Hermes, OpenClaw or OpenCode web UIs in a panel where framing is permitted; an external-tab link stays available. Codex/Claude desktop and terminal apps remain separate, with their AGAS task evidence accessible in the tab. Providers run independently and handle their own login; direct desktop or interactive terminal embedding remains open work. The hosted Chrome smoke checks login, Security assessment, Health coordination and all five agent tabs through browser interactions, plus page errors and horizontal overflow at 390px across ten workspace views and seven hub pages. It saves desktop and mobile screenshots as a CI artifact.
- An accepted source mission can offer one reviewed evidence record to a named mission in another hub. The receiving owner inspects and acknowledges it before an agent may read it in its scoped prompt. A receiving task may require that exact receipt: it cannot launch while offered, declined, or tampered. The owner may opt that task into one automatic run after acknowledgement; an interrupted dispatch is reconciled on restart without replaying any previously recorded attempt. Source integrity is rechecked before run and owner acceptance. A child-process fixture covers OpenCode text output in Content → hash-backed owner review → accepted handoff → automatically dispatched Codex Dev worktree → reviewed file. Live authenticated provider calls remain unverified.
- A local offline snapshot command copies the SQLite database, projected vault and recorded run workspaces into a checksummed bundle. Restore verifies every byte into a **new empty directory**, relocates run paths and clears links to external Git repositories. A restore drill checks a recorded artifact after relocation. Stop AGAS and its agent processes before taking a snapshot.
- Direct CEO requests save to a durable inbox and surface in the executive feed. The owner can choose a ready Codex, OpenCode, restricted OpenClaw or restricted Claude Code runtime for a bounded reply; response, errors and interrupted state survive restart. The prompt includes only organization and that hub's notes and recent conversation. Other hubs and private notes are excluded. Process fixtures are tested, while live provider replies are not verified on this host.
- Twelve exact Agency prompt bodies, with verified upstream Git blob hashes and MIT license; the pinned index contains 295 source references at commit `053ddbbf392a1688fc7043d81529f47ef2cf86c8`. Role assignment is configuration, not activation. Codex, OpenCode and Claude Code readiness checks confirm local CLI login state; OpenClaw checks a live Gateway and its active `agas` policy. Hermes remains discovery only. A readiness check does not prove a provider run will complete.
- Scoped knowledge records and a one-vault Obsidian Markdown projection. AGAS updates files it previously generated when their bytes are untouched, including mission tasks and evidence summaries. The Knowledge page can import edited AGAS notes, mission title/objective briefs, and goal title/objective/measure briefs against their exact IDs, metadata and revisions, then project the new revision. Linked missions, mission criteria, tasks and evidence sections remain generated records; conflicting edits remain untouched. Import of other vault file types is still pending.

To import the complete pinned Agency source, check out [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) at the exact commit above and run:

```sh
npm run import:agency -- /path/to/agency-agents
```

The importer verifies the revision and each Git blob against `catalog/agency-index.json`; no Agency app or server is installed. Source prompt copies and license are in `vendor/agency/`. No AionUI, Paperclip or MBAs code is used in this product.

## Restricted Claude Code text integration

Install Claude Code 2.1.259 or newer and sign in locally with `claude auth login`; `claude auth status` must confirm login. AGAS runs noninteractive `-p` replies only for CEO messages and non-Dev hub tasks. It requires the documented `--restricted`, `--safe-mode`, `--tools ""`, `--disallowedTools "mcp__*"` and `--permission-prompts none` controls, disables session persistence and Chrome, limits turns and budget, and records only the final result for owner review. It will not run Claude Code Dev edits, arbitrary tools or a separate desktop window. The CLI adapter is covered by an isolated process fixture on Windows, macOS and Linux; a real authenticated Claude installation is not available on this host. See [Claude Code's CLI reference](https://code.claude.com/docs/en/cli-reference) for these flags.

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

Live authenticated Codex, OpenCode, OpenClaw and Claude provider runs and CEO replies, independently verified semantic outcomes, wider automatic planning and reconciliation of external effects, Dev integration/release beyond a local review branch, authorized external Media publishing and analytics, FinOS licensed data feeds, realistic validated backtests and broker reconciliation, person-specific Health access controls and provider integration, active Security assessment/retest adapters with separate authorization, deeper Business and Maintenance execution, vault import for records beyond notes and goal/mission briefs, online coordinated snapshots, desktop installers, voice and spatial UI. Task creation does not start a run unless the owner opts an assigned task into automatic dispatch on acceptance of a required handoff. OpenCode's adapter currently supports the 1.x CLI protocol. Hermes remains discovery only; its dashboard can show in a local agent window where framing is permitted, but it has no executable task adapter. See the [complete product contract](docs/architecture/AGAS_MASTER_REQUIREMENTS_V4.md) and [composite scope and release gates](docs/architecture/AGAS_COMPOSITE_SCOPE_V5.md).

The old AionUI/Paperclip trial is preserved in another branch. Its prior simulator and the earlier AGAS prototype remain in Git history, outside this native application's boot path.
