import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store.js";
import { ExecutionManager } from "../src/execution.js";
import { projectVault } from "../src/vault.js";

test("failed and interrupted runs open durable Management incidents resolved only by their response mission",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-incident-")),db=join(root,"agas.db"),vault=join(root,"vault");
  let store=new Store(db);
  const project=store.createProject({hubId:"dev",title:"Source code",kind:"software",description:"Local repo"});
  store.linkProjectRepository(project.id,root);
  const mission=store.createMission({hubId:"dev",project:project.id,title:"Worker",objective:"Produce a file",criteria:["Result"]});
  const assignment=store.assignPersona({hubId:"dev",path:"engineering/engineering-frontend-developer.md",runtime:"codex"});
  let detail=store.createTask(mission.id,{title:"Write file",objective:"Create it",assignmentId:assignment.id,expectedVersion:1});
  const taskId=detail.tasks[0].id,first=store.queueRun(mission.id,taskId,{expectedVersion:2,timeoutSeconds:30});
  store.claimRun(first.id);
  store.completeRun(first.id,{status:"failed",result:"Worker ended before producing a file"});
  let incidents=store.overview().incidents;
  assert.equal(incidents.length,1);
  assert.equal(incidents[0].status,"open");
  assert.equal(store.missionDetail(incidents[0].resolution_mission_id).mission.hub_id,"management");
  assert.throws(()=>store.reviewIncident(incidents[0].id,{decision:"resolve",reviewNote:"Too early",expectedVersion:1}),/reload/);
  store.close();

  store=new Store(db);
  assert.equal(store.overview().incidents.length,1,"restart does not duplicate a failed run's incident");
  const incident=store.reviewIncident(incidents[0].id,{decision:"acknowledge",
    reviewNote:"Checked failure log; no file was committed",expectedVersion:1});
  assert.equal(incident.status,"acknowledged");
  const responseId=incident.resolution_mission_id;
  detail=store.createTask(responseId,{title:"Reconcile run",objective:"Inspect logs and partial work",expectedVersion:1});
  for(let index=0;index<3;index++){
    detail=store.submitEvidence(responseId,{taskId:detail.tasks[0].id,criterionIndex:index,kind:"observation",
      title:`Owner check ${index+1}`,content:`Checked criterion ${index+1} for run ${first.id}`,
      expectedVersion:detail.mission.version});
    const evidence=detail.evidence.find(e=>e.criterion_index===index);
    detail=store.reviewEvidence(responseId,evidence.id,{decision:"reviewed",reviewNote:"Inspected recorded state",
      expectedVersion:detail.mission.version});
  }
  detail=store.acceptTask(responseId,detail.tasks[0].id,{expectedVersion:detail.mission.version});
  detail=store.acceptMission(responseId,{expectedVersion:detail.mission.version});
  const resolution=detail.evidence[0];
  store.db.prepare("UPDATE mission_evidence SET content='changed after review' WHERE id=?").run(resolution.id);
  assert.throws(()=>store.reviewIncident(incident.id,{decision:"resolve",missionId:responseId,evidenceId:resolution.id,
    reviewNote:"Reconciled",expectedVersion:2}),/unchanged/);
  store.db.prepare("UPDATE mission_evidence SET content=? WHERE id=?").run(resolution.content,resolution.id);
  const resolved=store.reviewIncident(incident.id,{decision:"resolve",missionId:responseId,evidenceId:resolution.id,
    reviewNote:"Reviewed logs and verified no partial file or external effect",expectedVersion:2});
  assert.equal(resolved.status,"resolved");
  assert.equal(store.overview().incidents[0].evidence_current,true);
  store.db.prepare("UPDATE mission_evidence SET content='tampered after incident resolution' WHERE id=?").run(resolution.id);
  assert.equal(store.overview().incidents[0].evidence_current,false);
  await projectVault(store,vault);
  assert.match(await readFile(join(vault,"09 Decisions and Evidence",incident.id+".md"),"utf8"),/Changed; inspect before use/);

  const retry=store.queueRun(mission.id,taskId,{expectedVersion:store.missionDetail(mission.id).mission.version,
    timeoutSeconds:30});
  store.claimRun(retry.id);
  store.close();
  store=new Store(db);
  const manager=new ExecutionManager(store,{adapters:{},workspaces:join(root,"workspaces")});
  assert.equal(store.missionDetail(mission.id).runs.find(r=>r.id===retry.id).status,"interrupted");
  assert.equal(store.overview().incidents.length,2);
  assert.equal(store.overview().incidents.find(i=>i.run_id===retry.id).status,"open");
  assert.equal(store.queuedRuns().length,0,"interrupted work is held for inspection");
  manager.shutdown();store.close();
});
