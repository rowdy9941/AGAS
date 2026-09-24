# Deployment

## Local Node.js

```bash
export AGAS_BOOTSTRAP_TOKEN="$(openssl rand -hex 24)"
export AGAS_DB_PATH="$PWD/data/agas.db"
npm ci
npm start
```

Open `http://127.0.0.1:4310` and enter the bootstrap token. The default local
development token is `agas-dev-token` only when `AGAS_BOOTSTRAP_TOKEN` is unset.

## Docker Compose

```bash
mkdir -p workspace
export AGAS_BOOTSTRAP_TOKEN="$(openssl rand -hex 24)"
docker compose up --build -d
docker compose ps
```

The service is bound to loopback. SQLite state uses the `agas-data` volume and
the local `workspace/` directory is the only runtime working tree.

## Runtime modes

- `simulator` (default): deterministic, offline execution for evaluation and UI.
- `disabled`: planning and approvals work, but the dispatcher records a failure.
- `local`: invokes only a registry-declared executable with a fixed argument
  template, no shell, a scrubbed environment, output limit, timeout, and a
  working directory constrained beneath `AGAS_WORKSPACE_ROOT`.

Never expose a local-mode node to untrusted users. Runtime CLIs retain their own
provider credentials and terms; AGAS does not bundle them.
