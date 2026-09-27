import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeAdapter } from "../src/execution.js";
import { createAgasServer } from "../src/server.js";

test("Claude Code requires restricted authenticated CLI and keeps CEO and mission text scoped",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-claude-")),script=join(root,"claude-fixture.js"),
    binary=process.platform==="win32"?join(root,"claude-fixture.cmd"):script,
    config=join(root,"agas-claude-fixture.json");
  await writeFile(config,JSON.stringify({version:"2.1.260",loggedIn:true}));
  await writeFile(script,`#!/usr/bin/env node
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const args=process.argv.slice(2),fixture=JSON.parse(readFileSync(join(process.env.HOME,'agas-claude-fixture.json'),'utf8'));
if(args[0]==='--version')console.log(fixture.version+' (Claude Code)');
else if(args[0]==='--help')console.log('--restricted --safe-mode --tools --disallowedTools --permission-prompts --no-session-persistence --output-format');
else if(args[0]==='auth'&&args[1]==='status')console.log(JSON.stringify({loggedIn:fixture.loggedIn}));
else if(args[0]==='-p'){
 const required=['--restricted','--safe-mode','--no-session-persistence','--no-chrome','--verbose'];
 if(required.some(flag=>!args.includes(flag))||args[args.indexOf('--tools')+1]!==''||
   args[args.indexOf('--disallowedTools')+1]!=='mcp__*'||
   args[args.indexOf('--permission-prompts')+1]!=='none'||
   args[args.indexOf('--output-format')+1]!=='stream-json')process.exit(2);
 const prompt=args.at(-1);
 if(prompt.includes('FINANCE SECRET'))process.exit(3);
 console.log(JSON.stringify({type:'result',is_error:fixture.providerError===true,
   result:'Claude scoped result: '+(prompt.includes('Allowed content')?'Allowed content':'No content note')}));
}else process.exit(2);
`);
  await chmod(script,0o700);
  if(process.platform==="win32")await writeFile(binary,`@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n)\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\claude-fixture.js" %*\r\n`);
  const adapter=new ClaudeAdapter({binary,environment:{HOME:root,PATH:process.env.PATH}});
  assert.equal((await adapter.probe()).ready,true);
  await writeFile(config,JSON.stringify({version:"2.1.258",loggedIn:true}));
  assert.equal((await adapter.probe()).ready,false,"older versions lack fail-closed permission prompts");
  await writeFile(config,JSON.stringify({version:"2.1.260",loggedIn:false}));
  assert.equal((await adapter.probe()).ready,false,"no confirmed local login");
  await writeFile(config,JSON.stringify({version:"2.1.260",loggedIn:true}));
  const app=createAgasServer({database:join(root,"agas.db"),workspaces:join(root,"runs"),
    vault:join(root,"vault"),token:"claude-test",adapters:{claude:adapter}});
  await new Promise(resolve=>app.server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  async function request(path,method="GET",value) {
    const response=await fetch(base+path,{method,headers:{authorization:"Bearer claude-test",
      ...(value?{"content-type":"application/json"}:{})},body:value?JSON.stringify(value):undefined});
    return {status:response.status,data:await response.json()};
  }
  try {
    await request("/api/notes","POST",{title:"Content",scope:"hub",ownerId:"content",content:"Allowed content"});
    await request("/api/notes","POST",{title:"Finance",scope:"hub",ownerId:"finance",content:"FINANCE SECRET"});
    assert.equal((await request("/api/messages","POST",{hubId:"content",text:"Summarize this hub",runtime:"claude"})).status,201);
    let overview;
    for(let i=0;i<100;i++){
      overview=(await request("/api/overview")).data;
      if(overview.messages[0].status==="completed")break;
      await new Promise(resolve=>setTimeout(resolve,30));
    }
    assert.equal(overview.messages[0].status,"completed",JSON.stringify(overview.messages[0]));
    assert.equal(overview.messages[0].reply,"Claude scoped result: Allowed content");
    const mission=(await request("/api/missions","POST",{hubId:"content",title:"Review audience",
      objective:"Record the audience",criteria:["Brief reviewed"]})).data.mission;
    const assigned=(await request("/api/assignments","POST",{hubId:"content",path:"research/research-synthesist.md",
      runtime:"claude"})).data.assignment;
    const task=(await request(`/api/missions/${mission.id}/tasks`,"POST",{title:"Brief",objective:"Write a bounded answer",
      assignmentId:assigned.id,expectedVersion:1})).data.tasks[0];
    assert.equal((await request(`/api/missions/${mission.id}/tasks/${task.id}/run`,"POST",{
      expectedVersion:2,timeoutSeconds:30})).status,202);
    let detail;
    for(let i=0;i<100;i++){
      detail=(await request(`/api/missions/${mission.id}`)).data;
      if(detail.runs[0]?.status==="succeeded")break;
      await new Promise(resolve=>setTimeout(resolve,30));
    }
    assert.equal(detail.runs[0]?.status,"succeeded",JSON.stringify(detail.runs[0]));
    assert.equal(detail.runs[0].output_text,"Claude scoped result: Allowed content");
    assert(!detail.runs[0].output_text.includes("FINANCE SECRET"));
    await writeFile(config,JSON.stringify({version:"2.1.260",loggedIn:true,providerError:true}));
    const second=(await request(`/api/missions/${mission.id}/tasks`,"POST",{title:"Second brief",
      objective:"Record another result",assignmentId:assigned.id,expectedVersion:detail.mission.version})).data;
    const secondTask=second.tasks.find(item=>item.title==="Second brief");
    assert.equal((await request(`/api/missions/${mission.id}/tasks/${secondTask.id}/run`,"POST",{
      expectedVersion:second.mission.version,timeoutSeconds:30})).status,202);
    for(let i=0;i<100;i++){
      detail=(await request(`/api/missions/${mission.id}`)).data;
      if(detail.runs.some(run=>run.status==="failed"))break;
      await new Promise(resolve=>setTimeout(resolve,30));
    }
    assert.equal(detail.runs.find(run=>run.status==="failed")?.output_text,null,"provider error is not a successful reply");
    assert.equal((await request("/api/overview")).data.incidents.length,1,"failed run opens Management review");
  } finally {await new Promise(resolve=>app.server.close(resolve))}
});
