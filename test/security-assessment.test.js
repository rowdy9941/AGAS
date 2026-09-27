import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgasServer } from "../src/server.js";
import { Store } from "../src/store.js";

test("Security findings stay inside an owner-recorded scope and need a separate reviewed fix",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-security-")),db=join(root,"agas.db"),vault=join(root,"vault");
  const app=createAgasServer({database:db,vault,token:"security-test",adapters:{}});
  await new Promise(resolve=>app.server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  async function request(path,method="GET",body,auth=true){
    const response=await fetch(base+path,{method,headers:{...(auth?{authorization:"Bearer security-test"}:{}),
      ...(body?{"content-type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
    return {status:response.status,data:await response.json()};
  }
  async function acceptedMission(project,title){
    const mission=(await request("/api/missions","POST",{hubId:"security",project:project.id,title,
      objective:`Inspect ${title} within the recorded asset scope`,criteria:["Evidence reviewed by the owner"]})).data.mission;
    const task=(await request(`/api/missions/${mission.id}/tasks`,"POST",{title:"Document observed result",
      objective:"Record observation and reference",expectedVersion:1})).data.tasks[0];
    const sent=(await request(`/api/missions/${mission.id}/evidence`,"POST",{taskId:task.id,criterionIndex:0,
      kind:"observation",title:`${title} result`,content:`Owner checked the ${title} source`,expectedVersion:2})).data;
    const evidence=sent.evidence[0];
    const reviewed=(await request(`/api/missions/${mission.id}/evidence/${evidence.id}/review`,"POST",
      {decision:"reviewed",reviewNote:"Compared the recorded source",expectedVersion:sent.mission.version})).data;
    const taskDone=(await request(`/api/missions/${mission.id}/tasks/${task.id}/accept`,"POST",
      {expectedVersion:reviewed.mission.version})).data;
    assert.equal((await request(`/api/missions/${mission.id}/accept`,"POST",
      {expectedVersion:taskDone.mission.version})).status,200);
    return {mission,evidence};
  }
  try {
    const project=(await request("/api/projects","POST",{hubId:"security",kind:"security",
      title:"Owned test service",description:"Review only the recorded asset"})).data.project;
    const other=(await request("/api/projects","POST",{hubId:"security",kind:"security",
      title:"Other tenant",description:"Separate assessment"})).data.project;
    const future=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
    const record={projectId:project.id,assetLabel:"internal.example.test",scopeNote:"Read-only configuration review",
      authorizedBy:"System owner",authorizationNote:"Owner approved examination of this owned test system",validUntil:future};
    assert.equal((await request("/api/security/assessments","POST",record,false)).status,401);
    assert.equal((await request("/api/security/assessments","POST",{...record,validUntil:"2020-01-01"})).status,400);
    assert.equal((await request("/api/security/assessments","POST",{...record,projectId:other.id,
      validUntil:"2026-02-31"})).status,400);
    const assessment=(await request("/api/security/assessments","POST",record)).data.assessment;
    const otherAssessment=(await request("/api/security/assessments","POST",{...record,projectId:other.id})).data.assessment;
    const source=await acceptedMission(project,"Inspect configuration");
    const findingBody={assessmentId:assessment.id,title:"Unreviewed role grant",severity:"high",
      missionId:source.mission.id,evidenceId:source.evidence.id};
    assert.equal((await request("/api/security/findings","POST",{...findingBody,assessmentId:otherAssessment.id})).status,409);
    app.store.db.prepare("UPDATE security_assessments SET valid_until='2020-01-01' WHERE id=?").run(assessment.id);
    assert.equal((await request("/api/security/findings","POST",findingBody)).status,409);
    app.store.db.prepare("UPDATE security_assessments SET valid_until=? WHERE id=?").run(future,assessment.id);
    const created=await request("/api/security/findings","POST",findingBody);
    assert.equal(created.status,201);
    const finding=created.data.finding;
    assert.equal(finding.status,"open");
    const endpoint=`/api/security/findings/${finding.id}/verify`;
    const same={missionId:source.mission.id,evidenceId:source.evidence.id,
      reviewNote:"Not a separate retest",expectedVersion:1};
    assert.equal((await request(endpoint,"POST",same)).status,409);
    const otherSource=await acceptedMission(other,"Other tenant fix");
    assert.equal((await request(endpoint,"POST",{...same,missionId:otherSource.mission.id,
      evidenceId:otherSource.evidence.id})).status,409);
    const fix=await acceptedMission(project,"Check remediation");
    app.store.db.prepare("UPDATE mission_evidence SET content='altered original finding' WHERE id=?").run(source.evidence.id);
    const verification={missionId:fix.mission.id,evidenceId:fix.evidence.id,
      reviewNote:"Compared corrected role grant and saved proof",expectedVersion:1};
    assert.equal((await request(endpoint,"POST",verification)).status,409);
    app.store.db.prepare("UPDATE mission_evidence SET content=? WHERE id=?").run(source.evidence.content,source.evidence.id);
    app.store.db.prepare("UPDATE mission_evidence SET content='altered after owner review' WHERE id=?").run(fix.evidence.id);
    assert.equal((await request(endpoint,"POST",verification)).status,409);
    app.store.db.prepare("UPDATE mission_evidence SET content=? WHERE id=?").run(fix.evidence.content,fix.evidence.id);
    const verified=await request(endpoint,"POST",verification);
    assert.equal(verified.status,200);
    assert.equal(verified.data.finding.status,"owner-verified");
    assert.equal((await request(endpoint,"POST",verification)).status,409);
    let snapshot=(await request("/api/overview")).data.securityFindings.find(f=>f.id===finding.id);
    assert.equal(snapshot.source_current,true);
    assert.equal(snapshot.remediation_current,true);
    app.store.db.prepare("UPDATE mission_evidence SET content='different source' WHERE id=?").run(source.evidence.id);
    snapshot=(await request("/api/overview")).data.securityFindings.find(f=>f.id===finding.id);
    assert.equal(snapshot.source_current,false);
    assert.equal((await request("/api/vault/project","POST",{})).status,200);
    assert.match(await readFile(join(vault,"09 Decisions and Evidence",finding.id+".md"),"utf8"),/Changed; inspect before use/);
    await new Promise(resolve=>app.server.close(resolve));
    const reopened=new Store(db);
    assert.equal(reopened.overview().securityFindings.find(f=>f.id===finding.id).source_current,false);
    reopened.close();
  } finally {if(app.server.listening)await new Promise(resolve=>app.server.close(resolve))}
});
