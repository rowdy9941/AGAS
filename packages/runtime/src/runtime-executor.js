import { spawn } from "node:child_process";
import { resolve, sep } from "node:path";
import { stat } from "node:fs/promises";
import { DomainError, invariant } from "../../core/src/errors.js";

const MAX_OUTPUT_BYTES = 1024 * 1024;

function scopedDirectory(root, requested = ".") {
  const resolvedRoot = resolve(root);
  const candidate = resolve(resolvedRoot, requested);
  invariant(candidate === resolvedRoot || candidate.startsWith(`${resolvedRoot}${sep}`), "WORKING_DIRECTORY_DENIED", "Working directory must remain inside AGAS_WORKSPACE_ROOT", 403);
  return candidate;
}

function safeEnvironment() {
  const names = ["PATH", "LANG", "LC_ALL", "TMPDIR", "TERM"];
  return Object.fromEntries(names.flatMap((name) => process.env[name] ? [[name, process.env[name]]] : []));
}

async function runProcess({ executable, args, input, cwd, timeoutMs, signal }) {
  await stat(cwd);
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: safeEnvironment(),
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let timedOut = false;

    const collect = (target) => (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        child.kill("SIGTERM");
        reject(new DomainError("RUNTIME_OUTPUT_LIMIT", "Runtime output exceeded 1 MiB", 422));
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.on("error", (error) => reject(new DomainError("RUNTIME_START_FAILED", error.message, 422)));
    child.on("close", (code, childSignal) => {
      const result = {
        exitCode: code,
        signal: childSignal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (timedOut) return reject(new DomainError("RUNTIME_TIMEOUT", `Runtime exceeded ${timeoutMs}ms`, 422, result));
      if (code !== 0) return reject(new DomainError("RUNTIME_FAILED", `Runtime exited with code ${code}`, 422, result));
      resolvePromise(result);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1_000).unref();
    }, timeoutMs);
    timer.unref();
    child.once("close", () => clearTimeout(timer));
    if (signal) signal.addEventListener("abort", () => child.kill("SIGTERM"), { once: true });
    child.stdin.end(input);
  });
}

export class RuntimeExecutor {
  constructor({ registry, mode = "simulator", workspaceRoot = process.cwd(), timeoutMs = 120_000 } = {}) {
    this.registry = registry;
    this.mode = mode;
    this.workspaceRoot = workspaceRoot;
    this.timeoutMs = timeoutMs;
  }

  async execute(execution, { signal } = {}) {
    if (this.mode === "disabled") throw new DomainError("RUNTIME_EXECUTION_DISABLED", "Runtime execution is disabled", 503);
    if (this.mode === "simulator") return this.#simulate(execution);
    invariant(this.mode === "local", "INVALID_RUNTIME_MODE", `Unknown runtime execution mode: ${this.mode}`);

    const assignment = execution.plan.assignments.find(({ runtimeId }) => runtimeId);
    invariant(assignment, "RUNTIME_ASSIGNMENT_REQUIRED", "Execution plan has no runtime assignment", 422);
    const runtime = this.registry.get("runtimes", assignment.runtimeId);
    invariant(runtime.execution && Array.isArray(runtime.execution.args), "RUNTIME_NOT_EXECUTABLE", `${runtime.id} does not declare an execution adapter`, 422);
    const cwd = scopedDirectory(this.workspaceRoot, execution.workingDirectory);
    const args = runtime.execution.args.map((arg) => arg.replaceAll("{objective}", execution.objective));
    const input = runtime.execution.input === "objective" ? execution.objective : "";
    const startedAt = new Date().toISOString();
    const processResult = await runProcess({ executable: runtime.command, args, input, cwd, timeoutMs: this.timeoutMs, signal });
    return {
      mode: "local",
      runtimeId: runtime.id,
      startedAt,
      completedAt: new Date().toISOString(),
      summary: processResult.stdout.trim().slice(0, 4_000) || `${runtime.name} completed successfully`,
      process: processResult,
      outputs: [{ agentId: assignment.agentId, runtimeId: runtime.id, status: "completed" }],
      toolActions: [],
    };
  }

  async #simulate(execution) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    const completedAt = new Date().toISOString();
    return {
      mode: "simulator",
      runtimeId: "agas-sim",
      startedAt: execution.updatedAt,
      completedAt,
      summary: `Completed: ${execution.objective}`,
      outputs: execution.plan.assignments.map((assignment, index) => ({
        agentId: assignment.agentId,
        personaId: assignment.personaId,
        runtimeId: assignment.runtimeId,
        status: "completed",
        sequence: index + 1,
        evidence: `Simulated ${assignment.personaId} contribution`,
      })),
      toolActions: [{ type: "simulation", status: "completed", occurredAt: completedAt }],
    };
  }
}
