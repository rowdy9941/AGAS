# Threat model

## Protected assets

AGAS protects API credentials, workspace files, runtime credentials, MCP secret
references, authoritative SQLite state, mission approvals, audit evidence, and
vault documents. Availability and evidence integrity are as important as
confidentiality because mission completion depends on them.

## Trust boundaries

1. Browser/operator to authenticated HTTP control plane.
2. Control plane to the SQLite database and vault filesystem.
3. Dispatcher to a runtime adapter and its constrained working directory.
4. MCP projection to an independently operated MCP service.
5. Imported persona/vault content to canonical validated records.

## Threats and controls

| Threat | Control |
| --- | --- |
| Stolen API token | Hash at rest, one-time token display, role/workspace scope, revocation |
| Cross-workspace data access | Workspace authorization on every scoped route and query |
| Command injection | Fixed executable and argument arrays, `shell: false`, no user command templates |
| Filesystem escape | Resolved-path containment for runtime work and vault writes |
| Secret disclosure | Raw MCP secrets rejected; only `env:`/`vault:` references persist |
| Permission escalation | MCP grants must be subsets of service-declared tools |
| Unapproved side effect | Sensitive mission tasks remain blocked until admin approval |
| Malicious imported content | Schema/type/workspace validation; UI uses DOM `textContent` |
| Denial of service | 256 KiB request limit, runtime time/output limits, bounded list limits |
| Crash or power loss | SQLite WAL, migrations, restart reconciliation, backup/restore validation |
| Supply-chain compromise | No runtime dependencies, lockfile, Node 22/24 CI, `npm audit` |

## Red-team cases in CI

Tests deny unauthenticated routes, invalid roles/workspaces, raw MCP secrets,
MCP tool escalation, incompatible runtimes, path escape, invalid state
transitions, premature mission start, oversized budgets, and corrupt/invalid
vault imports. The acceptance suite proves approvals cannot be skipped.

## Residual risks

Local runtime CLIs and remote MCP services execute outside AGAS's implementation
boundary and retain their own credentials, network behavior, licenses, and
security posture. An administrator enabling `AGAS_RUNTIME_EXECUTION=local` must
trust those binaries and should isolate the node from untrusted users. AGAS does
not yet provide multi-host workers, hardware-backed secrets, or sandboxing beyond
the host/runtime facilities it invokes.
