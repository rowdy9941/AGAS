const state = { token: sessionStorage.getItem("agas-token") ?? "", session: null, health: null, executions: [], missions: [], missionEvents: [], organizations: [], workspaces: [], projects: [], teams: [], conversations: [], runtimes: [], managedRuntimes: [], personas: [], hubs: [], selectedPersonas: [], artifacts: [], handoffs: [], mcpServices: [], mcpGrants: [], audit: [], view: "overview" };

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      authorization: `Bearer ${state.token}`,
      ...options.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? `Request failed (${response.status})`);
  return body;
}

function cell(row, value) {
  const element = document.createElement(row ? "td" : "th");
  element.textContent = value;
  return element;
}

function badge(status) {
  const element = document.createElement("span");
  element.className = `badge ${status}`;
  element.textContent = status;
  return element;
}

function renderTable(executions, container) {
  container.replaceChildren();
  if (!executions.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No executions yet.";
    container.append(empty);
    return;
  }
  const table = document.createElement("table");
  const header = document.createElement("tr");
  ["Objective", "Workspace", "Status", "Updated", "Actions"].forEach((value) => header.append(cell(false, value)));
  table.append(header);
  for (const execution of executions) {
    const row = document.createElement("tr");
    row.append(cell(true, execution.objective), cell(true, execution.plan.workspaceId));
    const statusCell = cell(true, ""); statusCell.append(badge(execution.status)); row.append(statusCell);
    row.append(cell(true, new Date(execution.updatedAt).toLocaleString()));
    const actions = cell(true, ""); actions.className = "actions";
    if (execution.status === "proposed" && state.session?.principal.role === "admin") actions.append(actionButton("Approve", () => transition(execution.id, "approved")));
    if (["proposed", "approved", "running"].includes(execution.status)) actions.append(actionButton("Cancel", () => transition(execution.id, "cancelled"), "danger"));
    row.append(actions); table.append(row);
  }
  container.append(table);
}

