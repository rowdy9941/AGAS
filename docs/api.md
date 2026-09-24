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
| GET | `/v1/runtimes/managed` | List allowlisted managed packages |
| POST | `/v1/runtimes/:id/install` | Activate a managed runtime (admin) |
| GET | `/v1/catalog/search` | Search catalog with compatibility filters |
| POST | `/v1/catalog/import/agency` | Import a versioned Agency source (admin) |
| GET | `/v1/personas/:id/projections/:runtimeId` | Render a runtime persona projection |
| GET | `/v1/hubs` | List stable hub definitions |
| POST | `/v1/hubs` | Create or update a hub (admin) |
| POST | `/v1/hubs/:id/activate` | Activate a compatible hub plan |
| POST | `/v1/hubs/:id/plan` | Plan a compatible hub roster |
| POST | `/v1/memory` | Append a scoped memory record |
| POST | `/v1/memory/search` | Search visible memory records |
| GET | `/v1/context/artifacts` | List workspace artifacts |
| POST | `/v1/context/artifacts` | Create a typed artifact |
| GET | `/v1/context/events` | Read workspace context events |
| GET | `/v1/context/handoffs` | List cross-runtime handoffs |
| POST | `/v1/context/handoffs` | Create an evidence-backed handoff |
| POST | `/v1/context/handoffs/:id/resolve` | Accept or reject a handoff |
| GET | `/v1/context/checkpoints` | List context checkpoints |
| POST | `/v1/context/checkpoints` | Capture a context checkpoint |
| POST | `/v1/context/checkpoints/:id/rollback` | Restore checkpointed context |
| POST | `/v1/mcp/services` | Register or update an MCP service (admin) |
| GET | `/v1/mcp/grants` | List workspace MCP grants |
| POST | `/v1/mcp/grants` | Grant service tools to a runtime (admin) |
| GET | `/v1/mcp/projections/:runtimeId` | Render a runtime MCP projection |
| POST | `/v1/vault/project` | Project workspace knowledge to Markdown |
| POST | `/v1/vault/import` | Validate and import an artifact document |
| GET/POST | `/v1/organizations` | List or create organizations |
| GET/POST | `/v1/workspaces` | List or create workspaces |
| GET/POST | `/v1/projects` | List or create projects |
| GET/POST | `/v1/teams` | List or create teams |
| GET/POST | `/v1/conversations` | List or create conversations |
| POST | `/v1/conversations/:id/messages` | Append durable conversation context |
| GET/POST | `/v1/missions` | List missions or create a structured plan |
| GET | `/v1/missions/:id` | Read a mission, task graph, budget, and report |
| POST | `/v1/missions/:id/approve` | Approve sensitive mission tasks (admin) |
| POST | `/v1/missions/:id/start` | Start an approved mission |
| POST | `/v1/missions/:id/cancel` | Cancel active mission work |
| POST | `/v1/missions/:id/tasks/:taskId/retry` | Retry a failed task within budget |
| GET | `/v1/mission-events` | Read the mission event stream |
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

Artifacts use canonical `urn:agas:*` identifiers. Handoffs require at least one
artifact from the same workspace. MCP credentials must be references beginning
with `env:` or `vault:`; raw tokens are rejected. Vault imports currently accept
only artifact documents and require the document workspace to match the caller's
authorized workspace.

Mission types are `repository` and `research`. Creation returns a durable task
dependency graph in `awaiting-approval`. Sensitive tasks must be approved by an
administrator before the mission can start. Completion requires task evidence,
verification, a final report, and a successful vault projection.
