import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { Store, InputError } from "./store.js";
import { importVaultNotes, projectVault } from "./vault.js";
import { detectRuntimes } from "./runtimes.js";
import { ExecutionManager, validateRepository } from "./execution.js";
import { ConversationManager } from "./conversation.js";

const mime={"/":"text/html; charset=utf-8","/app.js":"text/javascript; charset=utf-8",
  "/styles.css":"text/css; charset=utf-8","/assets/agas-logo.jpg":"image/jpeg"};
const asset={"/":"index.html","/app.js":"app.js","/styles.css":"styles.css","/assets/agas-logo.jpg":"assets/agas-logo.jpg"};
const publicRoot=new URL("../public/",import.meta.url);
const safeToken=(given,expected)=>{
  const a=Buffer.from(given||""),b=Buffer.from(expected);
  return a.length===b.length&&timingSafeEqual(a,b);
};
const json=(res,status,data)=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(data))};
async function body(req) {
  if(req.headers["content-type"]?.split(";")[0]!=="application/json")throw new InputError("Expected application/json",415);
  let data="";
  for await(const chunk of req){
    data+=chunk;
    if(data.length>65536)throw new InputError("Request body exceeds 64 KiB",413);
  }
  let parsed;
  try {parsed=JSON.parse(data)}catch{throw new InputError("Invalid JSON")}
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new InputError("Expected a JSON object");
  return parsed;
}

