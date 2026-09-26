import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store.js";
import { ExecutionManager, CodexAdapter } from "../src/execution.js";
import { createAgasServer } from "../src/server.js";

async function repository(root) {
  const path=join(root,"repository");
  execFileSync("git",["init","-q",path]);
  await writeFile(join(path,"README.md"),"Original source\n");
  execFileSync("git",["-C",path,"add","README.md"]);
  execFileSync("git",["-C",path,"-c","user.name=AGAS Test","-c","user.email=test@example.invalid",
    "commit","-q","-m","Base"]);
  return path;
}

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn) {
  for(let index=0;index<120;index++) {
    const value=await fn();
    if(value)return value;
    await sleep(40);
  }
  throw new Error("Timed out waiting for a run state");
}

function fakeAdapter({hang=false,prompts=[]}={}) {
  return {
    async probe(){return {id:"codex",ready:true,version:"test process"}},
    launch(workspace,prompt) {
      prompts.push(prompt);
      const script=hang?"setInterval(()=>{},1000)":
        "require('node:fs').writeFileSync('result.txt','Actual worker file\\n'); console.log(JSON.stringify({type:'turn.completed',item:{type:'agent_message',text:'Wrote result.txt'}}))";
      return spawn(process.execPath,["-e",script],{cwd:workspace,stdio:["ignore","pipe","pipe"],detached:process.platform!=="win32"});
    }
  };
}

async function session(root,adapter) {
  const {server,store,executor}=createAgasServer({database:join(root,"agas.db"),
    vault:join(root,"vault"),workspaces:join(root,"workspaces"),token:"exec-secret",adapter});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  async function request(path,method="GET",value) {
    const res=await fetch(base+path,{method,headers:{authorization:"Bearer exec-secret",
      ...(value?{"content-type":"application/json"}:{})},body:value?JSON.stringify(value):undefined});
    return {status:res.status,data:await res.json()};
  }
  return {server,store,executor,request,close:()=>new Promise(resolve=>server.close(resolve))};
}

async function missionFixture(request,repo) {
  const project=(await request("/api/projects","POST",{hubId:"dev",title:"Real repo",kind:"software",description:"A test source repo"})).data.project;
  assert.equal((await request(`/api/projects/${project.id}/repository`,"POST",{repositoryPath:repo})).status,200);
  const mission=(await request("/api/missions","POST",{hubId:"dev",project:project.id,title:"Create a file",
    objective:"Make the specified file",criteria:["The file exists with expected bytes"]})).data.mission;
  const assignment=(await request("/api/assignments","POST",{hubId:"dev",
    path:"engineering/engineering-frontend-developer.md",runtime:"codex"})).data.assignment;
  const task=(await request(`/api/missions/${mission.id}/tasks`,"POST",{title:"Implement",
    objective:"Write result.txt",assignmentId:assignment.id,expectedVersion:1})).data.tasks[0];
  return {project,mission,assignment,task};
}

