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
      `# ${project.title}\n\n${project.description}\n`);
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
    const tasks=detail.tasks.map(t=>`- ${t.title} · ${t.status}${t.assignment_id?` · configured specialist ${t.assignment_id}`:""}`).join("\n");
    const evidence=detail.evidence.map(e=>`- Criterion ${e.criterion_index+1}: ${e.title} · ${e.status} · SHA-256 ${e.sha256}`).join("\n");
    await managed("03 Missions",`${mission.id}.md`,header({agas_id:`mission:${mission.id}`,type:"mission",hub_id:mission.hub_id,project:mission.project,revision:mission.version,status:mission.status,provenance:"agas:mission"})+
      `# ${mission.title}\n\n${mission.objective}\n\n## Acceptance criteria\n${criteria}\n\n## Tasks\n${tasks||"No tasks yet."}\n\n## Evidence ledger\n${evidence||"No evidence yet."}\n\nOwner review is separate from independent verification. Full evidence stays in AGAS.\n`);
  }
  for (const note of store.allNotesForVault()) {
    const folder=note.scope==="private"?"01 People and Organizations":
      note.scope==="project"?"02 Projects":note.scope==="hub"?"04 Hubs":"07 Knowledge";
    await managed(folder,`${note.id}.md`,header({agas_id:`note:${note.id}`,type:"note",scope:note.scope,owner_id:note.owner_id,revision:note.revision,provenance:"agas:context"})+
      `# ${note.title}\n\n${note.content}\n`);
  }
  return { root, written, conflicts, projectCount:state.projects.length, mediaAccountCount:state.mediaAccounts.length,
    mediaCampaignCount:state.mediaCampaigns.length, noteCount:store.allNotesForVault().length, missionCount:state.missions.length };
}
