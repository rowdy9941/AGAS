import { randomUUID } from "node:crypto";
import { invariant } from "../../core/src/errors.js";

const MISSION_TYPES = new Set(["repository", "research"]);
const TERMINAL_MISSION_STATES = new Set(["completed", "failed", "cancelled"]);

function canonicalId(type) {
  return `urn:agas:${type}:${randomUUID()}`;
}

function task(id, title, { type, personaId, agentId, runtimeId, dependencies = [], sensitive = false, criteria }) {
  return {
    id, canonicalId: canonicalId("task"), title, type, personaId, agentId, runtimeId,
    dependencies, sensitive, approvalStatus: sensitive ? "pending" : "not-required",
    status: "pending", attempts: 0, maxAttempts: 2, executionId: null,
    artifactId: null, result: null, criteria,
  };
}

function repositoryPlan() {
  return [
    task("analyze", "Analyze repository and constraints", { type: "analysis", personaId: "software-architect", agentId: "architect", runtimeId: "hermes", criteria: "Repository constraints and implementation plan are recorded" }),
    task("implement", "Implement the approved change", { type: "implementation", personaId: "backend-engineer", agentId: "backend", runtimeId: "codex", dependencies: ["analyze"], sensitive: true, criteria: "Requested behavior is implemented with bounded permissions" }),
    task("review", "Review security and correctness", { type: "review", personaId: "security-reviewer", agentId: "security", runtimeId: "opencode", dependencies: ["implement"], criteria: "Security and correctness review has evidence" }),
    task("verify", "Verify tests and acceptance criteria", { type: "verification", personaId: "reality-checker", agentId: "reality", runtimeId: "hermes", dependencies: ["implement", "review"], criteria: "All mission acceptance criteria are verified" }),
  ];
}

function researchPlan() {
  return [
    task("scope", "Define research scope and evidence standard", { type: "planning", personaId: "research-analyst", agentId: "researcher", runtimeId: "hermes", criteria: "Scope, sources, and evaluation criteria are explicit" }),
    task("research", "Collect and synthesize evidence", { type: "research", personaId: "research-analyst", agentId: "researcher", runtimeId: "codex", dependencies: ["scope"], criteria: "Findings preserve source provenance" }),
    task("challenge", "Challenge claims and gaps", { type: "review", personaId: "reality-checker", agentId: "reality", runtimeId: "opencode", dependencies: ["research"], criteria: "Unsupported claims and evidence gaps are identified" }),
    task("report", "Produce the verified research report", { type: "verification", personaId: "reality-checker", agentId: "reality", runtimeId: "hermes", dependencies: ["research", "challenge"], criteria: "Report distinguishes evidence, inference, and unresolved questions" }),
  ];
}

export class MissionAuthority {
  #missions;
  #events;
  #onChange;

  constructor({ state = {}, onChange, registry, executions, context, vault, organization } = {}) {
    this.#missions = structuredClone(state.missions ?? []);
    this.#events = structuredClone(state.events ?? []);
    this.#onChange = onChange;
    this.registry = registry;
    this.executions = executions;
    this.context = context;
    this.vault = vault;
    this.organization = organization;
  }

