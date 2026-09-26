import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenClawAdapter } from "../src/execution.js";
import { createAgasServer } from "../src/server.js";

const policy={gateway:{mode:"local"},agents:{entries:{agas:{skipBootstrap:true,skills:[],
  tools:{deny:["*"]},sandbox:{mode:"all",scope:"agent",workspaceAccess:"none"}}}}};

test("OpenClaw admits only an applied local Gateway policy and records bounded CEO and hub text",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-claw-")),binary=join(root,"openclaw"),config=join(root,"agas-openclaw-fixture.json");
  await writeFile(config,JSON.stringify({config:policy,configRevisionHash:"current",appliedConfigHash:"current"}));
  await writeFile(binary,`#!/usr/bin/env node
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const args=process.argv.slice(2),fixture=JSON.parse(readFileSync(join(process.env.HOME,'agas-openclaw-fixture.json'),'utf8'));
if(args[0]==='--version')console.log('OpenClaw 2026.9');
else if(args[0]==='agent'&&args[1]==='--help')console.log('--agent --message-file --session-key --json');
else if(args[0]==='gateway'&&args[1]==='status')console.log(JSON.stringify({ok:true}));
else if(args[0]==='gateway'&&args[1]==='call')console.log(JSON.stringify(fixture));
else if(args[0]==='agent'){
 if(args.includes('--deliver')||!args.includes('--json')||args[args.indexOf('--agent')+1]!=='agas')process.exit(2);
 const prompt=readFileSync(args[args.indexOf('--message-file')+1],'utf8');
 console.log(JSON.stringify({ok:true,status:'ok',final:'Scoped result: '+(prompt.includes('Allowed content')?'Allowed content':'No content note')}));
}else process.exit(2);
`);
  await chmod(binary,0o700);
  const adapter=new OpenClawAdapter({binary,environment:{HOME:root,PATH:process.env.PATH}});
  assert.equal((await adapter.probe()).ready,true);
  await writeFile(config,JSON.stringify({config:policy,configRevisionHash:"current",appliedConfigHash:"older"}));
  assert.equal((await adapter.probe()).ready,false);
  await writeFile(config,JSON.stringify({config:{...policy,agents:{entries:{agas:{...policy.agents.entries.agas,tools:{deny:["exec"]}}}}},
    configRevisionHash:"current",appliedConfigHash:"current"}));
  assert.equal((await adapter.probe()).ready,false);
  await writeFile(config,JSON.stringify({config:policy,configRevisionHash:"current",appliedConfigHash:"current"}));

  const app=createAgasServer({database:join(root,"agas.db"),workspaces:join(root,"runs"),vault:join(root,"vault"),token:"claw-test",
    adapters:{openclaw:adapter}});
  await new Promise(resolve=>app.server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  async function request(path,method="GET",value) {
    const response=await fetch(base+path,{method,headers:{authorization:"Bearer claw-test",
      ...(value?{"content-type":"application/json"}:{})},body:value?JSON.stringify(value):undefined});
    return {status:response.status,data:await response.json()};
  }
  try {
    assert.equal((await request("/api/notes","POST",{title:"Context",scope:"hub",ownerId:"content",content:"Allowed content"})).status,201);
    assert.equal((await request("/api/notes","POST",{title:"Other",scope:"hub",ownerId:"finance",content:"FINANCE SECRET"})).status,201);
    const sent=await request("/api/messages","POST",{hubId:"content",text:"Summarize this hub",runtime:"openclaw"});
    assert.equal(sent.status,201);
    let overview;
    for(let i=0;i<100;i++) {
      overview=(await request("/api/overview")).data;
      if(overview.messages[0].status==="completed")break;
      await new Promise(resolve=>setTimeout(resolve,30));
    }
    assert.equal(overview.messages[0].status,"completed",JSON.stringify(overview.messages[0]));
    assert.equal(overview.messages[0].reply,"Scoped result: Allowed content");
    const mission=(await request("/api/missions","POST",{hubId:"content",title:"Content brief",objective:"Describe the audience",criteria:["Brief reviewed"]})).data.mission;
    const assigned=(await request("/api/assignments","POST",{hubId:"content",path:"research/research-synthesist.md",runtime:"openclaw"})).data.assignment;
    const task=(await request(`/api/missions/${mission.id}/tasks`,"POST",{title:"Brief",objective:"Write a bounded answer",assignmentId:assigned.id,expectedVersion:1})).data.tasks[0];
    assert.equal((await request(`/api/missions/${mission.id}/tasks/${task.id}/run`,"POST",{expectedVersion:2,timeoutSeconds:30})).status,202);
    let detail;
    for(let i=0;i<100;i++) {
      detail=(await request(`/api/missions/${mission.id}`)).data;
      if(detail.runs[0]?.status==="succeeded")break;
      await new Promise(resolve=>setTimeout(resolve,30));
    }
    assert.equal(detail.runs[0]?.status,"succeeded",JSON.stringify(detail.runs[0]));
    assert.equal(detail.runs[0].output_text,"Scoped result: Allowed content");
    assert(!detail.runs[0].output_text.includes("FINANCE SECRET"));
  } finally {await new Promise(resolve=>app.server.close(resolve))}
});