function actionButton(label, handler, type = "secondary") {
  const button = document.createElement("button");
  button.className = `button small ${type}`;
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function addPersona(personaId) {
  if (state.personas.some((persona) => persona.id === personaId) && !state.selectedPersonas.includes(personaId)) state.selectedPersonas.push(personaId);
  renderHubBuilder();
}

function removePersona(personaId) {
  state.selectedPersonas = state.selectedPersonas.filter((id) => id !== personaId);
  renderHubBuilder();
}

function personaCard(persona, { builder = false } = {}) {
  const card = document.createElement("div");
  card.className = builder ? "builder-persona" : "catalog-card";
  card.draggable = true;
  card.addEventListener("dragstart", (event) => event.dataTransfer.setData("text/plain", persona.id));
  const copy = document.createElement("div");
  const name = document.createElement("strong"); name.textContent = persona.name;
  const details = document.createElement(builder ? "small" : "p"); details.textContent = builder ? persona.tags?.join(" · ") : persona.description;
  copy.append(name, details); card.append(copy);
  const actions = document.createElement("div"); actions.className = "card-actions";
  actions.append(actionButton("Add", () => addPersona(persona.id), "secondary"));
  if (!builder) actions.append(actionButton("Hermes projection", () => showProjection(persona), "secondary"));
  card.append(actions);
  return card;
}

async function showProjection(persona) {
  try {
    const projection = await api(`/v1/personas/${persona.id}/projections/hermes`);
    $("#projection-title").textContent = `${persona.name} → Hermes`;
    $("#projection-output").textContent = JSON.stringify(projection, null, 2);
    $("#projection-panel").hidden = false;
  } catch (error) {
    $("#projection-title").textContent = "Projection failed";
    $("#projection-output").textContent = error.message;
    $("#projection-panel").hidden = false;
  }
}

function renderHubBuilder() {
  if (!state.session) return;
  $("#builder-personas").replaceChildren(...state.personas.map((persona) => personaCard(persona, { builder: true })));
  $("#selected-personas").replaceChildren(...state.selectedPersonas.map((personaId) => {
    const persona = state.personas.find((item) => item.id === personaId);
    const chip = document.createElement("span"); chip.className = "selected-persona";
    const label = document.createElement("span"); label.textContent = persona?.name ?? personaId;
    const remove = document.createElement("button"); remove.type = "button"; remove.setAttribute("aria-label", `Remove ${label.textContent}`); remove.textContent = "×"; remove.addEventListener("click", () => removePersona(personaId));
    chip.append(label, remove); return chip;
  }));
  $("#hub-list").replaceChildren(...state.hubs.map((hub) => {
    const card = document.createElement("div"); card.className = "hub-card";
    const heading = document.createElement("strong"); heading.textContent = hub.name;
    const details = document.createElement("p"); details.textContent = `${hub.roster.length} specialists · ${hub.runtimePreference.join(" → ")}`;
    const activate = actionButton("Activate plan", async () => {
      try {
        const plan = await api(`/v1/hubs/${hub.id}/activate`, { method: "POST", body: JSON.stringify({ workspaceId: $("#workspace").value || "default" }) });
        $("#hub-message").textContent = `${hub.name} activated with ${plan.assignments.length} compatible assignments.`;
      } catch (error) { $("#hub-message").textContent = error.message; }
    }, "primary");
    card.append(heading, details, activate); return card;
  }));
}

async function installRuntime(runtimeId) {
  await api(`/v1/runtimes/${runtimeId}/install`, { method: "POST", body: "{}" });
  await refresh();
}

function renderContext() {
  $("#artifact-list").replaceChildren(...state.artifacts.map((artifact) => {
    const card = document.createElement("div"); card.className = "catalog-card";
    const name = document.createElement("strong"); name.textContent = artifact.name;
    const details = document.createElement("p"); details.textContent = `${artifact.type} · v${artifact.version} · ${artifact.canonicalId}`;
    card.append(name, details); return card;
  }));
  const artifactSelect = $("#handoff-artifact");
  const selectedArtifact = artifactSelect.value;
  artifactSelect.replaceChildren(...state.artifacts.map((artifact) => {
    const option = document.createElement("option"); option.value = artifact.id; option.textContent = artifact.name; return option;
  }));
  if (state.artifacts.some((artifact) => artifact.id === selectedArtifact)) artifactSelect.value = selectedArtifact;

  $("#handoff-list").replaceChildren(...state.handoffs.map((handoff) => {
    const card = document.createElement("div"); card.className = "catalog-card";
    const heading = document.createElement("div"); heading.className = "panel-heading";
    const name = document.createElement("strong"); name.textContent = `${handoff.fromRuntimeId} → ${handoff.toRuntimeId}`;
    heading.append(name, badge(handoff.status));
    const details = document.createElement("p"); details.textContent = handoff.summary;
    card.append(heading, details);
    if (handoff.status === "pending") card.append(actionButton("Accept", async () => {
      await api(`/v1/context/handoffs/${handoff.id}/resolve`, { method: "POST", body: JSON.stringify({ status: "accepted", resolution: "Accepted from operator console" }) }); await refresh();
    }, "primary"));
    return card;
  }));
}

function renderMcp() {
  const serviceSelect = $("#mcp-service");
  const selectedService = serviceSelect.value;
  serviceSelect.replaceChildren(...state.mcpServices.map((service) => {
    const option = document.createElement("option"); option.value = service.id; option.textContent = service.name; return option;
  }));
  if (state.mcpServices.some((service) => service.id === selectedService)) serviceSelect.value = selectedService;
  $("#mcp-grant-list").replaceChildren(...state.mcpGrants.map((grant) => {
    const card = document.createElement("div"); card.className = "runtime-card";
    const title = document.createElement("strong"); title.textContent = `${grant.serviceId} → ${grant.runtimeId}`;
    const details = document.createElement("p"); details.textContent = grant.allowedTools.join(", ");
    card.append(title, details); return card;
  }));
}

async function missionAction(id, action) {
  try {
    const mission = await api(`/v1/missions/${id}/${action}`, { method: "POST", body: JSON.stringify(action === "approve" ? { reason: "Plan and sensitive tasks approved in operator console" } : {}) });
    $("#mission-message").textContent = `${mission.objective.slice(0, 48)} is ${mission.status}.`;
    await refresh();
  } catch (error) { $("#mission-message").textContent = error.message; }
}

function renderMissions() {
  const nodes = state.missions.map((mission) => {
    const card = document.createElement("article"); card.className = "mission-card";
    const heading = document.createElement("div"); heading.className = "panel-heading";
    const title = document.createElement("strong"); title.textContent = mission.objective;
    heading.append(title, badge(mission.status));
    const summary = document.createElement("p");
    const completed = mission.tasks.filter((item) => item.status === "completed").length;
    summary.textContent = `${mission.type} · ${completed}/${mission.tasks.length} tasks · ${mission.budget.usedAttempts}/${mission.budget.maxTotalAttempts} attempts`;
    const tasks = document.createElement("ol"); tasks.className = "task-list compact";
    for (const plannedTask of mission.tasks) {
      const item = document.createElement("li");
      const label = document.createElement("span"); label.textContent = plannedTask.title;
      item.append(label, badge(plannedTask.status === "pending" && plannedTask.approvalStatus === "pending" ? "approval required" : plannedTask.status));
      tasks.append(item);
    }
    const actions = document.createElement("div"); actions.className = "card-actions";
    if (mission.status === "awaiting-approval" && state.session?.principal.role === "admin") actions.append(actionButton("Approve sensitive tasks", () => missionAction(mission.id, "approve"), "primary"));
    if (mission.status === "approved") actions.append(actionButton("Start mission", () => missionAction(mission.id, "start"), "primary"));
    if (["awaiting-approval", "approved", "running"].includes(mission.status)) actions.append(actionButton("Cancel", () => missionAction(mission.id, "cancel"), "danger"));
    if (mission.status === "completed") {
      const report = document.createElement("p"); report.className = "verified-report";
      report.textContent = `Verified report ${mission.finalReportId} · ${mission.vaultProjection?.files.length ?? 0} vault files`;
      card.append(heading, summary, tasks, report, actions);
    } else card.append(heading, summary, tasks, actions);
    return card;
  });
  if (!nodes.length) {
    const empty = document.createElement("p"); empty.className = "muted"; empty.textContent = "No missions yet."; nodes.push(empty);
  }
  $("#mission-list").replaceChildren(...nodes);
}

function renderOrganization() {
  $("#organization-list").replaceChildren(...[...state.workspaces, ...state.teams].map((record) => {
    const card = document.createElement("div"); card.className = "runtime-card";
    const title = document.createElement("strong"); title.textContent = record.name;
    const details = document.createElement("p"); details.textContent = `${record.canonicalId}${record.hubIds ? ` · ${record.hubIds.join(", ")}` : ""}`;
    card.append(title, details); return card;
  }));
  $("#project-list").replaceChildren(...state.projects.map((project) => {
    const card = document.createElement("div"); card.className = "catalog-card";
    const title = document.createElement("strong"); title.textContent = project.name;
    const details = document.createElement("p"); details.textContent = `${project.id} · ${project.description ?? "No description"}`;
    card.append(title, details); return card;
  }));
}

function renderConversations() {
  const select = $("#conversation-id"); const previous = select.value;
  select.replaceChildren(...state.conversations.map((conversation) => {
    const option = document.createElement("option"); option.value = conversation.id; option.textContent = conversation.title ?? conversation.name; return option;
  }));
  if (state.conversations.some((conversation) => conversation.id === previous)) select.value = previous;
  $("#conversation-list").replaceChildren(...state.conversations.map((conversation) => {
    const card = document.createElement("div"); card.className = "catalog-card";
    const title = document.createElement("strong"); title.textContent = conversation.title ?? conversation.name;
    const details = document.createElement("p"); details.textContent = `${conversation.messages.length} messages · ${conversation.projectId ?? "No project"}`;
    const latest = document.createElement("p"); latest.textContent = conversation.messages.at(-1)?.content ?? "No messages yet.";
    card.append(title, details, latest); return card;
  }));
}

async function transition(id, status) {
  await api(`/v1/executions/${id}/transitions`, { method: "POST", body: JSON.stringify({ status, reason: `${status} from operator console` }) });
  await refresh();
}

function render() {
  $("#login-panel").hidden = Boolean(state.session);
  $("#app-content").hidden = !state.session;
  $("#connection-dot").classList.toggle("online", Boolean(state.session));
  $("#connection-label").textContent = state.session ? `${state.session.principal.role} · connected` : "Disconnected";
  if (!state.session) return;

  const counts = state.health.registry;
  const cards = [["Runtimes", counts.runtimes], ["Specialists", counts.personas], ["Missions", state.missions.length], ["Active", state.missions.filter((item) => item.status === "running").length]];
  $("#stats").replaceChildren(...cards.map(([label, value]) => {
    const node = document.createElement("div"); node.className = "stat";
    const span = document.createElement("span"); span.textContent = label;
    const strong = document.createElement("strong"); strong.textContent = value;
    node.append(span, strong); return node;
  }));
  $("#system-details").replaceChildren(...[["Version", state.health.version], ["Role", state.session.principal.role], ["Service", state.health.service], ["Workspace grants", state.session.principal.workspaceIds.join(", ")]].flatMap(([term, description]) => {
    const wrapper = document.createElement("div");
    const dt = document.createElement("dt"); dt.textContent = term;
    const dd = document.createElement("dd"); dd.textContent = description;
    wrapper.append(dt, dd); return wrapper;
  }));
  renderTable(state.executions.slice(0, 5), $("#recent-executions"));
  const filter = $("#status-filter").value;
  renderTable(state.executions.filter((item) => !filter || item.status === filter), $("#execution-list"));

  $("#runtime-list").replaceChildren(...state.runtimes.map((runtime) => {
    const card = document.createElement("div"); card.className = "runtime-card";
    const heading = document.createElement("div"); heading.className = "panel-heading";
    const name = document.createElement("strong"); name.textContent = runtime.runtimeId;
    heading.append(name, badge(runtime.installed ? "installed" : "unavailable"));
    const version = document.createElement("p"); version.textContent = runtime.installed ? (runtime.version ?? runtime.diagnostic ?? "Detected") : "Not found on PATH";
    card.append(heading, version); return card;
  }));
  $("#managed-runtime-list").replaceChildren(...state.managedRuntimes.map((runtime) => {
    const card = document.createElement("div"); card.className = "runtime-card";
    const heading = document.createElement("div"); heading.className = "panel-heading";
    const name = document.createElement("strong"); name.textContent = `${runtime.runtimeId} ${runtime.version}`;
    heading.append(name, badge(runtime.installed ? "installed" : "available"));
    const details = document.createElement("p"); details.textContent = `${runtime.source} · ${runtime.checksum}`;
    card.append(heading, details);
    if (!runtime.installed && state.session.principal.role === "admin") card.append(actionButton("Install", () => installRuntime(runtime.runtimeId), "primary"));
    return card;
  }));

  const catalogQuery = $("#catalog-search").value.trim().toLowerCase();
  const filteredPersonas = state.personas.filter((persona) => !catalogQuery || JSON.stringify(persona).toLowerCase().includes(catalogQuery));
  $("#catalog-list").replaceChildren(...filteredPersonas.map((persona) => personaCard(persona)));
  renderHubBuilder();
  renderContext();
  renderMcp();
  renderMissions();
  renderOrganization();
  renderConversations();
  $("#settings-details").replaceChildren(...[["Version", state.health.version], ["Role", state.session.principal.role], ["Workspace", state.workspaces[0]?.name ?? "default"], ["Mission events", String(state.missionEvents.length)]].flatMap(([term, description]) => {
    const wrapper = document.createElement("div"); const dt = document.createElement("dt"); const dd = document.createElement("dd");
    dt.textContent = term; dd.textContent = description; wrapper.append(dt, dd); return wrapper;
  }));

  $("#audit-list").replaceChildren(...state.audit.map((event) => {
    const item = document.createElement("li");
    const text = document.createElement("strong"); text.textContent = `${event.from ?? "created"} → ${event.to}`;
    const details = document.createElement("p"); details.textContent = `${event.actorId}${event.reason ? ` · ${event.reason}` : ""}`;
    const time = document.createElement("time"); time.dateTime = event.occurredAt; time.textContent = new Date(event.occurredAt).toLocaleString();
    item.append(text, details, time); return item;
  }));
}

async function refresh() {
  if (!state.token) return;
  try {
    const [health, session, executions, missions, missionEvents, organizations, workspaces, projects, teams, conversations, runtimes, managedRuntimes, personas, hubs, artifacts, handoffs, mcpServices, mcpGrants, audit] = await Promise.all([
      fetch("/healthz").then((response) => response.json()),
      api("/v1/session"), api("/v1/executions"), api("/v1/missions?workspaceId=default"), api("/v1/mission-events?workspaceId=default"),
      api("/v1/organizations"), api("/v1/workspaces?workspaceId=default"), api("/v1/projects?workspaceId=default"), api("/v1/teams?workspaceId=default"), api("/v1/conversations?workspaceId=default"),
      api("/v1/runtimes/detect"), api("/v1/runtimes/managed"),
      api("/v1/catalog/search?kind=personas&limit=500"), api("/v1/hubs"),
      api("/v1/context/artifacts?workspaceId=default"), api("/v1/context/handoffs?workspaceId=default"),
      api("/v1/registry/mcpServers"), api("/v1/mcp/grants?workspaceId=default"), api("/v1/audit"),
    ]);
    Object.assign(state, { health, session, executions: executions.items, missions: missions.items, missionEvents: missionEvents.items, organizations: organizations.items, workspaces: workspaces.items, projects: projects.items, teams: teams.items, conversations: conversations.items, runtimes: runtimes.runtimes, managedRuntimes: managedRuntimes.items, personas: personas.items, hubs: hubs.items, artifacts: artifacts.items, handoffs: handoffs.items, mcpServices: mcpServices.items, mcpGrants: mcpGrants.items, audit: audit.items.reverse() });
    render();
  } catch (error) {
    state.session = null;
    $("#login-error").textContent = error.message;
    render();
  }
}

function showView(view) {
  state.view = view;
  $$(".view").forEach((element) => { element.hidden = element.id !== `${view}-view`; });
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  const titles = { overview: "Overview", missions: "Missions", projects: "Projects & Teams", conversations: "Conversations", runtimes: "Runtimes", catalog: "Catalog", hubs: "Hub Builder", context: "Context Fabric", mcp: "MCP & Vault", executions: "Executions", audit: "Audit", settings: "Settings" };
  $("#page-title").textContent = titles[view] ?? view;
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault(); state.token = $("#token").value; sessionStorage.setItem("agas-token", state.token); $("#login-error").textContent = ""; await refresh();
});
$("#mission-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const mission = await api("/v1/missions", { method: "POST", body: JSON.stringify({
      workspaceId: "default", organizationId: "default-org", projectId: "default-project", teamId: "engineering-team", conversationId: "default-conversation",
      type: $("#mission-type").value, objective: $("#mission-objective").value,
      acceptanceCriteria: ["Planned tasks complete", "Evidence and handoffs recorded", "Verification report passes"],
    }) });
    $("#mission-message").textContent = `Created ${mission.tasks.length}-task plan. Review and approve the sensitive task.`;
    $("#mission-objective").value = ""; await refresh();
  } catch (error) { $("#mission-message").textContent = error.message; }
});
$("#project-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const project = await api("/v1/projects", { method: "POST", body: JSON.stringify({ id: $("#project-id").value, name: $("#project-name").value, description: $("#project-description").value, workspaceId: "default" }) });
    $("#project-message").textContent = `Created ${project.name}.`; await refresh();
  } catch (error) { $("#project-message").textContent = error.message; }
});
$("#conversation-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api(`/v1/conversations/${$("#conversation-id").value}/messages`, { method: "POST", body: JSON.stringify({ role: "user", content: $("#conversation-content").value }) });
    $("#conversation-message").textContent = "Message added to durable context."; $("#conversation-content").value = ""; await refresh();
  } catch (error) { $("#conversation-message").textContent = error.message; }
});
$("#execution-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const execution = await api("/v1/executions", { method: "POST", body: JSON.stringify({ hubId: "engineering", workspaceId: $("#workspace").value, objective: $("#objective").value, workingDirectory: $("#working-directory").value }) });
    $("#execution-message").textContent = `Proposed ${execution.id.slice(0, 8)}. An administrator can approve it.`;
    $("#objective").value = ""; await refresh();
  } catch (error) { $("#execution-message").textContent = error.message; }
});
$("#hub-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const hub = await api("/v1/hubs", { method: "POST", body: JSON.stringify({
      id: $("#hub-id").value,
      name: $("#hub-name").value,
      personaIds: state.selectedPersonas,
      runtimePreference: ["hermes", "codex", "opencode", "agas-sim"],
    }) });
    $("#hub-message").textContent = `Saved ${hub.name} with ${hub.roster.length} specialists.`;
    await refresh();
  } catch (error) { $("#hub-message").textContent = error.message; }
});
$("#artifact-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const artifact = await api("/v1/context/artifacts", { method: "POST", body: JSON.stringify({ workspaceId: "default", name: $("#artifact-name").value, type: "document", content: $("#artifact-content").value }) });
    $("#artifact-message").textContent = `Created ${artifact.canonicalId}.`;
    $("#artifact-content").value = ""; await refresh();
  } catch (error) { $("#artifact-message").textContent = error.message; }
});
$("#handoff-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const handoff = await api("/v1/context/handoffs", { method: "POST", body: JSON.stringify({
      workspaceId: "default", fromRuntimeId: $("#handoff-from").value, toRuntimeId: $("#handoff-to").value,
      fromAgentId: "architect", toAgentId: "implementer", summary: $("#handoff-summary").value,
      acceptanceCriteria: ["Evidence accepted"], artifactIds: [$("#handoff-artifact").value],
    }) });
    $("#handoff-message").textContent = `Created ${handoff.canonicalId}.`; await refresh();
  } catch (error) { $("#handoff-message").textContent = error.message; }
});
$("#mcp-service-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const service = await api("/v1/mcp/services", { method: "POST", body: JSON.stringify({
      id: $("#mcp-id").value, name: $("#mcp-name").value, transport: "http", endpoint: $("#mcp-endpoint").value,
      tools: $("#mcp-tools").value.split(",").map((item) => item.trim()).filter(Boolean), secretRef: $("#mcp-secret-ref").value || null,
    }) });
    $("#mcp-service-message").textContent = `Registered ${service.id}.`; await refresh();
  } catch (error) { $("#mcp-service-message").textContent = error.message; }
});
$("#mcp-grant-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const grant = await api("/v1/mcp/grants", { method: "POST", body: JSON.stringify({
      serviceId: $("#mcp-service").value, runtimeId: $("#mcp-runtime").value, workspaceId: "default",
      allowedTools: $("#mcp-allowed-tools").value.split(",").map((item) => item.trim()).filter(Boolean),
    }) });
    $("#mcp-grant-message").textContent = `Granted ${grant.allowedTools.join(", ")} to ${grant.runtimeId}.`; await refresh();
  } catch (error) { $("#mcp-grant-message").textContent = error.message; }
});
$("#vault-project-button").addEventListener("click", async () => {
  try {
    const projection = await api("/v1/vault/project", { method: "POST", body: JSON.stringify({ workspaceId: "default" }) });
    $("#vault-output").textContent = JSON.stringify(projection, null, 2);
  } catch (error) { $("#vault-output").textContent = error.message; }
});
const dropzone = $("#hub-dropzone");
dropzone.addEventListener("dragover", (event) => { event.preventDefault(); dropzone.classList.add("dragging"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragging"));
dropzone.addEventListener("drop", (event) => { event.preventDefault(); dropzone.classList.remove("dragging"); addPersona(event.dataTransfer.getData("text/plain")); });
$("#refresh-button").addEventListener("click", refresh);
$("#detect-button").addEventListener("click", refresh);
$("#status-filter").addEventListener("change", render);
$("#catalog-search").addEventListener("input", render);
$$(".nav-item").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
$$('[data-jump]').forEach((button) => button.addEventListener("click", () => showView(button.dataset.jump)));

if (state.token) refresh(); else render();
setInterval(() => {
  if (state.session && ["overview", "executions", "audit"].includes(state.view)) void refresh();
}, 3_000);
