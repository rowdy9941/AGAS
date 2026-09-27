import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgasServer } from "../src/server.js";
import { Store } from "../src/store.js";

test("Business opportunity decision needs accepted project evidence and reports later source changes",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-business-")),db=join(root,"agas.db"),vault=join(root,"vault");
  const app=createAgasServer({database:db,vault,token:"business-test",adapters:{}});
  await new Promise(resolve=>app.server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  async function request(path,method="GET",body) {
    const result=await fetch(base+path,{method,headers:{authorization:"Bearer business-test",
      ...(body?{"content-type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
    return {status:result.status,data:await result.json()};
  }
  try {
    const project=(await request("/api/projects","POST",{hubId:"business",kind:"business",
      title:"Independent studio",description:"AGAS venture, independent of MBAs"})).data.project;
    const other=(await request("/api/projects","POST",{hubId:"business",kind:"business",
      title:"Another venture",description:"Other evidence scope"})).data.project;
    assert.equal((await request("/api/business/opportunities","POST",{projectId:other.id,
      title:"Second",segment:"Teams",hypothesis:"Separate concept"})).status,201);
    const created=await request("/api/business/opportunities","POST",{projectId:project.id,
      title:"Research pilot",segment:"Small teams",hypothesis:"Interview owners about a useful workflow"});
    assert.equal(created.status,201);
    const opportunity=created.data.opportunity;
    assert.equal(opportunity.status,"idea");
    const mission=(await request("/api/missions","POST",{hubId:"business",project:project.id,
      title:"Check demand",objective:"Record the actual interview findings",criteria:["Reviewed findings"]})).data.mission;
    const task=(await request(`/api/missions/${mission.id}/tasks`,"POST",{title:"Review findings",
      objective:"Compare source notes",expectedVersion:1})).data.tasks[0];
    const decisionPath=`/api/business/opportunities/${opportunity.id}/decide`;
    assert.equal((await request(decisionPath,"POST",{missionId:mission.id,evidenceId:task.id,
      decision:"continue",reviewNote:"Checked source",expectedVersion:1})).status,409);
    const sent=await request(`/api/missions/${mission.id}/evidence`,"POST",{taskId:task.id,
      criterionIndex:0,kind:"observation",title:"Owner interview notes",content:"Interview records were checked by the owner",
      expectedVersion:2});
    const evidence=sent.data.evidence[0];
    const reviewed=await request(`/api/missions/${mission.id}/evidence/${evidence.id}/review`,"POST",
      {decision:"reviewed",reviewNote:"Compared the recorded notes",expectedVersion:sent.data.mission.version});
    const acceptedTask=await request(`/api/missions/${mission.id}/tasks/${task.id}/accept`,"POST",
      {expectedVersion:reviewed.data.mission.version});
    assert.equal((await request(`/api/missions/${mission.id}/accept`,"POST",
      {expectedVersion:acceptedTask.data.mission.version})).status,200);
    const decision={missionId:mission.id,evidenceId:evidence.id,decision:"continue",
      reviewNote:"Reviewed the source record and want to plan the next test",expectedVersion:1};
    const second=(await request("/api/overview")).data.businessOpportunities.find(item=>item.project_id===other.id);
    assert.equal((await request(`/api/business/opportunities/${second.id}/decide`,"POST",decision)).status,409,
      "another Business project cannot borrow this mission's evidence");
    app.store.db.prepare("UPDATE mission_evidence SET content='altered after acceptance' WHERE id=?").run(evidence.id);
    assert.equal((await request(decisionPath,"POST",decision)).status,409,"altered source cannot support review");
    app.store.db.prepare("UPDATE mission_evidence SET content=? WHERE id=?").run(evidence.content,evidence.id);
    const decided=await request(decisionPath,"POST",decision);
    assert.equal(decided.status,200);
    assert.equal(decided.data.opportunity.status,"owner-reviewed");
    assert.equal(decided.data.opportunity.evidence_sha256,evidence.sha256);
    assert.equal((await request(decisionPath,"POST",decision)).status,409);
    assert.equal((await request("/api/overview")).data.businessOpportunities.find(item=>item.id===opportunity.id).evidence_current,true);
    app.store.db.prepare("UPDATE mission_evidence SET content='altered again' WHERE id=?").run(evidence.id);
    assert.equal((await request("/api/overview")).data.businessOpportunities.find(item=>item.id===opportunity.id).evidence_current,false);
    assert.equal((await request("/api/vault/project","POST",{})).status,200);
    assert.match(await readFile(join(vault,"02 Projects",opportunity.id+".md"),"utf8"),/Changed; inspect before use/);
    await new Promise(resolve=>app.server.close(resolve));
    const reopened=new Store(db);
    assert.equal(reopened.overview().businessOpportunities.find(item=>item.id===opportunity.id).evidence_current,false);
    reopened.close();
  } finally {if(app.server.listening)await new Promise(resolve=>app.server.close(resolve))}
});
