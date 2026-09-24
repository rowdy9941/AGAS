# Mission evaluation suites

AGAS ships deterministic repository and research mission suites. They exercise
the same Mission Authority, execution ledger, Context Fabric, and vault paths as
local runtime adapters, but use the built-in simulator in CI so no provider
credentials are required.

## Repository suite

1. Hermes identity analyzes constraints and produces the implementation plan.
2. A sensitive Codex implementation task remains blocked until administrator
   approval.
3. OpenCode identity reviews security and correctness.
4. Hermes identity verifies acceptance criteria and tests.
5. Every completed task produces an artifact; cross-runtime dependencies create
   accepted handoffs; the final report is projected to the vault.

The suite fails if approval can be bypassed, a dependency runs early, task
evidence is missing, verification does not pass, or the final vault projection
is absent.

## Research suite

1. The Command Hub scopes the question and evidence standard.
2. A research specialist collects and synthesizes evidence with provenance.
3. A separate runtime challenges unsupported claims and gaps.
4. The verifier produces a report that distinguishes evidence, inference, and
   unresolved questions.

## Metrics

Each mission records task count, total attempts, runtime budget, task status,
execution IDs, artifact IDs, handoffs, approval events, verification result,
final report ID, and projected vault files. Tests assert those records survive a
database restart.
