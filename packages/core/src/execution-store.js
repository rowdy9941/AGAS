import { randomUUID } from "node:crypto";
import { invariant } from "./errors.js";

const TRANSITIONS = Object.freeze({
  proposed: ["approved", "cancelled"],
  approved: ["running", "cancelled"],
  running: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
});

export class ExecutionStore {
  #executions = new Map();
  #audit = [];

  propose(plan, input = {}) {
    invariant(typeof input.objective === "string" && input.objective.trim(), "OBJECTIVE_REQUIRED", "objective is required");
    const now = new Date().toISOString();
    const execution = {
      id: randomUUID(),
      status: "proposed",
      objective: input.objective.trim(),
      plan: structuredClone(plan),
      createdBy: plan.requestedBy,
      createdAt: now,
      updatedAt: now,
      result: null,
    };
    this.#executions.set(execution.id, execution);
    this.#record(execution, null, "proposed", execution.createdBy, input.reason ?? "Execution proposed");
    return structuredClone(execution);
  }

  get(id) {
    const execution = this.#executions.get(id);
    invariant(execution, "EXECUTION_NOT_FOUND", `Execution ${id} was not found`, 404);
    return structuredClone(execution);
  }

  transition(id, input = {}) {
    const execution = this.#executions.get(id);
    invariant(execution, "EXECUTION_NOT_FOUND", `Execution ${id} was not found`, 404);
    invariant(typeof input.actorId === "string" && input.actorId, "ACTOR_REQUIRED", "actorId is required");
    invariant(Object.hasOwn(TRANSITIONS, input.status), "INVALID_EXECUTION_STATUS", `Invalid execution status: ${input.status}`);
    invariant(TRANSITIONS[execution.status].includes(input.status), "INVALID_EXECUTION_TRANSITION", `Cannot transition from ${execution.status} to ${input.status}`, 409);
    if (["completed", "failed"].includes(input.status)) {
      invariant(input.result && typeof input.result === "object", "RESULT_REQUIRED", `result is required when marking an execution ${input.status}`);
    }

    const previous = execution.status;
    execution.status = input.status;
    execution.updatedAt = new Date().toISOString();
    execution.result = input.result ? structuredClone(input.result) : execution.result;
    this.#record(execution, previous, input.status, input.actorId, input.reason ?? null);
    return structuredClone(execution);
  }

  audit() {
    return this.#audit.map((event) => structuredClone(event));
  }

  #record(execution, from, to, actorId, reason) {
    this.#audit.push(Object.freeze({
      id: randomUUID(),
      executionId: execution.id,
      workspaceId: execution.plan.workspaceId,
      type: "execution.transition",
      from,
      to,
      actorId,
      reason,
      occurredAt: new Date().toISOString(),
    }));
  }
}
