import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgasServer } from "../src/server.js";
import { Store } from "../src/store.js";

async function until(fn) {
  for(let i=0;i<120;i++) {
    const value=await fn();
    if(value)return value;
    await new Promise(resolve=>setTimeout(resolve,30));
  }
  throw new Error("Timed out waiting for the child process");
}

test("two runtime runs transfer only reviewed text through an acknowledged, required cross-hub handoff",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-team-")),database=join(root,"agas.db");
  const repository=join(root,"dev-repo");
  execFileSync("git",["init","-q",repository]);
  await writeFile(join(repository,"README.md"),"Source checkout\n");
  execFileSync("git",["-C",repository,"add","README.md"]);
  execFileSync("git",["-C",repository,"-c","user.name=AGAS Test","-c","user.email=test@example.invalid","commit","-q","-m","Base"]);
  const prompts={text:[],code:[]};
  const adapters={
    opencode:{
      async probe(){return {id:"opencode",ready:true,version:"fixture"}},
      launchMessage(workspace,prompt){
        prompts.text.push(prompt);
        return spawn(process.execPath,["-e","console.log(JSON.stringify({type:'text',part:{type:'text',text:'Audience brief: Telugu readers need an accessible summary.'}}))"],
          {cwd:workspace,stdio:["ignore","pipe","pipe"],detached:process.platform!=="win32"});
      }
    },
    codex:{
      async probe(){return {id:"codex",ready:true,version:"fixture"}},
      launch(workspace,prompt){
        prompts.code.push(prompt);
        return spawn(process.execPath,["-e","require('node:fs').writeFileSync('summary.txt','Accessible summary implemented\\n');console.log(JSON.stringify({type:'turn.completed'}))"],
          {cwd:workspace,stdio:["ignore","pipe","pipe"],detached:process.platform!=="win32"});
      }
    }
  };
  const app=createAgasServer({database,workspaces:join(root,"runs"),vault:join(root,"vault"),token:"handoff-test",adapters});
  await new Promise(resolve=>app.server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  async function request(path,method="GET",value) {
    const response=await fetch(base+path,{method,headers:{authorization:"Bearer handoff-test",
      ...(value?{"content-type":"application/json"}:{})},body:value?JSON.stringify(value):undefined});
    return {status:response.status,data:await response.json()};
  }
  try {
    assert.equal((await request("/api/notes","POST",{title:"Content brief",content:"Only the Content team knows this niche",scope:"hub",ownerId:"content"})).status,201);
    assert.equal((await request("/api/notes","POST",{title:"Finance private",content:"FINANCE SECRET",scope:"hub",ownerId:"finance"})).status,201);
    const source=(await request("/api/missions","POST",{hubId:"content",title:"ARCHON audience research",objective:"Make a bounded audience brief",criteria:["Owner has reviewed an audience brief"]})).data.mission;
    const contentAssignment=(await request("/api/assignments","POST",{hubId:"content",path:"research/research-synthesist.md",runtime:"opencode"})).data.assignment;
    const sourceTask=(await request(`/api/missions/${source.id}/tasks`,"POST",{title:"Write audience brief",objective:"Summarize supplied audience facts",assignmentId:contentAssignment.id,expectedVersion:1})).data.tasks[0];
    const started=await request(`/api/missions/${source.id}/tasks/${sourceTask.id}/run`,"POST",{expectedVersion:2,timeoutSeconds:30});
    assert.equal(started.status,202);
    const sourceRun=await until(async()=>{
      const detail=(await request(`/api/missions/${source.id}`)).data;
      return detail.runs[0]?.status==="succeeded"?detail:null;
    });
    assert.match(sourceRun.runs[0].output_text,/Telugu readers/);
    assert.match(sourceRun.runs[0].output_sha256,/^[a-f0-9]{64}$/);
    assert.equal(sourceRun.runs[0].base_commit,null);
    assert.match(prompts.text[0],/Only the Content team/);
    assert(!prompts.text[0].includes("FINANCE SECRET"));
    assert.equal((await readFile(join(repository,"README.md"),"utf8")),"Source checkout\n");
    const proved=await request(`/api/missions/${source.id}/output-evidence`,"POST",{runId:sourceRun.runs[0].id,title:"Audience brief result",criterionIndex:0,expectedVersion:sourceRun.mission.version});
    assert.equal(proved.status,201);
    const evidence=proved.data.evidence[0];
    assert.equal(evidence.verification,"runtime-output-hash-verified");
    app.store.db.prepare("UPDATE mission_runs SET output_text='tampered' WHERE id=?").run(sourceRun.runs[0].id);
    assert.equal((await request(`/api/missions/${source.id}/evidence/${evidence.id}/review`,"POST",{decision:"reviewed",reviewNote:"Inspected",expectedVersion:proved.data.mission.version})).status,409);
    app.store.db.prepare("UPDATE mission_runs SET output_text=? WHERE id=?").run(sourceRun.runs[0].output_text,sourceRun.runs[0].id);
    const reviewed=await request(`/api/missions/${source.id}/evidence/${evidence.id}/review`,"POST",{decision:"reviewed",reviewNote:"Checked scope and factual claims",expectedVersion:proved.data.mission.version});
    assert.equal(reviewed.status,200);
    assert.equal((await request(`/api/missions/${source.id}/tasks/${sourceTask.id}/accept`,"POST",{expectedVersion:reviewed.data.mission.version})).status,200);
    const acceptedSource=await request(`/api/missions/${source.id}/accept`,"POST",{expectedVersion:reviewed.data.mission.version+1});
    assert.equal(acceptedSource.data.mission.status,"accepted");

    const project=(await request("/api/projects","POST",{hubId:"dev",kind:"software",title:"MANI source",description:"Dev source repository"})).data.project;
    assert.equal((await request(`/api/projects/${project.id}/repository`,"POST",{repositoryPath:repository})).status,200);
    const target=(await request("/api/missions","POST",{hubId:"dev",project:project.id,title:"MANI summary",objective:"Use the reviewed ARCHON brief",criteria:["A local summary exists"]})).data.mission;
    const handoff=(await request("/api/handoffs","POST",{sourceMissionId:source.id,targetMissionId:target.id,evidenceId:evidence.id,title:"Reviewed audience",purpose:"Implement the accessible summary"})).data.handoff;
    assert.equal(handoff.status,"offered");
    const devAssignment=(await request("/api/assignments","POST",{hubId:"dev",path:"engineering/engineering-frontend-developer.md",runtime:"codex"})).data.assignment;
    const targetTask=(await request(`/api/missions/${target.id}/tasks`,"POST",{title:"Build summary",objective:"Write a summary from the received brief",assignmentId:devAssignment.id,requiredHandoffId:handoff.id,expectedVersion:1})).data.tasks[0];
    assert.equal((await request(`/api/missions/${target.id}/tasks/${targetTask.id}/run`,"POST",{expectedVersion:2,timeoutSeconds:30})).status,409);
    assert.equal(prompts.code.length,0);
    assert.equal((await request(`/api/handoffs/${handoff.id}/review`,"POST",{decision:"accepted",responseNote:"Inspected evidence and scope",expectedVersion:1})).status,200);
    assert.equal(app.store.acceptedHandoffs(target.id).length,1);
    app.store.db.prepare("UPDATE mission_runs SET output_text='changed after approval' WHERE id=?").run(sourceRun.runs[0].id);
    assert.equal((await request(`/api/missions/${target.id}/tasks/${targetTask.id}/run`,"POST",{expectedVersion:3,timeoutSeconds:30})).status,409);
    app.store.db.prepare("UPDATE mission_runs SET output_text=? WHERE id=?").run(sourceRun.runs[0].output_text,sourceRun.runs[0].id);
    const launched=await request(`/api/missions/${target.id}/tasks/${targetTask.id}/run`,"POST",{expectedVersion:3,timeoutSeconds:30});
    assert.equal(launched.status,202,JSON.stringify(launched.data));
    const targetRun=await until(async()=>{
      const detail=(await request(`/api/missions/${target.id}`)).data;
      return detail.runs[0]?.status==="succeeded"?detail:null;
    });
    assert.match(prompts.code[0],/Audience brief: Telugu readers/);
    assert.match(prompts.code[0],new RegExp(handoff.id));
    assert(!prompts.code[0].includes("FINANCE SECRET"));
    assert.equal(targetRun.artifacts[0].path,"summary.txt");
    assert.equal((await readFile(join(targetRun.runs[0].workspace,"summary.txt"),"utf8")),"Accessible summary implemented\n");
    const completed=await request(`/api/missions/${target.id}/artifact-evidence`,"POST",{runId:targetRun.runs[0].id,taskId:targetTask.id,path:"summary.txt",criterionIndex:0,title:"Actual summary file",expectedVersion:targetRun.mission.version});
    assert.equal(completed.status,201);
    const targetEvidence=completed.data.evidence[0];
    const targetReview=await request(`/api/missions/${target.id}/evidence/${targetEvidence.id}/review`,"POST",{decision:"reviewed",reviewNote:"Inspected the actual bytes",expectedVersion:completed.data.mission.version});
    assert.equal(targetReview.status,200);
    assert.equal((await request(`/api/missions/${target.id}/tasks/${targetTask.id}/accept`,"POST",{expectedVersion:targetReview.data.mission.version})).status,200);
    assert.equal((await request(`/api/missions/${target.id}/accept`,"POST",{expectedVersion:targetReview.data.mission.version+1})).data.mission.status,"accepted");
    await new Promise(resolve=>app.server.close(resolve));
    const restored=new Store(database);
    try {
      assert.equal(restored.missionDetail(source.id).runs[0].output_sha256,sourceRun.runs[0].output_sha256);
      assert.equal(restored.acceptedHandoffs(target.id).length,1);
      assert.equal(restored.missionDetail(target.id).mission.status,"accepted");
    } finally {restored.close()}
  } finally {if(app.server.listening)await new Promise(resolve=>app.server.close(resolve))}
});