  create(input, actorId) {
    invariant(input && typeof input.workspaceId === "string" && input.workspaceId, "WORKSPACE_REQUIRED", "workspaceId is required");
    invariant(typeof input.objective === "string" && input.objective.trim(), "OBJECTIVE_REQUIRED", "objective is required");
    invariant(MISSION_TYPES.has(input.type), "INVALID_MISSION_TYPE", "mission type must be repository or research");
    this.organization?.get("workspaces", input.workspaceId);
    if (input.projectId) {
      const project = this.organization?.get("projects", input.projectId);
      invariant(project.workspaceId === input.workspaceId, "PROJECT_WORKSPACE_MISMATCH", "project must belong to the mission workspace", 409);
    }
    if (input.teamId) {
      const team = this.organization?.get("teams", input.teamId);
      invariant(team.workspaceId === input.workspaceId, "TEAM_WORKSPACE_MISMATCH", "team must belong to the mission workspace", 409);
    }
    if (input.conversationId) {
      const conversation = this.organization?.get("conversations", input.conversationId);
      invariant(conversation.workspaceId === input.workspaceId, "CONVERSATION_WORKSPACE_MISMATCH", "conversation must belong to the mission workspace", 409);
    }
    const tasks = input.type === "repository" ? repositoryPlan() : researchPlan();
    const budget = {
      maxTasks: input.budget?.maxTasks ?? 8,
      maxTotalAttempts: input.budget?.maxTotalAttempts ?? 12,
      maxRuntimeMs: input.budget?.maxRuntimeMs ?? 600_000,
      usedAttempts: 0,
    };
    invariant(Number.isInteger(budget.maxTasks) && budget.maxTasks >= tasks.length, "MISSION_TASK_BUDGET_EXCEEDED", "Mission plan exceeds maxTasks");
    invariant(Number.isInteger(budget.maxTotalAttempts) && budget.maxTotalAttempts >= tasks.length, "INVALID_ATTEMPT_BUDGET", "maxTotalAttempts must cover every planned task");
    invariant(Number.isInteger(budget.maxRuntimeMs) && budget.maxRuntimeMs > 0, "INVALID_RUNTIME_BUDGET", "maxRuntimeMs must be positive");
    for (const plannedTask of tasks) {
      this.registry?.get("personas", plannedTask.personaId);
      this.registry?.get("runtimes", plannedTask.runtimeId);
    }
    const now = new Date().toISOString();
    const acceptanceCriteria = [...new Set(input.acceptanceCriteria ?? ["Every task completed", "Verification evidence exists", "Final report is projected to the vault"])];
    invariant(acceptanceCriteria.length > 0 && acceptanceCriteria.every((criterion) => typeof criterion === "string" && criterion.trim()), "MISSION_ACCEPTANCE_REQUIRED", "At least one non-empty acceptance criterion is required");
    const mission = {
      id: randomUUID(), canonicalId: canonicalId("mission"), version: 1,
      workspaceId: input.workspaceId, organizationId: input.organizationId ?? "default-org",
      projectId: input.projectId ?? "default-project", teamId: input.teamId ?? "engineering-team",
      conversationId: input.conversationId ?? "default-conversation", type: input.type,
      hubId: input.type === "repository" ? "engineering" : "command",
      objective: input.objective.trim(), acceptanceCriteria,
      status: "awaiting-approval", tasks, budget, approvals: [], finalReportId: null,
      vaultProjection: null, createdBy: actorId, createdAt: now, updatedAt: now,
    };
    this.#missions.push(mission);
    this.#record(mission, "mission.created", actorId, { type: mission.type, tasks: tasks.length });
    this.organization?.appendMessage(mission.conversationId, { role: "user", content: mission.objective }, actorId);
    this.#changed();
    return structuredClone(mission);
  }

  approve(id, input, actorId) {
    const mission = this.#find(id);
    invariant(mission.status === "awaiting-approval", "MISSION_NOT_AWAITING_APPROVAL", `Mission is ${mission.status}`, 409);
    const sensitive = mission.tasks.filter((item) => item.sensitive);
    const requested = new Set(input?.taskIds?.length ? input.taskIds : sensitive.map((item) => item.id));
    invariant([...requested].every((taskId) => sensitive.some((item) => item.id === taskId)), "INVALID_APPROVAL_TASK", "Only sensitive tasks in this mission can be approved");
    for (const plannedTask of sensitive) if (requested.has(plannedTask.id)) plannedTask.approvalStatus = "approved";
    invariant(sensitive.every((item) => item.approvalStatus === "approved"), "SENSITIVE_TASK_APPROVAL_REQUIRED", "All sensitive tasks must be approved", 409);
    const approval = { id: randomUUID(), taskIds: [...requested], actorId, reason: input?.reason?.trim() ?? "Mission plan approved", occurredAt: new Date().toISOString() };
    mission.approvals.push(approval);
    mission.status = "approved";
    mission.updatedAt = approval.occurredAt;
    mission.version += 1;
    this.#record(mission, "mission.approved", actorId, { taskIds: approval.taskIds });
    this.#changed();
    return structuredClone(mission);
  }

