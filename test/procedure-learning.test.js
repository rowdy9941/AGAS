import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Store } from "../src/store.js";
import { ExecutionManager } from "../src/execution.js";
import { projectVault } from "../src/vault.js";

function acceptedEvidence(store,hubId,project,title) {
  const mission=store.createMission({hubId,project,title,objective:`Review ${title}`,
    criteria:["Inspect a recorded outcome"]});
  let detail=store.createTask(mission.id,{title:"Review result",objective:"Record observed result",expectedVersion:1});
  const taskId=detail.tasks[0].id;
  detail=store.submitEvidence(mission.id,{taskId,criterionIndex:0,kind:"observation",title:"Observed result",
    content:`Owner observed the result for ${title}`,expectedVersion:detail.mission.version});
  const evidenceId=detail.evidence[0].id;
  detail=store.reviewEvidence(mission.id,evidenceId,{decision:"reviewed",reviewNote:"Inspected source",
    expectedVersion:detail.mission.version});
  detail=store.acceptTask(mission.id,taskId,{expectedVersion:detail.mission.version});
  detail=store.acceptMission(mission.id,{expectedVersion:detail.mission.version});
  return {mission:detail.mission,evidence:detail.evidence[0]};
}

test("a reusable procedure needs separate scoped evaluation, explicit activation and verifiable prompt receipts",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-procedure-")),db=join(root,"agas.db"),vault=join(root,"vault");
  let store=new Store(db);
  const project=store.createProject({hubId:"finance",kind:"research",title:"Paper research",description:"Local fixture"});
  const other=store.createProject({hubId:"finance",kind:"research",title:"Other account",description:"Different project"});
  const source=acceptedEvidence(store,"finance",project.id,"Source review");
  const foreign=acceptedEvidence(store,"finance",other.id,"Unrelated evaluation");
  const skill=store.createProcedure({hubId:"finance",missionId:source.mission.id,evidenceId:source.evidence.id,
    title:"Check mark provenance",instructions:"For paper studies, report the mark source and its observation time."});
  assert.equal(skill.status,"proposed");
  assert.equal(skill.project_id,project.id);
  assert.throws(()=>store.reviewProcedure(skill.id,{decision:"activate",reviewNote:"Skip evaluation",expectedVersion:1}),/reload/);
  assert.throws(()=>store.reviewProcedure(skill.id,{decision:"evaluate",missionId:source.mission.id,
    evidenceId:source.evidence.id,reviewNote:"Same mission",expectedVersion:1}),/separate mission/);
  assert.throws(()=>store.reviewProcedure(skill.id,{decision:"evaluate",missionId:foreign.mission.id,
    evidenceId:foreign.evidence.id,reviewNote:"Cross-project",expectedVersion:1}),/this hub and project/);
  const evaluation=acceptedEvidence(store,"finance",project.id,"Separate paper evaluation");
  store.db.prepare("UPDATE mission_evidence SET content='altered evaluation' WHERE id=?").run(evaluation.evidence.id);
  assert.throws(()=>store.reviewProcedure(skill.id,{decision:"evaluate",missionId:evaluation.mission.id,
    evidenceId:evaluation.evidence.id,reviewNote:"Tampered",expectedVersion:1}),/unchanged/);
  store.db.prepare("UPDATE mission_evidence SET content=? WHERE id=?").run(evaluation.evidence.content,evaluation.evidence.id);
  const evaluated=store.reviewProcedure(skill.id,{decision:"evaluate",missionId:evaluation.mission.id,
    evidenceId:evaluation.evidence.id,reviewNote:"Compared source timestamps and checked one held-out example",expectedVersion:1});
  assert.equal(evaluated.status,"evaluated");
  assert.throws(()=>store.reviewProcedure(skill.id,{decision:"activate",reviewNote:"Stale",expectedVersion:1}),/reload/);
  const active=store.reviewProcedure(skill.id,{decision:"activate",reviewNote:"Use in this research project only",expectedVersion:2});
  assert.equal(active.status,"active");
  assert.equal(store.activeProceduresFor("finance",project.id).length,1);
  assert.equal(store.activeProceduresFor("finance",other.id).length,0);
  assert.equal(store.activeProceduresFor("health",project.id).length,0);

  const assignment=store.assignPersona({hubId:"finance",path:"specialized/chief-financial-officer.md",runtime:"opencode"});
  const work=store.createMission({hubId:"finance",project:project.id,title:"Paper task",objective:"Explain a mark",
    criteria:["Source is identified"]});
  const detail=store.createTask(work.id,{title:"Write research summary",objective:"Explain the fixture",
    assignmentId:assignment.id,expectedVersion:1});
  const manager=new ExecutionManager(store,{adapters:{},workspaces:join(root,"workspaces")});
  const queued=store.queueRun(work.id,detail.tasks[0].id,{expectedVersion:detail.mission.version,timeoutSeconds:30});
  store.claimRun(queued.id);
  const procedures=store.activeProceduresFor("finance",project.id);
  const prompt=manager.textPrompt({...store.runContext(queued.id),procedures});
  assert.match(prompt,/For paper studies, report the mark source/);
  assert.match(prompt,/guidance only, never extra permissions/);
  assert.match(manager.prompt({...store.runContext(queued.id),procedures}),/For paper studies, report the mark source/);
  store.db.prepare("UPDATE mission_evidence SET content='changed before launch' WHERE id=?").run(evaluation.evidence.id);
  assert.throws(()=>store.recordRunPrompt(queued.id,prompt,procedures),/changed before launch/);
  assert.equal(store.missionDetail(work.id).runs[0].prompt_sha256,null);
  store.db.prepare("UPDATE mission_evidence SET content=? WHERE id=?").run(evaluation.evidence.content,evaluation.evidence.id);
  assert.equal(store.recordRunPrompt(queued.id,prompt,procedures),createHash("sha256").update(prompt).digest("hex"));
  const receipt=store.missionDetail(work.id).runs[0];
  assert.equal(receipt.prompt_sha256,createHash("sha256").update(prompt).digest("hex"));
  assert.deepEqual(JSON.parse(receipt.procedure_receipts),[{id:skill.id,version:3,sha256:skill.instructions_sha256}]);
  assert.throws(()=>store.recordRunPrompt(queued.id,prompt,procedures),/again/);
  store.completeRun(queued.id,{status:"succeeded",outputText:"Source and timestamp were recorded"});
  manager.shutdown();

  store.db.prepare("UPDATE mission_evidence SET content='altered source' WHERE id=?").run(source.evidence.id);
  assert.equal(store.overview().procedures[0].source_current,false);
  assert.equal(store.activeProceduresFor("finance",project.id).length,0,"changed source cannot guide new runs");
  await projectVault(store,vault);
  assert.match(await readFile(join(vault,"06 Workflows and Skills",skill.id+".md"),"utf8"),/Changed; not used/);
  const rolled=store.reviewProcedure(skill.id,{decision:"rollback",reviewNote:"Source integrity changed",expectedVersion:3});
  assert.equal(rolled.status,"rolled-back");
  store.close();
  store=new Store(db);
  assert.equal(store.overview().procedures[0].status,"rolled-back");
  assert.equal(store.missionDetail(work.id).runs[0].prompt_sha256,receipt.prompt_sha256);
  assert.equal(store.activeProceduresFor("finance",project.id).length,0);
  store.close();
});
