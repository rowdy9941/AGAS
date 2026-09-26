import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, InputError } from "../src/store.js";
import { ExecutionManager } from "../src/execution.js";

test("cross-hub evidence enters a receiving agent prompt only after explicit acknowledgement",async()=>{
  const path=join(await mkdtemp(join(tmpdir(),"agas-handoff-")),"agas.db"),store=new Store(path);
  try {
    const source=store.createMission({hubId:"content",title:"ARCHON research",objective:"Produce a source backed brief",criteria:["A reviewed brief exists"]});
    let detail=store.createTask(source.id,{title:"Research",objective:"Prepare a brief",expectedVersion:1});
    const task=detail.tasks[0];
    const target=store.createMission({hubId:"dev",title:"MANI API",objective:"Use the approved brief",criteria:["API works"]});
    detail=store.submitEvidence(source.id,{taskId:task.id,criterionIndex:0,kind:"artifact",title:"Audience brief",content:"Explicitly shared audience facts",expectedVersion:2});
    const evidence=detail.evidence[0];
    assert.throws(()=>store.offerHandoff({sourceMissionId:source.id,targetMissionId:target.id,evidenceId:evidence.id,title:"Context",purpose:"Use the facts"}),InputError);
    store.reviewEvidence(source.id,evidence.id,{decision:"reviewed",reviewNote:"Checked content",expectedVersion:3});
    store.acceptTask(source.id,task.id,{expectedVersion:4});
    store.acceptMission(source.id,{expectedVersion:5});
    const handoff=store.offerHandoff({sourceMissionId:source.id,targetMissionId:target.id,evidenceId:evidence.id,title:"Audience handoff",purpose:"Inform API requirements"});
    assert.equal(handoff.status,"offered");
    assert.equal(store.acceptedHandoffs(target.id).length,0);
    assert.equal(store.missionDetail(target.id).handoffs[0].source_evidence_content,"Explicitly shared audience facts");
    assert.throws(()=>store.reviewHandoff(handoff.id,{decision:"accepted",responseNote:"Missing revision",expectedVersion:5}),InputError);
    const reviewed=store.reviewHandoff(handoff.id,{decision:"accepted",responseNote:"Inspected source brief",expectedVersion:1});
    assert.equal(reviewed.status,"accepted");
    assert.equal(store.acceptedHandoffs(target.id).length,1);
    const manager=new ExecutionManager(store,{adapter:{probe:async()=>({ready:false})}});
    const prompt=manager.prompt({mission:store.missionDetail(target.id).mission,task:{title:"Use facts",objective:"Implement scoped requirements"},
      persona:{title:"Backend Architect",path:"engineering/test",source_commit:"pinned",source_sha:"hash",prompt:"Build"},
      notes:[],handoffs:store.acceptedHandoffs(target.id)});
    assert.match(prompt,/Explicitly shared audience facts/);
    assert.match(prompt,/Audience handoff/);
    const restored=new Store(path);
    try {
      assert.equal(restored.missionDetail(target.id).handoffs[0].status,"accepted");
      assert.equal(restored.acceptedHandoffs(target.id).length,1);
      restored.db.prepare("UPDATE mission_evidence SET content='Tampered facts' WHERE id=?").run(evidence.id);
      assert.equal(restored.acceptedHandoffs(target.id).length,0);
    } finally {restored.close()}
    manager.shutdown();
  } finally {store.close()}
});
