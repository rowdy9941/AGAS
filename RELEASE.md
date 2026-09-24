# AGAS 1.0.1

AGAS 1.0.1 is the public single-node MVP: a local-first governed operating
environment for composing specialist agents, approving their work, sharing
evidence across runtimes, and verifying mission outcomes.

## Install

Use Node.js 22 or 24:

```bash
git clone https://github.com/rowdy9941/AGAS.git
cd AGAS
./scripts/install.sh
AGAS_BOOTSTRAP_TOKEN="$(openssl rand -hex 24)" npm start
```

Or use `docker compose up --build -d` after setting
`AGAS_BOOTSTRAP_TOKEN`. Open `http://127.0.0.1:4310`.

## Release evidence

- Automated twelve-step MVP scenario in `test/mvp-acceptance.test.js`.
- Repository and research mission evaluations.
- In-flight crash recovery plus integrity-checked backup/restore tests.
- Authentication, workspace isolation, permission escalation, and import tests.
- Baseline keyboard/label accessibility and single-node context benchmark.
- GitHub Actions on Node.js 22 and 24 with a high-severity dependency audit.

## Integration boundary

The built-in simulator is fully functional offline. Codex, OpenCode, Hermes,
Claude Code, and OpenClaw are detected/invoked only when separately installed
and authorized by their operators. AGAS does not vendor those products or their
provider credentials.