  start(id, actorId) {
    const mission = this.#find(id);
    invariant(mission.status === "approved", "MISSION_NOT_APPROVED", "Mission must be approved before it starts", 409);
    mission.status = "running";
    mission.startedAt = new Date().toISOString();
    mission.updatedAt = mission.startedAt;
    mission.version += 1;
    this.#record(mission, "mission.started", actorId);
    this.#changed();
    return structuredClone(mission);
  }

  cancel(id, actorId, reason = "Mission cancelled") {
    const mission = this.#find(id);
    invariant(!TERMINAL_MISSION_STATES.has(mission.status), "MISSION_ALREADY_TERMINAL", `Mission is already ${mission.status}`, 409);
    for (const plannedTask of mission.tasks.filter((item) => item.executionId && ["running", "pending"].includes(item.status))) {
      const execution = this.executions.get(plannedTask.executionId);
      if (["proposed", "approved", "running"].includes(execution.status)) this.executions.transition(execution.id, { status: "cancelled", actorId, reason });
      plannedTask.status = "cancelled";
    }
    mission.status = "cancelled";
    mission.updatedAt = new Date().toISOString();
    mission.version += 1;
    this.#record(mission, "mission.cancelled", actorId, { reason });
    this.#changed();
    return structuredClone(mission);
  }

  retryTask(missionId, taskId, actorId) {
    const mission = this.#find(missionId);
    const plannedTask = mission.tasks.find((item) => item.id === taskId);
    invariant(plannedTask, "MISSION_TASK_NOT_FOUND", `Task ${taskId} was not found`, 404);
    invariant(plannedTask.status === "failed", "MISSION_TASK_NOT_FAILED", "Only a failed task can be retried", 409);
    invariant(mission.budget.usedAttempts < mission.budget.maxTotalAttempts, "MISSION_ATTEMPT_BUDGET_EXCEEDED", "Mission attempt budget is exhausted", 409);
    plannedTask.status = "pending";
    plannedTask.executionId = null;
    mission.status = "running";
    mission.updatedAt = new Date().toISOString();
    this.#record(mission, "task.retry-requested", actorId, { taskId });
    this.#changed();
    return structuredClone(mission);
  }

  async reconcile() {
    for (const mission of this.#missions.filter((item) => item.status === "running")) {
      await this.#reconcileMission(mission);
    }
  }

