# Operations and recovery

## Diagnostics

`GET /healthz` is the liveness check. `GET /readyz` verifies SQLite integrity and
schema compatibility. Authenticated operators can inspect `GET /v1/diagnostics`
for Node/runtime metadata, database namespaces and sizes, record counts, and the
current schema version. Server lifecycle and unexpected failures are emitted as
single-line structured JSON.

## Backup

Create a transactionally consistent SQLite backup while AGAS is running:

```bash
npm run backup -- ./data/agas.db ./data/backups/agas.db
```

The command uses SQLite `VACUUM INTO` and verifies the resulting database before
reporting success. It refuses to overwrite an existing backup.

## Restore

Stop AGAS before restoring. Restore to a new path first, start AGAS against it,
and verify `/readyz` before replacing a production database:

```bash
npm run restore -- ./data/backups/agas.db ./data/restored.db
AGAS_DB_PATH=./data/restored.db npm start
```

An existing target is never replaced unless `--force` is supplied. The restore
is copied to a temporary file, integrity-checked, and atomically renamed.

## Restart recovery

On startup, executions left in `running` are marked failed with
`INTERRUPTED_BY_RESTART`. Mission Authority schedules a retry only when the task
and mission budgets allow it, preserving dependency order and prior evidence.
The automated recovery test interrupts a live mission, reopens the database,
retries the task, and verifies the final report.

## Offline mode

The default simulator, registry, database, console, Context Fabric, Mission
Authority, and vault work without network access or provider credentials. Remote
MCP endpoints are registered as metadata and are not contacted by the current
MVP. Local runtime mode may use network access according to the selected CLI.
