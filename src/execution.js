import { spawn, execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, stat } from "node:fs/promises";
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

export class ExecutionManager {
  constructor(store,{workspaces="data/workspaces",adapter,adapters}={}) {
    this.store=store;this.root=resolve(workspaces);
    this.adapters=adapters||(adapter?{codex:adapter}:{codex:new CodexAdapter(),opencode:new OpenCodeAdapter()});
    this.active=null;this.busy=false;this.stopping=false;
    this.store.recoverRuns();
  }
  async readiness(id="codex") {
    const adapter=this.adapters[id];
    if(!adapter)return {id,ready:false,reason:"AGAS has no executable adapter for this runtime"};
    return adapter.probe();
  }
  resumeQueued(){this.enqueue()}
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
  logStream(runId,channel,stream,budget) {
    let pending="";
    stream.setEncoding("utf8");
    stream.on("data",chunk=>{
      if(this.stopping)return;
      if(budget.used>=MAX_LOG_BYTES)return;
      budget.used+=Buffer.byteLength(chunk);
      pending+=chunk;
      const lines=pending.split("\n");pending=lines.pop().slice(-4000);
      for(const line of lines.slice(0,40))this.logLine(runId,channel,line);
      if(budget.used>=MAX_LOG_BYTES)this.store.appendRunLog(runId,"system","Run output limit reached; further output was not recorded");
    });
    stream.on("end",()=>{if(!this.stopping&&pending&&budget.used<MAX_LOG_BYTES)this.logLine(runId,channel,pending)});
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
    const paths=(await git(workspace,"ls-files","-m","-d","-o","--exclude-standard","-z"))
      .split("\0").filter(Boolean);
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
  async execute(id) {
    let workspace,child,timeoutTimer,timedOut=false;
    try {
      const context=this.store.claimRun(id);
      this.active={id,child:null};
      const adapter=this.adapters[context.run.runtime];
      if(!adapter)throw new Error(`No adapter installed for ${context.run.runtime}`);
      const ready=await adapter.probe();
      if(!ready.ready)throw new Error(ready.reason||"Assigned runtime is not ready");
      workspace=await this.prepare(context);
      if(this.stopping||terminal.has(this.store.runContext(id).run.status))return;
      child=adapter.launch(workspace,this.prompt(context));
      this.active.child=child;
      this.store.runningRun(id,child.pid||null);
      this.store.appendRunLog(id,"system",`${context.run.runtime} launched in isolated worktree at ${context.run.id}`);
      const budget={used:0};
      this.logStream(id,"agent",child.stdout,budget);
      this.logStream(id,"progress",child.stderr,budget);
      const completed=new Promise((resolve,reject)=>{
        child.once("error",reject);
        child.once("close",(code,signal)=>resolve({code,signal}));
      });
      timeoutTimer=setTimeout(()=>{timedOut=true;this.terminate(child)},context.run.timeout_seconds*1000);
      const {code,signal}=await completed;
      if(this.stopping||terminal.has(this.store.runContext(id).run.status))return;
      const artifacts=await this.artifacts(workspace,id);
      this.store.completeRun(id,{status:code===0&&!timedOut?"succeeded":"failed",exitCode:code,
        result:timedOut?`Timed out after ${context.run.timeout_seconds} seconds`:
          code===0?"Process exited successfully; inspect artifacts and review evidence":`Exit ${code??signal}; inspect worktree for partial changes`,artifacts});
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
