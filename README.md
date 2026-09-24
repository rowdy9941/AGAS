# AGAS

AGAS is an open control plane for governing, activating, and observing teams of
AI agents across multiple runtimes. It keeps runtime discovery, agent identity,
memory boundaries, hub composition, permissions, and execution state in one
explicit model.

The control plane is dependency-free at runtime and stores its state in SQLite.
It includes a recoverable background dispatcher, deterministic simulator, an
opt-in local CLI adapter, and a responsive authenticated operator console.

## Run it

Requirements: Node.js 22 or newer.

```bash
npm install
npm test
npm start
```

The service listens on `http://127.0.0.1:4310` by default and persists state to
`./data/agas.db`. Local development uses the token `agas-dev-token`. Set
`AGAS_BOOTSTRAP_TOKEN` before the first start for a private administrator token.
Set `AGAS_HOST`, `AGAS_PORT`, or `AGAS_DB_PATH` to override other defaults. AGAS
refuses a non-loopback bind unless an explicit bootstrap token is configured.
Open the service URL in a browser to use the operator console.

```bash
curl http://127.0.0.1:4310/healthz
export AGAS_TOKEN=agas-dev-token
curl -H "authorization: Bearer $AGAS_TOKEN" http://127.0.0.1:4310/v1/registry
curl -H "authorization: Bearer $AGAS_TOKEN" http://127.0.0.1:4310/v1/runtimes/detect

curl -X POST http://127.0.0.1:4310/v1/hubs/engineering/plan \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $AGAS_TOKEN" \
  -d '{"workspaceId":"demo"}'
```

See [docs/api.md](docs/api.md) for the complete HTTP surface and
[docs/architecture.md](docs/architecture.md) for boundaries and next phases.

## Safety model

- Runtime detection is read-only and uses fixed version arguments with no shell.
- Every memory write declares a scope and visibility.
- Workspace and principal boundaries are enforced during memory search.
- API tokens are stored only as SHA-256 hashes and use role/workspace policy.
- Hub plans select only compatible runtimes and expose their permission envelope.
- Execution records use a strict state machine and append-only audit events.
- Runtime commands use no shell, a scrubbed environment, bounded output and time,
  and a working directory constrained beneath `AGAS_WORKSPACE_ROOT`.
- JSON bodies are size-limited and errors are structured.

## Project status

Phases 1–3 are implemented. See the
[master architecture plan](docs/AGAS_MASTER_ARCHITECTURE_PLAN.md) for the full
MVP contract and [deployment guide](docs/deployment.md) for Node and Docker use.
