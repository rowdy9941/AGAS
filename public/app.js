const $=selector=>document.querySelector(selector);
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const state={data:null,view:"overview",hub:null,inspected:null,search:"",onlyImported:true,token:sessionStorage.getItem("agas-token")||""};
const titles={overview:"Mission control",organization:"Organization",projects:"Projects",hubs:"Hubs",agents:"Agents",knowledge:"Knowledge & vault",activity:"Activity"};
let noticeTimer;
function notify(message,error=false){const node=$("#notice");node.textContent=message;node.style.background=error?"#542d32":"";clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>node.textContent="",5000)}
async function api(path,options={}) {
  const result=await fetch(path,{...options,headers:{authorization:`Bearer ${state.token}`,...(options.body?{"content-type":"application/json"}:{}),...(options.headers||{})}});
  const payload=await result.json();
  if(!result.ok)throw new Error(payload.error||`Request failed (${result.status})`);
  return payload;
}
async function refresh(){state.data=await api("/api/overview");$("#login-overlay").classList.add("hidden");render()}
const hubs=()=>state.data?.hubs||[];
const hub=id=>hubs().find(item=>item.id===id);
const missions=id=>state.data.missions.filter(item=>!id||item.hub_id===id);
const sourceIcon=division=>({engineering:"⌘",marketing:"◈",finance:"◉",healthcare:"✳",security:"⬡",testing:"✓",design:"✦",specialized:"◇",research:"◎"}[division]||"✦");
function setView(view,hubId=null) {
  state.view=view;state.hub=hubId;state.inspected=null;
  render();$("#main").focus({preventScroll:true});
  if(window.innerWidth<800)window.scrollTo({top:0,behavior:"smooth"});
}
function heading(label,title,description,extra="") {
  return `<div class="page-head"><div><span class="eyebrow">${esc(label)}</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${extra}</div>`;
}
function eventRows(events) {
  return events.length?events.map(item=>`<div class="row"><div class="avatar-small">◷</div><div class="row-main"><strong>${esc(item.description)}</strong><small>${esc(item.type)} · ${esc(new Date(item.occurred_at).toLocaleString())}</small></div></div>`).join(""):`<div class="empty">Activity will appear when you create a mission, message, or note.</div>`;
}
function missionRows(list) {
  return list.length?list.map(item=>`<button class="card mission-card" data-action="inspect-mission" data-id="${esc(item.id)}"><span class="avatar-small">${esc(hub(item.hub_id)?.icon)}</span><span class="row-main"><strong>${esc(item.title)}</strong><small>${esc(hub(item.hub_id)?.name)} · ${esc(item.criteria.length)} criteria · ${esc(item.project||"No project")}</small></span><span class="badge warn">${esc(item.status)}</span></button>`).join(""):`<div class="empty">No missions yet. Create one with clear acceptance criteria to start tracking work.</div>`;
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
    `<div class="split"><div class="panel"><h3>Executive feed</h3><div class="list">${eventRows(d.events.filter(e=>e.type==="ceo.inbox").slice(0,5))}</div></div><div class="panel"><h3>How a team works</h3><p class="helper">Ask a CEO directly → register a scoped request → assign a connected assistant → produce an artifact and evidence → accept the outcome → summarize it to the executive. Messages currently wait for a real runtime.</p><button class="secondary" data-action="view" data-id="agents">Browse specialists →</button></div></div>`;
}
function projectsPage() {
  const projects=state.data.projects;
  return heading("ONE ORGANIZATION","Projects","Organize each software product, media brand, research program or ongoing venture under a responsible hub.",
    `<button class="primary" data-action="new-project">+ New project</button>`)+
    `<div class="hub-grid">${projects.length?projects.map(p=>`<article class="card hub-card" data-accent="${esc(hub(p.hub_id)?.accent)}"><span class="avatar">${esc(hub(p.hub_id)?.icon)}</span><strong>${esc(p.title)}</strong><small>${esc(p.description)}</small><div class="count">${esc(hub(p.hub_id)?.name)} · ${esc(p.kind)} · ${state.data.missions.filter(m=>m.project===p.id).length} missions</div></article>`).join(""):`<div class="panel empty">No projects yet. Add your first media brand or software product to give missions and knowledge a permanent home.</div>`}</div>`;
}
function hubsPage() {
  if(!state.hub)return heading("YOUR DEPARTMENTS","Seven hubs","Each permanent hub has its own CEO inbox, missions and specialist team.")+
    `<div class="hub-grid">${hubs().map(h=>`<button class="card hub-card" data-action="hub" data-id="${esc(h.id)}" data-accent="${esc(h.accent)}"><span class="avatar">${esc(h.icon)}</span><strong>${esc(h.name)}</strong><small>${esc(h.mandate)}</small><div class="count">Open hub →</div></button>`).join("")}</div>`;
  const h=hub(state.hub),messages=state.data.messages.filter(m=>m.hub_id===h.id);
  const assigned=state.data.assignments.filter(a=>a.hub_id===h.id);
  return heading("HUB WORKSPACE",h.name,h.mandate,`<span class="head-count">${esc(missions(h.id).length)} missions</span>`)+
    `<div class="two-column"><section class="panel"><div class="ceo-card"><div class="ceo-avatar">${esc(h.icon)}</div><div><strong>${esc(h.name)} CEO</strong><small>Persistent leader record · runtime unbound</small></div></div><div class="conversation" aria-label="CEO inbox">${messages.length?messages.map(m=>`<div class="bubble">${esc(m.text)}<small>Owner · awaiting runtime · ${esc(new Date(m.created_at).toLocaleString())}</small></div>`).join(""):`<div class="empty">Tell the chief what you want to do. It will stay queued until a runtime is ready.</div>`}</div><form id="message-form" class="composer"><textarea name="text" required maxlength="4000" placeholder="Ask this CEO about a goal, campaign, or project..." aria-label="Message to CEO"></textarea><button class="primary" type="submit">Send</button></form></section><section><div class="panel"><h3>Mission queue</h3><div class="mission-table">${missionRows(missions(h.id))}</div><button class="secondary" data-action="new-mission" style="margin-top:12px">+ Plan mission</button></div><div class="panel" style="margin-top:16px"><h3>Projects</h3>${state.data.projects.filter(p=>p.hub_id===h.id).map(p=>`<div class="row"><span class="avatar-small">${esc(h.icon)}</span><span class="row-main"><strong>${esc(p.title)}</strong><small>${esc(p.kind)} · ${esc(p.status)}</small></span></div>`).join("")||`<p class="helper">Create a software product, media brand or other project.</p>`}<button class="ghost" data-action="new-project">+ Project</button></div><div class="panel" style="margin-top:16px"><h3>Specialist team</h3>${assigned.length?assigned.map(a=>`<div class="row"><span class="avatar-small">${esc(state.data.personas.find(p=>p.path===a.persona_path)?.emoji||"✦")}</span><span class="row-main"><strong>${esc(state.data.personas.find(p=>p.path===a.persona_path)?.title||a.persona_path)}</strong><small>${esc(a.runtime)} · configured, readiness pending</small></span></div>`).join(""):`<p class="helper">No specialists assigned. Import a role and bind a runtime from Agents.</p>`}<button class="ghost" data-action="view" data-id="agents">Manage agents →</button></div></section></div>`;
}
function mediaPanels() {
  const d=state.data,brands=d.projects.filter(p=>p.hub_id==="content"&&p.kind==="media-brand");
  return `<div class="section-head"><h2>Media Empire</h2><span>${brands.length} brands · ${d.mediaAccounts.length} accounts</span></div>
    <div class="split"><section class="panel"><h3>Brand & channel portfolio</h3>
    ${brands.length?brands.map(p=>`<div class="row"><span class="avatar-small">◈</span><span class="row-main"><strong>${esc(p.title)}</strong><small>${esc(p.description)} · ${d.mediaAccounts.filter(a=>a.project_id===p.id).length} accounts</small></span></div>`).join(""):`<p class="helper">Create your first media-brand project to organize niches and channel accounts.</p>`}
    ${d.mediaAccounts.map(a=>`<div class="row"><span class="avatar-small">◎</span><span class="row-main"><strong>${esc(a.platform)} · ${esc(a.handle)}</strong><small>${esc(a.niche)} · ${esc(a.language)} · planned</small></span></div>`).join("")}
    <button class="secondary" data-action="new-media-account" ${brands.length?"":"disabled"}>+ Add account</button></section>
    <section class="panel"><h3>Campaign pipeline</h3><p class="helper">Research → strategy → creation → editing → media → review → publishing → engagement → analytics. These are planning records. No channel has been connected or published to.</p>
    ${d.mediaCampaigns.map(c=>`<div class="row"><span class="avatar-small">◷</span><span class="row-main"><strong>${esc(c.title)}</strong><small>${esc(d.projects.find(p=>p.id===c.project_id)?.title)} · ${esc(c.stage)} · ${esc(c.status)}</small></span></div>`).join("")}
    <button class="secondary" data-action="new-media-campaign" ${brands.length?"":"disabled"}>+ Campaign brief</button></section></div>`;
}
function agentsPage() {
  const d=state.data,imported=new Map(d.personas.map(p=>[p.path,p]));
  const terms=state.search.toLowerCase();
  const candidates=(state.onlyImported?d.personas:d.agency.index).filter(p=>(p.title||p.name||"").toLowerCase().includes(terms)||p.path.toLowerCase().includes(terms)).slice(0,48);
  return heading("SPECIALISTS & RUNTIMES","Agents",`${d.personas.length} sourced role files installed. The full catalog contains ${d.agency.count} references; each role needs an eligible connected runtime.`,`<span class="head-count">${d.personas.length} imported / ${d.agency.count} indexed</span>`)+
    `<div class="toolbar"><input id="agent-search" type="search" placeholder="Search role, team or skill..." value="${esc(state.search)}" aria-label="Search agents"><button class="secondary" data-action="toggle-catalog">${state.onlyImported?"Browse complete index":"Show imported roles"}</button></div><div class="agent-grid">${candidates.map(item=>{const p=imported.get(item.path),title=p?.title||item.name;return `<article class="card agent-card"><span class="emoji">${esc(p?.emoji||sourceIcon(item.division))}</span><h3>${esc(title)}</h3><p>${esc(p?.description||"Source reference only. Import from the pinned Agency checkout to use this role.")}</p><footer><span>${esc(item.division)} · ${p?"Imported":"Source only"}</span>${p?`<button class="ghost" data-action="assign" data-path="${esc(item.path)}">Assign →</button>`:""}</footer></article>`}).join("")}</div>`+
    `<div class="section-head"><h2>Execution runtimes</h2><span>Discovery is read-only</span></div><div class="agent-grid">${d.runtimes.map(r=>`<div class="card agent-card"><span class="emoji">${esc(r.icon)}</span><h3>${esc(r.name)}</h3><p>${r.state==="detected"?`Executable found at ${esc(r.path)}. Authentication and task execution have not been checked.`:"Not detected on this host."}</p><footer><span>${esc(r.state)}</span><span class="badge warn">Not ready</span></footer></div>`).join("")}</div>`+
    `<div class="panel" style="margin-top:18px"><h3>Source provenance</h3><p class="helper">Agency Agents · pinned commit <code>${esc(d.agency.commit)}</code> · MIT license. The included 12 files are exact upstream prompts with verified blob hashes. Import all ${d.agency.count} with <code>npm run import:agency -- /path/to/agency-agents</code> after checking out the pinned revision.</p></div>`;
}
function knowledgePage() {
  const notes=state.data.notes;
  return heading("SHARED CONTEXT","Knowledge & vault","One Obsidian vault for readable knowledge; scope and provenance are enforced by AGAS.")+
    `<div class="split"><div class="panel"><h3>Vault projection</h3><p class="helper">AGAS organizes the vault into System, People, Projects, Missions, Hubs, Agents, Workflows, Knowledge, Artifacts, Decisions, and Archive. Records remain authoritative in the database. Existing edited files are reported as conflicts instead of overwritten.</p><button class="primary" data-action="project-vault">Project vault now →</button></div><form id="note-form" class="panel form-grid"><h3>Add a scoped note</h3><label class="field">Title<input name="title" required maxlength="140" placeholder="Decision, source, or insight"></label><label class="field">Scope<select name="scope"><option value="organization">Organization</option><option value="hub">Hub</option><option value="project">Project</option><option value="private">Private</option></select></label><label class="field">Owner ID<input name="ownerId" required value="agas" placeholder="agas, hub ID, project ID, owner"></label><label class="field">Content<textarea name="content" required maxlength="30000" placeholder="Write the source, decision or useful context..."></textarea></label><button class="primary" type="submit">Save note</button></form></div>`+
    `<div class="section-head"><h2>Context records</h2><span>${notes.length} records</span></div><div class="note-grid">${notes.length?notes.map(n=>`<button class="card note-card" data-action="inspect-note" data-id="${esc(n.id)}"><strong>▧ ${esc(n.title)}</strong><small>${esc(n.scope)} · ${esc(n.owner_id)} · revision ${n.revision}</small></button>`).join(""):`<div class="empty">No notes yet. Add one and project it into your Obsidian vault.</div>`}</div>`;
}
function activityPage(){return heading("AUDIT & PROGRESS","Activity","The executive sees mission, CEO and knowledge events as they happen.")+`<div class="panel list">${eventRows(state.data.events)}</div>`}
function renderInspector() {
  const selected=state.inspected;
  if(selected?.type==="mission") {
    const m=state.data.missions.find(x=>x.id===selected.id);
    if(m) {$("#inspector-content").innerHTML=`<div class="inspector-section"><span class="eyebrow">MISSION · ${esc(m.hub_id)}</span><h3 style="margin-top:13px">${esc(m.title)}</h3><p>${esc(m.objective)}</p><div class="kv"><span>State</span><strong>${esc(m.status)}</strong></div><div class="kv"><span>Project</span><strong>${esc(m.project||"None")}</strong></div><div class="kv"><span>Version</span><strong>${m.version}</strong></div></div><div class="inspector-section"><h3>Acceptance criteria</h3>${m.criteria.map(c=>`<p>◯ ${esc(c)}</p>`).join("")}<p>Execution evidence is required before acceptance.</p></div>`;return}
  }
  if(selected?.type==="note") {
    $("#inspector-content").innerHTML=`<div class="inspector-section"><span class="eyebrow">KNOWLEDGE</span><h3 style="margin-top:13px">Loading scoped note…</h3></div>`;
    api("/api/notes/"+encodeURIComponent(selected.id)).then(result=>{const n=result.note;if(n&&state.inspected?.id===selected.id)$("#inspector-content").innerHTML=`<div class="inspector-section"><span class="eyebrow">${esc(n.scope)} · ${esc(n.owner_id)}</span><h3 style="margin-top:14px">${esc(n.title)}</h3><p style="white-space:pre-wrap">${esc(n.content)}</p><div class="kv"><span>Revision</span><strong>${n.revision}</strong></div></div>`}).catch(error=>notify(error.message,true));return;
  }
  $("#inspector-content").innerHTML=`<div class="inspector-section"><img class="logo-large" src="/assets/agas-logo.jpg" alt=""><h3>Your command center</h3><p>One organization, seven hub chiefs, one shared context with clear boundaries. AGAS reports actual state, so a configured role does not appear as a working agent.</p></div><div class="inspector-section"><h3>Workspace state</h3><div class="kv"><span>Organization</span><strong>AGAS</strong></div><div class="kv"><span>Hubs</span><strong>${hubs().length}</strong></div><div class="kv"><span>Runtime ready</span><strong>0 verified</strong></div><div class="kv"><span>Pending CEO requests</span><strong>${state.data.messages.length}</strong></div></div><div class="inspector-section"><h3>On this machine</h3><div class="stack">${state.data.runtimes.map(r=>`<div class="runtime-chip"><strong>${esc(r.icon)} ${esc(r.name)}</strong><span class="${r.state==="detected"?"":"off"}">${esc(r.state)}</span></div>`).join("")}</div></div><div class="inspector-section"><h3>Current milestone</h3><p>Native organization, scoped mission intake, Agency personas and Obsidian projection. Runtime execution comes after adapter and recovery tests.</p></div>`;
}
function render() {
  if(!state.data)return;
  $("#crumb").textContent=state.view==="hubs"&&state.hub?hub(state.hub)?.name:titles[state.view];
  document.querySelectorAll(".nav").forEach(button=>button.classList.toggle("active",button.dataset.view===state.view));
  $("#hub-nav").innerHTML=hubs().map(h=>`<button class="hub-link ${state.view==="hubs"&&state.hub===h.id?"active":""}" data-action="hub" data-id="${esc(h.id)}"><span>${esc(h.icon)}</span>${esc(h.name)}</button>`).join("");
  $("#content").innerHTML=({overview:dashboard,organization,projects:projectsPage,hubs:hubsPage,agents:agentsPage,knowledge:knowledgePage,activity:activityPage}[state.view]||dashboard)();
  if(state.view==="hubs"&&state.hub==="content")$("#content").insertAdjacentHTML("beforeend",mediaPanels());
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
    `<label class="field">Hub<select name="hubId">${hubs().map(h=>`<option value="${esc(h.id)}" ${h.id===selected?"selected":""}>${esc(h.name)}</option>`).join("")}</select></label><label class="field">Project (optional)<select name="project"><option value="">No project</option>${state.data.projects.map(p=>`<option value="${esc(p.id)}">${esc(p.title)} · ${esc(hub(p.hub_id)?.name)}</option>`).join("")}</select></label><label class="field">Mission title<input name="title" required maxlength="140" placeholder="What should your team deliver?"></label><label class="field">Objective<textarea name="objective" required maxlength="4000" placeholder="Describe the actual objective and constraints"></textarea></label><label class="field">Acceptance criteria · one per line<textarea name="criteria" required placeholder="What evidence would prove this is complete?"></textarea></label>`,
    data=>api("/api/missions",{method:"POST",body:JSON.stringify({hubId:data.get("hubId"),project:data.get("project"),title:data.get("title"),objective:data.get("objective"),criteria:String(data.get("criteria")).split("\n").map(c=>c.trim()).filter(Boolean)})}));
}
function newProject() {
  const selected=state.view==="hubs"&&state.hub?state.hub:"content";
  openModal("Create a project","Give a media brand, software product or other initiative a permanent home.",
    `<label class="field">Hub<select name="hubId">${hubs().map(h=>`<option value="${esc(h.id)}" ${h.id===selected?"selected":""}>${esc(h.name)}</option>`).join("")}</select></label><label class="field">Type<select name="kind"><option value="media-brand">Media brand</option><option value="software">Software product</option><option value="research">Research</option><option value="business">Business</option><option value="health">Health</option><option value="security">Security</option><option value="operations">Operations</option><option value="general">General</option></select></label><label class="field">Name<input name="title" required maxlength="140" placeholder="Project name"></label><label class="field">Mandate<textarea name="description" required maxlength="4000" placeholder="Who it serves and what the team will produce"></textarea></label>`,
    data=>api("/api/projects",{method:"POST",body:JSON.stringify(Object.fromEntries(data))}));
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
  else if(type==="new-project")newProject();
  else if(type==="new-media-account")newMediaAccount();
  else if(type==="new-media-campaign")newMediaCampaign();
  else if(type==="assign")assign(path);
  else if(type==="toggle-catalog"){state.onlyImported=!state.onlyImported;render()}
  else if(type==="inspect-mission"||type==="inspect-note"){state.inspected={type:type==="inspect-mission"?"mission":"note",id};renderInspector()}
  else if(type==="project-vault"){try{const result=await api("/api/vault/project",{method:"POST",body:"{}"});notify(`Vault projected: ${result.written.length} files written, ${result.conflicts.length} edit conflicts.`)}catch(error){notify(error.message,true)}}
});
$("#nav").addEventListener("click",event=>{const target=event.target.closest("[data-view]");if(target)setView(target.dataset.view)});
$("#new-mission").onclick=()=>newMission();
$("#close-inspector").onclick=()=>{state.inspected=null;renderInspector()};
$("#content").addEventListener("input",event=>{if(event.target.id==="agent-search"){const pos=event.target.selectionStart;state.search=event.target.value;render();const input=$("#agent-search");input.focus();input.setSelectionRange(pos,pos)}});
$("#content").addEventListener("submit",async event=>{
  if(event.target.id==="message-form"){event.preventDefault();try{await api("/api/messages",{method:"POST",body:JSON.stringify({hubId:state.hub,text:new FormData(event.target).get("text")})});await refresh();notify("Saved in the CEO inbox and executive feed; awaiting a connected runtime.")}catch(error){notify(error.message,true)}}
  if(event.target.id==="note-form"){event.preventDefault();try{await api("/api/notes",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(event.target)))});await refresh();notify("Scoped note saved. Project the vault to create its Markdown file.")}catch(error){notify(error.message,true)}}
});
$("#login-form").onsubmit=async event=>{event.preventDefault();state.token=$("#token").value;try{await refresh();sessionStorage.setItem("agas-token",state.token)}catch(error){$("#login-error").textContent=error.message;state.token=""}};
if(state.token)refresh().catch(()=>{sessionStorage.removeItem("agas-token");state.token="";$("#login-overlay").classList.remove("hidden")});