export function createAgasServer({database="data/agas.db",vault="data/AGAS Vault",token="agas-dev-token",
  workspaces="data/workspaces",adapter,adapters}={}) {
  const store=new Store(resolve(database));
  const executor=new ExecutionManager(store,{workspaces,adapter,adapters});
  const conversations=new ConversationManager(store,executor);
  const server=createServer(async(req,res)=>{
    res.setHeader("x-content-type-options","nosniff");
    res.setHeader("referrer-policy","no-referrer");
    res.setHeader("content-security-policy","default-src 'none'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-src http://127.0.0.1:* http://localhost:* https://127.0.0.1:* https://localhost:*; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const url=new URL(req.url,"http://localhost"),path=url.pathname;
      if(req.method==="GET"&&path==="/healthz")return json(res,200,{status:"ok",product:"AGAS native",phase:"execution-foundation"});
      if(req.method==="GET"&&asset[path]) {
        const bytes=await readFile(new URL(asset[path],publicRoot));
        res.writeHead(200,{"content-type":mime[path],"cache-control":path==="/assets/agas-logo.jpg"?"public, max-age=3600":"no-store"});
        return res.end(bytes);
      }
      if(!path.startsWith("/api/"))return json(res,404,{error:"Not found"});
      if(!safeToken(req.headers.authorization?.replace(/^Bearer /i,""),token))return json(res,401,{error:"Authentication required"});
      const runtimes=async()=>{
        const checks=await Promise.all([executor.readiness("codex"),executor.readiness("opencode")]);
        return detectRuntimes().map(runtime=>{
          const check=checks.find(item=>item.id===runtime.id);
          return check?{...runtime,ready:check.ready,state:check.ready?"ready":runtime.state,
            reason:check.reason||"",version:check.version||""}:runtime;
        });
      };
      if(req.method==="GET"&&path==="/api/overview")return json(res,200,{...store.overview(),runtimes:await runtimes()});
      if(req.method==="GET"&&path==="/api/runtimes")return json(res,200,{runtimes:await runtimes()});
      if(req.method==="GET"&&path==="/api/notes")return json(res,200,{notes:store.notesFor({hubId:url.searchParams.get("hubId"),project:url.searchParams.get("project"),principal:"owner"})});
      if(req.method==="GET"&&path.startsWith("/api/notes/"))return json(res,200,{note:store.noteForOwner(path.slice("/api/notes/".length))});
      if(req.method==="POST"&&path==="/api/missions")return json(res,201,{mission:store.createMission(await body(req))});
      const missionRoute=path.match(/^\/api\/missions\/([\da-f-]{36})(?:\/(.*))?$/);
      if(missionRoute){
        const [,id,action]=missionRoute;
        if(req.method==="GET"&&!action)return json(res,200,store.missionDetail(id));
        const logs=action?.match(/^runs\/([\da-f-]{36})\/logs$/);
        if(req.method==="GET"&&logs)return json(res,200,store.runLogs(id,logs[1]));
        if(req.method==="POST"){
          const input=await body(req);
          const reviewBranch=action?.match(/^runs\/([\da-f-]{36})\/review-branch$/);
          if(reviewBranch){
            if(store.missionDetail(id).mission.version!==input.expectedVersion)
              throw new InputError("Mission changed; reload before creating a review branch",409);
            return json(res,201,{receipt:await executor.createReviewBranch(id,reviewBranch[1])});
          }
          if(action==="tasks")return json(res,201,store.createTask(id,input));
          if(action==="evidence")return json(res,201,store.submitEvidence(id,input));
          if(action==="artifact-evidence")return json(res,201,store.submitRunArtifact(id,input));
          if(action==="output-evidence")return json(res,201,store.submitRunOutput(id,input));
          if(action==="accept")return json(res,200,store.acceptMission(id,input));
          if(action==="cancel"){
            const detail=store.cancelMission(id,input);
            for(const run of detail.runs.filter(item=>item.status==="cancelled"))executor.stop(run.id);
            return json(res,200,detail);
          }
          const launch=action?.match(/^tasks\/([\da-f-]{36})\/run$/);
          if(launch){
            const detail=store.missionDetail(id);
            const task=detail.tasks.find(item=>item.id===launch[1]);
            const runtime=store.overview().assignments.find(item=>item.id===task?.assignment_id)?.runtime;
            const ready=await executor.readiness(runtime);
            if(!ready.ready)throw new InputError(ready.reason||"Assigned runtime is not ready",409);
            const run=store.queueRun(id,launch[1],input);
            executor.enqueue();
            return json(res,202,{run,mission:store.missionDetail(id)});
          }
          const stop=action?.match(/^runs\/([\da-f-]{36})\/stop$/);
          if(stop){const detail=store.stopRun(id,stop[1],input);executor.stop(stop[1]);return json(res,200,detail)}
          const review=action?.match(/^evidence\/([\da-f-]{36})\/review$/);
          if(review)return json(res,200,store.reviewEvidence(id,review[1],input));
          const acceptTask=action?.match(/^tasks\/([\da-f-]{36})\/accept$/);
          if(acceptTask)return json(res,200,store.acceptTask(id,acceptTask[1],input));
        }
      }
      if(req.method==="POST"&&path==="/api/projects")return json(res,201,{project:store.createProject(await body(req))});
      if(req.method==="POST"&&path==="/api/handoffs")return json(res,201,{handoff:store.offerHandoff(await body(req))});
      const handoffReview=path.match(/^\/api\/handoffs\/([\da-f-]{36})\/review$/);
      if(req.method==="POST"&&handoffReview)return json(res,200,{handoff:store.reviewHandoff(handoffReview[1],await body(req))});
      if(req.method==="POST"&&path==="/api/goals")return json(res,201,{goal:store.createGoal(await body(req))});
      const achieve=path.match(/^\/api\/goals\/([\da-f-]{36})\/achieve$/);
      if(req.method==="POST"&&achieve)return json(res,200,{goal:store.completeGoal(achieve[1],await body(req))});
      const repository=path.match(/^\/api\/projects\/([\da-f-]{36})\/repository$/);
      if(req.method==="POST"&&repository){
        const input=await body(req);
        const root=await validateRepository(input.repositoryPath);
        return json(res,200,{project:store.linkProjectRepository(repository[1],root)});
      }
      const runLimit=path.match(/^\/api\/projects\/([\da-f-]{36})\/run-limit$/);
      if(req.method==="POST"&&runLimit)return json(res,200,{project:store.setRunLimit(runLimit[1],await body(req))});
      if(req.method==="POST"&&path==="/api/media/accounts")return json(res,201,{account:store.createMediaAccount(await body(req))});
      if(req.method==="POST"&&path==="/api/media/campaigns")return json(res,201,{campaign:store.createMediaCampaign(await body(req))});
      const campaignRoute=path.match(/^\/api\/media\/campaigns\/([\da-f-]{36})(?:\/(.*))?$/);
      if(campaignRoute){
        const [,id,action]=campaignRoute;
        if(req.method==="GET"&&!action)return json(res,200,store.mediaCampaignDetail(id));
        if(req.method==="POST"){
          const input=await body(req);
          if(action==="artifacts")return json(res,201,store.submitMediaArtifact(id,input));
          const review=action?.match(/^artifacts\/([\da-f-]{36})\/review$/);
          if(review)return json(res,200,store.reviewMediaArtifact(id,review[1],input));
          if(action==="packets")return json(res,201,{packet:store.prepareMediaPacket(id,input)});
        }
      }
      if(req.method==="POST"&&path==="/api/finance/paper-accounts")
        return json(res,201,{account:store.createPaperAccount(await body(req))});
      const paperRoute=path.match(/^\/api\/finance\/paper-accounts\/([\da-f-]{36})(?:\/(marks|orders))?$/);
      if(paperRoute){
        const [,id,action]=paperRoute;
        if(req.method==="GET"&&!action)return json(res,200,store.paperAccountDetail(id));
        if(req.method==="POST"&&action==="marks")return json(res,201,store.recordPaperMark(id,await body(req)));
        if(req.method==="POST"&&action==="orders")return json(res,201,store.simulatePaperOrder(id,await body(req)));
      }
      if(req.method==="POST"&&path==="/api/messages"){
        const input=await body(req);
        if(input.runtime){
          if(!["codex","opencode"].includes(input.runtime))throw new InputError("Unsupported conversation runtime");
          const ready=await executor.readiness(input.runtime);
          if(!ready.ready)throw new InputError(ready.reason||"Conversation runtime is not ready",409);
        }
        const message=store.sendMessage(input);
        if(input.runtime){store.queueCeoReply(message.id,input.runtime);conversations.enqueue()}
        return json(res,201,{message});
      }
      const respond=path.match(/^\/api\/messages\/([\da-f-]{36})\/respond$/);
      if(req.method==="POST"&&respond){
        const input=await body(req),ready=await executor.readiness(input.runtime);
        if(!ready.ready)throw new InputError(ready.reason||"Conversation runtime is not ready",409);
        const reply=store.queueCeoReply(respond[1],input.runtime);
        conversations.enqueue();
        return json(res,202,{reply});
      }
      if(req.method==="POST"&&path==="/api/notes")return json(res,201,{note:store.createNote(await body(req))});
      if(req.method==="POST"&&path==="/api/assignments")return json(res,201,{assignment:store.assignPersona(await body(req))});
      if(req.method==="POST"&&path==="/api/vault/project")return json(res,200,await projectVault(store,vault));
      if(req.method==="POST"&&path==="/api/vault/import"){
        const result=await importVaultNotes(store,vault);
        const projection=await projectVault(store,vault);
        return json(res,200,{...result,projected:projection.written,projectionConflicts:projection.conflicts});
      }
      return json(res,404,{error:"Unknown API route"});
    }catch(error){
      const status=error instanceof InputError?error.status:500;
      if(status===500)console.error("AGAS request failed:",error);
      if(!res.headersSent)json(res,status,{error:status===500?"Internal error":error.message});
      else res.destroy();
    }
  });
  server.on("listening",()=>{executor.resumeQueued();conversations.enqueue()});
  server.on("close",()=>{conversations.shutdown();executor.shutdown();store.close()});
  return {server,store,executor,conversations};
}

if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
  const host=process.env.AGAS_HOST||"127.0.0.1",port=Number(process.env.AGAS_PORT||4310);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Invalid AGAS_PORT");
  if(!["127.0.0.1","localhost","::1"].includes(host)&&!process.env.AGAS_BOOTSTRAP_TOKEN)
    throw new Error("Set AGAS_BOOTSTRAP_TOKEN before binding to a network interface");
  const {server}=createAgasServer({database:process.env.AGAS_DB_PATH||"data/agas.db",
    vault:process.env.AGAS_VAULT_PATH||"data/AGAS Vault",
    workspaces:process.env.AGAS_WORKSPACES_PATH||"data/workspaces",
    token:process.env.AGAS_BOOTSTRAP_TOKEN||"agas-dev-token"});
  server.listen(port,host,()=>console.log(`AGAS native workspace at http://${host}:${port}`));
}
