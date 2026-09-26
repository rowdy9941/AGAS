import { spawn, execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { writeFileSync, unlinkSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import { detectRuntimes } from "./runtimes.js";
import { InputError } from "./store.js";

const execFile=promisify(execFileCallback);
const GIT_TIMEOUT=15000;
const MAX_LOG_BYTES=256*1024;
const MAX_ARTIFACT_BYTES=10*1024*1024;
const MAX_ARTIFACTS=100;
const terminal=new Set(["cancelled","failed","succeeded","interrupted"]);

function childEnv(source=process.env) {
  // The API token and unrelated service credentials must never be inherited by agents.
  const keys=["PATH","HOME","USERPROFILE","SYSTEMROOT","WINDIR","TMPDIR","TEMP","TMP","LANG","LC_ALL","TERM","CODEX_HOME"];
  return Object.fromEntries(keys.filter(key=>typeof source[key]==="string").map(key=>[key,source[key]]));
}

async function git(cwd,...args) {
  const {stdout}=await execFile("git",["-C",cwd,...args],{timeout:GIT_TIMEOUT,maxBuffer:1024*1024,env:childEnv()});
  return stdout.trim();
}

async function changedPaths(workspace) {
  const [tracked,untracked]=await Promise.all([
    git(workspace,"diff","--no-renames","HEAD","--name-only","-z"),
    git(workspace,"ls-files","-o","--exclude-standard","-z")
  ]);
  return [...new Set((tracked+untracked).split("\0").filter(Boolean))];
}

export async function validateRepository(path) {
  if(typeof path!=="string"||!isAbsolute(path))throw new InputError("Choose an absolute Git repository path");
  let root;
  try {
    root=await realpath(path);
    if(!(await stat(root)).isDirectory())throw new Error("Not a directory");
    const top=await git(root,"rev-parse","--show-toplevel");
    if(await realpath(top)!==root||await git(root,"rev-parse","--is-bare-repository")!=="false")
      throw new Error("Path must be the repository root");
    await git(root,"rev-parse","--verify","HEAD");
  } catch {throw new InputError("Choose a local, non-bare Git repository root with a HEAD commit")}
  return root;
}

export class CodexAdapter {
  constructor({binary=null,environment=process.env}={}) {this.binary=binary;this.environment=environment}
  executable() {return this.binary||detectRuntimes(this.environment).find(item=>item.id==="codex")?.path}
  async probe() {
    const binary=this.executable();
    if(!binary)return {id:"codex",ready:false,reason:"Codex CLI is not installed on this host"};
    try {
      const env=childEnv(this.environment);
      const version=await execFile(binary,["--version"],{env,timeout:5000,maxBuffer:4096});
      await execFile(binary,["login","status"],{env,timeout:5000,maxBuffer:4096});
      return {id:"codex",ready:true,version:version.stdout.trim(),path:binary};
    } catch {
      return {id:"codex",ready:false,reason:"Codex CLI did not confirm authentication; run codex login status locally"};
    }
  }
  launch(workspace,prompt) {
    const binary=this.executable();
    if(!binary)throw new InputError("Codex CLI is missing",409);
    return spawn(binary,["exec","--json","--ephemeral","--sandbox","workspace-write",
      "--ask-for-approval","never","--cd",workspace,prompt],{
      cwd:workspace,env:childEnv(this.environment),stdio:["ignore","pipe","pipe"],shell:false,
      detached:process.platform!=="win32"
    });
  }
  launchMessage(workspace,prompt) {
    const binary=this.executable();
    if(!binary)throw new InputError("Codex CLI is missing",409);
    return spawn(binary,["exec","--json","--ephemeral","--sandbox","read-only",
      "--ask-for-approval","never","--cd",workspace,prompt],{
      cwd:workspace,env:childEnv(this.environment),stdio:["ignore","pipe","pipe"],shell:false,
      detached:process.platform!=="win32"
    });
  }
}

export class OpenCodeAdapter {
  constructor({binary=null,environment=process.env}={}) {this.binary=binary;this.environment=environment}
  executable() {return this.binary||detectRuntimes(this.environment).find(item=>item.id==="opencode")?.path}
  async probe() {
    const binary=this.executable();
    if(!binary)return {id:"opencode",ready:false,reason:"OpenCode CLI is not installed on this host"};
    try {
      const env=childEnv(this.environment);
      const version=(await execFile(binary,["--version"],{env,timeout:5000,maxBuffer:4096})).stdout.trim();
      const major=Number(version.match(/(?:^|\s)v?(\d+)\./)?.[1]);
      if(major!==1)return {id:"opencode",ready:false,reason:"AGAS currently supports the OpenCode 1.x CLI protocol",version};
      const help=(await execFile(binary,["run","--help"],{env,timeout:5000,maxBuffer:16384})).stdout;
      if(!help.includes("--format"))throw new Error("JSON run events unavailable");
      const output=(await execFile(binary,["auth","list"],{env,timeout:5000,maxBuffer:8192})).stdout
        .replace(/\u001b\[[0-9;]*m/g,"");
      if(!/\b[1-9]\d*\s+credentials?\b/i.test(output))
        return {id:"opencode",ready:false,reason:"OpenCode has no confirmed stored provider credential; run opencode auth list locally",version};
      return {id:"opencode",ready:true,version,path:binary};
    } catch {
      return {id:"opencode",ready:false,reason:"OpenCode did not confirm its JSON run protocol and stored provider login"};
    }
  }
  launch(workspace,prompt) {
    const binary=this.executable();
    if(!binary)throw new InputError("OpenCode CLI is missing",409);
    const env={...childEnv(this.environment),OPENCODE_PERMISSION:JSON.stringify({
      "*":"deny",read:"allow",edit:"allow",glob:"allow",grep:"allow",external_directory:"deny"
    }),OPENCODE_AUTO_SHARE:"false",OPENCODE_DISABLE_AUTOUPDATE:"true",
      OPENCODE_DISABLE_LSP_DOWNLOAD:"true",OPENCODE_DISABLE_DEFAULT_PLUGINS:"true"};
    return spawn(binary,["--pure","run","--format","json",prompt+"\n\nAGAS permits only local file read, edit and search in this worktree. Shell tools and external directories are disabled. State honestly when checks could not be run."],{
      cwd:workspace,env,stdio:["ignore","pipe","pipe"],shell:false,detached:process.platform!=="win32"
    });
  }
  launchMessage(workspace,prompt) {
    const binary=this.executable();
    if(!binary)throw new InputError("OpenCode CLI is missing",409);
    return spawn(binary,["--pure","run","--format","json",prompt],{
      cwd:workspace,env:{...childEnv(this.environment),OPENCODE_PERMISSION:JSON.stringify({"*":"deny"}),
        OPENCODE_AUTO_SHARE:"false",OPENCODE_DISABLE_AUTOUPDATE:"true",
        OPENCODE_DISABLE_DEFAULT_PLUGINS:"true",OPENCODE_DISABLE_LSP_DOWNLOAD:"true"},
      stdio:["ignore","pipe","pipe"],shell:false,detached:process.platform!=="win32"
    });
  }
}

// OpenClaw work is admitted only to a dedicated Gateway agent whose active
// policy denies every tool. Gateway configuration must have been applied,
// not merely written to disk, before AGAS can send a scoped prompt.
export class OpenClawAdapter {
  constructor({binary=null,environment=process.env}={}) {this.binary=binary;this.environment=environment}
  executable() {return this.binary||detectRuntimes(this.environment).find(item=>item.id==="openclaw")?.path}
  async probe() {
    const binary=this.executable();
    if(!binary)return {id:"openclaw",ready:false,reason:"OpenClaw CLI is not installed on this host"};
    try {
      const env=childEnv(this.environment),options={env,timeout:10000,maxBuffer:512*1024};
      const version=(await execFile(binary,["--version"],options)).stdout.trim();
      const help=(await execFile(binary,["agent","--help"],options)).stdout;
      if(!["--agent","--message-file","--session-key","--json"].every(flag=>help.includes(flag)))
        throw new Error("OpenClaw agent JSON protocol is unavailable");
      const status=JSON.parse((await execFile(binary,["gateway","status","--require-rpc","--json"],options)).stdout);
      if(status.ok!==true)throw new Error("Gateway read probe failed");
      const snapshot=JSON.parse((await execFile(binary,["gateway","call","config.get","--params","{}","--json"],options)).stdout);
      const active=snapshot.result||snapshot;
      const agent=active.config?.agents?.entries?.agas;
      if(!active.configRevisionHash||active.configRevisionHash!==active.appliedConfigHash||
        active.config?.gateway?.mode!=="local"||
        agent?.skipBootstrap!==true||!Array.isArray(agent.skills)||agent.skills.length!==0||
        !agent.tools?.deny?.includes("*")||
        agent.sandbox?.mode!=="all"||agent.sandbox?.workspaceAccess!=="none")
        throw new Error("AGAS agent policy is not active");
      return {id:"openclaw",ready:true,version,path:binary,capability:"text-only"};
    } catch {
      return {id:"openclaw",ready:false,reason:"OpenClaw needs a reachable local Gateway with an applied, tool-denied agas agent profile; see README"};
    }
  }
  launchMessage(workspace,prompt) {
    const binary=this.executable();
    if(!binary)throw new InputError("OpenClaw CLI is missing",409);
    const file=join(workspace,`agas-request-${randomUUID()}.txt`);
    writeFileSync(file,prompt,{encoding:"utf8",mode:0o600,flag:"wx"});
    try {
      const child=spawn(binary,["agent","--agent","agas","--session-key",`agas-${randomUUID()}`,
        "--message-file",file,"--timeout","120","--json"],{
        cwd:workspace,env:childEnv(this.environment),stdio:["ignore","pipe","pipe"],shell:false,
        detached:process.platform!=="win32"
      });
      child.once("close",()=>{try{unlinkSync(file)}catch(error){if(error.code!=="ENOENT")console.error("Could not remove OpenClaw request file",error)}});
      return child;
    } catch(error){unlinkSync(file);throw error}
  }
}

export class ExecutionManager {
  constructor(store,{workspaces="data/workspaces",adapter,adapters}={}) {
    this.store=store;this.root=resolve(workspaces);
    this.adapters=adapters||(adapter?{codex:adapter}:{codex:new CodexAdapter(),opencode:new OpenCodeAdapter(),openclaw:new OpenClawAdapter()});
    this.active=null;this.busy=false;this.stopping=false;this.promoting=new Set();
    this.store.recoverRuns();
  }
  async readiness(id="codex") {
    const adapter=this.adapters[id];
    if(!adapter)return {id,ready:false,reason:"AGAS has no executable adapter for this runtime"};
    return adapter.probe();
  }
  resumeQueued(){this.store.reconcileAutoHandoffRuns();this.enqueue()}
  enqueue() {
    if(this.busy||this.stopping)return;
    this.busy=true;
    queueMicrotask(async()=>{
      try {
        while(!this.stopping) {
          const next=this.store.queuedRuns()[0];
          if(!next)break;
          await this.execute(next.id);
        }
      } catch(error) {
        // Keep the server alive if storage or dispatch fails; do not automatically
        // replay a run whose effects may already have happened.
        console.error("AGAS execution queue stopped:",error);
      } finally {this.busy=false}
    });
  }
  stop(id) {if(this.active?.id===id)this.terminate(this.active.child)}
  terminate(child) {
    if(!child?.pid)return;
    try {
      if(process.platform!=="win32")process.kill(-child.pid,"SIGTERM");
      else child.kill("SIGTERM");
    } catch {child.kill("SIGTERM")}
    const kill=setTimeout(()=>{
      if(child.exitCode!==null)return;
      try {if(process.platform!=="win32")process.kill(-child.pid,"SIGKILL");else child.kill("SIGKILL")}
      catch {child.kill("SIGKILL")}
    },3000);
    kill.unref();
    child.once("close",()=>clearTimeout(kill));
  }
  shutdown() {
    this.stopping=true;
    if(this.active) {
      this.store.completeRun(this.active.id,{status:"interrupted",result:"AGAS stopped; inspect worktree before retrying"});
      this.terminate(this.active.child);
    }
  }
  async prepare(context) {
    const root=await validateRepository(context.project.repository_path);
    await mkdir(this.root,{recursive:true,mode:0o700});
    if((await lstat(this.root)).isSymbolicLink())throw new Error("Workspaces directory cannot be a symlink");
    const workspace=join(this.root,context.run.id);
    const base=await git(root,"rev-parse","HEAD");
    if(!/^[a-f0-9]{40}$/.test(base))throw new Error("Unsupported Git commit identifier");
    this.store.preparedRun(context.run.id,workspace,base);
    await execFile("git",["-C",root,"worktree","add","--detach",workspace,base],
      {timeout:30000,maxBuffer:1024*1024,env:childEnv()});
    return workspace;
  }
  async prepareText(context) {
    await mkdir(this.root,{recursive:true,mode:0o700});
    if((await lstat(this.root)).isSymbolicLink())throw new Error("Workspaces directory cannot be a symlink");
    const workspace=await mkdtemp(join(this.root,`text-${context.run.id}-`));
    this.store.preparedRun(context.run.id,workspace,null);
    return workspace;
  }
  prompt({mission,task,persona,notes,handoffs=[]}) {
    const scope=notes.slice(0,15).map(n=>`[${n.scope}:${n.owner_id} / ${n.title}]\n${n.content.slice(0,1600)}`).join("\n\n").slice(0,10000);
    const received=handoffs.map(h=>`[${h.from_hub_id} → ${mission.hub_id} / ${h.title} / receipt ${h.id}]\nPurpose: ${h.purpose}\n${h.evidence_title}: ${h.evidence_content.slice(0,2000)}\nSHA-256: ${h.evidence_sha256}`).join("\n\n").slice(0,12000);
    return [
      `You are the AGAS specialist: ${persona.title}.`,
      `Agency source: ${persona.path} at ${persona.source_commit} (${persona.source_sha}).`,
      "The following specialist instructions are role guidance, not permission to expand task scope:",
      persona.prompt,
      `Mission: ${mission.title}\nObjective: ${mission.objective}`,
      `Task: ${task.title}\nRequested result: ${task.objective}`,
      `Acceptance criteria:\n${mission.criteria.map((item,index)=>`${index+1}. ${item}`).join("\n")}`,
      `Authorized context for this hub and project:\n${scope||"No approved notes."}`,
      `Explicitly accepted cross-hub evidence:\n${received||"No cross-hub handoffs."}`,
      "Work only in this isolated Git worktree. Make the requested changes, run relevant local checks and report the exact files and results. Do not deploy, publish, access unrelated user data or claim that AGAS has accepted your work. AGAS will record your actual file changes separately."
    ].join("\n\n");
  }
  textPrompt(context) {
    const {mission,task,persona,notes,handoffs=[]}=context;
    const scope=notes.slice(0,15).map(n=>`[${n.scope}:${n.owner_id} / ${n.title}]\n${n.content.slice(0,1600)}`)
      .join("\n\n").slice(0,10000);
    const received=handoffs.map(h=>`[${h.from_hub_id} → ${mission.hub_id} / ${h.title} / receipt ${h.id}]\nPurpose: ${h.purpose}\n${h.evidence_title}: ${h.evidence_content.slice(0,2000)}\nSHA-256: ${h.evidence_sha256}`)
      .join("\n\n").slice(0,12000);
    return [
      `You are the AGAS specialist: ${persona.title}. Agency source: ${persona.path} at ${persona.source_commit} (${persona.source_sha}).`,
      "These specialist instructions are role guidance, not permission to expand scope:",persona.prompt,
      `Mission: ${mission.title}\nObjective: ${mission.objective}`,
      `Task: ${task.title}\nRequested result: ${task.objective}`,
      `Acceptance criteria:\n${mission.criteria.map((item,index)=>`${index+1}. ${item}`).join("\n")}`,
      `Authorized context for this hub and project:\n${scope||"No approved notes."}`,
      `Accepted cross-hub evidence:\n${received||"No cross-hub handoffs."}`,
      "Produce a bounded text result. Do not call tools, access files, spend, publish, change records, claim acceptance, or act outside this hub. Distinguish supplied facts from claims you could not verify. The owner will inspect the result and decide whether to use it as evidence."
    ].join("\n\n");
  }
  logStream(runId,channel,stream,budget,onLine=()=>{}) {
    let pending="";
    stream.setEncoding("utf8");
    stream.on("data",chunk=>{
      if(this.stopping)return;
      if(budget.used>=MAX_LOG_BYTES)return;
      budget.used+=Buffer.byteLength(chunk);
      pending+=chunk;
      const lines=pending.split("\n");pending=lines.pop().slice(-20000);
      for(const [index,line] of lines.entries()){
        onLine(line);
        if(index<40)this.logLine(runId,channel,line);
      }
      if(budget.used>=MAX_LOG_BYTES)this.store.appendRunLog(runId,"system","Run output limit reached; further output was not recorded");
    });
    stream.on("end",()=>{if(!this.stopping&&pending&&budget.used<MAX_LOG_BYTES){onLine(pending);this.logLine(runId,channel,pending)}});
  }
  logLine(runId,channel,line) {
    if(!line.trim())return;
    if(channel==="agent") {
      try {
        const event=JSON.parse(line);
        const item=event.item||event.part||{};
        const summary=[event.type,item.type,item.status,item.command,item.text,event.message]
          .filter(value=>typeof value==="string"&&value.trim()).join(" · ");
        this.store.appendRunLog(runId,"agent",summary||"Agent event");
      } catch {this.store.appendRunLog(runId,"agent",line)}
    } else this.store.appendRunLog(runId,"progress",line);
  }
  async artifacts(workspace,root) {
    const paths=await changedPaths(workspace);
    const output=[];
    for(const path of [...new Set(paths)].slice(0,MAX_ARTIFACTS)) {
      const full=resolve(workspace,path);
      if(full===workspace||!full.startsWith(workspace+sep))continue;
      let info;
      try {info=await lstat(full)} catch(error) {
        if(error.code==="ENOENT"){output.push({path,status:"deleted",sha256:null,bytes:null});continue}
        throw error;
      }
      if(!info.isFile()||info.size>MAX_ARTIFACT_BYTES){output.push({path,status:"skipped",sha256:null,bytes:info.size});continue}
      const actual=await realpath(full);
      if(actual!==full&&!actual.startsWith(workspace+sep)){output.push({path,status:"skipped",sha256:null,bytes:info.size});continue}
      const bytes=await readFile(full);
      output.push({path,status:"recorded",sha256:createHash("sha256").update(bytes).digest("hex"),bytes:bytes.length});
    }
    if(paths.length>MAX_ARTIFACTS)this.store.appendRunLog(root,"system",`Only the first ${MAX_ARTIFACTS} changed paths were recorded`);
    return output;
  }
  async createReviewBranch(missionId,runId) {
    if(this.promoting.has(runId))throw new InputError("Review branch creation is already underway",409);
    this.promoting.add(runId);
    try {
      const {mission,project,run,artifacts,existing}=this.store.reviewBranchContext(missionId,runId);
      if(existing)return existing;
      const root=await validateRepository(project.repository_path);
      const workspace=await realpath(run.workspace);
      if(workspace!==join(this.root,runId)||await git(workspace,"rev-parse","--show-toplevel")!==workspace)
        throw new InputError("Run worktree is no longer in AGAS's workspace directory",409);
      const ref=`refs/heads/agas/${mission.id}/${runId}`;
      let commit;
      try {commit=await git(root,"rev-parse","--verify",ref)} catch {}
      if(commit) {
        const message=await git(root,"show","-s","--format=%B",commit);
        if(!message.split("\n").includes(`AGAS-Run-ID: ${runId}`)||
          await git(root,"rev-parse",`${commit}^`)!==run.base_commit||
          await git(workspace,"rev-parse","HEAD")!==commit)
          throw new InputError("A different review branch already has this name",409);
      } else {
        if(await git(workspace,"rev-parse","HEAD")!==run.base_commit)
          throw new InputError("The agent changed Git history; inspect the worktree manually",409);
        const actual=await changedPaths(workspace),expected=artifacts.map(item=>item.path);
        if(actual.length!==expected.length||actual.some(path=>!expected.includes(path)))
          throw new InputError("Worktree files changed since the accepted run; review fresh evidence",409);
        await git(workspace,"add","--",...expected);
        await git(workspace,"-c","user.name=AGAS","-c","user.email=agas@users.noreply.github.com",
          "-c",`core.hooksPath=${process.platform==="win32"?"NUL":"/dev/null"}`,
          "-c","commit.gpgsign=false","commit","-m",`AGAS review: ${mission.title}`,
          "-m",`AGAS-Run-ID: ${runId}`);
        commit=await git(workspace,"rev-parse","HEAD");
        try {await git(root,"update-ref",ref,commit,"0".repeat(40))}
        catch {throw new InputError("Review branch could not be created; inspect the linked repository",409)}
      }
      return this.store.recordReviewBranch(missionId,runId,ref,commit,run.base_commit);
    } finally {this.promoting.delete(runId)}
  }
  async execute(id) {
    let workspace,child,timeoutTimer,timedOut=false;
    try {
      const context=this.store.claimRun(id);
      this.active={id,child:null};
      if(context.task.required_handoff_id&&
        !context.handoffs.some(handoff=>handoff.id===context.task.required_handoff_id))
        throw new Error("Required cross-hub evidence changed before execution; inspect the handoff");
      const adapter=this.adapters[context.run.runtime];
      if(!adapter)throw new Error(`No adapter installed for ${context.run.runtime}`);
      const ready=await adapter.probe();
      if(!ready.ready)throw new Error(ready.reason||"Assigned runtime is not ready");
      const codeRun=context.mission.hub_id==="dev";
      if(!codeRun&&!adapter.launchMessage)throw new Error("Text-only runtime does not provide a restricted message protocol");
      workspace=codeRun?await this.prepare(context):await this.prepareText(context);
      if(this.stopping||terminal.has(this.store.runContext(id).run.status))return;
      child=codeRun?adapter.launch(workspace,this.prompt(context)):
        adapter.launchMessage(workspace,this.textPrompt(context));
      this.active.child=child;
      this.store.runningRun(id,child.pid||null);
      this.store.appendRunLog(id,"system",`${context.run.runtime} launched in ${codeRun?"isolated Git worktree":"restricted text workspace"} at ${context.run.id}`);
      const budget={used:0};
      let output="",outputOverflow=false;
      this.logStream(id,"agent",child.stdout,budget,line=>{
        if(codeRun||outputOverflow)return;
        try {
          const event=JSON.parse(line);
          const part=event.type==="text"&&event.part?.type==="text"?event.part.text:
            event.ok===true&&event.status==="ok"&&!event.deliveryStatus?event.final:null;
          if(typeof part!=="string")return;
          const next=output+part;
          if(next.length>12000){outputOverflow=true;this.terminate(child);return}
          output=next;
        } catch {}
      });
      this.logStream(id,"progress",child.stderr,budget);
      const completed=new Promise((resolve,reject)=>{
        child.once("error",reject);
        child.once("close",(code,signal)=>resolve({code,signal}));
      });
      timeoutTimer=setTimeout(()=>{timedOut=true;this.terminate(child)},context.run.timeout_seconds*1000);
      const {code,signal}=await completed;
      if(this.stopping||terminal.has(this.store.runContext(id).run.status))return;
      const artifacts=codeRun?await this.artifacts(workspace,id):[];
      const succeeded=code===0&&!timedOut&&(codeRun||!outputOverflow&&budget.used<MAX_LOG_BYTES&&!!output.trim());
      this.store.completeRun(id,{status:succeeded?"succeeded":"failed",exitCode:code,
        result:timedOut?`Timed out after ${context.run.timeout_seconds} seconds`:
          outputOverflow?"Text output exceeded 12,000 characters":
          !codeRun&&budget.used>=MAX_LOG_BYTES?"Process output exceeded the recording limit":
          succeeded?codeRun?"Process exited successfully; inspect artifacts and review evidence":
            "Text result recorded with a hash; owner review is required":
            code===0?"Runtime supplied no usable text result":`Exit ${code??signal}; inspect workspace for partial changes`,
        artifacts,outputText:succeeded&&!codeRun?output:null});
    } catch(error) {
      if(!this.stopping&&!terminal.has(this.store.runContext(id).run.status)) {
        this.store.appendRunLog(id,"system",`Run failed: ${error.message}`);
        this.store.completeRun(id,{status:"failed",result:error.message});
      }
    } finally {
      clearTimeout(timeoutTimer);
      if(this.active?.id===id)this.active=null;
    }
  }
}
