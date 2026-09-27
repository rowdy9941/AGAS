import { lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";

const FOLDERS = [
  "00 System","01 People and Organizations","02 Projects","03 Missions","04 Hubs",
  "05 Agents","06 Workflows and Skills","07 Knowledge","08 Artifacts","09 Decisions and Evidence","99 Archive"
];
const q = value => JSON.stringify(value);
const header = properties => `---\n${Object.entries(properties).map(([key,value])=>`${key}: ${q(value)}`).join("\n")}\n---\n`;
const sha256 = text => createHash("sha256").update(text).digest("hex");
const noteFolder=note=>note.scope==="private"?"01 People and Organizations":
  note.scope==="project"?"02 Projects":note.scope==="hub"?"04 Hubs":"07 Knowledge";
const missionMetadata=mission=>({agas_id:`mission:${mission.id}`,type:"mission",hub_id:mission.hub_id,
  project:mission.project,goal_id:mission.goal_id,revision:mission.version,status:mission.status,provenance:"agas:mission"});
const goalMetadata=goal=>({agas_id:`goal:${goal.id}`,type:"goal",parent_id:goal.parent_id,
  hub_id:goal.hub_id,project_id:goal.project_id,status:goal.status,revision:goal.version,provenance:"agas:goal"});
const goalBody=(state,goal)=>header(goalMetadata(goal))+
  `# ${goal.title}\n\n${goal.objective}\n\nMeasure: ${goal.measure}\n\nLinked missions: ${state.missions.filter(m=>m.goal_id===goal.id).map(m=>m.title).join(", ")||"None yet"}.\n`;
function missionBody(store,state,mission) {
  const criteria=mission.criteria.map(c=>`- [ ] ${c}`).join("\n");
  const detail=store.missionDetail(mission.id);
  const tasks=detail.tasks.map(t=>`- ${t.title} · ${t.status}${t.assignment_id?` · configured specialist ${t.assignment_id}`:""}${detail.dependencies.filter(d=>d.task_id===t.id).map(d=>` · depends on ${d.prerequisite_id}`).join("")}${t.required_handoff_id?` · requires handoff ${t.required_handoff_id}${t.auto_on_handoff?" · one automatic dispatch after prerequisites":""}`:""}`).join("\n");
  const evidence=detail.evidence.map(e=>`- Criterion ${e.criterion_index+1}: ${e.title} · ${e.status} · SHA-256 ${e.sha256} · ${e.verification}`).join("\n");
  const runs=detail.runs.map(r=>`- ${r.runtime} run ${r.id} · ${r.status} · ${r.base_commit?`base ${r.base_commit}`:"text-only"}${r.output_sha256?` · output SHA-256 ${r.output_sha256}`:""}${r.result?` · ${r.result}`:""}`).join("\n");
  const artifacts=detail.artifacts.map(a=>`- ${a.path} · ${a.status} · SHA-256 ${a.sha256||"not recorded"}`).join("\n");
  const branches=detail.reviewBranches.map(b=>`- ${b.branch} · commit ${b.commit_sha} · base ${b.base_commit}`).join("\n");
  return header(missionMetadata(mission))+`# ${mission.title}\n\n${mission.objective}\n\nLinked goal: ${state.goals.find(g=>g.id===mission.goal_id)?.title||"None"}.\n\n## Acceptance criteria\n${criteria}\n\n## Tasks\n${tasks||"No tasks yet."}\n\n## Runs\n${runs||"No agent runs yet."}\n\n## Recorded files\n${artifacts||"No files yet."}\n\n## Review branches\n${branches||"No local review branch yet."}\n\n## Evidence ledger\n${evidence||"No evidence yet."}\n\nRecorded file or text integrity is checked for linked artifacts. Owner review remains separate from semantic or external verification. Full evidence stays in AGAS.\n`;
}

export async function importVaultEdits(store,basePath) {
  const root=resolve(basePath),conflicts=[],imported=[];
  const rootInfo=await lstat(root).catch(error=>{if(error.code==="ENOENT")return null;throw error});
  if(!rootInfo)return {imported,conflicts};
  if(rootInfo.isSymbolicLink()||!rootInfo.isDirectory())throw new Error("Vault root must be a regular directory");
  for(const note of store.allNotesForVault()) {
    const relative=join(noteFolder(note),`${note.id}.md`),path=resolve(root,relative);
    if(!path.startsWith(root+sep)){conflicts.push(relative);continue}
    try {
      const folder=await lstat(resolve(root,noteFolder(note)));
      const file=await lstat(path);
      if(folder.isSymbolicLink()||!folder.isDirectory()||file.isSymbolicLink()||!file.isFile()||file.size>65536)
        throw new Error("Vault note is not a bounded regular file");
      const body=await readFile(path,"utf8"),sourceHash=sha256(body),baselineHash=store.projectionHash(relative);
      if(sourceHash===baselineHash)continue;
      if(!baselineHash)throw new Error("No AGAS projection baseline");
      const match=body.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if(!match)throw new Error("Malformed note metadata");
      const metadata=Object.fromEntries(match[1].split("\n").map(line=>{
        const divider=line.indexOf(": ");
        if(divider<1)throw new Error("Malformed metadata field");
        return [line.slice(0,divider),JSON.parse(line.slice(divider+2))];
      }));
      if(metadata.agas_id!==`note:${note.id}`||metadata.type!=="note"||metadata.scope!==note.scope||
        metadata.owner_id!==note.owner_id||metadata.revision!==note.revision||metadata.provenance!=="agas:context")
        throw new Error("Vault metadata or note revision changed");
      const content=match[2].match(/^# ([^\n]+)\n\n([\s\S]*)\n$/);
      if(!content)throw new Error("Note must contain a title and body");
      store.importNoteEdit({id:note.id,title:content[1],content:content[2],scope:note.scope,
        ownerId:note.owner_id,revision:note.revision,path:relative,sourceHash,baselineHash});
      imported.push(relative);
    } catch(error) {
      if(error.code!=="ENOENT")conflicts.push(relative);
    }
  }
  const state=store.overview();
  for(const goal of state.goals) {
    const relative=join("01 People and Organizations",`${goal.id}.md`),path=resolve(root,relative);
    if(!path.startsWith(root+sep)){conflicts.push(relative);continue}
    try {
      const folder=await lstat(resolve(root,"01 People and Organizations")),file=await lstat(path);
      if(folder.isSymbolicLink()||!folder.isDirectory()||file.isSymbolicLink()||!file.isFile()||file.size>65536)
        throw new Error("Vault goal is not a bounded regular file");
      const body=await readFile(path,"utf8"),sourceHash=sha256(body),baselineHash=store.projectionHash(relative);
      if(sourceHash===baselineHash)continue;
      const expected=goalBody(state,goal),metadata=header(goalMetadata(goal));
      if(!baselineHash||baselineHash!==sha256(expected))throw new Error("Goal changed since projection");
      const immutable=`\n\nLinked missions: ${state.missions.filter(m=>m.goal_id===goal.id).map(m=>m.title).join(", ")||"None yet"}.\n`;
      if(!body.startsWith(metadata)||!body.endsWith(immutable))
        throw new Error("Goal metadata or linked missions changed");
      const editable=body.slice(metadata.length,body.length-immutable.length);
      const parsed=editable.match(/^# ([^\n]+)\n\n([\s\S]+)\n\nMeasure: ([^\n]+)$/);
      if(!parsed||parsed[1]===goal.title&&parsed[2]===goal.objective&&parsed[3]===goal.measure)
        throw new Error("Edit only the goal title, objective or measure");
      store.importGoalBrief({id:goal.id,title:parsed[1],objective:parsed[2],measure:parsed[3],
        revision:goal.version,parentId:goal.parent_id,hubId:goal.hub_id,projectId:goal.project_id,
        status:goal.status,path:relative,sourceHash,baselineHash});
      imported.push(relative);
    } catch(error) {if(error.code!=="ENOENT")conflicts.push(relative)}
  }
  for(const mission of state.missions) {
    const relative=join("03 Missions",`${mission.id}.md`),path=resolve(root,relative);
    if(!path.startsWith(root+sep)){conflicts.push(relative);continue}
    try {
      const folder=await lstat(resolve(root,"03 Missions")),file=await lstat(path);
      if(folder.isSymbolicLink()||!folder.isDirectory()||file.isSymbolicLink()||!file.isFile()||file.size>65536)
        throw new Error("Vault mission is not a bounded regular file");
      const body=await readFile(path,"utf8"),sourceHash=sha256(body),baselineHash=store.projectionHash(relative);
      if(sourceHash===baselineHash)continue;
      const expected=missionBody(store,state,mission),metadata=header(missionMetadata(mission));
      if(!baselineHash||baselineHash!==sha256(expected))throw new Error("Mission changed since projection");
      const originalBrief=`# ${mission.title}\n\n${mission.objective}`;
      const immutable=expected.slice(metadata.length+originalBrief.length);
      if(!body.startsWith(metadata)||!body.endsWith(immutable))
        throw new Error("Mission metadata or generated sections changed");
      const editable=body.slice(metadata.length,body.length-immutable.length);
      const parsed=editable.match(/^# ([^\n]+)\n\n([\s\S]+)$/);
      if(!parsed||parsed[1]===mission.title&&parsed[2]===mission.objective)
        throw new Error("Edit only the mission title or objective");
      store.importMissionBrief({id:mission.id,title:parsed[1],objective:parsed[2],revision:mission.version,
        hubId:mission.hub_id,project:mission.project,goalId:mission.goal_id,path:relative,sourceHash,baselineHash});
      imported.push(relative);
    } catch(error) {if(error.code!=="ENOENT")conflicts.push(relative)}
  }
  return {imported,conflicts};
}

export async function projectVault(store, basePath) {
  const root = resolve(basePath);
  await mkdir(root,{recursive:true,mode:0o700});
  if((await lstat(root)).isSymbolicLink())throw new Error("Vault root cannot be a symlink");
  for (const folder of FOLDERS) {
    const location=join(root,folder);
    await mkdir(location,{recursive:true,mode:0o700});
    const info=await lstat(location);
    if(info.isSymbolicLink()||!info.isDirectory())throw new Error("Vault folder cannot be a symlink or file");
  }
  const state = store.overview();
  const conflicts = [], written = [];
  async function managed(folder, name, body) {
    const target=resolve(root,folder,name);
    if (!target.startsWith(root+sep)) throw new Error("Vault path escaped root");
    const relative=join(folder,name);
    const info=await lstat(target).catch(error=>{if(error.code==="ENOENT")return null;throw error});
    if(info&&(info.isSymbolicLink()||!info.isFile())){conflicts.push(relative);return}
    const previous=await readFile(target,"utf8").catch(error=>{if(error.code==="ENOENT")return null;throw error});
    if(previous===body){store.recordProjection(relative,sha256(body));return}
    if(previous!==null&&store.projectionHash(relative)!==sha256(previous)){conflicts.push(relative);return}
    const temporary=`${target}.${randomUUID()}.tmp`;
    try {await writeFile(temporary,body,{mode:0o600});await rename(temporary,target)}
    finally {await unlink(temporary).catch(error=>{if(error.code!=="ENOENT")throw error})}
    store.recordProjection(relative,sha256(body));
    written.push(relative);
  }
  await managed("00 System","AGAS.md",header({agas_id:"agas",type:"organization",version:1})+
    `# AGAS\n\nAccessible General AI System by Raghunath D.\n\nThis is one Obsidian vault projected from AGAS's scoped context. Missions and notes have canonical IDs and provenance; the database holds authoritative state. Open this folder as a vault in Obsidian.\n`);
  for (const hub of state.hubs) {
    await managed("04 Hubs",`${hub.id}.md`,header({agas_id:`hub:${hub.id}`,type:"hub",scope:"organization",version:1})+
      `# ${hub.name}\n\n${hub.mandate}\n\nCEO: ${state.leaders.find(l=>l.hub_id===hub.id)?.name}\n`);
  }
  for (const project of state.projects) {
    await managed("02 Projects",`${project.id}.md`,header({agas_id:`project:${project.id}`,type:"project",hub_id:project.hub_id,kind:project.kind,status:project.status,provenance:"agas:project"})+
      `# ${project.title}\n\n${project.description}\n\nDev run quota per month: ${project.monthly_run_limit??"not set"}.\n`);
  }
  for (const goal of state.goals) {
    await managed("01 People and Organizations",`${goal.id}.md`,goalBody(state,goal));
  }
  for (const account of state.mediaAccounts) {
    await managed("02 Projects",`${account.id}.md`,header({agas_id:`media-account:${account.id}`,type:"media-account",project_id:account.project_id,platform:account.platform,status:account.status,provenance:"agas:media"})+
      `# ${account.handle}\n\nNiche: ${account.niche}\nLanguage: ${account.language}\n\nNo publishing connection or credentials are stored in this note.\n`);
  }
  for (const paper of state.paperAccounts) {
    const detail=store.paperAccountDetail(paper.id);
    const positions=detail.positions.map(p=>`- ${p.symbol}: ${p.quantity} units · cost ${p.cost_paise} paise · manually marked ${p.mark?.price_paise??"unavailable"} paise`).join("\n");
    const replays=detail.backtests.map(b=>`- ${b.symbol} · replay ${b.id} · ending ${b.ending_equity_paise} paise · ${b.trade_count} simulated fills · SHA-256 ${b.sha256}`).join("\n");
    await managed("02 Projects",`${paper.id}.md`,header({agas_id:`paper-account:${paper.id}`,type:"paper-account",project_id:paper.project_id,
      version:paper.version,scope:"finance",provenance:"agas:paper-ledger"})+
      `# ${paper.title}\n\nSimulation only. No broker connection, live orders or independently verified prices.\n\nCurrency: ${paper.currency}. Starting cash: ${paper.starting_cash_paise} paise. Current paper cash: ${paper.cash_paise} paise. Single purchase cap: ${paper.max_trade_bps}/10000 of starting cash.\n\n## Paper positions\n${positions||"No positions."}\n\n## Historical manual-mark replays\n${replays||"No replay yet."}\n\nManual mark sources and simulated orders are recorded in AGAS.\n`);
  }
  for (const opportunity of state.businessOpportunities) {
    await managed("02 Projects",`${opportunity.id}.md`,header({agas_id:`business-opportunity:${opportunity.id}`,
      type:"business-opportunity",project_id:opportunity.project_id,revision:opportunity.version,
      status:opportunity.status,scope:"business",provenance:"agas:business"})+
      `# ${opportunity.title}\n\nCustomer segment: ${opportunity.segment}\n\nHypothesis: ${opportunity.hypothesis}\n\nOwner review: ${opportunity.decision_note||"Pending an accepted Business mission"}.\n\nSource mission: ${opportunity.mission_id||"None"}. Reviewed evidence: ${opportunity.evidence_id||"None"}. SHA-256: ${opportunity.evidence_sha256||"None"}. Source integrity: ${opportunity.evidence_current===null?"Not yet reviewed":opportunity.evidence_current?"Current":"Changed; inspect before use"}.\n\nNo customer contact or commercial commitment is recorded by this decision. MBAs stays separate.\n`);
  }
  for (const assessment of state.securityAssessments) {
    await managed("02 Projects",`${assessment.id}.md`,header({agas_id:`security-assessment:${assessment.id}`,
      type:"security-assessment",project_id:assessment.project_id,scope:"security",
      valid_until:assessment.valid_until,provenance:"agas:security"})+
      `# ${assessment.asset_label}\n\nAllowed scope: ${assessment.scope_note}.\n\nAuthorizing person: ${assessment.authorized_by}. Authorization basis: ${assessment.authorization_note}. Valid through: ${assessment.valid_until} UTC.\n\nThis is an owner attestation, not a scan permit or independent proof of authorization.\n`);
  }
  for (const profile of state.healthProfiles) {
    const events=state.healthConsentEvents.filter(event=>event.profile_id===profile.id)
      .map(event=>`- ${event.occurred_at} · ${event.action} · through ${event.valid_until} UTC`).join("\n");
    const items=state.healthCareItems.filter(item=>item.profile_id===profile.id)
      .map(item=>`- ${item.kind} · ${item.title} · ${item.status}${item.evidence_current===false?" · evidence changed":""}`).join("\n");
    await managed("02 Projects",`${profile.id}.md`,header({agas_id:`health-profile:${profile.id}`,
      type:"health-profile",project_id:profile.project_id,revision:profile.version,
      status:profile.status,scope:"health",provenance:"agas:health"})+
      `# ${profile.alias}\n\nLocal coordination consent: ${profile.consent_current?"current":"expired or revoked"}. Valid through ${profile.valid_until} UTC.\n\n## Consent history\n${events||"None"}\n\n## Administrative care items\n${items||"None"}\n\nFull owner review remains inside AGAS. Existing records and snapshots are retained after consent revocation. No clinical decision or external provider action is recorded here.\n`);
  }
  for (const finding of state.securityFindings) {
    await managed("09 Decisions and Evidence",`${finding.id}.md`,header({agas_id:`security-finding:${finding.id}`,
      type:"security-finding",assessment_id:finding.assessment_id,revision:finding.version,
      status:finding.status,scope:"security",provenance:"agas:security"})+
      `# ${finding.title}\n\nSeverity: ${finding.severity}. Source mission: ${finding.source_mission_id}. Source evidence: ${finding.source_evidence_id}. SHA-256: ${finding.source_sha256}. Source integrity: ${finding.source_current?"Current":"Changed; inspect before use"}.\n\nRemediation mission: ${finding.remediation_mission_id||"None"}. Evidence: ${finding.remediation_evidence_id||"None"}. SHA-256: ${finding.remediation_sha256||"None"}. Source integrity: ${finding.remediation_current===null?"Pending owner review":finding.remediation_current?"Current":"Changed; inspect before use"}.\n\nOwner review: ${finding.review_note||"Pending"}. No independent retest or active scan is claimed.\n`);
  }
  for (const campaign of state.mediaCampaigns) {
    const detail=store.mediaCampaignDetail(campaign.id);
    const trail=detail.artifacts.map(item=>`- ${item.stage} · ${item.status} · ${item.title} · SHA-256 ${item.sha256}`).join("\n");
    const packets=detail.packets.map(item=>`- ${item.account_id} · ${item.status} · SHA-256 ${item.sha256}${item.approved_at?` · owner approval ${item.approved_at}: ${item.approval_note}`:""}`).join("\n");
    await managed("03 Missions",`${campaign.id}.md`,header({agas_id:`media-campaign:${campaign.id}`,type:"media-campaign",project_id:campaign.project_id,stage:campaign.stage,status:campaign.status,provenance:"agas:media"})+
      `# ${campaign.title}\n\n${campaign.objective}\n\nEditorial pipeline: research → strategy → creation → editing → media → review → local publication packet → owner approval. Current stage: ${campaign.stage}.\n\n## Reviewed work\n${trail||"No submissions yet."}\n\n## Local publication packets\n${packets||"No packets yet; no external publication is claimed."}\n\nLocal approval does not publish to an external channel.\n`);
  }
  for (const mission of state.missions) {
    await managed("03 Missions",`${mission.id}.md`,missionBody(store,state,mission));
  }
  for (const handoff of state.handoffs) {
    await managed("09 Decisions and Evidence",`${handoff.id}.md`,header({agas_id:`handoff:${handoff.id}`,
      type:"handoff",source_mission_id:handoff.source_mission_id,target_mission_id:handoff.target_mission_id,
      source_evidence_id:handoff.source_evidence_id,from_hub_id:handoff.from_hub_id,to_hub_id:handoff.to_hub_id,
      evidence_sha256:handoff.evidence_sha256,status:handoff.status,revision:handoff.version,provenance:"agas:handoff"})+
      `# ${handoff.title}\n\n${handoff.purpose}\n\nResponse: ${handoff.response_note||"Pending recipient review"}.\n\nThe source evidence body is readable in its authorized AGAS mission.\n`);
  }
  for (const incident of state.incidents) {
    await managed("09 Decisions and Evidence",`${incident.id}.md`,header({agas_id:`incident:${incident.id}`,
      type:"run-incident",run_id:incident.run_id,source_hub_id:incident.source_hub_id,
      response_mission_id:incident.resolution_mission_id,status:incident.status,
      revision:incident.version,provenance:"agas:management"})+
      `# ${incident.title}\n\nRun: ${incident.run_id}. Source hub: ${incident.source_hub_id}.\n\nAcknowledgement: ${incident.acknowledgement_note||"Pending"}.\n\nResolution: ${incident.resolution_note||"Pending accepted Management evidence"}. Evidence SHA-256: ${incident.evidence_sha256||"None"}. Source integrity: ${incident.evidence_current===null?"Not yet resolved":incident.evidence_current?"Current":"Changed; inspect before use"}.\n\nInspect the partial workspace before retry. This incident record does not automatically replay the run.\n`);
  }
  for (const procedure of state.procedures) {
    await managed("06 Workflows and Skills",`${procedure.id}.md`,header({agas_id:`procedure:${procedure.id}`,
      type:"hub-procedure",hub_id:procedure.hub_id,project_id:procedure.project_id,
      status:procedure.status,revision:procedure.version,provenance:"agas:procedure"})+
      `# ${procedure.title}\n\n${procedure.instructions}\n\nInstructions SHA-256: ${procedure.instructions_sha256}.\n\nSource mission: ${procedure.source_mission_id}. Reviewed evidence: ${procedure.source_evidence_id}. SHA-256: ${procedure.source_sha256}. Integrity: ${procedure.source_current?"Current":"Changed; not used"}.\n\nSeparate evaluation mission: ${procedure.evaluation_mission_id||"Pending"}. Reviewed evidence: ${procedure.evaluation_evidence_id||"Pending"}. SHA-256: ${procedure.evaluation_sha256||"Pending"}. Integrity: ${procedure.evaluation_current===null?"Pending":procedure.evaluation_current?"Current":"Changed; not used"}.\n\nOwner review: ${procedure.review_note||"Pending"}. This is procedural guidance, not model training or a runtime permission grant. Active guidance is skipped if its evidence changes.\n`);
  }
  for (const note of store.allNotesForVault()) {
    const folder=noteFolder(note);
    await managed(folder,`${note.id}.md`,header({agas_id:`note:${note.id}`,type:"note",scope:note.scope,owner_id:note.owner_id,revision:note.revision,provenance:"agas:context"})+
      `# ${note.title}\n\n${note.content}\n`);
  }
  return { root, written, conflicts, projectCount:state.projects.length, mediaAccountCount:state.mediaAccounts.length,
    mediaCampaignCount:state.mediaCampaigns.length, noteCount:store.allNotesForVault().length, missionCount:state.missions.length };
}
