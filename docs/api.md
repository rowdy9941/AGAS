# HTTP API

All responses are JSON. Except for `/healthz`, requests require an
`Authorization: Bearer <token>` header. Errors have `error.code`,
`error.message`, and `requestId`. Mutating responses return `201` or `200`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/healthz` | Health and registry counts |
| GET | `/v1/session` | Current API-key principal and policy |
| GET | `/v1/registry` | Entire registry snapshot |
| GET | `/v1/registry/:kind` | One registry collection |
| POST | `/v1/registry/:kind` | Register an immutable entry |
| GET | `/v1/runtimes/detect` | Read-only local runtime detection |
| POST | `/v1/hubs/:id/plan` | Plan a compatible hub roster |
| POST | `/v1/memory` | Append a scoped memory record |
| POST | `/v1/memory/search` | Search visible memory records |
| POST | `/v1/executions` | Propose an execution from a hub plan |
| GET | `/v1/executions` | List visible executions |
| GET | `/v1/executions/:id` | Read an execution record |
| POST | `/v1/executions/:id/transitions` | Apply a lifecycle transition |
| GET | `/v1/audit` | Read the append-only audit stream |
| GET | `/v1/api-keys` | List API-key metadata (admin) |
| POST | `/v1/api-keys` | Issue an API key once (admin) |
| DELETE | `/v1/api-keys/:id` | Revoke an API key (admin) |

Memory scopes are `working`, `session`, `mission`, `workspace`, `hub`,
`personal`, `organization`, and `artifact`. Visibility is `private`,
`workspace`, `hub`, `organization`, or `public`.

Execution states are `proposed`, `approved`, `running`, `completed`, `failed`,
and `cancelled`. Only valid forward transitions are accepted.

Roles are `viewer`, `operator`, and `admin`. Keys can be constrained to named
workspaces. Only administrators can mutate the registry, approve executions, or
manage keys; operators can propose and run work; viewers are read-only.