test("a real child process runs in an isolated worktree and a file hash is checked through owner acceptance",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-run-")),repo=await repository(root),prompts=[];
  const current=await session(root,fakeAdapter({prompts}));
  try {
    const {mission,task}=await missionFixture(current.request,repo);
    await current.request("/api/notes","POST",{title:"Dev context",content:"Public dev note",scope:"hub",ownerId:"dev"});
    await current.request("/api/notes","POST",{title:"Private context",content:"DO NOT LEAK THIS NOTE",scope:"private",ownerId:"owner"});
    const started=await current.request(`/api/missions/${mission.id}/tasks/${task.id}/run`,"POST",{expectedVersion:2,timeoutSeconds:30});
    assert.equal(started.status,202);
    const id=started.data.run.id;
    const detail=await until(async()=>{
      const response=await current.request(`/api/missions/${mission.id}`);
      return response.data.runs.find(run=>run.id===id)?.status==="succeeded"?response.data:null;
    });
    assert.equal(detail.tasks[0].status,"awaiting-review");
    assert.equal(detail.artifacts.length,1);
    assert.equal(detail.artifacts[0].path,"result.txt");
    assert.equal(detail.artifacts[0].status,"recorded");
    assert.equal((await readFile(join(repo,"README.md"),"utf8")),"Original source\n");
    await assert.rejects(stat(join(repo,"result.txt")),{code:"ENOENT"});
    assert.match(prompts[0],/Public dev note/);
    assert(!prompts[0].includes("DO NOT LEAK THIS NOTE"));
    const logs=await current.request(`/api/missions/${mission.id}/runs/${id}/logs`);
    assert(logs.data.logs.some(entry=>entry.message.includes("turn.completed")));
    const latest=detail.mission.version;
    const evidence=await current.request(`/api/missions/${mission.id}/artifact-evidence`,"POST",{
      runId:id,taskId:task.id,path:"result.txt",criterionIndex:0,title:"Real file",expectedVersion:latest});
    assert.equal(evidence.status,201);
    const e=evidence.data.evidence[0];
    assert.equal(e.verification,"file-hash-verified");
    await writeFile(join(detail.runs[0].workspace,"result.txt"),"Changed after receipt\n");
    assert.equal((await current.request(`/api/missions/${mission.id}/evidence/${e.id}/review`,"POST",{
      decision:"reviewed",reviewNote:"Checked file",expectedVersion:latest+1})).status,409);
    await writeFile(join(detail.runs[0].workspace,"result.txt"),"Actual worker file\n");
    assert.equal((await current.request(`/api/missions/${mission.id}/evidence/${e.id}/review`,"POST",{
      decision:"reviewed",reviewNote:"Checked recorded bytes",expectedVersion:latest+1})).status,200);
    assert.equal((await current.request(`/api/missions/${mission.id}/tasks/${task.id}/accept`,"POST",{
      expectedVersion:latest+2})).status,200);
    assert.equal((await current.request(`/api/missions/${mission.id}/accept`,"POST",{
      expectedVersion:latest+3})).data.mission.status,"accepted");
    await current.close();
    const restored=new Store(join(root,"agas.db"));
    assert.equal(restored.missionDetail(mission.id).runs[0].status,"succeeded");
    assert.equal(restored.missionDetail(mission.id).evidence[0].verification,"file-hash-verified");
    restored.close();
  } finally {if(current.server.listening)await current.close()}
});

test("stopping a live run records cancellation and prevents late success",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-stop-")),repo=await repository(root),current=await session(root,fakeAdapter({hang:true}));
  try {
    const {mission,task}=await missionFixture(current.request,repo);
    const response=await current.request(`/api/missions/${mission.id}/tasks/${task.id}/run`,"POST",{expectedVersion:2,timeoutSeconds:30});
    assert.equal(response.status,202);
    const id=response.data.run.id;
    const running=await until(async()=>{
      const detail=(await current.request(`/api/missions/${mission.id}`)).data;
      return detail.runs[0]?.status==="running"?detail:null;
    });
    const stopped=await current.request(`/api/missions/${mission.id}/runs/${id}/stop`,"POST",{
      expectedVersion:running.mission.version});
    assert.equal(stopped.data.runs[0].status,"cancelled");
    await sleep(130);
    assert.equal((await current.request(`/api/missions/${mission.id}`)).data.runs[0].status,"cancelled");
  } finally {await current.close()}
});

test("startup recovery blocks an interrupted run instead of silently retrying it",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-restart-")),repo=await repository(root),db=join(root,"agas.db");
  let store=new Store(db);
  const project=store.createProject({hubId:"dev",title:"Repo",kind:"software",description:"Dev repo"});
  store.linkProjectRepository(project.id,repo);
  const mission=store.createMission({hubId:"dev",project:project.id,title:"Recover",objective:"Work",criteria:["File"]});
  const assignment=store.assignPersona({hubId:"dev",path:"engineering/engineering-frontend-developer.md",runtime:"codex"});
  const detail=store.createTask(mission.id,{title:"Task",objective:"Do work",assignmentId:assignment.id,expectedVersion:1});
  const run=store.queueRun(mission.id,detail.tasks[0].id,{expectedVersion:2,timeoutSeconds:30});
  store.claimRun(run.id);store.runningRun(run.id,12345);store.close();
  store=new Store(db);
  const manager=new ExecutionManager(store,{workspaces:join(root,"workspaces"),adapter:fakeAdapter()});
  assert.equal(store.missionDetail(mission.id).runs[0].status,"interrupted");
  assert.equal(store.missionDetail(mission.id).tasks[0].status,"blocked");
  assert.equal(store.queuedRuns().length,0);
  manager.shutdown();store.close();
});

test("a missing Codex login blocks launch before any run record is queued",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-unready-")),repo=await repository(root);
  const current=await session(root,new CodexAdapter({environment:{PATH:""}}));
  try {
    const {mission,task}=await missionFixture(current.request,repo);
    const response=await current.request(`/api/missions/${mission.id}/tasks/${task.id}/run`,"POST",{expectedVersion:2,timeoutSeconds:30});
    assert.equal(response.status,409);
    assert.equal((await current.request(`/api/missions/${mission.id}`)).data.runs.length,0);
  } finally {await current.close()}
});
