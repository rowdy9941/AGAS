import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store.js";
import { createAgasServer } from "../src/server.js";

function conversationAdapter(prompts) {
  return {
    async probe(){return {id:"opencode",ready:true,version:"fixture"}},
    launchMessage(workspace,prompt){
      prompts.push(prompt);
      return spawn(process.execPath,["-e",
        "console.log(JSON.stringify({type:'text',part:{type:'text',text:'Here is a bounded plan from the CEO.'}}))"],
      {cwd:workspace,stdio:["ignore","pipe","pipe"],detached:process.platform!=="win32"});
    }
  };
}

async function service(root,prompts) {
  const app=createAgasServer({database:join(root,"agas.db"),vault:join(root,"vault"),
    workspaces:join(root,"workspaces"),token:"private-token",
    adapters:{opencode:conversationAdapter(prompts)}});
  await new Promise(resolve=>app.server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  async function request(path,method="GET",data) {
    const response=await fetch(base+path,{method,headers:{authorization:"Bearer private-token",
      ...(data?{"content-type":"application/json"}:{})},body:data?JSON.stringify(data):undefined});
    return {status:response.status,data:await response.json()};
  }
  return {...app,request,close:()=>new Promise(resolve=>app.server.close(resolve))};
}

test("a CEO replies through a real child process with only authorized hub context, then the reply survives restart",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-ceo-")),prompts=[],app=await service(root,prompts);
  try {
    for(const item of [
      {scope:"organization",ownerId:"agas",content:"Organization objective"},
      {scope:"hub",ownerId:"dev",content:"Dev team guidance"},
      {scope:"hub",ownerId:"finance",content:"FINANCE SECRET SHOULD STAY OUT"},
      {scope:"private",ownerId:"owner",content:"PRIVATE SECRET SHOULD STAY OUT"}
    ])assert.equal((await app.request("/api/notes","POST",{title:item.scope, ...item})).status,201);
    const sent=await app.request("/api/messages","POST",{hubId:"dev",text:"What should Dev do next?",runtime:"opencode"});
    assert.equal(sent.status,201);
    let overview;
    for(let i=0;i<100;i++) {
      overview=(await app.request("/api/overview")).data;
      if(overview.messages[0].status==="completed")break;
      await new Promise(resolve=>setTimeout(resolve,30));
    }
    const record=overview.messages[0];
    assert.equal(record.status,"completed");
    assert.equal(record.runtime,"opencode");
    assert.match(record.reply,/bounded plan/);
    assert(overview.events.some(event=>event.type==="ceo.reply-completed"&&event.subject===record.id));
    assert.match(prompts[0],/Organization objective/);
    assert.match(prompts[0],/Dev team guidance/);
    assert(!prompts[0].includes("FINANCE SECRET"));
    assert(!prompts[0].includes("PRIVATE SECRET"));
    assert.equal((await app.request(`/api/messages/${record.id}/respond`,"POST",{runtime:"opencode"})).status,409);
    await app.close();
    const restored=new Store(join(root,"agas.db"));
    assert.equal(restored.overview().messages[0].reply,record.reply);
    restored.close();
  } finally {if(app.server.listening)await app.close()}
});

test("an interrupted CEO request is held for explicit retry and an unavailable runtime cannot start one",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-ceo-recovery-")),db=join(root,"agas.db");
  let store=new Store(db);
  const message=store.sendMessage({hubId:"management",text:"Check the backlog"});
  store.queueCeoReply(message.id,"opencode");
  store.claimCeoReply(message.id);
  store.close();
  const prompts=[],app=await service(root,prompts);
  try {
    assert.equal((await app.request("/api/overview")).data.messages[0].status,"interrupted");
    assert.equal(prompts.length,0);
    assert.equal((await app.request("/api/messages","POST",{hubId:"dev",text:"Do something",runtime:"codex"})).status,409);
    assert.equal((await app.request("/api/overview")).data.messages.length,1);
    assert.equal((await app.request(`/api/messages/${message.id}/respond`,"POST",{runtime:"opencode"})).status,202);
    for(let i=0;i<100;i++) {
      if((await app.request("/api/overview")).data.messages[0].status==="completed")break;
      await new Promise(resolve=>setTimeout(resolve,30));
    }
    assert.equal((await app.request("/api/overview")).data.messages[0].status,"completed");
    assert.equal(prompts.length,1);
  } finally {await app.close()}
});
