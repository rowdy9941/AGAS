import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgasServer } from "../src/server.js";
import { OpenCodeAdapter } from "../src/execution.js";

async function fixture(root) {
  const binary=join(root,"opencode-fixture");
  await writeFile(binary,`#!/usr/bin/env node
const fs=require('node:fs');
if(process.argv.includes('--version')) {console.log('opencode 1.2.3');process.exit(0)}
if(process.argv.includes('--help')) {console.log('--format json');process.exit(0)}
if(process.argv.includes('auth')) {console.log('1 credential');process.exit(0)}
if(process.argv.includes('run')) {
  const policy=JSON.parse(process.env.OPENCODE_PERMISSION);
  if(!process.argv.includes('--pure')||!process.argv.includes('json')||
    policy['*']!=='deny'||policy.edit!=='allow'||policy.external_directory!=='deny'||
    process.env.SECRET_AGAS_TEST_TOKEN||process.env.OPENCODE_AUTO_SHARE!=='false')
    process.exit(4);
  fs.writeFileSync('opencode-result.txt','OpenCode fixture artifact\\n');
  console.log(JSON.stringify({type:'text',part:{type:'text',text:'Wrote opencode-result.txt'}}));
  process.exit(0);
}
process.exit(5);
`);
  await chmod(binary,0o700);
  return binary;
}

test("an assigned OpenCode process passes readiness, executes in a Git worktree and records a hashed artifact",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-opencode-")),repo=join(root,"repository");
  execFileSync("git",["init","-q",repo]);
  await writeFile(join(repo,"README.md"),"Source remains unchanged\n");
  execFileSync("git",["-C",repo,"add","README.md"]);
  execFileSync("git",["-C",repo,"-c","user.name=AGAS Test","-c","user.email=test@example.invalid","commit","-q","-m","Base"]);
  const binary=await fixture(root);
  const opencode=new OpenCodeAdapter({binary,environment:{PATH:process.env.PATH,HOME:root,SECRET_AGAS_TEST_TOKEN:"must-not-pass"}});
  const {server}=createAgasServer({database:join(root,"agas.db"),vault:join(root,"vault"),
    workspaces:join(root,"workspaces"),token:"test-token",adapters:{opencode}});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  async function request(path,method="GET",data) {
    const response=await fetch(base+path,{method,headers:{authorization:"Bearer test-token",
      ...(data?{"content-type":"application/json"}:{})},body:data?JSON.stringify(data):undefined});
    return {status:response.status,data:await response.json()};
  }
  try {
    const runtime=(await request("/api/runtimes")).data.runtimes.find(item=>item.id==="opencode");
    assert.equal(runtime.ready,true);
    const project=(await request("/api/projects","POST",{hubId:"dev",title:"Project",kind:"software",description:"A repo"})).data.project;
    assert.equal((await request(`/api/projects/${project.id}/repository`,"POST",{repositoryPath:repo})).status,200);
    const mission=(await request("/api/missions","POST",{hubId:"dev",project:project.id,title:"Deliver file",objective:"Edit in worktree",criteria:["File exists"]})).data.mission;
    const assignment=(await request("/api/assignments","POST",{hubId:"dev",path:"engineering/engineering-frontend-developer.md",runtime:"opencode"})).data.assignment;
    const task=(await request(`/api/missions/${mission.id}/tasks`,"POST",{title:"Create",objective:"Write opencode-result.txt",assignmentId:assignment.id,expectedVersion:1})).data.tasks[0];
    const queued=await request(`/api/missions/${mission.id}/tasks/${task.id}/run`,"POST",{expectedVersion:2,timeoutSeconds:30});
    assert.equal(queued.status,202);
    assert.equal(queued.data.run.runtime,"opencode");
    let detail;
    for(let attempt=0;attempt<120;attempt++) {
      detail=(await request(`/api/missions/${mission.id}`)).data;
      if(["succeeded","failed"].includes(detail.runs[0].status))break;
      await new Promise(resolve=>setTimeout(resolve,40));
    }
    assert.equal(detail.runs[0].status,"succeeded");
    assert.equal(detail.tasks[0].status,"awaiting-review");
    assert.equal(detail.artifacts[0].path,"opencode-result.txt");
    assert.match(detail.artifacts[0].sha256,/^[0-9a-f]{64}$/);
    assert.equal((await readFile(join(detail.runs[0].workspace,"opencode-result.txt"),"utf8")),"OpenCode fixture artifact\n");
    await assert.rejects(stat(join(repo,"opencode-result.txt")),{code:"ENOENT"});
    const logs=(await request(`/api/missions/${mission.id}/runs/${queued.data.run.id}/logs`)).data.logs;
    assert(logs.some(entry=>entry.message.includes("Wrote opencode-result.txt")));
    const receipt=await request(`/api/missions/${mission.id}/artifact-evidence`,"POST",{
      runId:queued.data.run.id,taskId:task.id,path:"opencode-result.txt",criterionIndex:0,
      title:"Produced file",expectedVersion:detail.mission.version});
    assert.equal(receipt.data.evidence[0].verification,"file-hash-verified");
  } finally {await new Promise(resolve=>server.close(resolve))}
});

test("OpenCode rejects unsupported protocol or missing login before launch",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-opencode-probe-")),binary=await fixture(root);
  const adapter=new OpenCodeAdapter({binary,environment:{PATH:process.env.PATH,HOME:root}});
  assert.equal((await adapter.probe()).ready,true);
  await writeFile(binary,"#!/usr/bin/env node\nif(process.argv.includes('--version'))console.log('opencode 2.0.0');else console.log('0 credentials');\n");
  assert.equal((await adapter.probe()).ready,false);
});
