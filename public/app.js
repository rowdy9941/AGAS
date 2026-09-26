const $=selector=>document.querySelector(selector);
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const state={data:null,view:"overview",hub:null,missionId:null,detail:null,inspected:null,search:"",onlyImported:true,windowId:"hermes",windowUrl:null,token:sessionStorage.getItem("agas-token")||""};
const titles={overview:"Mission control",organization:"Organization",goals:"Goals",projects:"Projects",missions:"Missions",mission:"Mission",hubs:"Hubs",agents:"Agents",windows:"Agent windows",knowledge:"Knowledge & vault",activity:"Activity"};
let noticeTimer;
function notify(message,error=false){const node=$("#notice");node.textContent=message;node.style.background=error?"#542d32":"";clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>node.textContent="",5000)}
async function api(path,options={}) {
  const result=await fetch(path,{...options,headers:{authorization:`Bearer ${state.token}`,...(options.body?{"content-type":"application/json"}:{}),...(options.headers||{})}});
  const payload=await result.json();
  if(!result.ok)throw new Error(payload.error||`Request failed (${result.status})`);
  return payload;
}
async function refresh(){state.data=await api("/api/overview");if(state.view==="mission"&&state.missionId)state.detail=await api(`/api/missions/${state.missionId}`);$("#login-overlay").classList.add("hidden");render()}
const hubs=()=>state.data?.hubs||[];
const hub=id=>hubs().find(item=>item.id===id);
const missions=id=>state.data.missions.filter(item=>!id||item.hub_id===id);
const sourceIcon=division=>({engineering:"⌘",marketing:"◈",finance:"◉",healthcare:"✳",security:"⬡",testing:"✓",design:"✦",specialized:"◇",research:"◎"}[division]||"✦");
function setView(view,hubId=null) {
  state.view=view;state.hub=hubId;state.missionId=null;state.detail=null;state.inspected=null;
  render();$("#main").focus({preventScroll:true});
  if(window.innerWidth<800)window.scrollTo({top:0,behavior:"smooth"});
}
async function openMission(id){
  try {const detail=await api(`/api/missions/${encodeURIComponent(id)}`);state.view="mission";state.missionId=id;state.detail=detail;state.inspected=null;render();$("#main").focus({preventScroll:true})}
  catch(error){notify(error.message,true)}
}
function heading(label,title,description,extra="") {
  return `<div class="page-head"><div><span class="eyebrow">${esc(label)}</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${extra}</div>`;
}
function eventRows(events) {
  return events.length?events.map(item=>`<div class="row"><div class="avatar-small">◷</div><div class="row-main"><strong>${esc(item.description)}</strong><small>${esc(item.type)} · ${esc(new Date(item.occurred_at).toLocaleString())}</small></div></div>`).join(""):`<div class="empty">Activity will appear when you create a mission, message, or note.</div>`;
}
function missionRows(list) {
  return list.length?list.map(item=>`<button class="card mission-card" data-action="open-mission" data-id="${esc(item.id)}"><span class="avatar-small">${esc(hub(item.hub_id)?.icon)}</span><span class="row-main"><strong>${esc(item.title)}</strong><small>${esc(hub(item.hub_id)?.name)} · ${esc(item.criteria.length)} criteria · ${esc(item.project||"No project")}</small></span><span class="badge ${item.status==="accepted"?"":"warn"}">${esc(item.status)}</span></button>`).join(""):`<div class="empty">No missions yet. Create one with clear acceptance criteria to start tracking work.</div>`;
}
function missionsPage(){
  return heading("DURABLE WORK","Missions","Plan tasks, collect actual artifacts and review evidence. Owner acceptance is recorded separately from independent verification.",`<button class="primary" data-action="new-mission">+ New mission</button>`)+
    `<div class="mission-table">${missionRows(state.data.missions)}</div>`;
}
function missionPage(){
  const d=state.detail;if(!d)return `<div class="empty">Loading mission…</div>`;
  const {mission:m,tasks,evidence,runs,artifacts,reviewBranches}=d,open=!(["accepted","cancelled"].includes(m.status));
  const linkedProject=state.data.projects.find(p=>p.id===m.project);
  const criterionRows=m.criteria.map((criterion,index)=>{
    const items=evidence.filter(e=>e.criterion_index===index),reviewed=items.filter(e=>e.status==="reviewed"&&tasks.some(t=>t.id===e.task_id&&t.status==="accepted"));
    return `<article class="criterion"><span class="badge ${reviewed.length?"":"warn"}">${reviewed.length?"Owner reviewed":"Evidence required"}</span><strong>${index+1}. ${esc(criterion)}</strong><small>${items.length} submission${items.length===1?"":"s"}</small></article>`;
  }).join("");
  return heading(`MISSION · ${hub(m.hub_id)?.name||m.hub_id}`,m.title,m.objective,`<span class="head-count">${esc(m.status)} · revision ${m.version}</span>`)+
    `<div class="mission-actions"><button class="secondary" data-action="view" data-id="missions">← All missions</button><button class="secondary" data-action="refresh-mission">Refresh</button>${open?`<button class="primary" data-action="new-task">+ Add task</button><button class="secondary" data-action="cancel-mission">Cancel mission</button>`:""}</div>`+
    `<div class="split"><section class="panel"><h3>Acceptance criteria</h3><p class="helper">AGAS checks recorded file and text output hashes. The owner still judges whether a result proves a criterion.</p><p class="helper">Goal: ${esc(state.data.goals.find(g=>g.id===m.goal_id)?.title||"Not linked")}</p><div class="criteria-list">${criterionRows}</div></section><section class="panel"><h3>Decision</h3><p class="helper">Owner acceptance requires reviewed evidence for every criterion. Recorded file or text bytes are verified when linked to a completed run; semantic and external claims still require independent checks.</p>${open?`<button class="primary" data-action="accept-mission">Record owner acceptance</button>`:`<span class="badge">${esc(m.status)}</span>`}</section></div>`+
    `<div class="section-head"><h2>Task queue</h2><span>${tasks.length} tasks</span></div><div class="mission-table">${tasks.length?tasks.map(t=>{const a=state.data.assignments.find(item=>item.id===t.assignment_id),ready=state.data.runtimes.find(item=>item.id===a?.runtime)?.ready;return `<article class="card work-card"><div><strong>${esc(t.title)}</strong><p>${esc(t.objective)}</p><small>${a?`${esc(a.runtime)} specialist · ${ready?"runtime ready":"runtime not ready"}`:"No runtime assigned · manual planning"}${d.dependencies.filter(dep=>dep.task_id===t.id).map(dep=>` · after ${esc(tasks.find(item=>item.id===dep.prerequisite_id)?.title||dep.prerequisite_id)}`).join("")}${t.required_handoff_id?` · requires ${esc(d.handoffs.find(h=>h.id===t.required_handoff_id)?.title||t.required_handoff_id)} (${esc(d.handoffs.find(h=>h.id===t.required_handoff_id)?.status||"missing")})`:""}</small></div><div class="work-actions"><span class="badge ${t.status==="accepted"?"":"warn"}">${esc(t.status)}</span>${open&&["queued","blocked"].includes(t.status)&&ready&&((m.hub_id==="dev"&&["codex","opencode"].includes(a?.runtime)&&linkedProject?.repository_path)||(m.hub_id!=="dev"&&["opencode","openclaw"].includes(a?.runtime)))?`<button class="primary" data-action="launch-run" data-id="${esc(t.id)}">Run ${esc(a.runtime)}</button>`:""}${open&&t.status!=="accepted"&&t.status!=="running"?`<button class="secondary" data-action="add-evidence" data-id="${esc(t.id)}">Submit evidence</button>${t.status==="awaiting-review"?`<button class="secondary" data-action="accept-task" data-id="${esc(t.id)}">Accept task</button>`:""}`:""}</div></article>`}).join(""):`<div class="panel empty">Add a bounded task and assign a specialist. Dev code runs need a linked Git repository. Other hubs can run bounded text tasks with a ready OpenCode or restricted OpenClaw CLI.</div>`}</div>`+
    `<div class="section-head"><h2>Agent runs</h2><span>${runs.length} attempts</span></div><div class="mission-table">${runs.length?runs.map(r=>`<article class="card work-card"><div><strong>${esc(r.runtime)} · ${esc(r.status)}</strong><p>${esc(r.result||"Preparing or executing in an isolated worktree.")}</p><small>Run ${esc(r.id)} · ${esc(r.base_commit||"base pending")} · ${esc(r.workspace||"workspace pending")}</small></div><div class="work-actions"><span class="badge ${r.status==="succeeded"?"":"warn"}">${esc(r.status)}</span><button class="secondary" data-action="inspect-run" data-id="${esc(r.id)}">Inspect run</button>${open&&m.hub_id!=="dev"&&r.status==="succeeded"&&r.output_sha256?`<button class="secondary" data-action="prove-output" data-id="${esc(r.id)}">Use output as evidence</button>`:""}${m.hub_id==="dev"&&m.status==="accepted"&&r.status==="succeeded"?reviewBranches.find(item=>item.run_id===r.id)?`<small>Review branch: ${esc(reviewBranches.find(item=>item.run_id===r.id).branch)}</small>`:`<button class="secondary" data-action="review-branch" data-id="${esc(r.id)}">Create review branch</button>`:""}${open&&["queued","starting","running"].includes(r.status)?`<button class="secondary" data-action="stop-run" data-id="${esc(r.id)}">Stop</button>`:""}</div></article>`).join(""):`<div class="panel empty">No agent run has been launched for this mission.</div>`}</div>`+
    `<div class="section-head"><h2>Recorded files</h2><span>${artifacts.filter(a=>a.status==="recorded").length} hashed</span></div><div class="mission-table">${artifacts.length?artifacts.map(a=>`<article class="card work-card"><div><strong>${esc(a.path)}</strong><small>${esc(a.status)} · ${esc(a.sha256||"no hash")} · ${esc(a.bytes??"?")} bytes</small></div><div class="work-actions">${open&&a.status==="recorded"&&runs.find(r=>r.id===a.run_id)?.status==="succeeded"?`<button class="secondary" data-action="prove-artifact" data-id="${esc(a.run_id)}" data-path="${esc(a.path)}">Use as evidence</button>`:""}</div></article>`).join(""):`<div class="panel empty">Completed runs will list changed files and their hashes here.</div>`}</div>`+
    `<div class="section-head"><h2>Evidence ledger</h2><span>${evidence.length} entries</span></div><div class="mission-table">${evidence.length?evidence.map(e=>`<article class="card evidence-card"><div><strong>${esc(e.title)}</strong><small>Criterion ${e.criterion_index+1} · ${esc(e.kind)} · SHA-256 ${esc(e.sha256)}${e.verification==="file-hash-verified"?" · recorded file hash verified":e.verification==="runtime-output-hash-verified"?" · runtime text hash verified":" · unverified submission"}</small><p>${esc(e.content)}</p>${e.review_note?`<p>Owner review: ${esc(e.review_note)}</p>`:""}</div><div class="work-actions"><span class="badge ${e.status==="reviewed"?"":"warn"}">${esc(e.status)}</span>${open&&e.status==="submitted"?`<button class="secondary" data-action="review-evidence" data-id="${esc(e.id)}">Review</button>`:""}</div></article>`).join(""):`<div class="panel empty">No evidence submitted. Completing a task requires real output and owner review.</div>`}</div>`;
}
function handoffsPanel(d) {
  const {mission:m,handoffs}=d;
  const approved=d.evidence.some(e=>e.status==="reviewed"&&d.tasks.some(t=>t.id===e.task_id&&t.status==="accepted"));
  const targets=state.data.missions.some(other=>other.hub_id!==m.hub_id&&!["accepted","cancelled"].includes(other.status));
  const action=m.status==="accepted"&&approved&&targets?'<button class="secondary" data-action="offer-handoff">Offer reviewed evidence →</button>':"";
  const rows=handoffs.map(h=>`<article class="card work-card"><div><strong>${esc(h.title)}</strong><p>${esc(h.purpose)}</p><small>${esc(h.from_hub_id)} → ${esc(h.to_hub_id)} · ${esc(h.source_evidence_title)} · SHA-256 ${esc(h.evidence_sha256)}</small>${h.response_note?`<p>Response: ${esc(h.response_note)}</p>`:""}</div><div class="work-actions"><span class="badge ${h.status==="accepted"?"":"warn"}">${esc(h.status)}</span>${h.target_mission_id===m.id&&h.status==="offered"?`<button class="secondary" data-action="review-handoff" data-id="${esc(h.id)}">Inspect & review</button>`:""}<button class="ghost" data-action="open-mission" data-id="${esc(h.source_mission_id===m.id?h.target_mission_id:h.source_mission_id)}">${h.source_mission_id===m.id?"Receiving":"Source"} mission →</button></div></article>`).join("");
  return `<div class="section-head"><h2>Cross-hub handoffs</h2>${action}</div><div class="mission-table">${rows||'<div class="panel empty">No evidence handoffs for this mission yet.</div>'}</div>`;
}
function dashboard() {
  const d=state.data;
  const stats=[["Hubs",hubs().length,"Permanent departments"],["Projects",d.projects.length,"Owned by a hub"],["Open missions",d.missions.filter(m=>m.status!=="accepted").length,"Intake and active work"],["Agency roles",d.personas.length,`of ${d.agency.count} catalogued`]];
  return heading("ONE ORGANIZATION · ONE WORKSPACE","Mission control","Your goals, teams and knowledge in one place. Current work is shown as it really stands.")+
    `<section class="intro"><img src="/assets/agas-logo.jpg" alt=""><div><h2>Build with your entire organization.</h2><p>Speak to a hub chief, give a team a mission, or inspect the evidence. Runtimes and CEOs remain unbound until you connect them.</p></div><button class="primary" data-action="new-mission">Create mission →</button></section>`+
    `<div class="stat-grid" style="margin-top:25px">${stats.map(([label,value,detail])=>`<div class="stat"><span class="stat-label">${esc(label)}</span><strong>${value}</strong><small>${esc(detail)}</small></div>`).join("")}</div>`+
    `<div class="section-head"><h2>Explore your hubs</h2><span>Seven permanent teams</span></div><div class="hub-grid">${hubs().map(h=>`<button class="card hub-card" data-action="hub" data-id="${esc(h.id)}" data-accent="${esc(h.accent)}"><span class="avatar">${esc(h.icon)}</span><strong>${esc(h.name)}</strong><small>${esc(h.mandate)}</small><div class="count">${missions(h.id).length} missions · CEO awaiting runtime →</div></button>`).join("")}</div>`+
    `<div class="section-head"><h2>Recent missions</h2><button class="ghost" data-action="new-mission">+ New mission</button></div><div class="mission-table">${missionRows(d.missions.slice(0,5))}</div>`+
    `<div class="section-head"><h2>Latest activity</h2><button class="ghost" data-action="view" data-id="activity">View all →</button></div><div class="panel list">${eventRows(d.events.slice(0,4))}</div>`;
}
function organization() {
  const d=state.data;
  return heading("STRUCTURE & RESPONSIBILITY","Your organization","One executive coordinates seven hub CEOs. Team roles wake for tasks; no agent is currently running.")+
    `<div class="panel organization-map"><div class="executive">✦ AGAS Executive<small>Identity persistent · runtime unbound</small></div><div class="org-stem"></div><div class="chief-grid">${hubs().map(h=>`<button class="card chief-card" data-action="hub" data-id="${esc(h.id)}"><strong>${esc(h.icon)} &nbsp; ${esc(h.name)} CEO</strong><small>${esc(h.mandate)} · unbound</small></button>`).join("")}</div></div>`+
    `<div class="split"><div class="panel"><h3>Executive feed</h3><div class="list">${eventRows(d.events.filter(e=>e.type==="ceo.inbox").slice(0,5))}</div></div><div class="panel"><h3>How a team works</h3><p class="helper">Ask a CEO directly → register a scoped request → assign a connected assistant → produce an artifact and evidence → accept the outcome → summarize it to the executive. When a runtime is connected, a CEO can reply within its hub context and log an executive event.</p><button class="secondary" data-action="view" data-id="agents">Browse specialists →</button></div></div>`;
}
function goalsPage() {
  const d=state.data;
  return heading("PURPOSE & ACCOUNTABILITY","Goals","Organization and hub goals link projects, missions and accepted outcomes.",`<button class="primary" data-action="new-goal">+ New goal</button>`)+
    `<div class="mission-table">${d.goals.length?d.goals.map(g=>`<article class="card work-card"><div><strong>${esc(g.title)}</strong><p>${esc(g.objective)}</p><small>${g.parent_id?`Child of ${esc(d.goals.find(item=>item.id===g.parent_id)?.title||g.parent_id)} · `:""}${esc(g.hub_id?hub(g.hub_id)?.name:"Organization")} · ${esc(g.project_id?d.projects.find(item=>item.id===g.project_id)?.title:"All projects")} · Measure: ${esc(g.measure)}</small><small>${d.missions.filter(m=>m.goal_id===g.id).length} linked missions</small></div><div class="work-actions"><span class="badge ${g.status==="achieved"?"":"warn"}">${esc(g.status)}</span>${g.status==="active"?`<button class="secondary" data-action="achieve-goal" data-id="${esc(g.id)}">Mark achieved</button>`:""}</div></article>`).join(""):`<div class="panel empty">Create an organization or hub goal, then link a mission to it.</div>`}</div>`;
}
function projectsPage() {
  const projects=state.data.projects;
  return heading("ONE ORGANIZATION","Projects","Organize each software product, media brand, research program or ongoing venture under a responsible hub.",
    `<button class="primary" data-action="new-project">+ New project</button>`)+
    `<div class="hub-grid">${projects.length?projects.map(p=>`<article class="card hub-card" data-accent="${esc(hub(p.hub_id)?.accent)}"><span class="avatar">${esc(hub(p.hub_id)?.icon)}</span><strong>${esc(p.title)}</strong><small>${esc(p.description)}</small><div class="count">${esc(hub(p.hub_id)?.name)} · ${esc(p.kind)} · ${state.data.missions.filter(m=>m.project===p.id).length} missions</div>${p.hub_id==="dev"&&p.kind==="software"?`<div class="count">${p.repository_path?`Git root: ${esc(p.repository_path)}`:"Git repository not linked"} · Monthly run quota: ${esc(p.monthly_run_limit??"unset")}</div><button class="secondary" data-action="link-repo" data-id="${esc(p.id)}">${p.repository_path?"Change":"Link"} Git repository</button><button class="secondary" data-action="run-limit" data-id="${esc(p.id)}">Set run quota</button>`:""}</article>`).join(""):`<div class="panel empty">No projects yet. Add your first media brand or software product to give missions and knowledge a permanent home.</div>`}</div>`;
}
function hubsPage() {
  if(!state.hub)return heading("YOUR DEPARTMENTS","Seven hubs","Each permanent hub has its own CEO inbox, missions and specialist team.")+
    `<div class="hub-grid">${hubs().map(h=>`<button class="card hub-card" data-action="hub" data-id="${esc(h.id)}" data-accent="${esc(h.accent)}"><span class="avatar">${esc(h.icon)}</span><strong>${esc(h.name)}</strong><small>${esc(h.mandate)}</small><div class="count">Open hub →</div></button>`).join("")}</div>`;
  const h=hub(state.hub),messages=state.data.messages.filter(m=>m.hub_id===h.id);
  const assigned=state.data.assignments.filter(a=>a.hub_id===h.id);
  const replyRuntimes=state.data.runtimes.filter(r=>r.ready&&["codex","opencode","openclaw"].includes(r.id));
  const conversation=messages.slice().reverse().map(m=>`<div class="bubble">${esc(m.text)}<small>Owner · ${esc(m.status)} · ${esc(new Date(m.created_at).toLocaleString())}</small>${m.error?`<small>${esc(m.error)}</small>`:""}${["awaiting-runtime","failed","interrupted"].includes(m.status)&&replyRuntimes.length?`<button class="ghost" data-action="reply-message" data-id="${esc(m.id)}" data-runtime="${esc(replyRuntimes[0].id)}">Ask ${esc(replyRuntimes[0].name)} to reply →</button>`:""}</div>${m.reply?`<div class="bubble ceo-reply">${esc(m.reply)}<small>${esc(h.name)} CEO · ${esc(m.runtime)} · ${esc(new Date(m.completed_at).toLocaleString())}</small></div>`:""}`).join("");
  return heading("HUB WORKSPACE",h.name,h.mandate,`<span class="head-count">${esc(missions(h.id).length)} missions</span>`)+
    `<div class="two-column"><section class="panel"><div class="ceo-card"><div class="ceo-avatar">${esc(h.icon)}</div><div><strong>${esc(h.name)} CEO</strong><small>Persistent leader · replies through an available runtime</small></div></div><div class="conversation" aria-label="CEO conversation">${conversation||`<div class="empty">Tell the chief what you want to do. You can connect a runtime later.</div>`}</div><form id="message-form" class="composer"><textarea name="text" required maxlength="4000" placeholder="Ask this CEO about a goal, campaign, or project..." aria-label="Message to CEO"></textarea><label class="field">Runtime<select name="runtime"><option value="">Save to inbox</option>${replyRuntimes.map((r,i)=>`<option value="${esc(r.id)}" ${i===0?"selected":""}>${esc(r.name)}</option>`).join("")}</select></label><button class="primary" type="submit">Send</button></form></section><section><div class="panel"><h3>Mission queue</h3><div class="mission-table">${missionRows(missions(h.id))}</div><button class="secondary" data-action="new-mission" style="margin-top:12px">+ Plan mission</button></div><div class="panel" style="margin-top:16px"><h3>Projects</h3>${state.data.projects.filter(p=>p.hub_id===h.id).map(p=>`<div class="row"><span class="avatar-small">${esc(h.icon)}</span><span class="row-main"><strong>${esc(p.title)}</strong><small>${esc(p.kind)} · ${esc(p.status)}</small></span></div>`).join("")||`<p class="helper">Create a software product, media brand or other project.</p>`}<button class="ghost" data-action="new-project">+ Project</button></div><div class="panel" style="margin-top:16px"><h3>Specialist team</h3>${assigned.length?assigned.map(a=>`<div class="row"><span class="avatar-small">${esc(state.data.personas.find(p=>p.path===a.persona_path)?.emoji||"✦")}</span><span class="row-main"><strong>${esc(state.data.personas.find(p=>p.path===a.persona_path)?.title||a.persona_path)}</strong><small>${esc(a.runtime)} · configured, readiness pending</small></span></div>`).join(""):`<p class="helper">No specialists assigned. Import a role and bind a runtime from Agents.</p>`}<button class="ghost" data-action="view" data-id="agents">Manage agents →</button></div></section></div>`;
}
function mediaPanels() {
  const d=state.data,brands=d.projects.filter(p=>p.hub_id==="content"&&p.kind==="media-brand");
  return `<div class="section-head"><h2>Media Empire</h2><span>${brands.length} brands · ${d.mediaAccounts.length} accounts</span></div>
    <div class="split"><section class="panel"><h3>Brand & channel portfolio</h3>
    ${brands.length?brands.map(p=>`<div class="row"><span class="avatar-small">◈</span><span class="row-main"><strong>${esc(p.title)}</strong><small>${esc(p.description)} · ${d.mediaAccounts.filter(a=>a.project_id===p.id).length} accounts</small></span></div>`).join(""):`<p class="helper">Create your first media-brand project to organize niches and channel accounts.</p>`}
    ${d.mediaAccounts.map(a=>`<div class="row"><span class="avatar-small">◎</span><span class="row-main"><strong>${esc(a.platform)} · ${esc(a.handle)}</strong><small>${esc(a.niche)} · ${esc(a.language)} · planned</small></span></div>`).join("")}
    <button class="secondary" data-action="new-media-account" ${brands.length?"":"disabled"}>+ Add account</button></section>
    <section class="panel"><h3>Campaign pipeline</h3><p class="helper">Source-backed research → strategy → creation → editing → media → editorial and rights review → local publication packet. Each stage needs owner review. External publishing and analytics need a connected channel adapter.</p>
    ${d.mediaCampaigns.map(c=>{const pending=d.mediaArtifacts.find(a=>a.campaign_id===c.id&&a.stage===c.stage&&a.status==="submitted"),packets=d.mediaPackets.filter(p=>p.campaign_id===c.id);return `<div class="row"><span class="avatar-small">◷</span><span class="row-main"><strong>${esc(c.title)}</strong><small>${esc(d.projects.find(p=>p.id===c.project_id)?.title)} · ${esc(c.stage)} · ${esc(c.status)} · ${packets.length} prepared packets</small></span><span class="work-actions"><button class="ghost" data-action="inspect-media" data-id="${esc(c.id)}">Inspect</button>${pending?`<button class="secondary" data-action="review-media" data-id="${esc(c.id)}" data-artifact="${esc(pending.id)}">Review ${esc(c.stage)}</button>`:c.status==="ready-for-publishing"?`<button class="secondary" data-action="prepare-media" data-id="${esc(c.id)}">Prepare packet</button>`:`<button class="secondary" data-action="submit-media" data-id="${esc(c.id)}">Submit ${esc(c.stage)}</button>`}</span></div>`}).join("")}
    <button class="secondary" data-action="new-media-campaign" ${brands.length?"":"disabled"}>+ Campaign brief</button></section></div>`;
}
const rupees=paise=>`₹${(Number(paise)/100).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
function financePanels() {
  const d=state.data,projects=d.projects.filter(p=>p.hub_id==="finance"&&p.kind==="research");
  return `<div class="section-head"><h2>FinOS · paper ledger</h2><span>${d.paperAccounts.length} simulated accounts</span></div><div class="panel"><p class="helper">Manual source references and prices. Paper fills use those marks and entered fees; they are not broker executions, verified quotes or investment advice. Each buy has a configured size cap, cash only and no short positions.</p><div class="mission-table">${d.paperAccounts.map(a=>`<article class="card work-card"><div><strong>${esc(a.title)}</strong><p>${esc(d.projects.find(p=>p.id===a.project_id)?.title)} · Paper cash ${rupees(a.cash_paise)}</p><small>Single purchase cap ${esc((a.max_trade_bps/100).toFixed(2))}% of starting cash · revision ${a.version}</small></div><div class="work-actions"><button class="secondary" data-action="inspect-paper" data-id="${esc(a.id)}">Ledger</button><button class="secondary" data-action="paper-mark" data-id="${esc(a.id)}">Record price</button><button class="primary" data-action="paper-order" data-id="${esc(a.id)}">Simulate trade</button></div></article>`).join("")||'<div class="empty">Create a Finance research project, then a paper account.</div>'}</div><button class="secondary" data-action="new-paper-account" ${projects.length?"":"disabled"}>+ Paper account</button></div>`;
}
function agentsPage() {
  const d=state.data,imported=new Map(d.personas.map(p=>[p.path,p]));
  const terms=state.search.toLowerCase();
  const candidates=(state.onlyImported?d.personas:d.agency.index).filter(p=>(p.title||p.name||"").toLowerCase().includes(terms)||p.path.toLowerCase().includes(terms)).slice(0,48);
  return heading("SPECIALISTS & RUNTIMES","Agents",`${d.personas.length} sourced role files installed. The full catalog contains ${d.agency.count} references; each role needs an eligible connected runtime.`,`<span class="head-count">${d.personas.length} imported / ${d.agency.count} indexed</span>`)+
    `<div class="toolbar"><input id="agent-search" type="search" placeholder="Search role, team or skill..." value="${esc(state.search)}" aria-label="Search agents"><button class="secondary" data-action="toggle-catalog">${state.onlyImported?"Browse complete index":"Show imported roles"}</button></div><div class="agent-grid">${candidates.map(item=>{const p=imported.get(item.path),title=p?.title||item.name;return `<article class="card agent-card"><span class="emoji">${esc(p?.emoji||sourceIcon(item.division))}</span><h3>${esc(title)}</h3><p>${esc(p?.description||"Source reference only. Import from the pinned Agency checkout to use this role.")}</p><footer><span>${esc(item.division)} · ${p?"Imported":"Source only"}</span>${p?`<button class="ghost" data-action="assign" data-path="${esc(item.path)}">Assign →</button>`:""}</footer></article>`}).join("")}</div>`+
    `<div class="section-head"><h2>Execution runtimes</h2><span>Codex/OpenCode logins are checked; OpenClaw additionally needs a verified, tool-denied Gateway profile. Hermes and Claude are discovery only</span></div><div class="agent-grid">${d.runtimes.map(r=>`<div class="card agent-card"><span class="emoji">${esc(r.icon)}</span><h3>${esc(r.name)}</h3><p>${r.ready?`CLI and task policy checked at ${esc(r.path)}. ${r.id==="openclaw"?"Bounded text replies and non-Dev tasks only":"Dev worktrees"}${r.id==="opencode"?"; bounded non-Dev text tasks too":""}.`:r.state==="detected"?`Executable found at ${esc(r.path)}. ${esc(r.reason||"Authentication and task execution have not been checked.")}`:"Not detected on this host."}</p><footer><span>${esc(r.state)}</span><span class="badge ${r.ready?"":"warn"}">${r.ready?"Ready for assigned tasks":"Not ready"}</span></footer></div>`).join("")}</div>`+
    `<div class="panel" style="margin-top:18px"><h3>Source provenance</h3><p class="helper">Agency Agents · pinned commit <code>${esc(d.agency.commit)}</code> · MIT license. The included 12 files are exact upstream prompts with verified blob hashes. Import all ${d.agency.count} with <code>npm run import:agency -- /path/to/agency-agents</code> after checking out the pinned revision.</p></div>`;
}
const nativeWindows={hermes:{name:"Hermes dashboard",defaultUrl:"http://127.0.0.1:9119/",instruction:"Start Hermes locally with hermes dashboard --no-open. Use its own sign-in where required."},openclaw:{name:"OpenClaw Control UI",defaultUrl:"http://127.0.0.1:18789/",instruction:"Start your local OpenClaw Gateway; pair and authenticate through OpenClaw itself."},opencode:{name:"OpenCode web",defaultUrl:"",instruction:"Start the OpenCode web UI and paste its local URL. The port varies by version and configuration."}};
function localWindowUrl(value) {
  try {
    const url=new URL(value);
    if(!["http:","https:"].includes(url.protocol)||!["localhost","127.0.0.1","[::1]"].includes(url.hostname)||url.username||url.password||url.search||url.hash)
      throw new Error();
    return url.href;
  } catch {throw new Error("Enter a local HTTP(S) agent URL without credentials, query parameters or a fragment.")}
}
function savedWindowUrl(id) {
  const saved=sessionStorage.getItem(`agas-window-${id}`);
  if(!saved)return "";
  try {return localWindowUrl(saved)}catch {sessionStorage.removeItem(`agas-window-${id}`);return ""}
}
function windowsPage() {
  const local=["localhost","127.0.0.1","[::1]"].includes(location.hostname);
  const choice=nativeWindows[state.windowId];
  const current=state.windowUrl||savedWindowUrl(state.windowId)||choice?.defaultUrl||"";
  const selected=state.data.runtimes.find(r=>r.id===state.windowId);
  return heading("RUNTIME WORKSPACES","Agent windows","Open an agent's actual local web UI alongside AGAS missions. The provider controls its own authentication and may block framing.")+
    `<div class="window-tabs">${Object.entries(nativeWindows).map(([id,window])=>`<button class="secondary ${state.windowId===id?"selected":""}" data-action="select-window" data-id="${id}">${esc(window.name)}</button>`).join("")}</div>`+
    `<div class="panel window-header"><div><h3>${esc(choice.name)}</h3><p class="helper">${esc(choice.instruction)}<br>CLI on this AGAS host: ${esc(selected?.state||"unknown")}. Web UI availability is independent of CLI discovery.</p></div><form id="window-form" class="window-form"><label class="field">Local web address<input name="url" type="url" value="${esc(current)}" placeholder="http://127.0.0.1:PORT/" required></label><button class="primary" type="submit">Open in panel</button>${current?`<a class="secondary" href="${esc(current)}" target="_blank" rel="noopener noreferrer">Open native tab ↗</a>`:""}</form></div>`+
    (!local?`<div class="panel empty">Open AGAS on the same machine as this browser to use loopback agent windows. A hosted AGAS needs an authenticated remote-window integration.</div>`:
      state.windowUrl?`<div class="window-frame"><iframe src="${esc(state.windowUrl)}" title="${esc(choice.name)} native web interface" sandbox="allow-same-origin allow-scripts allow-forms allow-popups" referrerpolicy="no-referrer"></iframe></div><p class="helper">If the agent denies framing or its login cannot complete here, use “Open native tab”. AGAS never bypasses the agent's frame or login policy.</p>`:
      `<div class="panel empty">Select a local agent address to show its real interface here. Codex and OpenCode runs and logs are available inside Dev missions; Codex and Claude desktop or CLI interfaces require a separate native integration.</div>`);
}
function knowledgePage() {
  const notes=state.data.notes;
  return heading("SHARED CONTEXT","Knowledge & vault","One Obsidian vault for readable knowledge; scope and provenance are enforced by AGAS.")+
    `<div class="split"><div class="panel"><h3>Vault projection</h3><p class="helper">AGAS organizes the vault into System, People, Projects, Missions, Hubs, Agents, Workflows, Knowledge, Artifacts, Decisions, and Archive. Records remain authoritative in the database. Existing edited files are reported as conflicts instead of overwritten. Import known note edits with matching scope and revision.</p><button class="primary" data-action="project-vault">Project vault now →</button><button class="secondary" data-action="import-vault">Import edited notes</button></div><form id="note-form" class="panel form-grid"><h3>Add a scoped note</h3><label class="field">Title<input name="title" required maxlength="140" placeholder="Decision, source, or insight"></label><label class="field">Scope<select name="scope"><option value="organization">Organization</option><option value="hub">Hub</option><option value="project">Project</option><option value="private">Private</option></select></label><label class="field">Owner ID<input name="ownerId" required value="agas" placeholder="agas, hub ID, project ID, owner"></label><label class="field">Content<textarea name="content" required maxlength="30000" placeholder="Write the source, decision or useful context..."></textarea></label><button class="primary" type="submit">Save note</button></form></div>`+
    `<div class="section-head"><h2>Context records</h2><span>${notes.length} records</span></div><div class="note-grid">${notes.length?notes.map(n=>`<button class="card note-card" data-action="inspect-note" data-id="${esc(n.id)}"><strong>▧ ${esc(n.title)}</strong><small>${esc(n.scope)} · ${esc(n.owner_id)} · revision ${n.revision}</small></button>`).join(""):`<div class="empty">No notes yet. Add one and project it into your Obsidian vault.</div>`}</div>`;
}
function activityPage(){return heading("AUDIT & PROGRESS","Activity","The executive sees mission, CEO and knowledge events as they happen.")+`<div class="panel list">${eventRows(state.data.events)}</div>`}
function renderInspector() {
  const selected=state.inspected;
  if(selected?.type==="run") {
    const {run,logs,artifacts}=selected.data;
    $("#inspector-content").innerHTML=`<div class="inspector-section"><span class="eyebrow">RUN · ${esc(run.runtime)}</span><h3>${esc(run.status)}</h3><p>${esc(run.result||"The run is still active.")}</p><div class="kv"><span>Base commit</span><strong>${esc(run.base_commit||"Text-only run")}</strong></div><div class="kv"><span>Exit</span><strong>${esc(run.exit_code??"pending")}</strong></div></div>${run.output_sha256?`<div class="inspector-section"><h3>Recorded text · SHA-256 ${esc(run.output_sha256)}</h3><p style="white-space:pre-wrap">${esc(run.output_text)}</p></div>`:""}<div class="inspector-section"><h3>Recorded files</h3>${artifacts.map(a=>`<p>${esc(a.path)} · ${esc(a.status)} · ${esc(a.sha256||"no hash")}</p>`).join("")||"<p>No changed files recorded yet.</p>"}</div><div class="inspector-section"><h3>Process events</h3><div class="run-log" aria-label="Agent run events">${logs.map(row=>`<p><small>${esc(row.channel)} · ${esc(new Date(row.occurred_at).toLocaleTimeString())}</small><br>${esc(row.message)}</p>`).join("")||"<p>No events yet.</p>"}</div></div>`;
    return;
  }
  if(selected?.type==="mission") {
    const m=state.data.missions.find(x=>x.id===selected.id);
    if(m) {$("#inspector-content").innerHTML=`<div class="inspector-section"><span class="eyebrow">MISSION · ${esc(m.hub_id)}</span><h3 style="margin-top:13px">${esc(m.title)}</h3><p>${esc(m.objective)}</p><div class="kv"><span>State</span><strong>${esc(m.status)}</strong></div><div class="kv"><span>Project</span><strong>${esc(m.project||"None")}</strong></div><div class="kv"><span>Version</span><strong>${m.version}</strong></div></div><div class="inspector-section"><h3>Acceptance criteria</h3>${m.criteria.map(c=>`<p>◯ ${esc(c)}</p>`).join("")}<p>Execution evidence is required before acceptance.</p></div>`;return}
  }
  if(selected?.type==="media") {
    const {campaign,artifacts,packets}=selected.data;
    $("#inspector-content").innerHTML=`<div class="inspector-section"><span class="eyebrow">MEDIA · ${esc(campaign.stage)}</span><h3>${esc(campaign.title)}</h3><p>${esc(campaign.objective)}</p><p>${esc(campaign.status)} · revision ${esc(campaign.version)}</p></div><div class="inspector-section"><h3>Stage trail</h3>${artifacts.map(a=>`<p><strong>${esc(a.stage)} · ${esc(a.status)}</strong><br>${esc(a.title)} · SHA-256 ${esc(a.sha256)}<br><span style="white-space:pre-wrap">${esc(a.content)}</span><br>References: ${esc(JSON.parse(a.sources).join(" · ")||"None")}<br>Rights: ${esc(a.rights_note||"Not supplied")}<br>Owner review: ${esc(a.review_note||"Pending")}</p>`).join("")||"<p>Submit a source-backed research brief to begin.</p>"}</div><div class="inspector-section"><h3>Prepared packets</h3>${packets.map(p=>`<p>${esc(p.account_id)} · ${esc(p.status)}<br>SHA-256 ${esc(p.sha256)}<br><span style="white-space:pre-wrap">${esc(p.content)}</span></p>`).join("")||"<p>No packet prepared. Nothing has been published.</p>"}</div>`;
    return;
  }
  if(selected?.type==="paper") {
    const {account,marks,positions,orders,valuation}=selected.data;
    $("#inspector-content").innerHTML=`<div class="inspector-section"><span class="eyebrow">FINOS · SIMULATION</span><h3>${esc(account.title)}</h3><p>Paper cash ${rupees(account.cash_paise)} · starting ${rupees(account.starting_cash_paise)}.</p><p>${valuation?`Marked equity ${rupees(valuation.equity_paise)} · realized ${rupees(valuation.realized_pnl_paise)} · unrealized ${rupees(valuation.unrealized_pnl_paise)}. Oldest mark: ${esc(valuation.as_of||"none")}.`:"A complete marked valuation is not available."}</p></div><div class="inspector-section"><h3>Positions</h3>${positions.map(p=>`<p>${esc(p.symbol)} · ${p.quantity} units · cost ${rupees(p.cost_paise)} · manual mark ${p.mark?rupees(p.mark.price_paise):"missing"}</p>`).join("")||"<p>No positions.</p>"}</div><div class="inspector-section"><h3>Manual marks</h3>${marks.slice(0,20).map(m=>`<p>${esc(m.symbol)} · ${rupees(m.price_paise)} · ${esc(m.as_of)}<br>${esc(m.source_url)}</p>`).join("")||"<p>No prices recorded.</p>"}</div><div class="inspector-section"><h3>Simulated fills</h3>${orders.slice(0,30).map(o=>`<p>${esc(o.side)} ${o.quantity} ${esc(o.symbol)} · ${rupees(o.price_paise)} each · fee ${rupees(o.fee_paise)} · realized ${rupees(o.realized_pnl_paise)}<br>${esc(o.id)} · ${esc(o.status)}</p>`).join("")||"<p>No paper orders.</p>"}</div>`;
    return;
  }
  if(selected?.type==="note") {
    $("#inspector-content").innerHTML=`<div class="inspector-section"><span class="eyebrow">KNOWLEDGE</span><h3 style="margin-top:13px">Loading scoped note…</h3></div>`;
    api("/api/notes/"+encodeURIComponent(selected.id)).then(result=>{const n=result.note;if(n&&state.inspected?.id===selected.id)$("#inspector-content").innerHTML=`<div class="inspector-section"><span class="eyebrow">${esc(n.scope)} · ${esc(n.owner_id)}</span><h3 style="margin-top:14px">${esc(n.title)}</h3><p style="white-space:pre-wrap">${esc(n.content)}</p><div class="kv"><span>Revision</span><strong>${n.revision}</strong></div></div>`}).catch(error=>notify(error.message,true));return;
  }
  $("#inspector-content").innerHTML=`<div class="inspector-section"><img class="logo-large" src="/assets/agas-logo.jpg" alt=""><h3>Your command center</h3><p>One organization, seven hub chiefs, one shared context with clear boundaries. AGAS reports actual state, so a configured role does not appear as a working agent.</p></div><div class="inspector-section"><h3>Workspace state</h3><div class="kv"><span>Organization</span><strong>AGAS</strong></div><div class="kv"><span>Hubs</span><strong>${hubs().length}</strong></div><div class="kv"><span>Runtime ready</span><strong>${state.data.runtimes.filter(r=>r.ready).length} on this host</strong></div><div class="kv"><span>Pending CEO requests</span><strong>${state.data.messages.filter(m=>m.status!=="completed").length}</strong></div></div><div class="inspector-section"><h3>On this machine</h3><div class="stack">${state.data.runtimes.map(r=>`<div class="runtime-chip"><strong>${esc(r.icon)} ${esc(r.name)}</strong><span class="${r.ready||r.state==="detected"?"":"off"}">${esc(r.state)}</span></div>`).join("")}</div></div><div class="inspector-section"><h3>Current milestone</h3><p>Dev tasks can launch in isolated Git worktrees. Other hubs can run text-only OpenCode or restricted OpenClaw tasks. A receiving task may require an owner-accepted cross-hub handoff; automatic dispatch remains pending.</p></div>`;
}
function render() {
  if(!state.data)return;
  $("#crumb").textContent=state.view==="hubs"&&state.hub?hub(state.hub)?.name:titles[state.view];
  document.querySelectorAll(".nav").forEach(button=>button.classList.toggle("active",button.dataset.view===state.view));
  $("#hub-nav").innerHTML=hubs().map(h=>`<button class="hub-link ${state.view==="hubs"&&state.hub===h.id?"active":""}" data-action="hub" data-id="${esc(h.id)}"><span>${esc(h.icon)}</span>${esc(h.name)}</button>`).join("");
  $("#content").innerHTML=({overview:dashboard,organization,goals:goalsPage,projects:projectsPage,missions:missionsPage,mission:missionPage,hubs:hubsPage,agents:agentsPage,windows:windowsPage,knowledge:knowledgePage,activity:activityPage}[state.view]||dashboard)();
  if(state.view==="mission"&&state.detail)$("#content").insertAdjacentHTML("beforeend",handoffsPanel(state.detail));
  if(state.view==="hubs"&&state.hub==="content")$("#content").insertAdjacentHTML("beforeend",mediaPanels());
  if(state.view==="hubs"&&state.hub==="finance")$("#content").insertAdjacentHTML("beforeend",financePanels());
  renderInspector();
}
function openModal(title,description,fields,submit) {
  const form=$("#modal-form");
  form.innerHTML=`<h2>${esc(title)}</h2><p>${esc(description)}</p>${fields}<div class="modal-actions"><button type="button" class="secondary" id="cancel-modal">Cancel</button><button type="submit" class="primary">Save →</button></div>`;
  form.onsubmit=async event=>{event.preventDefault();try{await submit(new FormData(form));$("#modal").close();await refresh();notify("Saved to your AGAS workspace.")}catch(error){notify(error.message,true)}};
  $("#cancel-modal").onclick=()=>$("#modal").close();
  $("#modal").showModal();
}
function newMission() {
  const selected=state.view==="hubs"&&state.hub?state.hub:"dev";
  openModal("Create a mission","Define the work and what would count as a real result.",
    `<label class="field">Hub<select name="hubId">${hubs().map(h=>`<option value="${esc(h.id)}" ${h.id===selected?"selected":""}>${esc(h.name)}</option>`).join("")}</select></label><label class="field">Project (optional)<select name="project"><option value="">No project</option>${state.data.projects.map(p=>`<option value="${esc(p.id)}">${esc(p.title)} · ${esc(hub(p.hub_id)?.name)}</option>`).join("")}</select></label><label class="field">Goal (optional)<select name="goalId"><option value="">No goal</option>${state.data.goals.filter(g=>g.status==="active").map(g=>`<option value="${esc(g.id)}">${esc(g.title)} · ${esc(g.hub_id||"organization")}</option>`).join("")}</select></label><label class="field">Mission title<input name="title" required maxlength="140" placeholder="What should your team deliver?"></label><label class="field">Objective<textarea name="objective" required maxlength="4000" placeholder="Describe the actual objective and constraints"></textarea></label><label class="field">Acceptance criteria · one per line<textarea name="criteria" required placeholder="What evidence would prove this is complete?"></textarea></label>`,
    data=>api("/api/missions",{method:"POST",body:JSON.stringify({hubId:data.get("hubId"),project:data.get("project"),goalId:data.get("goalId"),title:data.get("title"),objective:data.get("objective"),criteria:String(data.get("criteria")).split("\n").map(c=>c.trim()).filter(Boolean)})}));
}
function newTask(){
  const {mission:m}=state.detail,assignments=state.data.assignments.filter(a=>a.hub_id===m.hub_id);
  const handoffs=state.detail.handoffs.filter(h=>h.target_mission_id===m.id&&["offered","accepted"].includes(h.status));
  openModal("Add a mission task","Define one bounded delivery. Assigning a configured specialist does not run it.",
    `<label class="field">Title<input name="title" required maxlength="140" placeholder="Produce the required artifact"></label><label class="field">Objective<textarea name="objective" required maxlength="4000" placeholder="Describe the result, constraints and expected output"></textarea></label><label class="field">Specialist (optional)<select name="assignmentId"><option value="">Unassigned</option>${assignments.map(a=>`<option value="${esc(a.id)}">${esc(state.data.personas.find(p=>p.path===a.persona_path)?.title||a.persona_path)} · ${esc(a.runtime)} (unverified)</option>`).join("")}</select></label>${state.detail.tasks.length?`<label class="field">Run after task (optional)<select name="dependsOn"><option value="">No prerequisite</option>${state.detail.tasks.map(t=>`<option value="${esc(t.id)}">${esc(t.title)} · ${esc(t.status)}</option>`).join("")}</select></label>`:""}${handoffs.length?`<label class="field">Required cross-hub handoff (optional)<select name="requiredHandoffId"><option value="">No handoff dependency</option>${handoffs.map(h=>`<option value="${esc(h.id)}">${esc(h.title)} · ${esc(h.status)}</option>`).join("")}</select></label>`:""}`,
    data=>api(`/api/missions/${m.id}/tasks`,{method:"POST",body:JSON.stringify({title:data.get("title"),objective:data.get("objective"),assignmentId:data.get("assignmentId"),dependsOn:data.get("dependsOn")?[data.get("dependsOn")]:[],requiredHandoffId:data.get("requiredHandoffId")||null,expectedVersion:state.detail.mission.version})}));
}
function addEvidence(taskId){
  const {mission:m}=state.detail;
  openModal("Submit task evidence","Record the actual output. A hash protects these bytes; owner review decides whether they support a criterion.",
    `<label class="field">Acceptance criterion<select name="criterionIndex">${m.criteria.map((c,i)=>`<option value="${i}">${i+1}. ${esc(c)}</option>`).join("")}</select></label><label class="field">Evidence type<select name="kind"><option value="artifact">Artifact description</option><option value="test-log">Test output</option><option value="observation">Observation</option></select></label><label class="field">Title<input name="title" required maxlength="140" placeholder="What was produced?"></label><label class="field">Content<textarea name="content" required maxlength="12000" placeholder="Paste the output or a precise reference and provenance"></textarea></label>`,
    data=>api(`/api/missions/${m.id}/evidence`,{method:"POST",body:JSON.stringify({taskId,criterionIndex:Number(data.get("criterionIndex")),kind:data.get("kind"),title:data.get("title"),content:data.get("content"),expectedVersion:state.detail.mission.version})}));
}
function reviewEvidence(evidenceId){
  const {mission:m}=state.detail;
  openModal("Review evidence","This records an owner decision. AGAS has not independently verified external claims.",
    `<label class="field">Decision<select name="decision"><option value="reviewed">Supports the criterion</option><option value="rejected">Reject and request a better result</option></select></label><label class="field">Reason<textarea name="reviewNote" required maxlength="2000" placeholder="What did you inspect and why? Did the actual result meet the criterion?"></textarea></label>`,
    data=>api(`/api/missions/${m.id}/evidence/${evidenceId}/review`,{method:"POST",body:JSON.stringify({decision:data.get("decision"),reviewNote:data.get("reviewNote"),expectedVersion:state.detail.mission.version})}));
}
function offerHandoff(){
  const {mission:m,tasks,evidence}=state.detail;
  const targets=state.data.missions.filter(other=>other.hub_id!==m.hub_id&&!["accepted","cancelled"].includes(other.status));
  const accepted=evidence.filter(e=>e.status==="reviewed"&&tasks.some(t=>t.id===e.task_id&&t.status==="accepted"));
  if(m.status!=="accepted"||!targets.length||!accepted.length)return notify("Accept source work and create an open receiving mission first.",true);
  openModal("Offer reviewed evidence","Choose the exact evidence and receiving mission. The receiving team must acknowledge it before an agent may read it.",
    `<label class="field">Receiving mission<select name="targetMissionId">${targets.map(item=>`<option value="${esc(item.id)}">${esc(hub(item.hub_id)?.name)} · ${esc(item.title)}</option>`).join("")}</select></label><label class="field">Accepted source evidence<select name="evidenceId">${accepted.map(e=>`<option value="${esc(e.id)}">${esc(e.title)} · criterion ${e.criterion_index+1}</option>`).join("")}</select></label><label class="field">Handoff title<input name="title" required maxlength="140"></label><label class="field">Purpose<textarea name="purpose" required maxlength="2000" placeholder="What should the receiving team do with it?"></textarea></label>`,
    data=>api("/api/handoffs",{method:"POST",body:JSON.stringify({sourceMissionId:m.id,targetMissionId:data.get("targetMissionId"),evidenceId:data.get("evidenceId"),title:data.get("title"),purpose:data.get("purpose")})}));
}
function reviewHandoff(id){
  const handoff=state.detail.handoffs.find(h=>h.id===id);
  if(!handoff)return notify("Handoff not found; refresh the mission.",true);
  openModal("Review cross-hub evidence","This decision grants the receiving mission explicit use of the source evidence.",
    `<p>${esc(handoff.source_evidence_title)} · SHA-256 ${esc(handoff.evidence_sha256)}</p><p>${esc(handoff.source_evidence_content)}</p><label class="field">Decision<select name="decision"><option value="accepted">Accept for this mission</option><option value="declined">Decline</option></select></label><label class="field">Reason<textarea name="responseNote" required maxlength="2000"></textarea></label>`,
    data=>api(`/api/handoffs/${id}/review`,{method:"POST",body:JSON.stringify({decision:data.get("decision"),responseNote:data.get("responseNote"),expectedVersion:handoff.version})}));
}
async function missionAction(action){
  try {await api(`/api/missions/${state.missionId}/${action}`,{method:"POST",body:JSON.stringify({expectedVersion:state.detail.mission.version})});await refresh();notify("Mission record updated.")}
  catch(error){notify(error.message,true);if(error.message.includes("reload"))await refresh()}
}
function newProject() {
  const selected=state.view==="hubs"&&state.hub?state.hub:"content";
  openModal("Create a project","Give a media brand, software product or other initiative a permanent home.",
    `<label class="field">Hub<select name="hubId">${hubs().map(h=>`<option value="${esc(h.id)}" ${h.id===selected?"selected":""}>${esc(h.name)}</option>`).join("")}</select></label><label class="field">Type<select name="kind"><option value="media-brand">Media brand</option><option value="software">Software product</option><option value="research">Research</option><option value="business">Business</option><option value="health">Health</option><option value="security">Security</option><option value="operations">Operations</option><option value="general">General</option></select></label><label class="field">Name<input name="title" required maxlength="140" placeholder="Project name"></label><label class="field">Mandate<textarea name="description" required maxlength="4000" placeholder="Who it serves and what the team will produce"></textarea></label>`,
    data=>api("/api/projects",{method:"POST",body:JSON.stringify(Object.fromEntries(data))}));
}
function newGoal() {
  openModal("Create a goal","Link strategic intent to accepted mission work. A goal can be organization-wide, scoped to a hub, or scoped to one project.",
    `<label class="field">Parent goal (optional)<select name="parentId"><option value="">Top-level goal</option>${state.data.goals.filter(g=>g.status==="active").map(g=>`<option value="${esc(g.id)}">${esc(g.title)}</option>`).join("")}</select></label><label class="field">Hub (optional)<select name="hubId"><option value="">Entire organization</option>${hubs().map(h=>`<option value="${esc(h.id)}">${esc(h.name)}</option>`).join("")}</select></label><label class="field">Project (optional)<select name="projectId"><option value="">No project</option>${state.data.projects.map(p=>`<option value="${esc(p.id)}">${esc(p.title)} · ${esc(p.hub_id)}</option>`).join("")}</select></label><label class="field">Goal title<input name="title" required maxlength="140" placeholder="What should this team achieve?"></label><label class="field">Objective<textarea name="objective" required maxlength="4000" placeholder="Desired outcome and boundaries"></textarea></label><label class="field">Success measure<input name="measure" required maxlength="500" placeholder="Observable measure of success"></label>`,
    data=>api("/api/goals",{method:"POST",body:JSON.stringify(Object.fromEntries(data))}));
}
async function achieveGoal(id) {
  const goal=state.data.goals.find(item=>item.id===id);
  if(!goal||!window.confirm("Mark this goal achieved after checking its accepted missions and child goals?"))return;
  try {await api(`/api/goals/${id}/achieve`,{method:"POST",body:JSON.stringify({expectedVersion:goal.version})});await refresh();notify("Goal achievement recorded.")}
  catch(error){notify(error.message,true)}
}
function setRunLimit(id) {
  const project=state.data.projects.find(p=>p.id===id);
  openModal(`Set ${project?.title||"project"} run quota`,"This limits the number of new agent attempts each UTC month. It does not estimate or cap provider charges.",
    `<label class="field">Monthly run attempts (leave empty for no quota)<input name="monthlyRunLimit" type="number" min="1" max="10000" value="${esc(project?.monthly_run_limit??"")}"></label>`,
    data=>api(`/api/projects/${id}/run-limit`,{method:"POST",body:JSON.stringify({monthlyRunLimit:data.get("monthlyRunLimit")?Number(data.get("monthlyRunLimit")):null})}));
}
function linkRepository(id) {
  const project=state.data.projects.find(p=>p.id===id);
  openModal(`Link ${project?.title||"project"} to Git`,"Select an existing local Git repository root. Agents work in detached copies; the source checkout is not edited by AGAS.",
    `<label class="field">Absolute repository path<input name="repositoryPath" required maxlength="4000" value="${esc(project?.repository_path||"")}" placeholder="/home/you/projects/my-app"></label>`,
    data=>api(`/api/projects/${id}/repository`,{method:"POST",body:JSON.stringify({repositoryPath:data.get("repositoryPath")})}));
}
function launchRun(taskId) {
  const {mission:m}=state.detail;
  const assignment=state.data.assignments.find(a=>a.id===state.detail.tasks.find(t=>t.id===taskId)?.assignment_id);
  const runtime=assignment?.runtime||"agent";
  openModal(`Run the assigned ${esc(runtime)} specialist`,`AGAS will prepare ${m.hub_id==="dev"?"an isolated Git worktree and record changed files":"a text-only workspace with tools denied"}, send approved hub/project notes, and record CLI events. This may consume ${esc(runtime)} usage. Inspect output before accepting it.`,
    `<label class="field">Maximum duration (seconds)<input name="timeoutSeconds" type="number" required min="30" max="3600" value="600"></label>`,
    data=>api(`/api/missions/${m.id}/tasks/${taskId}/run`,{method:"POST",body:JSON.stringify({expectedVersion:state.detail.mission.version,timeoutSeconds:Number(data.get("timeoutSeconds"))})}));
}
function reviewBranch(runId) {
  const {mission:m}=state.detail;
  openModal("Create a local review branch","Every changed file needs a reviewed file-hash receipt. AGAS creates a commit and an agas/... branch in the linked Git repository for inspection. It does not change the source checkout or push to GitHub.",
    `<p class="helper">Run ${esc(runId)} · mission ${esc(m.title)}. Review the diff before merging this branch.</p>`,
    ()=>api(`/api/missions/${m.id}/runs/${runId}/review-branch`,{method:"POST",body:JSON.stringify({expectedVersion:m.version})}));
}
function proveArtifact(runId,path) {
  const {mission:m}=state.detail;
  const run=state.detail.runs.find(item=>item.id===runId);
  openModal("Use recorded file as evidence","AGAS compares current file bytes to its run receipt. You still decide whether the file meets the criterion.",
    `<label class="field">Recorded file<input value="${esc(path)}" disabled></label><label class="field">Acceptance criterion<select name="criterionIndex">${m.criteria.map((c,i)=>`<option value="${i}">${i+1}. ${esc(c)}</option>`).join("")}</select></label><label class="field">Evidence title<input name="title" required maxlength="140" value="${esc(path)}"></label>`,
    data=>api(`/api/missions/${m.id}/artifact-evidence`,{method:"POST",body:JSON.stringify({runId,taskId:run.task_id,path,criterionIndex:Number(data.get("criterionIndex")),title:data.get("title"),expectedVersion:state.detail.mission.version})}));
}
function proveOutput(runId) {
  const {mission:m}=state.detail,run=state.detail.runs.find(item=>item.id===runId);
  openModal("Use recorded text as evidence","AGAS verifies the text hash from the completed run. Review the content and any unverified claims before accepting a criterion.",
    `<p class="helper" style="white-space:pre-wrap">${esc(run.output_text)}</p><label class="field">Acceptance criterion<select name="criterionIndex">${m.criteria.map((c,i)=>`<option value="${i}">${i+1}. ${esc(c)}</option>`).join("")}</select></label><label class="field">Evidence title<input name="title" required maxlength="140" value="${esc(run.id)} result"></label>`,
    data=>api(`/api/missions/${m.id}/output-evidence`,{method:"POST",body:JSON.stringify({runId,criterionIndex:Number(data.get("criterionIndex")),title:data.get("title"),expectedVersion:state.detail.mission.version})}));
}
async function inspectRun(id) {
  try {const data=await api(`/api/missions/${state.missionId}/runs/${id}/logs`);state.inspected={type:"run",data};renderInspector()}
  catch(error){notify(error.message,true)}
}
function newMediaAccount() {
  const brands=state.data.projects.filter(p=>p.hub_id==="content"&&p.kind==="media-brand");
  if(!brands.length)return notify("Create a Media Empire brand project first.",true);
  openModal("Add a channel account","Register the logical account and niche. No credentials or publishing permissions are stored.",
    `<label class="field">Media brand<select name="projectId">${brands.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join("")}</select></label><label class="field">Platform<select name="platform"><option>youtube</option><option>instagram</option><option>tiktok</option><option>facebook</option><option>x</option><option>linkedin</option><option>podcast</option><option>other</option></select></label><label class="field">Handle<input name="handle" required maxlength="120" placeholder="Channel or account identifier"></label><label class="field">Niche<input name="niche" required maxlength="140" placeholder="Audience and content focus"></label><label class="field">Language<input name="language" required maxlength="60" placeholder="English, Telugu, Hindi..."></label>`,
    data=>api("/api/media/accounts",{method:"POST",body:JSON.stringify(Object.fromEntries(data))}));
}
function newMediaCampaign() {
  const brands=state.data.projects.filter(p=>p.hub_id==="content"&&p.kind==="media-brand");
  if(!brands.length)return notify("Create a Media Empire brand project first.",true);
  openModal("Plan a campaign","Create a research brief. Drafting, review and publishing require later workflow adapters.",
    `<label class="field">Media brand<select name="projectId">${brands.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join("")}</select></label><label class="field">Title<input name="title" required maxlength="140" placeholder="Campaign name"></label><label class="field">Objective<textarea name="objective" required maxlength="4000" placeholder="Audience, channel, topics, desired outcome and constraints"></textarea></label>`,
    data=>api("/api/media/campaigns",{method:"POST",body:JSON.stringify(Object.fromEntries(data))}));
}
function submitMediaArtifact(id) {
  const campaign=state.data.mediaCampaigns.find(item=>item.id===id);
  openModal(`Submit ${campaign?.stage||"media"} for review`,"Save a concrete stage result. References are recorded as supplied and are not verified by AGAS. The owner must review it before the campaign advances.",
    `<label class="field">Title<input name="title" required maxlength="140"></label><label class="field">Stage result<textarea name="content" required maxlength="12000" placeholder="Research brief, strategy, draft, edit notes, media plan, or editorial verdict"></textarea></label><label class="field">Source URLs (one per line)<textarea name="sources" placeholder="https://example.com/source"></textarea></label><label class="field">Rights and factuality review (required in review stage)<textarea name="rightsNote" placeholder="State what was checked and any rights or accuracy limits"></textarea></label>`,
    data=>api(`/api/media/campaigns/${id}/artifacts`,{method:"POST",body:JSON.stringify({title:data.get("title"),content:data.get("content"),sources:String(data.get("sources")||"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean),rightsNote:data.get("rightsNote"),expectedVersion:campaign.version})}));
}
function reviewMediaArtifact(id,artifactId) {
  const campaign=state.data.mediaCampaigns.find(item=>item.id===id),artifact=state.data.mediaArtifacts.find(item=>item.id===artifactId);
  if(!campaign||!artifact)return notify("Refresh this campaign before reviewing.",true);
  openModal(`Review ${artifact.stage} submission`,"Accept to advance this campaign by one stage, or reject with a correction note. References and rights declarations remain visible in the record.",
    `<p class="helper" style="white-space:pre-wrap">${esc(artifact.title)} · SHA-256 ${esc(artifact.sha256)}<br>${esc(artifact.content)}</p><p class="helper">Sources: ${esc(JSON.parse(artifact.sources).join(" · ")||"None supplied")}</p><p class="helper">Rights and factuality note: ${esc(artifact.rights_note||"None supplied")}</p><label class="field">Decision<select name="decision"><option value="accepted">Accept stage</option><option value="rejected">Reject and revise</option></select></label><label class="field">Review note<textarea name="reviewNote" required maxlength="2000"></textarea></label>`,
    data=>api(`/api/media/campaigns/${id}/artifacts/${artifactId}/review`,{method:"POST",body:JSON.stringify({decision:data.get("decision"),reviewNote:data.get("reviewNote"),expectedVersion:campaign.version})}));
}
function prepareMediaPacket(id) {
  const campaign=state.data.mediaCampaigns.find(item=>item.id===id);
  const accounts=state.data.mediaAccounts.filter(item=>item.project_id===campaign?.project_id&&
    !state.data.mediaPackets.some(packet=>packet.campaign_id===id&&packet.account_id===item.id));
  if(!accounts.length)return notify("Add an account in this brand, or inspect its existing packet.",true);
  openModal("Prepare local publication packet","This bundles the approved stages and channel target with a hash. It does not connect to the channel or publish content.",
    `<label class="field">Account<select name="accountId">${accounts.map(a=>`<option value="${esc(a.id)}">${esc(a.platform)} · ${esc(a.handle)}</option>`).join("")}</select></label>`,
    data=>api(`/api/media/campaigns/${id}/packets`,{method:"POST",body:JSON.stringify({accountId:data.get("accountId"),expectedVersion:campaign.version})}));
}
async function inspectMediaCampaign(id) {
  try {const detail=await api(`/api/media/campaigns/${id}`);state.inspected={type:"media",data:detail};renderInspector()}
  catch(error){notify(error.message,true)}
}
async function inspectPaperAccount(id) {
  try {state.inspected={type:"paper",data:await api(`/api/finance/paper-accounts/${id}`)};renderInspector()}
  catch(error){notify(error.message,true)}
}
function newPaperAccount() {
  const projects=state.data.projects.filter(p=>p.hub_id==="finance"&&p.kind==="research");
  if(!projects.length)return notify("Create a Finance research project first.",true);
  openModal("Create paper account","All balances and trades are simulated in INR paise. The trade cap applies to each purchase as a share of the initial paper cash.",
    `<label class="field">Research project<select name="projectId">${projects.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join("")}</select></label><label class="field">Name<input name="title" maxlength="140" required></label><label class="field">Starting paper cash (₹)<input name="cash" type="number" min="1" step="0.01" required></label><label class="field">Maximum single buy (% of starting cash)<input name="limit" type="number" min="0.01" max="100" step="0.01" value="5" required></label>`,
    async data=>{const result=await api("/api/finance/paper-accounts",{method:"POST",body:JSON.stringify({projectId:data.get("projectId"),title:data.get("title"),startingCashPaise:Math.round(Number(data.get("cash"))*100),maxTradeBps:Math.round(Number(data.get("limit"))*100)})});state.inspected={type:"paper",data:await api(`/api/finance/paper-accounts/${result.account.id}`)}});
}
async function recordPaperMark(id) {
  let detail;
  try {detail=await api(`/api/finance/paper-accounts/${id}`)}catch(error){return notify(error.message,true)}
  openModal("Record manual paper price","Enter a price, time and public source URL. AGAS stores the reference but does not verify the quote or connect to a market feed.",
    `<label class="field">Instrument symbol<input name="symbol" required maxlength="32" placeholder="NSE:EXAMPLE"></label><label class="field">Price (₹ per unit)<input name="price" type="number" min="0.01" step="0.01" required></label><label class="field">Price time<input name="asOf" type="datetime-local" value="${esc(new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16))}" required></label><label class="field">Source URL<input name="sourceUrl" type="url" required maxlength="1000" placeholder="https://example.com/quote"></label>`,
    async data=>{const result=await api(`/api/finance/paper-accounts/${id}/marks`,{method:"POST",body:JSON.stringify({symbol:data.get("symbol"),pricePaise:Math.round(Number(data.get("price"))*100),asOf:new Date(data.get("asOf")).toISOString(),sourceUrl:data.get("sourceUrl"),expectedVersion:detail.account.version})});state.inspected={type:"paper",data:result}});
}
async function simulatePaperOrder(id) {
  let detail;
  try {detail=await api(`/api/finance/paper-accounts/${id}`)}catch(error){return notify(error.message,true)}
  const symbols=new Set(),marks=detail.marks.filter(m=>{if(symbols.has(m.symbol))return false;symbols.add(m.symbol);return true});
  if(!marks.length)return notify("Record a manual price for this paper account first.",true);
  const requestId=crypto.randomUUID();
  openModal("Simulate a paper trade","The selected manual mark determines this simulated fill. No broker order is sent. Selling cannot exceed the long position; buys obey the cash and size limits.",
    `<label class="field">Side<select name="side"><option value="buy">Paper buy</option><option value="sell">Paper sell</option></select></label><label class="field">Latest manual mark<select name="markId">${marks.map(m=>`<option value="${esc(m.id)}">${esc(m.symbol)} · ${rupees(m.price_paise)} · ${esc(m.as_of)}</option>`).join("")}</select></label><label class="field">Whole units<input name="quantity" type="number" min="1" step="1" required></label><label class="field">Simulated fee (₹)<input name="fee" type="number" min="0" step="0.01" value="0" required></label>`,
    async data=>{const result=await api(`/api/finance/paper-accounts/${id}/orders`,{method:"POST",body:JSON.stringify({side:data.get("side"),markId:data.get("markId"),quantity:Number(data.get("quantity")),feePaise:Math.round(Number(data.get("fee"))*100),requestId,expectedVersion:detail.account.version})});state.inspected={type:"paper",data:result.detail}});
}
function assign(path) {
  const p=state.data.personas.find(item=>item.path===path);
  openModal(`Assign ${p?.title||"specialist"}`,"Choose a hub and intended runtime. Assignment does not start a session.",
    `<label class="field">Hub<select name="hubId">${hubs().map(h=>`<option value="${esc(h.id)}">${esc(h.name)}</option>`).join("")}</select></label><label class="field">Runtime<select name="runtime">${state.data.runtimes.map(r=>`<option value="${esc(r.id)}">${esc(r.name)} · ${esc(r.state)}</option>`).join("")}</select></label>`,
    data=>api("/api/assignments",{method:"POST",body:JSON.stringify({path,hubId:data.get("hubId"),runtime:data.get("runtime")})}));
}
document.addEventListener("click",async event=>{
  const action=event.target.closest("[data-action]");if(!action)return;
  const {action:type,id,path}=action.dataset;
  if(type==="view")setView(id);
  else if(type==="hub")setView("hubs",id);
  else if(type==="new-mission")newMission();
  else if(type==="new-goal")newGoal();
  else if(type==="achieve-goal")achieveGoal(id);
  else if(type==="open-mission")openMission(id);
  else if(type==="refresh-mission")refresh().catch(error=>notify(error.message,true));
  else if(type==="new-task")newTask();
  else if(type==="link-repo")linkRepository(id);
  else if(type==="reply-message"){
    try {await api(`/api/messages/${id}/respond`,{method:"POST",body:JSON.stringify({runtime:action.dataset.runtime})});await refresh();notify("CEO reply started.")}
    catch(error){notify(error.message,true)}
  }
  else if(type==="run-limit")setRunLimit(id);
  else if(type==="launch-run")launchRun(id);
  else if(type==="inspect-run")inspectRun(id);
  else if(type==="review-branch")reviewBranch(id);
  else if(type==="prove-artifact")proveArtifact(id,path);
  else if(type==="prove-output")proveOutput(id);
  else if(type==="stop-run"&&window.confirm("Stop this run? Its partial worktree will be kept for inspection."))missionAction(`runs/${id}/stop`);
  else if(type==="add-evidence")addEvidence(id);
  else if(type==="review-evidence")reviewEvidence(id);
  else if(type==="offer-handoff")offerHandoff();
  else if(type==="review-handoff")reviewHandoff(id);
  else if(type==="accept-task")missionAction(`tasks/${id}/accept`);
  else if(type==="accept-mission")missionAction("accept");
  else if(type==="cancel-mission"&&window.confirm("Cancel this mission and all its open tasks?"))missionAction("cancel");
  else if(type==="new-project")newProject();
  else if(type==="new-media-account")newMediaAccount();
  else if(type==="new-media-campaign")newMediaCampaign();
  else if(type==="submit-media")submitMediaArtifact(id);
  else if(type==="review-media")reviewMediaArtifact(id,action.dataset.artifact);
  else if(type==="prepare-media")prepareMediaPacket(id);
  else if(type==="inspect-media")inspectMediaCampaign(id);
  else if(type==="new-paper-account")newPaperAccount();
  else if(type==="inspect-paper")inspectPaperAccount(id);
  else if(type==="paper-mark")recordPaperMark(id);
  else if(type==="paper-order")simulatePaperOrder(id);
  else if(type==="assign")assign(path);
  else if(type==="select-window"){state.windowId=id;state.windowUrl=null;render()}
  else if(type==="toggle-catalog"){state.onlyImported=!state.onlyImported;render()}
  else if(type==="inspect-note"){state.inspected={type:"note",id};renderInspector()}
  else if(type==="project-vault"){try{const result=await api("/api/vault/project",{method:"POST",body:"{}"});notify(`Vault projected: ${result.written.length} files written, ${result.conflicts.length} edit conflicts.`)}catch(error){notify(error.message,true)}}
  else if(type==="import-vault"){try{const result=await api("/api/vault/import",{method:"POST",body:"{}"});await refresh();notify(`Vault notes imported: ${result.imported.length}; conflicts: ${result.conflicts.length+result.projectionConflicts.length}.`)}catch(error){notify(error.message,true)}}
});
$("#nav").addEventListener("click",event=>{const target=event.target.closest("[data-view]");if(target)setView(target.dataset.view)});
$("#new-mission").onclick=()=>newMission();
$("#close-inspector").onclick=()=>{state.inspected=null;renderInspector()};
$("#content").addEventListener("input",event=>{if(event.target.id==="agent-search"){const pos=event.target.selectionStart;state.search=event.target.value;render();const input=$("#agent-search");input.focus();input.setSelectionRange(pos,pos)}});
$("#content").addEventListener("submit",async event=>{
  if(event.target.id==="window-form"){
    event.preventDefault();
    try {
      if(!["localhost","127.0.0.1","[::1]"].includes(location.hostname))throw new Error("Agent windows require a browser on the AGAS host.");
      const url=localWindowUrl(new FormData(event.target).get("url"));
      state.windowUrl=url;sessionStorage.setItem(`agas-window-${state.windowId}`,url);render();
    } catch(error){notify(error.message,true)}
  }
  if(event.target.id==="message-form"){event.preventDefault();try{const data=new FormData(event.target),runtime=data.get("runtime");await api("/api/messages",{method:"POST",body:JSON.stringify({hubId:state.hub,text:data.get("text"),runtime})});await refresh();notify(runtime?"CEO reply started; follow its status in this hub.":"Saved in the CEO inbox and executive feed.")}catch(error){notify(error.message,true)}}
  if(event.target.id==="note-form"){event.preventDefault();try{await api("/api/notes",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(event.target)))});await refresh();notify("Scoped note saved. Project the vault to create its Markdown file.")}catch(error){notify(error.message,true)}}
});
$("#login-form").onsubmit=async event=>{event.preventDefault();state.token=$("#token").value;try{await refresh();sessionStorage.setItem("agas-token",state.token)}catch(error){$("#login-error").textContent=error.message;state.token=""}};
if(state.token)refresh().catch(()=>{sessionStorage.removeItem("agas-token");state.token="";$("#login-overlay").classList.remove("hidden")});
setInterval(async()=>{
  if(state.view==="hubs"&&state.hub&&state.data?.messages.some(m=>m.hub_id===state.hub&&["queued","running"].includes(m.status))&&!document.hidden){
    if(document.activeElement?.closest("#message-form"))return;
    try {await refresh()}catch(error){notify(error.message,true)}
    return;
  }
  if(state.view!=="mission"||!state.missionId||!state.detail?.runs.some(r=>["queued","starting","running"].includes(r.status))||document.hidden)return;
  const id=state.missionId;
  try {
    const detail=await api(`/api/missions/${id}`);
    if(state.view!=="mission"||state.missionId!==id)return;
    state.detail=detail;
    state.data.missions=state.data.missions.map(m=>m.id===id?detail.mission:m);
    if(state.inspected?.type==="run")state.inspected.data=await api(`/api/missions/${id}/runs/${state.inspected.data.run.id}/logs`);
    render();
  } catch(error){notify(error.message,true)}
},2500);
