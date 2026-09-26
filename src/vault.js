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

export async function importVaultNotes(store,basePath) {
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
    await managed("01 People and Organizations",`${goal.id}.md`,header({agas_id:`goal:${goal.id}`,type:"goal",parent_id:goal.parent_id,
      hub_id:goal.hub_id,project_id:goal.project_id,status:goal.status,revision:goal.version,provenance:"agas:goal"})+
      `# ${goal.title}\n\n${goal.objective}\n\nMeasure: ${goal.measure}\n\nLinked missions: ${state.missions.filter(m=>m.goal_id===goal.id).map(m=>m.title).join(", ")||"None yet"}.\n`);
  }
  for (const account of state.mediaAccounts) {
    await managed("02 Projects",`${account.id}.md`,header({agas_id:`media-account:${account.id}`,type:"media-account",project_id:account.project_id,platform:account.platform,status:account.status,provenance:"agas:media"})+
      `# ${account.handle}\n\nNiche: ${account.niche}\nLanguage: ${account.language}\n\nNo publishing connection or credentials are stored in this note.\n`);
  }
  for (const campaign of state.mediaCampaigns) {
    await managed("03 Missions",`${campaign.id}.md`,header({agas_id:`media-campaign:${campaign.id}`,type:"media-campaign",project_id:campaign.project_id,stage:campaign.stage,status:campaign.status,provenance:"agas:media"})+
      `# ${campaign.title}\n\n${campaign.objective}\n\nEditorial pipeline: research → strategy → creation → editing → media → review → publishing → engagement → analytics. Current stage: research.\n`);
  }
  for (const mission of state.missions) {
    const criteria=mission.criteria.map(c=>`- [ ] ${c}`).join("\n");
    const detail=store.missionDetail(mission.id);
    const tasks=detail.tasks.map(t=>`- ${t.title} · ${t.status}${t.assignment_id?` · configured specialist ${t.assignment_id}`:""}${detail.dependencies.filter(d=>d.task_id===t.id).map(d=>` · depends on ${d.prerequisite_id}`).join("")}`).join("\n");
    const evidence=detail.evidence.map(e=>`- Criterion ${e.criterion_index+1}: ${e.title} · ${e.status} · SHA-256 ${e.sha256}`).join("\n");
    const runs=detail.runs.map(r=>`- ${r.runtime} run ${r.id} · ${r.status} · base ${r.base_commit||"pending"}${r.result?` · ${r.result}`:""}`).join("\n");
    const artifacts=detail.artifacts.map(a=>`- ${a.path} · ${a.status} · SHA-256 ${a.sha256||"not recorded"}`).join("\n");
    const branches=detail.reviewBranches.map(b=>`- ${b.branch} · commit ${b.commit_sha} · base ${b.base_commit}`).join("\n");
    await managed("03 Missions",`${mission.id}.md`,header({agas_id:`mission:${mission.id}`,type:"mission",hub_id:mission.hub_id,project:mission.project,goal_id:mission.goal_id,revision:mission.version,status:mission.status,provenance:"agas:mission"})+
      `# ${mission.title}\n\n${mission.objective}\n\nLinked goal: ${state.goals.find(g=>g.id===mission.goal_id)?.title||"None"}.\n\n## Acceptance criteria\n${criteria}\n\n## Tasks\n${tasks||"No tasks yet."}\n\n## Runs\n${runs||"No agent runs yet."}\n\n## Recorded files\n${artifacts||"No files yet."}\n\n## Review branches\n${branches||"No local review branch yet."}\n\n## Evidence ledger\n${evidence||"No evidence yet."}\n\nFile integrity is checked for linked artifacts. Owner review remains separate from semantic or external verification. Full evidence stays in AGAS.\n`);
  }
  for (const handoff of state.handoffs) {
    await managed("09 Decisions and Evidence",`${handoff.id}.md`,header({agas_id:`handoff:${handoff.id}`,
      type:"handoff",source_mission_id:handoff.source_mission_id,target_mission_id:handoff.target_mission_id,
      source_evidence_id:handoff.source_evidence_id,from_hub_id:handoff.from_hub_id,to_hub_id:handoff.to_hub_id,
      evidence_sha256:handoff.evidence_sha256,status:handoff.status,revision:handoff.version,provenance:"agas:handoff"})+
      `# ${handoff.title}\n\n${handoff.purpose}\n\nResponse: ${handoff.response_note||"Pending recipient review"}.\n\nThe source evidence body is readable in its authorized AGAS mission.\n`);
  }
  for (const note of store.allNotesForVault()) {
    const folder=noteFolder(note);
    await managed(folder,`${note.id}.md`,header({agas_id:`note:${note.id}`,type:"note",scope:note.scope,owner_id:note.owner_id,revision:note.revision,provenance:"agas:context"})+
      `# ${note.title}\n\n${note.content}\n`);
  }
  return { root, written, conflicts, projectCount:state.projects.length, mediaAccountCount:state.mediaAccounts.length,
    mediaCampaignCount:state.mediaCampaigns.length, noteCount:store.allNotesForVault().length, missionCount:state.missions.length };
}
