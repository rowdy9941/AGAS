import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgasServer } from "../src/server.js";
import { Store } from "../src/store.js";

test("Health coordination is one person per project, consent-gated, and reviewed with scoped evidence",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-health-")),db=join(root,"agas.db"),vault=join(root,"vault");
  const app=createAgasServer({database:db,vault,token:"health-test",adapters:{}});
  await new Promise(resolve=>app.server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  async function request(path,method="GET",body,authorized=true){
    const result=await fetch(base+path,{method,headers:{...(authorized?{authorization:"Bearer health-test"}:{}),
      ...(body?{"content-type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
    return {status:result.status,data:await result.json()};
  }
  async function evidenceFor(project,title){
    const mission=(await request("/api/missions","POST",{hubId:"health",project:project.id,title,
      objective:"Record an administrative update",criteria:["Owner reviewed the source"]})).data.mission;
    const task=(await request(`/api/missions/${mission.id}/tasks`,"POST",{title:"Inspect source",
      objective:"Document the result",expectedVersion:1})).data.tasks[0];
    const sent=(await request(`/api/missions/${mission.id}/evidence`,"POST",{taskId:task.id,
      criterionIndex:0,kind:"observation",title:"Owner source",content:"Owner checked the document list",
      expectedVersion:2})).data;
    const evidence=sent.evidence[0];
    const reviewed=(await request(`/api/missions/${mission.id}/evidence/${evidence.id}/review`,"POST",
      {decision:"reviewed",reviewNote:"Compared the list",expectedVersion:sent.mission.version})).data;
    const accepted=(await request(`/api/missions/${mission.id}/tasks/${task.id}/accept`,"POST",
      {expectedVersion:reviewed.mission.version})).data;
    assert.equal((await request(`/api/missions/${mission.id}/accept`,"POST",
      {expectedVersion:accepted.mission.version})).status,200);
    return {mission,evidence};
  }
  try {
    const person=(await request("/api/projects","POST",{hubId:"health",kind:"health",
      title:"Person A admin",description:"One person's coordination"})).data.project;
    const other=(await request("/api/projects","POST",{hubId:"health",kind:"health",
      title:"Person B admin",description:"Separate consent"})).data.project;
    const consent={projectId:person.id,alias:"A",consentBy:"Person A",consentPurpose:"Local appointment records only",
      validUntil:new Date(Date.now()+7*86400000).toISOString().slice(0,10)};
    assert.equal((await request("/api/health/profiles","POST",consent,false)).status,401);
    assert.equal((await request("/api/health/profiles","POST",{...consent,validUntil:"2020-01-01"})).status,400);
    const profile=(await request("/api/health/profiles","POST",consent)).data.profile;
    assert.equal((await request("/api/health/profiles","POST",{...consent,alias:"Another person"})).status,409);
    const item=(await request("/api/health/care-items","POST",{profileId:profile.id,kind:"document",
      title:"Check paperwork",nextStep:"Confirm which forms to bring"})).data.item;
    const endpoint=`/api/health/care-items/${item.id}/review`;
    const unrelated=await evidenceFor(other,"Other person's paperwork");
    const otherDecision={missionId:unrelated.mission.id,evidenceId:unrelated.evidence.id,
      reviewNote:"Wrong person's record",expectedVersion:1};
    assert.equal((await request(endpoint,"POST",otherDecision)).status,409);
    const revoked=(await request(`/api/health/profiles/${profile.id}/revoke`,"POST",
      {reviewNote:"Asked to pause local tracking",expectedVersion:1})).data.profile;
    assert.equal(revoked.status,"revoked");
    assert.equal((await request("/api/health/care-items","POST",{profileId:profile.id,kind:"appointment",
      title:"Should be blocked",nextStep:"No work"})).status,409);
    assert.equal((await request(endpoint,"POST",otherDecision)).status,409);
    assert.equal((await request(`/api/health/profiles/${profile.id}/renew`,"POST",{
      consentBy:"Person A",consentPurpose:"New local paperwork coordination",validUntil:consent.validUntil,
      expectedVersion:1})).status,409);
    const renewed=(await request(`/api/health/profiles/${profile.id}/renew`,"POST",{
      consentBy:"Person A",consentPurpose:"New local paperwork coordination",validUntil:consent.validUntil,
      expectedVersion:revoked.version})).data.profile;
    assert.equal(renewed.status,"active");
    const source=await evidenceFor(person,"Check this person's paperwork");
    const decision={missionId:source.mission.id,evidenceId:source.evidence.id,
      reviewNote:"Checked the actual list",expectedVersion:1};
    app.store.db.prepare("UPDATE mission_evidence SET content='edited' WHERE id=?").run(source.evidence.id);
    assert.equal((await request(endpoint,"POST",decision)).status,409);
    app.store.db.prepare("UPDATE mission_evidence SET content=? WHERE id=?").run(source.evidence.content,source.evidence.id);
    assert.equal((await request(endpoint,"POST",decision)).status,200);
    assert.equal((await request(endpoint,"POST",decision)).status,409);
    const eventList=(await request("/api/overview")).data.healthConsentEvents.filter(e=>e.profile_id===profile.id);
    assert.deepEqual(new Set(eventList.map(e=>e.action)),new Set(["granted","revoked","renewed"]));
    assert.equal((await request("/api/vault/project","POST",{})).status,200);
    assert.match(await readFile(join(vault,"02 Projects",profile.id+".md"),"utf8"),/Consent history/);
    app.store.db.prepare("UPDATE mission_evidence SET content='later edit' WHERE id=?").run(source.evidence.id);
    await new Promise(resolve=>app.server.close(resolve));
    const reopened=new Store(db);
    assert.equal(reopened.overview().healthCareItems.find(i=>i.id===item.id).evidence_current,false);
    reopened.close();
  } finally {if(app.server.listening)await new Promise(resolve=>app.server.close(resolve))}
});
