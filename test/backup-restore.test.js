import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store.js";
import { createSnapshot, restoreSnapshot } from "../src/backup.js";
import { projectVault } from "../src/vault.js";

test("database, Obsidian vault and recorded run bytes survive an isolated restore drill",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-snapshot-")),dbPath=join(root,"source","agas.db");
  const vault=join(root,"source","AGAS Vault"),workspaces=join(root,"source","workspaces");
  const store=new Store(dbPath);
  const project=store.createProject({hubId:"dev",title:"Product",kind:"software",description:"Source app"});
  store.linkProjectRepository(project.id,join(root,"external-repo"));
  const note=store.createNote({title:"Approved decision",content:"Source backed note",scope:"project",ownerId:project.id});
  const mission=store.createMission({hubId:"dev",project:project.id,title:"Delivery",objective:"Produce the file",criteria:["File exists"]});
  const assignment=store.assignPersona({hubId:"dev",path:"engineering/engineering-frontend-developer.md",runtime:"codex"});
  const task=store.createTask(mission.id,{title:"Write",objective:"File",assignmentId:assignment.id,expectedVersion:1}).tasks[0];
  const run=store.queueRun(mission.id,task.id,{expectedVersion:2,timeoutSeconds:30});
  store.claimRun(run.id);
  const workspace=join(workspaces,run.id),content="Approved output\n",hash=createHash("sha256").update(content).digest("hex");
  await mkdir(workspace,{recursive:true});
  await writeFile(join(workspace,"result.txt"),content);
  store.preparedRun(run.id,workspace,"0123456789012345678901234567890123456789");
  store.runningRun(run.id,12345);
  store.completeRun(run.id,{status:"succeeded",result:"Output ready",artifacts:[{path:"result.txt",status:"recorded",sha256:hash,bytes:content.length}]});
  await projectVault(store,vault);
  store.close();

  const bundle=join(root,"bundle"),restored=join(root,"restored");
  const manifest=await createSnapshot({database:dbPath,vault,workspaces,output:bundle});
  assert(manifest.files.some(file=>file.path.endsWith("result.txt")));
  assert(manifest.files.some(file=>file.path.endsWith("agas.db")));
  assert.equal((await restoreSnapshot({bundle,destination:restored})).root,restored);
  const recovered=new Store(join(restored,"data","agas.db"));
  try {
    assert.equal(recovered.overview().projects[0].repository_path,null);
    assert.equal(recovered.missionDetail(mission.id).runs[0].status,"succeeded");
    assert(recovered.verifyRecordedFile(run.id,"result.txt",hash));
    assert.equal((await readFile(join(restored,"data","workspaces",run.id,"result.txt"),"utf8")),content);
    assert((await readFile(join(restored,"data","AGAS Vault","02 Projects",note.id+".md"),"utf8")).includes("Source backed note"));
  } finally {recovered.close()}
  await assert.rejects(restoreSnapshot({bundle,destination:restored}),/already exists/);
  const record=manifest.files.find(file=>file.path.endsWith("result.txt"));
  await writeFile(join(bundle,record.path),"Damaged output");
  const corruptTarget=join(root,"corrupt-restore");
  await assert.rejects(restoreSnapshot({bundle,destination:corruptTarget}),/checksum mismatch/);
  await assert.rejects(stat(corruptTarget),{code:"ENOENT"});
});