  get(id) {
    return structuredClone(this.#find(id));
  }

  list({ workspaceId, status } = {}) {
    return this.#missions
      .filter((mission) => !workspaceId || mission.workspaceId === workspaceId)
      .filter((mission) => !status || mission.status === status)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((mission) => structuredClone(mission));
  }

  events({ workspaceId } = {}) {
    return this.#events.filter((event) => !workspaceId || event.workspaceId === workspaceId).map((event) => structuredClone(event));
  }

  snapshot() {
    return { missions: structuredClone(this.#missions), events: structuredClone(this.#events) };
  }

  async #reconcileMission(mission) {
    let changed = false;
    if (Date.now() - Date.parse(mission.startedAt) > mission.budget.maxRuntimeMs) {
      for (const plannedTask of mission.tasks.filter((item) => item.executionId && item.status === "running")) {
        const execution = this.executions.get(plannedTask.executionId);
        if (["proposed", "approved", "running"].includes(execution.status)) this.executions.transition(execution.id, { status: "cancelled", actorId: "system:mission-authority", reason: "Mission runtime budget exceeded" });
        plannedTask.status = "cancelled";
      }
      mission.status = "failed";
      mission.failure = { code: "MISSION_RUNTIME_BUDGET_EXCEEDED", maxRuntimeMs: mission.budget.maxRuntimeMs };
      this.#record(mission, "mission.failed", "system:mission-authority", mission.failure);
      this.#touch(mission);
      return;
    }
    for (const plannedTask of mission.tasks.filter((item) => item.status === "running" && item.executionId)) {
      const execution = this.executions.get(plannedTask.executionId);
      if (execution.status === "completed") {
        this.#completeTask(mission, plannedTask, execution);
        changed = true;
      } else if (execution.status === "failed") {
        plannedTask.result = execution.result;
        if (plannedTask.attempts < plannedTask.maxAttempts && mission.budget.usedAttempts < mission.budget.maxTotalAttempts) {
          plannedTask.status = "pending";
          plannedTask.executionId = null;
          this.#record(mission, "task.retry-scheduled", "system:mission-authority", { taskId: plannedTask.id, attempts: plannedTask.attempts });
        } else {
          plannedTask.status = "failed";
          mission.status = "failed";
          mission.failure = { taskId: plannedTask.id, result: execution.result };
          this.#record(mission, "mission.failed", "system:mission-authority", mission.failure);
        }
        changed = true;
      } else if (execution.status === "cancelled") {
        plannedTask.status = "cancelled";
        mission.status = "cancelled";
        changed = true;
      }
    }

    if (mission.status !== "running") {
      if (changed) this.#touch(mission);
      return;
    }

    const ready = mission.tasks.filter((plannedTask) => plannedTask.status === "pending"
      && plannedTask.dependencies.every((dependency) => mission.tasks.find((candidate) => candidate.id === dependency)?.status === "completed")
      && plannedTask.approvalStatus !== "pending");
    for (const plannedTask of ready) {
      invariant(mission.budget.usedAttempts < mission.budget.maxTotalAttempts, "MISSION_ATTEMPT_BUDGET_EXCEEDED", "Mission attempt budget is exhausted", 409);
      const plan = {
        hubId: mission.hubId, workspaceId: mission.workspaceId, requestedBy: "system:mission-authority",
        generatedAt: new Date().toISOString(), runtimePreference: [plannedTask.runtimeId, "agas-sim"],
        assignments: [{ agentId: plannedTask.agentId, personaId: plannedTask.personaId, runtimeId: plannedTask.runtimeId, permissions: this.registry.get("personas", plannedTask.personaId).permissions }],
        warnings: [],
      };
      const execution = this.executions.propose(plan, { objective: `${mission.objective}\n\nTask: ${plannedTask.title}\nAcceptance: ${plannedTask.criteria}`, reason: `Mission ${mission.id} task ${plannedTask.id}` });
      this.executions.transition(execution.id, { status: "approved", actorId: "system:mission-authority", reason: `Approved mission task ${plannedTask.id}` });
      plannedTask.executionId = execution.id;
      plannedTask.status = "running";
      plannedTask.attempts += 1;
      mission.budget.usedAttempts += 1;
      this.#record(mission, "task.dispatched", "system:mission-authority", { taskId: plannedTask.id, executionId: execution.id, attempt: plannedTask.attempts });
      changed = true;
    }

    if (mission.tasks.every((plannedTask) => plannedTask.status === "completed")) {
      await this.#completeMission(mission);
      changed = true;
    }
    if (changed) this.#touch(mission);
  }

  #completeTask(mission, plannedTask, execution) {
    plannedTask.status = "completed";
    plannedTask.result = execution.result;
    plannedTask.completedAt = new Date().toISOString();
    const artifact = this.context.createArtifact({
      workspaceId: mission.workspaceId, principalId: "system:mission-authority",
      name: `${plannedTask.title} evidence`, type: plannedTask.type === "verification" ? "test-evidence" : "document",
      mediaType: "text/markdown",
      content: `# ${plannedTask.title}\n\n${execution.result?.summary ?? "Task completed"}\n\nAcceptance: ${plannedTask.criteria}\n`,
      provenance: { source: "mission-task", missionId: mission.id, taskId: plannedTask.id, executionId: execution.id },
    });
    plannedTask.artifactId = artifact.id;
    this.#record(mission, "task.completed", "system:mission-authority", { taskId: plannedTask.id, artifactId: artifact.canonicalId });

    for (const next of mission.tasks.filter((candidate) => candidate.dependencies.includes(plannedTask.id) && candidate.runtimeId !== plannedTask.runtimeId)) {
      const handoff = this.context.createHandoff({
        workspaceId: mission.workspaceId, principalId: "system:mission-authority",
        fromRuntimeId: plannedTask.runtimeId, toRuntimeId: next.runtimeId,
        fromAgentId: plannedTask.agentId, toAgentId: next.agentId,
        summary: `${plannedTask.title} completed; continue with ${next.title}.`,
        acceptanceCriteria: [next.criteria], artifactIds: [artifact.id],
      });
      this.context.resolveHandoff(handoff.id, { status: "accepted", principalId: "system:mission-authority", resolution: `Accepted for mission task ${next.id}` });
    }
  }

  async #completeMission(mission) {
    const verified = mission.tasks.every((plannedTask) => plannedTask.status === "completed" && plannedTask.artifactId && plannedTask.criteria);
    invariant(verified, "MISSION_VERIFICATION_FAILED", "Mission cannot complete without task evidence and criteria");
    const content = [
      `# Mission report: ${mission.objective}`,
      "", `Status: verified`, `Type: ${mission.type}`, `Attempts: ${mission.budget.usedAttempts}/${mission.budget.maxTotalAttempts}`,
      "", "## Acceptance criteria", ...mission.acceptanceCriteria.map((criterion) => `- [x] ${criterion}`),
      "", "## Task evidence", ...mission.tasks.map((plannedTask) => `- ${plannedTask.title}: ${plannedTask.artifactId}`),
    ].join("\n");
    const report = this.context.createArtifact({
      workspaceId: mission.workspaceId, principalId: "system:mission-authority", name: `Mission report: ${mission.objective.slice(0, 80)}`,
      type: "report", mediaType: "text/markdown", content,
      provenance: { source: "mission-authority", missionId: mission.id, verified: true },
    });
    mission.finalReportId = report.id;
    mission.status = "completed";
    mission.completedAt = new Date().toISOString();
    mission.verification = { passed: true, artifactIds: mission.tasks.map((plannedTask) => plannedTask.artifactId), verifiedAt: mission.completedAt };
    mission.vaultProjection = await this.vault.project({ workspaceId: mission.workspaceId, principalId: "system:mission-authority" });
    this.organization?.appendMessage(mission.conversationId, { role: "assistant", content: `Mission completed and verified. Report: ${report.canonicalId}` }, "system:mission-authority");
    this.#record(mission, "mission.completed", "system:mission-authority", { reportId: report.canonicalId, vaultFiles: mission.vaultProjection.files.length });
  }

  #find(id) {
    const mission = this.#missions.find((item) => item.id === id || item.canonicalId === id);
    invariant(mission, "MISSION_NOT_FOUND", `Mission ${id} was not found`, 404);
    return mission;
  }

  #touch(mission) {
    mission.updatedAt = new Date().toISOString();
    mission.version += 1;
    this.#changed();
  }

  #record(mission, type, actorId, data = {}) {
    this.#events.push({ id: randomUUID(), canonicalId: canonicalId("event"), workspaceId: mission.workspaceId, missionId: mission.id, type, actorId, data: structuredClone(data), occurredAt: new Date().toISOString() });
  }

  #changed() {
    this.#onChange?.(this.snapshot());
  }
}

export class MissionCoordinator {
  #timer = null;
  #busy = false;

  constructor({ missions, intervalMs = 500 }) {
    this.missions = missions;
    this.intervalMs = intervalMs;
  }

  start() {
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
      await this.missions.reconcile();
    } catch (error) {
      console.error("Mission coordinator failed to reconcile", error);
    } finally {
      this.#busy = false;
    }
  }
}

export { MISSION_TYPES };
