import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { agencyIndex, loadBundledAgency } from "./agency.js";

const now = () => new Date().toISOString();
const HUBS = [
  ["dev","Dev / Software","⌘","Build and ship excellent software","cyan"],
  ["content","Content / Media Empire","◈","Plan, produce and grow media brands","violet"],
  ["finance","Finance","◉","Research, budget and evaluate finance","mint"],
  ["business","Business","◇","Operate and improve independent ventures","amber"],
  ["health","Family Health","✳","Organize consented family care","coral"],
  ["security","Authorized Security","⬡","Assess owned systems and verify fixes","blue"],
  ["management","Management / Maintenance","✦","Keep the organization healthy","slate"]
];
const nonempty = (value, field, max = 4000) => {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new InputError(`${field} must be nonempty and at most ${max} characters`);
  return value.trim();
};
export class InputError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

export class Store {
  constructor(path = ":memory:") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS organization (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS hubs (id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL, mandate TEXT NOT NULL, accent TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS leaders (id TEXT PRIMARY KEY, hub_id TEXT UNIQUE REFERENCES hubs(id), name TEXT NOT NULL, role TEXT NOT NULL, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, hub_id TEXT NOT NULL REFERENCES hubs(id), title TEXT NOT NULL, kind TEXT NOT NULL,
        description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS media_accounts (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), platform TEXT NOT NULL,
        handle TEXT NOT NULL, niche TEXT NOT NULL, language TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'planned',
        created_at TEXT NOT NULL, UNIQUE(project_id,platform,handle)
      );
      CREATE TABLE IF NOT EXISTS media_campaigns (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
        objective TEXT NOT NULL, stage TEXT NOT NULL DEFAULT 'research', status TEXT NOT NULL DEFAULT 'planned',
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS missions (
        id TEXT PRIMARY KEY, hub_id TEXT NOT NULL REFERENCES hubs(id), project TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL, objective TEXT NOT NULL, criteria TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'intake', version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, hub_id TEXT NOT NULL REFERENCES hubs(id), text TEXT NOT NULL,
        author TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, scope TEXT NOT NULL,
        owner_id TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS personas (
        path TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, emoji TEXT NOT NULL, division TEXT NOT NULL,
        prompt TEXT NOT NULL, source_commit TEXT NOT NULL, source_sha TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS assignments (
        id TEXT PRIMARY KEY, hub_id TEXT NOT NULL REFERENCES hubs(id), persona_path TEXT NOT NULL REFERENCES personas(path),
        runtime TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'configured', UNIQUE(hub_id,persona_path)
      );
      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, subject TEXT NOT NULL, hub_id TEXT,
        description TEXT NOT NULL, occurred_at TEXT NOT NULL
      );
    `);
    this.seed();
  }
  seed() {
    this.db.prepare("INSERT OR IGNORE INTO organization VALUES (?,?)").run("agas","AGAS · One organization");
    const hub = this.db.prepare("INSERT OR IGNORE INTO hubs VALUES (?,?,?,?,?)");
    const lead = this.db.prepare("INSERT OR IGNORE INTO leaders VALUES (?,?,?,?,?)");
    for (const h of HUBS) {
      hub.run(...h);
      lead.run(`ceo-${h[0]}`, h[0], `${h[1]} CEO`, "Hub chief", "unbound");
    }
    lead.run("executive", null, "AGAS Executive", "Executive coordinator", "unbound");
    const bundled = [
      "engineering/engineering-frontend-developer.md","engineering/engineering-backend-architect.md",
      "engineering/engineering-devops-automator.md","marketing/marketing-content-creator.md",
      "marketing/marketing-social-media-strategist.md","research/research-synthesist.md",
      "specialized/business-strategist.md","specialized/chief-financial-officer.md",
      "specialized/specialized-chief-of-staff.md","healthcare/healthcare-innovation-strategist.md",
      "security/security-appsec-engineer.md","testing/testing-reality-checker.md"
    ];
    for (const path of bundled) this.importPersona(loadBundledAgency(path));
  }
  event(type, subject, hubId, description) {
    this.db.prepare("INSERT INTO events(type,subject,hub_id,description,occurred_at) VALUES (?,?,?,?,?)").run(type,subject,hubId,description,now());
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  overview() {
    const all = sql => this.db.prepare(sql).all();
    return {
      organization: this.db.prepare("SELECT * FROM organization LIMIT 1").get(),
      hubs: all("SELECT * FROM hubs"),
      leaders: all("SELECT * FROM leaders"),
      projects: all("SELECT * FROM projects ORDER BY created_at DESC"),
      mediaAccounts: all("SELECT * FROM media_accounts ORDER BY created_at DESC"),
      mediaCampaigns: all("SELECT * FROM media_campaigns ORDER BY created_at DESC"),
      missions: all("SELECT * FROM missions ORDER BY created_at DESC").map(m => ({ ...m,criteria:JSON.parse(m.criteria) })),
      messages: all("SELECT * FROM messages ORDER BY created_at DESC LIMIT 60"),
      notes: all("SELECT id,title,scope,owner_id,revision,created_at,updated_at FROM notes ORDER BY updated_at DESC LIMIT 100"),
      personas: all("SELECT path,title,description,emoji,division,source_commit,source_sha FROM personas ORDER BY title"),
      assignments: all("SELECT * FROM assignments"),
      events: all("SELECT * FROM events ORDER BY seq DESC LIMIT 80"),
      agency: { count: agencyIndex.count, source: agencyIndex.source, commit: agencyIndex.commit,
        index: agencyIndex.agents.map(item => ({ path:item.path,division:item.path.split("/")[0],name:item.path.split("/").pop().replace(/\.md$/,"").replace(/^[^-]+-/,"").replaceAll("-"," ") })) }
    };
  }
  requireHub(id) { if (!this.db.prepare("SELECT 1 FROM hubs WHERE id=?").get(id)) throw new InputError("Unknown hub"); }
  createProject(input) {
    const hubId=nonempty(input.hubId,"hubId",30);this.requireHub(hubId);
    const title=nonempty(input.title,"title",140),description=nonempty(input.description,"description",4000);
    const kind=nonempty(input.kind,"kind",30);
    if(!["software","media-brand","research","business","health","security","operations","general"].includes(kind))
      throw new InputError("Invalid project kind");
    const id=randomUUID(),time=now();
    this.transaction(()=>{
      this.db.prepare("INSERT INTO projects(id,hub_id,title,kind,description,created_at) VALUES (?,?,?,?,?,?)")
        .run(id,hubId,title,kind,description,time);
      this.event("project.created",id,hubId,`New project: ${title}`);
    });
    return this.db.prepare("SELECT * FROM projects WHERE id=?").get(id);
  }
  requireMediaBrand(id) {
    const project=this.db.prepare("SELECT * FROM projects WHERE id=?").get(id);
    if(!project||project.hub_id!=="content"||project.kind!=="media-brand")
      throw new InputError("Choose a Media Empire brand project");
    return project;
  }
  createMediaAccount(input) {
    const projectId=nonempty(input.projectId,"projectId",120);
    this.requireMediaBrand(projectId);
    const platform=nonempty(input.platform,"platform",30).toLowerCase();
    if(!["youtube","instagram","tiktok","facebook","x","linkedin","podcast","other"].includes(platform))
      throw new InputError("Unsupported media platform");
    const handle=nonempty(input.handle,"handle",120),niche=nonempty(input.niche,"niche",140);
    const language=nonempty(input.language,"language",60),id=randomUUID(),time=now();
    this.transaction(()=>{
      try {this.db.prepare("INSERT INTO media_accounts(id,project_id,platform,handle,niche,language,created_at) VALUES (?,?,?,?,?,?,?)").run(id,projectId,platform,handle,niche,language,time)}
      catch(error){if(error.code==="ERR_SQLITE_ERROR"&&error.message.includes("UNIQUE"))throw new InputError("This account already exists for the brand",409);throw error}
      this.event("media.account.created",id,"content",`Media account registered: ${platform} · ${handle}`);
    });
    return this.db.prepare("SELECT * FROM media_accounts WHERE id=?").get(id);
  }
  createMediaCampaign(input) {
    const projectId=nonempty(input.projectId,"projectId",120);
    this.requireMediaBrand(projectId);
    const title=nonempty(input.title,"title",140),objective=nonempty(input.objective,"objective",4000);
    const id=randomUUID(),time=now();
    this.transaction(()=>{
      this.db.prepare("INSERT INTO media_campaigns(id,project_id,title,objective,created_at) VALUES (?,?,?,?,?)")
        .run(id,projectId,title,objective,time);
      this.event("media.campaign.created",id,"content",`Campaign brief created: ${title}`);
    });
    return this.db.prepare("SELECT * FROM media_campaigns WHERE id=?").get(id);
  }
  createMission(input) {
    const hubId=nonempty(input.hubId,"hubId",30); this.requireHub(hubId);
    const title=nonempty(input.title,"title",140), objective=nonempty(input.objective,"objective",4000), criteria=input.criteria;
    if (!Array.isArray(criteria) || !criteria.length || criteria.length>16 || criteria.some(c=>typeof c!=="string"||!c.trim()||c.length>300))
      throw new InputError("Provide 1–16 specific acceptance criteria");
    const project=typeof input.project==="string"?input.project.trim():"",id=randomUUID(),time=now();
    if(project){
      const record=this.db.prepare("SELECT * FROM projects WHERE id=?").get(project);
      if(!record||record.hub_id!==hubId)throw new InputError("Choose a project in the selected hub");
    }
    this.transaction(() => {
      this.db.prepare("INSERT INTO missions(id,hub_id,project,title,objective,criteria,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
        .run(id,hubId,project,title,objective,JSON.stringify(criteria.map(c=>c.trim())),time,time);
      this.event("mission.created",id,hubId,`New mission: ${title}`);
    });
    return this.db.prepare("SELECT * FROM missions WHERE id=?").get(id);
  }
  sendMessage(input) {
    const hubId=nonempty(input.hubId,"hubId",30);this.requireHub(hubId);
    const body=nonempty(input.text,"message",4000),id=randomUUID(),time=now();
    this.transaction(() => {
      this.db.prepare("INSERT INTO messages VALUES (?,?,?,?,?,?)").run(id,hubId,body,"owner","awaiting-runtime",time);
      this.event("ceo.inbox",id,hubId,`Direct request to ${hubId} CEO; awaiting a connected runtime`);
    });
    return this.db.prepare("SELECT * FROM messages WHERE id=?").get(id);
  }
  createNote(input) {
    const title=nonempty(input.title,"title",140),content=nonempty(input.content,"content",30000);
    const scope=nonempty(input.scope,"scope",20),owner=nonempty(input.ownerId,"ownerId",120);
    if (!["organization","hub","project","private"].includes(scope)) throw new InputError("Invalid note scope");
    if (scope==="organization" && owner!=="agas") throw new InputError("Organization scope requires owner agas");
    if (scope==="hub") this.requireHub(owner);
    if (scope==="project"&&!this.db.prepare("SELECT 1 FROM projects WHERE id=?").get(owner))throw new InputError("Unknown project");
    if (scope==="private" && owner!=="owner") throw new InputError("Private note owner must be owner");
    const id=randomUUID(),time=now();
    this.transaction(() => {
      this.db.prepare("INSERT INTO notes VALUES (?,?,?,?,?,1,?,?)").run(id,title,content,scope,owner,time,time);
      this.event("note.created",id,scope==="hub"?owner:null,`Knowledge note: ${title} · ${scope}`);
    });
    return this.db.prepare("SELECT * FROM notes WHERE id=?").get(id);
  }
  notesFor({hubId,project,principal="owner"}={}) {
    return this.db.prepare("SELECT * FROM notes ORDER BY updated_at DESC").all().filter(n =>
      n.scope==="organization" || (n.scope==="hub"&&n.owner_id===hubId) ||
      (n.scope==="project"&&n.owner_id===project) || (n.scope==="private"&&n.owner_id===principal));
  }
  allNotesForVault() {
    return this.db.prepare("SELECT * FROM notes ORDER BY updated_at DESC").all();
  }
  noteForOwner(id) {
    const note=this.db.prepare("SELECT * FROM notes WHERE id=?").get(id);
    if(!note)throw new InputError("Note not found",404);
    return note;
  }
  importPersona(record) {
    const source=agencyIndex.agents.find(item=>item.path===record.path);
    if (!source||record.sourceSha!==source.sha||record.sourceCommit!==agencyIndex.commit)
      throw new InputError("Agency source provenance mismatch");
    this.db.prepare("INSERT OR IGNORE INTO personas VALUES (?,?,?,?,?,?,?,?)")
      .run(record.path,record.title,record.description,record.emoji,record.division,record.prompt,record.sourceCommit,record.sourceSha);
  }
  assignPersona(input) {
    const hub=nonempty(input.hubId,"hubId",30),path=nonempty(input.path,"path",300);
    this.requireHub(hub);
    if (!this.db.prepare("SELECT 1 FROM personas WHERE path=?").get(path)) throw new InputError("Import Agency persona first");
    const runtime=nonempty(input.runtime,"runtime",40);
    if (!["hermes","openclaw","codex","claude","opencode"].includes(runtime)) throw new InputError("Unsupported runtime");
    const id=randomUUID();
    this.transaction(() => {
      this.db.prepare("INSERT INTO assignments VALUES (?,?,?,?,'configured')").run(id,hub,path,runtime);
      this.event("agent.configured",id,hub,`Configured ${path.split("/").pop()} for ${hub}; readiness pending`);
    });
    return this.db.prepare("SELECT * FROM assignments WHERE id=?").get(id);
  }
  close() { this.db.close(); }
}
