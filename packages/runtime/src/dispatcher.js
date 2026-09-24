export class Dispatcher {
  #timer = null;
  #busy = false;

  constructor({ executions, executor, intervalMs = 1_000, actorId = "system:dispatcher" }) {
    this.executions = executions;
    this.executor = executor;
    this.intervalMs = intervalMs;
    this.actorId = actorId;
  }

  start() {
    for (const execution of this.executions.list({ status: "running", limit: 500 })) {
      this.executions.transition(execution.id, {
        status: "failed",
        actorId: this.actorId,
        reason: "Recovered an execution interrupted by process restart",
        result: { code: "INTERRUPTED_BY_RESTART", retryable: true },
      });
    }
    this.#timer = setInterval(() => void this.tick(), this.intervalMs);
    this.#timer.unref();
    void this.tick();
  }

  stop() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  async tick() {
    if (this.#busy) return;
    this.#busy = true;
    try {
      for (const execution of this.executions.list({ status: "approved", limit: 100 })) {
        await this.#run(execution);
      }
    } finally {
      this.#busy = false;
    }
  }

  async #run(execution) {
    this.executions.transition(execution.id, { status: "running", actorId: this.actorId, reason: "Dispatcher claimed approved execution" });
    try {
      const result = await this.executor.execute(this.executions.get(execution.id));
      if (this.executions.get(execution.id).status === "running") {
        this.executions.transition(execution.id, { status: "completed", actorId: this.actorId, reason: "Runtime completed", result });
      }
    } catch (error) {
      if (this.executions.get(execution.id).status === "running") {
        this.executions.transition(execution.id, {
          status: "failed",
          actorId: this.actorId,
          reason: error.message,
          result: { code: error.code ?? "RUNTIME_ERROR", message: error.message, retryable: false },
        });
      }
    }
  }
}
