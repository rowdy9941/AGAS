import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { Store, InputError } from "./store.js";
import { projectVault } from "./vault.js";
import { detectRuntimes } from "./runtimes.js";

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

export function createAgasServer({database="data/agas.db",vault="data/AGAS Vault",token="agas-dev-token"}={}) {
  const store=new Store(resolve(database));
  const server=createServer(async(req,res)=>{
    res.setHeader("x-content-type-options","nosniff");
    res.setHeader("referrer-policy","no-referrer");
    res.setHeader("content-security-policy","default-src 'none'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const url=new URL(req.url,"http://localhost"),path=url.pathname;
      if(req.method==="GET"&&path==="/healthz")return json(res,200,{status:"ok",product:"AGAS native",phase:"foundation"});
      if(req.method==="GET"&&asset[path]) {
        const bytes=await readFile(new URL(asset[path],publicRoot));
        res.writeHead(200,{"content-type":mime[path],"cache-control":path==="/assets/agas-logo.jpg"?"public, max-age=3600":"no-store"});
        return res.end(bytes);
      }
      if(!path.startsWith("/api/"))return json(res,404,{error:"Not found"});
      if(!safeToken(req.headers.authorization?.replace(/^Bearer /i,""),token))return json(res,401,{error:"Authentication required"});
      if(req.method==="GET"&&path==="/api/overview")return json(res,200,{...store.overview(),runtimes:detectRuntimes()});
      if(req.method==="GET"&&path==="/api/runtimes")return json(res,200,{runtimes:detectRuntimes()});
      if(req.method==="GET"&&path==="/api/notes")return json(res,200,{notes:store.notesFor({hubId:url.searchParams.get("hubId"),project:url.searchParams.get("project"),principal:"owner"})});
      if(req.method==="GET"&&path.startsWith("/api/notes/"))return json(res,200,{note:store.noteForOwner(path.slice("/api/notes/".length))});
      if(req.method==="POST"&&path==="/api/missions")return json(res,201,{mission:store.createMission(await body(req))});
      const missionRoute=path.match(/^\/api\/missions\/([\da-f-]{36})(?:\/(.*))?$/);
      if(missionRoute){
        const [,id,action]=missionRoute;
        if(req.method==="GET"&&!action)return json(res,200,store.missionDetail(id));
        if(req.method==="POST"){
          const input=await body(req);
          if(action==="tasks")return json(res,201,store.createTask(id,input));
          if(action==="evidence")return json(res,201,store.submitEvidence(id,input));
          if(action==="accept")return json(res,200,store.acceptMission(id,input));
          if(action==="cancel")return json(res,200,store.cancelMission(id,input));
          const review=action?.match(/^evidence\/([\da-f-]{36})\/review$/);
          if(review)return json(res,200,store.reviewEvidence(id,review[1],input));
          const acceptTask=action?.match(/^tasks\/([\da-f-]{36})\/accept$/);
          if(acceptTask)return json(res,200,store.acceptTask(id,acceptTask[1],input));
        }
      }
      if(req.method==="POST"&&path==="/api/projects")return json(res,201,{project:store.createProject(await body(req))});
      if(req.method==="POST"&&path==="/api/media/accounts")return json(res,201,{account:store.createMediaAccount(await body(req))});
      if(req.method==="POST"&&path==="/api/media/campaigns")return json(res,201,{campaign:store.createMediaCampaign(await body(req))});
      if(req.method==="POST"&&path==="/api/messages")return json(res,201,{message:store.sendMessage(await body(req))});
      if(req.method==="POST"&&path==="/api/notes")return json(res,201,{note:store.createNote(await body(req))});
      if(req.method==="POST"&&path==="/api/assignments")return json(res,201,{assignment:store.assignPersona(await body(req))});
      if(req.method==="POST"&&path==="/api/vault/project")return json(res,200,await projectVault(store,vault));
      return json(res,404,{error:"Unknown API route"});
    }catch(error){
      const status=error instanceof InputError?error.status:500;
      if(status===500)console.error("AGAS request failed:",error);
      if(!res.headersSent)json(res,status,{error:status===500?"Internal error":error.message});
      else res.destroy();
    }
  });
  server.on("close",()=>store.close());
  return {server,store};
}

if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
  const host=process.env.AGAS_HOST||"127.0.0.1",port=Number(process.env.AGAS_PORT||4310);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Invalid AGAS_PORT");
  if(!["127.0.0.1","localhost","::1"].includes(host)&&!process.env.AGAS_BOOTSTRAP_TOKEN)
    throw new Error("Set AGAS_BOOTSTRAP_TOKEN before binding to a network interface");
  const {server}=createAgasServer({database:process.env.AGAS_DB_PATH||"data/agas.db",
    vault:process.env.AGAS_VAULT_PATH||"data/AGAS Vault",token:process.env.AGAS_BOOTSTRAP_TOKEN||"agas-dev-token"});
  server.listen(port,host,()=>console.log(`AGAS native foundation at http://${host}:${port}`));
}
