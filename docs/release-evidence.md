# 1.0.1 release evidence

Verified on 2026-09-24 with Node.js 22.22.3 on Linux x64.

| Check | Result |
| --- | --- |
| Syntax and automated suite | 35/35 tests passed locally |
| Runtime detection | Installed shim and snap CLIs passed a bounded cold-start regression and live version detection |
| Full MVP scenario | Twelve-step offline scenario passed |
| Crash recovery | Interrupted mission retried and completed after database reopen |
| Backup/restore | Backup and restored copy both passed SQLite integrity checks |
| Migration | Version 1 fixture migrated to schema 2 without data loss |
| Dependency audit | 0 vulnerabilities; no runtime dependencies |
| Context benchmark | 1,000 scoped writes plus search completed in approximately 100 ms locally (2 s gate) |
| Accessibility | Label/keyboard baseline test passed; focus and full mission flow browser-tested |
| Browser acceptance | Mission approval/completion, report/vault, projects, conversations, and settings passed |
| Packaging | `npm pack --dry-run` produced a 64-file, approximately 65 kB package plan |
| Compose | `docker compose config` passed |

The local host did not have a Docker daemon, so an image build was not claimed.
The Dockerfile and Compose model were validated statically; the Node deployment
was started and smoke-tested through `/readyz`, authenticated diagnostics, and
the operator console. GitHub Actions is the hosted merge gate on Node.js 22 and
24 and includes `npm audit --audit-level=high`.
