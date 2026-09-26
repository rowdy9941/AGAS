import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store.js";
import { projectVault } from "../src/vault.js";
import { agencyIndex, loadBundledAgency } from "../src/agency.js";
import { createAgasServer } from "../src/server.js";

test("one organization and seven CEOs persist, and missions need acceptance criteria",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"agas-native-")),path=join(dir,"agas.db");
  const first=new Store(path);
  assert.equal(first.overview().hubs.length,7);
  assert.equal(first.overview().leaders.length,8);
  assert.throws(()=>first.createMission({hubId:"dev",title:"Ship",objective:"Build an app",criteria:[]}),/acceptance criteria/);
  const project=first.createProject({hubId:"dev",title:"AGAS software",description:"Operator workspace",kind:"software"});
  assert.throws(()=>first.createMission({hubId:"content",project:project.id,title:"Wrong hub",objective:"No cross-hub owner",criteria:["Fails"]}),/selected hub/);
  const mission=first.createMission({hubId:"dev",project:project.id,title:"Ship a landing page",objective:"Build an accessible screen",criteria:["Browser opens the screen","Keyboard navigation works"]});
  first.sendMessage({hubId:"content",text:"Plan a launch editorial calendar"});
  first.close();
  const restored=new Store(path),overview=restored.overview();
  assert.equal(overview.missions[0].id,mission.id);
  assert.equal(overview.missions[0].project,project.id);
  assert.equal(overview.projects[0].id,project.id);
  assert.equal(overview.missions[0].status,"intake");
  assert.equal(overview.events.find(e=>e.type==="ceo.inbox").hub_id,"content");
  assert.equal(overview.messages[0].status,"awaiting-runtime");
  restored.close();
});

test("knowledge scopes exclude unrelated hubs and vault projection preserves edits",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-vault-")),store=new Store();
  const organization=store.createNote({title:"Mission principles",content:"Use evidence",scope:"organization",ownerId:"agas"});
  const privateNote=store.createNote({title:"Personal",content:"private material",scope:"private",ownerId:"owner"});
  const devNote=store.createNote({title:"Developer procedure",content:"Run checks",scope:"hub",ownerId:"dev"});
  const businessNote=store.createNote({title:"Business insight",content:"Scoped to business",scope:"hub",ownerId:"business"});
  const selected=store.notesFor({hubId:"dev",principal:"worker"});
  assert.deepEqual(selected.map(n=>n.id).sort(),[organization.id,devNote.id].sort());
  assert(!selected.some(n=>n.id===privateNote.id||n.id===businessNote.id));
  const first=await projectVault(store,join(root,"AGAS Vault"));
  assert.equal(first.noteCount,4);
  assert(first.written.some(name=>name.endsWith(devNote.id+".md")));
  const target=join(first.root,"04 Hubs",devNote.id+".md");
  await writeFile(target,"Manual edit in Obsidian\n");
  const second=await projectVault(store,join(root,"AGAS Vault"));
  assert(second.conflicts.some(name=>name.endsWith(devNote.id+".md")));
  assert.equal(await readFile(target,"utf8"),"Manual edit in Obsidian\n");
  store.close();
});

test("Agency bundled prompts have the pinned source hashes",()=>{
  assert.equal(agencyIndex.count,295);
  for(const path of ["engineering/engineering-frontend-developer.md","specialized/business-strategist.md","marketing/marketing-content-creator.md"])
    assert.equal(loadBundledAgency(path).sourceSha,agencyIndex.agents.find(item=>item.path===path).sha);
});

test("media brands own account and campaign configs without publishing or credentials",()=>{
  const store=new Store();
  const brand=store.createProject({hubId:"content",title:"AGAS Media",description:"Document product learning",kind:"media-brand"});
  const account=store.createMediaAccount({projectId:brand.id,platform:"youtube",handle:"AGAS Studio",niche:"AI products",language:"English"});
  const campaign=store.createMediaCampaign({projectId:brand.id,title:"First series",objective:"Research a sourced introduction"});
  assert.equal(account.status,"planned");
  assert.equal(campaign.stage,"research");
  assert.throws(()=>store.createMediaAccount({projectId:brand.id,platform:"youtube",handle:"AGAS Studio",niche:"AI products",language:"English"}),/already exists/);
  const software=store.createProject({hubId:"dev",title:"AGAS app",description:"Workspace",kind:"software"});
  assert.throws(()=>store.createMediaCampaign({projectId:software.id,title:"Wrong owner",objective:"No publishing"}),/Media Empire/);
  store.close();
});

test("API authorization, mission write and static logo work",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-http-"));
  const {server}=createAgasServer({database:join(root,"state.db"),vault:join(root,"vault"),token:"test-secret"});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const logo=await fetch(base+"/assets/agas-logo.jpg");
    assert.equal(logo.status,200);
    assert.equal(logo.headers.get("content-type"),"image/jpeg");
    assert.equal((await fetch(base+"/api/overview")).status,401);
    const headers={authorization:"Bearer test-secret","content-type":"application/json"};
    const write=await fetch(base+"/api/missions",{method:"POST",headers,body:JSON.stringify({hubId:"dev",title:"Verify UI",objective:"Open the browser",criteria:["Screen appears"]})});
    assert.equal(write.status,201);
    const overview=await (await fetch(base+"/api/overview",{headers})).json();
    assert.equal(overview.missions.length,1);
    assert.equal(overview.missions[0].status,"intake");
    const projected=await (await fetch(base+"/api/vault/project",{method:"POST",headers,body:"{}"})).json();
    assert.equal(projected.missionCount,1);
  } finally {await new Promise(resolve=>server.close(resolve))}
});
