import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";

const FOLDERS = [
  "00 System","01 People and Organizations","02 Projects","03 Missions","04 Hubs",
  "05 Agents","06 Workflows and Skills","07 Knowledge","08 Artifacts","09 Decisions and Evidence","99 Archive"
];
const q = value => JSON.stringify(value);
const header = properties => `---\n${Object.entries(properties).map(([key,value])=>`${key}: ${q(value)}`).join("\n")}\n---\n`;

export async function projectVault(store, basePath) {
  const root = resolve(basePath);
  for (const folder of FOLDERS) await mkdir(join(root,folder),{recursive:true,mode:0o700});
  const state = store.overview();
  const conflicts = [], written = [];
  async function managed(folder, name, body) {
    const target=resolve(root,folder,name);
    if (!target.startsWith(root+sep)) throw new Error("Vault path escaped root");
    const previous=await readFile(target,"utf8").catch(error=>{if(error.code==="ENOENT")return null;throw error});
    if(previous===body)return;
    if(previous!==null){ conflicts.push(join(folder,name));return; }
    const temporary=`${target}.${randomUUID()}.tmp`;
    await writeFile(temporary,body,{mode:0o600});
    await rename(temporary,target);
    written.push(join(folder,name));
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
  for (const mission of state.missions) {
    const criteria=mission.criteria.map(c=>`- [ ] ${c}`).join("\n");
    await managed("03 Missions",`${mission.id}.md`,header({agas_id:`mission:${mission.id}`,type:"mission",hub_id:mission.hub_id,project:mission.project,revision:mission.version,status:mission.status,provenance:"agas:mission"})+
      `# ${mission.title}\n\n${mission.objective}\n\n## Acceptance criteria\n${criteria}\n`);
  }
  for (const note of store.allNotesForVault()) {
    const folder=note.scope==="private"?"01 People and Organizations":
      note.scope==="project"?"02 Projects":note.scope==="hub"?"04 Hubs":"07 Knowledge";
    await managed(folder,`${note.id}.md`,header({agas_id:`note:${note.id}`,type:"note",scope:note.scope,owner_id:note.owner_id,revision:note.revision,provenance:"agas:context"})+
      `# ${note.title}\n\n${note.content}\n`);
  }
  return { root, written, conflicts, projectCount:state.projects.length, noteCount:store.allNotesForVault().length, missionCount:state.missions.length };
}
