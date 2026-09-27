import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store.js";
import { createAgasServer } from "../src/server.js";
import { projectVault } from "../src/vault.js";

test("a plausible report cannot finish a mission without reviewed evidence for every criterion, even after restart",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"agas-workflow-")),path=join(dir,"agas.db");
  let store=new Store(path);
  const mission=store.createMission({hubId:"dev",title:"Build a page",objective:"Ship a usable screen",criteria:["Page is reachable","Keyboard works"]});
  const id=mission.id;
  assert.throws(()=>store.acceptMission(id,{expectedVersion:1}),/tasks need owner acceptance/);
  const other=store.assignPersona({hubId:"content",path:"marketing/marketing-content-creator.md",runtime:"hermes"});
  assert.throws(()=>store.createTask(id,{title:"Work",objective:"Deliver",assignmentId:other.id,expectedVersion:1}),/mission hub/);
  let detail=store.createTask(id,{title:"Implement page",objective:"Build and check keyboard support",expectedVersion:1});
  assert.equal(detail.mission.version,2);
  assert.equal(detail.tasks[0].status,"queued");
  assert.throws(()=>store.createTask(id,{title:"Stale",objective:"Should not save",expectedVersion:1}),/reload/);
  const taskId=detail.tasks[0].id;
  detail=store.submitEvidence(id,{taskId,criterionIndex:0,kind:"observation",title:"I think it works",content:"The page is probably live.",expectedVersion:2});
  assert.throws(()=>store.acceptTask(id,taskId,{expectedVersion:3}),/reviewed evidence/);
  store.close();

  store=new Store(path);
  assert.equal(store.missionDetail(id).evidence[0].status,"submitted");
  detail=store.reviewEvidence(id,store.missionDetail(id).evidence[0].id,{decision:"rejected",reviewNote:"A statement alone does not prove the page is reachable",expectedVersion:3});
  assert.throws(()=>store.acceptTask(id,taskId,{expectedVersion:4}),/reviewed evidence/);
  detail=store.submitEvidence(id,{taskId,criterionIndex:0,kind:"test-log",title:"HTTP test",content:"GET /page returned 200 on the local preview",expectedVersion:4});
  detail=store.reviewEvidence(id,detail.evidence.find(e=>e.title==="HTTP test").id,{decision:"reviewed",reviewNote:"Owner inspected the local preview request",expectedVersion:5});
  detail=store.acceptTask(id,taskId,{expectedVersion:6});
  assert.throws(()=>store.acceptMission(id,{expectedVersion:7}),/Criterion 2 needs reviewed evidence/);

  detail=store.createTask(id,{title:"Keyboard check",objective:"Inspect keyboard access",expectedVersion:7});
  const secondTask=detail.tasks.find(t=>t.title==="Keyboard check").id;
  detail=store.submitEvidence(id,{taskId:secondTask,criterionIndex:1,kind:"observation",title:"Keyboard run",content:"Tab reached each control on the preview",expectedVersion:8});
  detail=store.reviewEvidence(id,detail.evidence.find(e=>e.title==="Keyboard run").id,{decision:"reviewed",reviewNote:"Owner manually checked each control",expectedVersion:9});
  detail=store.acceptTask(id,secondTask,{expectedVersion:10});
  detail=store.acceptMission(id,{expectedVersion:11});
  assert.equal(detail.mission.status,"accepted");
  assert.equal(detail.evidence.filter(e=>e.status==="reviewed").length,2);
  assert(store.overview().events.some(e=>e.type==="mission.owner-accepted"&&e.description.includes("not independently verified")));
  assert.throws(()=>store.createTask(id,{title:"Late work",objective:"Must fail",expectedVersion:12}),/closed/);
  store.close();
});

test("authenticated mission API returns durable task state and cancellation blocks future evidence",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"agas-workflow-http-"));
  const {server}=createAgasServer({database:join(dir,"state.db"),vault:join(dir,"vault"),token:"workflow-secret"});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const headers={authorization:"Bearer workflow-secret","content-type":"application/json"};
  const request=async(path,method,body,authenticated=true)=>{
    const response=await fetch(base+path,{method,headers:authenticated?headers:{},body:body?JSON.stringify(body):undefined});
    return {status:response.status,payload:await response.json()};
  };
  try {
    const mission=(await request("/api/missions","POST",{hubId:"dev",title:"Scoped task",objective:"Review work",criteria:["Artifact exists"]})).payload.mission;
    assert.equal((await request(`/api/missions/${mission.id}`,"GET",null,false)).status,401);
    const created=await request(`/api/missions/${mission.id}/tasks`,"POST",{title:"Create artifact",objective:"Produce actual output",expectedVersion:1});
    assert.equal(created.status,201);
    const task=created.payload.tasks[0];
    assert.equal((await request(`/api/missions/${mission.id}/accept`,"POST",{expectedVersion:2})).status,409);
    const cancelled=await request(`/api/missions/${mission.id}/cancel`,"POST",{expectedVersion:2});
    assert.equal(cancelled.payload.mission.status,"cancelled");
    assert.equal(cancelled.payload.tasks[0].status,"cancelled");
    assert.equal((await request(`/api/missions/${mission.id}/evidence`,"POST",{taskId:task.id,criterionIndex:0,kind:"artifact",title:"Late",content:"Should fail",expectedVersion:3})).status,409);
    assert.equal((await request(`/api/missions/${mission.id}`,"GET")).payload.tasks[0].status,"cancelled");
  } finally {await new Promise(resolve=>server.close(resolve))}
});

test("Obsidian mission projection updates only AGAS-owned bytes and preserves later user edits",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"agas-workflow-vault-")),dbPath=join(dir,"state.db"),vault=join(dir,"vault");
  let store=new Store(dbPath);
  const mission=store.createMission({hubId:"dev",title:"Vault proof",objective:"Keep work in one vault",criteria:["Task tracked"]});
  const first=await projectVault(store,vault),target=join(vault,"03 Missions",`${mission.id}.md`);
  assert(first.written.some(name=>name.endsWith(`${mission.id}.md`)));
  store.createTask(mission.id,{title:"Persist this task",objective:"Show it in the vault",expectedVersion:1});
  store.close();
  store=new Store(dbPath);
  const second=await projectVault(store,vault);
  assert.equal(second.conflicts.length,0);
  assert.match(await readFile(target,"utf8"),/Persist this task · queued/);
  await writeFile(target,(await readFile(target,"utf8"))+"\nOwner note in Obsidian\n");
  store.cancelMission(mission.id,{expectedVersion:2});
  const third=await projectVault(store,vault);
  assert(third.conflicts.some(name=>name.endsWith(`${mission.id}.md`)));
  assert.match(await readFile(target,"utf8"),/Owner note in Obsidian/);
  store.close();
});
