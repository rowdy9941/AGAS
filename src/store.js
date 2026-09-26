import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, lstatSync, realpathSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
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
const MEDIA_STAGES=["research","strategy","creation","editing","media","review"];
const mediaHash=({stage,title,content,sources,rights_note})=>createHash("sha256")
  .update(JSON.stringify({stage,title,content,sources:JSON.parse(sources),rightsNote:rights_note})).digest("hex");
const boundedInteger=(value,name,min,max)=>{
  if(!Number.isSafeInteger(value)||value<min||value>max)throw new InputError(`${name} must be an integer from ${min} to ${max}`);
  return value;
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
      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY, parent_id TEXT REFERENCES goals(id), hub_id TEXT REFERENCES hubs(id),
        project_id TEXT REFERENCES projects(id), title TEXT NOT NULL, objective TEXT NOT NULL,
        measure TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
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
      CREATE TABLE IF NOT EXISTS media_artifacts (
        id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES media_campaigns(id),
        stage TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, sources TEXT NOT NULL,
        rights_note TEXT NOT NULL DEFAULT '', sha256 TEXT NOT NULL, status TEXT NOT NULL,
        review_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, reviewed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS media_publication_packets (
        id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES media_campaigns(id),
        account_id TEXT NOT NULL REFERENCES media_accounts(id), content TEXT NOT NULL,
        sha256 TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'prepared', created_at TEXT NOT NULL,
        UNIQUE(campaign_id,account_id)
      );
      CREATE TABLE IF NOT EXISTS paper_accounts (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR', starting_cash_paise INTEGER NOT NULL,
        cash_paise INTEGER NOT NULL, realized_pnl_paise INTEGER NOT NULL DEFAULT 0,
        max_trade_bps INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS paper_marks (
        id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES paper_accounts(id), symbol TEXT NOT NULL,
        price_paise INTEGER NOT NULL, source_url TEXT NOT NULL, as_of TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS paper_marks_account ON paper_marks(account_id,symbol,created_at);
      CREATE TABLE IF NOT EXISTS paper_positions (
        account_id TEXT NOT NULL REFERENCES paper_accounts(id), symbol TEXT NOT NULL,
        quantity INTEGER NOT NULL, cost_paise INTEGER NOT NULL, PRIMARY KEY(account_id,symbol)
      );
      CREATE TABLE IF NOT EXISTS paper_orders (
        id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES paper_accounts(id), request_id TEXT NOT NULL,
        mark_id TEXT NOT NULL REFERENCES paper_marks(id), symbol TEXT NOT NULL, side TEXT NOT NULL,
        quantity INTEGER NOT NULL, price_paise INTEGER NOT NULL, fee_paise INTEGER NOT NULL,
        gross_paise INTEGER NOT NULL, cash_after_paise INTEGER NOT NULL,
        position_after INTEGER NOT NULL, realized_pnl_paise INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'simulated', created_at TEXT NOT NULL,
        UNIQUE(account_id,request_id)
      );
      CREATE TABLE IF NOT EXISTS missions (
        id TEXT PRIMARY KEY, hub_id TEXT NOT NULL REFERENCES hubs(id), project TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL, objective TEXT NOT NULL, criteria TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'intake', version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS mission_tasks (
        id TEXT PRIMARY KEY, mission_id TEXT NOT NULL REFERENCES missions(id), assignment_id TEXT REFERENCES assignments(id),
        title TEXT NOT NULL, objective TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS task_dependencies (
        task_id TEXT NOT NULL REFERENCES mission_tasks(id), prerequisite_id TEXT NOT NULL REFERENCES mission_tasks(id),
        PRIMARY KEY(task_id,prerequisite_id), CHECK(task_id<>prerequisite_id)
      );
      CREATE TABLE IF NOT EXISTS mission_evidence (
        id TEXT PRIMARY KEY, mission_id TEXT NOT NULL REFERENCES missions(id), task_id TEXT NOT NULL REFERENCES mission_tasks(id),
        criterion_index INTEGER NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
        sha256 TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'submitted', review_note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, reviewed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS mission_runs (
        id TEXT PRIMARY KEY, mission_id TEXT NOT NULL REFERENCES missions(id), task_id TEXT NOT NULL REFERENCES mission_tasks(id),
        assignment_id TEXT NOT NULL REFERENCES assignments(id), runtime TEXT NOT NULL, status TEXT NOT NULL,
        workspace TEXT, base_commit TEXT, timeout_seconds INTEGER NOT NULL, pid INTEGER,
        exit_code INTEGER, result TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
        started_at TEXT, ended_at TEXT
      );
      CREATE INDEX IF NOT EXISTS mission_runs_by_task ON mission_runs(task_id,created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_run_per_task ON mission_runs(task_id)
        WHERE status IN ('queued','starting','running');
      CREATE TABLE IF NOT EXISTS run_logs (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL REFERENCES mission_runs(id),
        channel TEXT NOT NULL, message TEXT NOT NULL, occurred_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS run_logs_by_run ON run_logs(run_id,seq);
      CREATE TABLE IF NOT EXISTS run_artifacts (
        run_id TEXT NOT NULL REFERENCES mission_runs(id), path TEXT NOT NULL,
        sha256 TEXT, bytes INTEGER, status TEXT NOT NULL, PRIMARY KEY(run_id,path)
      );
      CREATE TABLE IF NOT EXISTS project_review_branches (
        run_id TEXT PRIMARY KEY REFERENCES mission_runs(id), mission_id TEXT NOT NULL REFERENCES missions(id),
        branch TEXT NOT NULL, commit_sha TEXT NOT NULL, base_commit TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS handoffs (
        id TEXT PRIMARY KEY, source_mission_id TEXT NOT NULL REFERENCES missions(id),
        source_evidence_id TEXT NOT NULL REFERENCES mission_evidence(id),
        target_mission_id TEXT NOT NULL REFERENCES missions(id),
        from_hub_id TEXT NOT NULL REFERENCES hubs(id), to_hub_id TEXT NOT NULL REFERENCES hubs(id),
        title TEXT NOT NULL, purpose TEXT NOT NULL, evidence_sha256 TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'offered', version INTEGER NOT NULL DEFAULT 1,
        response_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, responded_at TEXT
      );
      CREATE INDEX IF NOT EXISTS handoffs_by_target ON handoffs(target_mission_id,created_at);
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, hub_id TEXT NOT NULL REFERENCES hubs(id), text TEXT NOT NULL,
        author TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ceo_replies (
        message_id TEXT PRIMARY KEY REFERENCES messages(id), runtime TEXT NOT NULL,
        status TEXT NOT NULL, reply TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, completed_at TEXT
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
      CREATE TABLE IF NOT EXISTS vault_projection (
        path TEXT PRIMARY KEY, sha256 TEXT NOT NULL, projected_at TEXT NOT NULL
      );
    `);
    if (!this.db.prepare("PRAGMA table_info(projects)").all().some(column=>column.name==="repository_path"))
      this.db.exec("ALTER TABLE projects ADD COLUMN repository_path TEXT");
    if (!this.db.prepare("PRAGMA table_info(projects)").all().some(column=>column.name==="monthly_run_limit"))
      this.db.exec("ALTER TABLE projects ADD COLUMN monthly_run_limit INTEGER");
    if (!this.db.prepare("PRAGMA table_info(missions)").all().some(column=>column.name==="goal_id"))
      this.db.exec("ALTER TABLE missions ADD COLUMN goal_id TEXT REFERENCES goals(id)");
    if (!this.db.prepare("PRAGMA table_info(media_campaigns)").all().some(column=>column.name==="version"))
      this.db.exec("ALTER TABLE media_campaigns ADD COLUMN version INTEGER NOT NULL DEFAULT 1");
    const evidenceColumns=this.db.prepare("PRAGMA table_info(mission_evidence)").all().map(column=>column.name);
    if(!evidenceColumns.includes("run_id"))this.db.exec("ALTER TABLE mission_evidence ADD COLUMN run_id TEXT REFERENCES mission_runs(id)");
    if(!evidenceColumns.includes("artifact_path"))this.db.exec("ALTER TABLE mission_evidence ADD COLUMN artifact_path TEXT");
    if(!evidenceColumns.includes("verified_sha256"))this.db.exec("ALTER TABLE mission_evidence ADD COLUMN verified_sha256 TEXT");
    if(!evidenceColumns.includes("verification"))this.db.exec("ALTER TABLE mission_evidence ADD COLUMN verification TEXT NOT NULL DEFAULT 'unverified'");
    if(!this.db.prepare("PRAGMA table_info(mission_tasks)").all().some(column=>column.name==="required_handoff_id"))
      this.db.exec("ALTER TABLE mission_tasks ADD COLUMN required_handoff_id TEXT REFERENCES handoffs(id)");
    if(!this.db.prepare("PRAGMA table_info(mission_tasks)").all().some(column=>column.name==="auto_on_handoff"))
      this.db.exec("ALTER TABLE mission_tasks ADD COLUMN auto_on_handoff INTEGER NOT NULL DEFAULT 0");
    const runColumns=this.db.prepare("PRAGMA table_info(mission_runs)").all().map(column=>column.name);
    if(!runColumns.includes("output_text"))this.db.exec("ALTER TABLE mission_runs ADD COLUMN output_text TEXT");
    if(!runColumns.includes("output_sha256"))this.db.exec("ALTER TABLE mission_runs ADD COLUMN output_sha256 TEXT");
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
      goals: all("SELECT * FROM goals ORDER BY created_at DESC"),
      mediaAccounts: all("SELECT * FROM media_accounts ORDER BY created_at DESC"),
      mediaCampaigns: all("SELECT * FROM media_campaigns ORDER BY created_at DESC"),
      mediaArtifacts: all("SELECT * FROM media_artifacts ORDER BY created_at DESC LIMIT 120"),
      mediaPackets: all("SELECT id,campaign_id,account_id,sha256,status,created_at FROM media_publication_packets ORDER BY created_at DESC LIMIT 120"),
      paperAccounts: all("SELECT * FROM paper_accounts ORDER BY created_at DESC"),
      missions: all("SELECT * FROM missions ORDER BY created_at DESC").map(m => ({ ...m,criteria:JSON.parse(m.criteria) })),
      runs: all("SELECT * FROM mission_runs ORDER BY created_at DESC LIMIT 80"),
      reviewBranches: all("SELECT * FROM project_review_branches ORDER BY created_at DESC LIMIT 80"),
      handoffs: all("SELECT * FROM handoffs ORDER BY created_at DESC LIMIT 80"),
      messages: all("SELECT m.*,r.runtime,r.reply,r.error,r.completed_at FROM messages m LEFT JOIN ceo_replies r ON r.message_id=m.id ORDER BY m.created_at DESC LIMIT 60"),
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
  linkProjectRepository(id,repositoryPath) {
    const project=this.db.prepare("SELECT * FROM projects WHERE id=?").get(id);
    if(!project)throw new InputError("Project not found",404);
    if(project.hub_id!=="dev"||project.kind!=="software")throw new InputError("Only Dev software projects can link a Git repository");
    const path=nonempty(repositoryPath,"repositoryPath",4000);
    this.transaction(()=>{
      this.db.prepare("UPDATE projects SET repository_path=? WHERE id=?").run(path,id);
      this.event("project.repository-linked",id,"dev",`Repository linked to ${project.title}`);
    });
    return this.db.prepare("SELECT * FROM projects WHERE id=?").get(id);
  }
  setRunLimit(id,input) {
    const project=this.db.prepare("SELECT * FROM projects WHERE id=?").get(id);
    if(!project)throw new InputError("Project not found",404);
    if(project.hub_id!=="dev"||project.kind!=="software")throw new InputError("Run quotas apply to Dev software projects");
    const limit=input.monthlyRunLimit;
    if(limit!==null&&(!Number.isInteger(limit)||limit<1||limit>10000))
      throw new InputError("Monthly run limit must be 1–10000 or null");
    this.transaction(()=>{
      this.db.prepare("UPDATE projects SET monthly_run_limit=? WHERE id=?").run(limit,id);
      this.event("project.run-limit",id,"dev",limit===null?"Dev run quota removed":`Dev run quota set to ${limit} per month`);
    });
    return this.db.prepare("SELECT * FROM projects WHERE id=?").get(id);
  }
  createGoal(input) {
    const hubId=input.hubId?nonempty(input.hubId,"hubId",30):null;
    if(hubId)this.requireHub(hubId);
    const projectId=input.projectId?nonempty(input.projectId,"projectId",120):null;
    if(projectId){
      const project=this.db.prepare("SELECT * FROM projects WHERE id=?").get(projectId);
      if(!project||project.hub_id!==hubId)throw new InputError("Goal project must belong to the selected hub");
    }
    const parentId=input.parentId?nonempty(input.parentId,"parentId",120):null;
    if(parentId){
      const parent=this.db.prepare("SELECT * FROM goals WHERE id=?").get(parentId);
      if(!parent)throw new InputError("Parent goal not found");
      if(parent.hub_id&&parent.hub_id!==hubId)throw new InputError("Parent goal belongs to another hub");
      if(parent.project_id&&parent.project_id!==projectId)throw new InputError("Parent goal belongs to another project");
    }
    const title=nonempty(input.title,"title",140),objective=nonempty(input.objective,"objective",4000);
    const measure=nonempty(input.measure,"measure",500),id=randomUUID(),time=now();
    this.transaction(()=>{
      this.db.prepare("INSERT INTO goals(id,parent_id,hub_id,project_id,title,objective,measure,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(id,parentId,hubId,projectId,title,objective,measure,time,time);
      this.event("goal.created",id,hubId,`Goal created: ${title}`);
    });
    return this.db.prepare("SELECT * FROM goals WHERE id=?").get(id);
  }
  completeGoal(id,input) {
    this.transaction(()=>{
      const goal=this.db.prepare("SELECT * FROM goals WHERE id=?").get(id);
      if(!goal)throw new InputError("Goal not found",404);
      if(goal.status!=="active"||goal.version!==input.expectedVersion)throw new InputError("Goal changed or closed; reload",409);
      const missions=this.db.prepare("SELECT status FROM missions WHERE goal_id=?").all(id);
      const children=this.db.prepare("SELECT status FROM goals WHERE parent_id=?").all(id);
      if((!missions.length&&!children.length)||missions.some(m=>m.status!=="accepted")||children.some(g=>g.status!=="achieved"))
        throw new InputError("Accept linked missions and complete child goals before marking this goal achieved",409);
      this.db.prepare("UPDATE goals SET status='achieved',version=version+1,updated_at=? WHERE id=?").run(now(),id);
      this.event("goal.achieved",id,goal.hub_id,`Goal achieved with linked accepted work: ${goal.title}`);
    });
    return this.db.prepare("SELECT * FROM goals WHERE id=?").get(id);
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
  mediaCampaignDetail(id) {
    const campaign=this.db.prepare("SELECT * FROM media_campaigns WHERE id=?").get(id);
    if(!campaign)throw new InputError("Media campaign not found",404);
    return {campaign,artifacts:this.db.prepare("SELECT * FROM media_artifacts WHERE campaign_id=? ORDER BY created_at,id").all(id),
      packets:this.db.prepare("SELECT * FROM media_publication_packets WHERE campaign_id=? ORDER BY created_at,id").all(id)};
  }
  submitMediaArtifact(id,input) {
    const title=nonempty(input.title,"title",140),content=nonempty(input.content,"content",12000);
    const rights=typeof input.rightsNote==="string"?input.rightsNote.trim():"";
    if(rights.length>2000)throw new InputError("Rights note is too long");
    const sources=input.sources;
    if(!Array.isArray(sources)||sources.length>12||sources.some(source=>{
      if(typeof source!=="string"||source.length>1000)return true;
      try {const url=new URL(source);return !["http:","https:"].includes(url.protocol)||Boolean(url.username||url.password)}catch{return true}
    }))throw new InputError("Provide up to 12 valid HTTP(S) source references");
    const artifactId=randomUUID(),time=now();
    this.transaction(()=>{
      const campaign=this.mediaCampaignDetail(id).campaign;
      if(campaign.version!==input.expectedVersion||!MEDIA_STAGES.includes(campaign.stage)||
        ["awaiting-review","ready-for-publishing"].includes(campaign.status))
        throw new InputError("Campaign changed or this stage is awaiting review",409);
      if(campaign.stage==="research"&&!sources.length)
        throw new InputError("Research needs at least one source reference");
      if(campaign.stage==="review"&&!rights)
        throw new InputError("Editorial review needs an explicit rights and factuality note");
      const sourceJSON=JSON.stringify(sources),sha256=mediaHash({stage:campaign.stage,title,content,
        sources:sourceJSON,rights_note:rights});
      this.db.prepare("INSERT INTO media_artifacts VALUES (?,?,?,?,?,?,?,?, 'submitted','',?,NULL)")
        .run(artifactId,id,campaign.stage,title,content,sourceJSON,rights,sha256,time);
      this.db.prepare("UPDATE media_campaigns SET status='awaiting-review',version=version+1 WHERE id=?").run(id);
      this.event("media.artifact.submitted",artifactId,"content",`${campaign.stage} artifact submitted for ${campaign.title}`);
    });
    return this.mediaCampaignDetail(id);
  }
  reviewMediaArtifact(id,artifactId,input) {
    const decision=input.decision;
    if(!["accepted","rejected"].includes(decision))throw new InputError("Choose accepted or rejected");
    const note=nonempty(input.reviewNote,"reviewNote",2000);
    this.transaction(()=>{
      const campaign=this.mediaCampaignDetail(id).campaign;
      const artifact=this.db.prepare("SELECT * FROM media_artifacts WHERE id=? AND campaign_id=?").get(artifactId,id);
      if(campaign.version!==input.expectedVersion||!artifact||artifact.status!=="submitted"||
        campaign.stage!==artifact.stage||campaign.status!=="awaiting-review")
        throw new InputError("Campaign artifact changed; reload before review",409);
      if(mediaHash(artifact)!==artifact.sha256)
        throw new InputError("Campaign artifact integrity changed",409);
      this.db.prepare("UPDATE media_artifacts SET status=?,review_note=?,reviewed_at=? WHERE id=?")
        .run(decision,note,now(),artifactId);
      const next=MEDIA_STAGES[MEDIA_STAGES.indexOf(artifact.stage)+1];
      this.db.prepare("UPDATE media_campaigns SET stage=?,status=?,version=version+1 WHERE id=?")
        .run(decision==="accepted"?(next||"ready-for-publishing"):campaign.stage,
          decision==="accepted"&&!next?"ready-for-publishing":"in-progress",id);
      this.event(`media.artifact.${decision}`,artifactId,"content",`Owner ${decision} ${artifact.stage} for ${campaign.title}`);
    });
    return this.mediaCampaignDetail(id);
  }
  prepareMediaPacket(id,input) {
    const accountId=nonempty(input.accountId,"accountId",120);
    let packetId;
    this.transaction(()=>{
      const {campaign,artifacts}=this.mediaCampaignDetail(id);
      const account=this.db.prepare("SELECT * FROM media_accounts WHERE id=?").get(accountId);
      if(campaign.version!==input.expectedVersion||campaign.status!=="ready-for-publishing"||
        !account||account.project_id!==campaign.project_id)
        throw new InputError("Campaign must pass editorial review and target an account of its own brand",409);
      if(this.db.prepare("SELECT 1 FROM media_publication_packets WHERE campaign_id=? AND account_id=?").get(id,accountId))
        throw new InputError("A packet already exists for this campaign and account",409);
      const approved=artifacts.filter(item=>item.status==="accepted");
      if(approved.length!==MEDIA_STAGES.length||MEDIA_STAGES.some(stage=>!approved.some(item=>item.stage===stage))||
        approved.some(item=>mediaHash(item)!==item.sha256))
        throw new InputError("Every content stage needs an accepted artifact",409);
      const content=JSON.stringify({campaign:{id,title:campaign.title,objective:campaign.objective},
        account:{id:account.id,platform:account.platform,handle:account.handle,language:account.language},
        artifacts:approved.map(item=>({stage:item.stage,title:item.title,content:item.content,
          sources:JSON.parse(item.sources),rightsNote:item.rights_note,sha256:item.sha256,reviewNote:item.review_note}))});
      packetId=randomUUID();
      this.db.prepare("INSERT INTO media_publication_packets(id,campaign_id,account_id,content,sha256,created_at) VALUES (?,?,?,?,?,?)")
        .run(packetId,id,accountId,content,createHash("sha256").update(content).digest("hex"),now());
      this.event("media.packet.prepared",packetId,"content",`Local publication packet prepared for ${campaign.title} on ${account.platform}`);
    });
    return this.db.prepare("SELECT * FROM media_publication_packets WHERE id=?").get(packetId);
  }
  createPaperAccount(input) {
    const project=this.db.prepare("SELECT * FROM projects WHERE id=?").get(nonempty(input.projectId,"projectId",120));
    if(!project||project.hub_id!=="finance"||project.kind!=="research")
      throw new InputError("Choose a Finance research project for paper trading");
    const title=nonempty(input.title,"title",140);
    const starting=boundedInteger(input.startingCashPaise,"startingCashPaise",100,1_000_000_000_000_000);
    const limit=boundedInteger(input.maxTradeBps??500,"maxTradeBps",1,10_000);
    const id=randomUUID();
    this.transaction(()=>{
      this.db.prepare("INSERT INTO paper_accounts(id,project_id,title,starting_cash_paise,cash_paise,max_trade_bps,created_at) VALUES (?,?,?,?,?,?,?)")
        .run(id,project.id,title,starting,starting,limit,now());
      this.event("finance.paper-account",id,"finance",`Paper-only account created for ${project.title}`);
    });
    return this.paperAccountDetail(id).account;
  }
  paperAccountDetail(id) {
    const account=this.db.prepare("SELECT * FROM paper_accounts WHERE id=?").get(id);
    if(!account)throw new InputError("Paper account not found",404);
    const marks=this.db.prepare(`SELECT m.* FROM paper_marks m WHERE m.account_id=? AND
      m.rowid=(SELECT MAX(rowid) FROM paper_marks WHERE account_id=m.account_id AND symbol=m.symbol)
      ORDER BY m.rowid DESC`).all(id);
    const positions=this.db.prepare("SELECT * FROM paper_positions WHERE account_id=? ORDER BY symbol").all(id);
    const orders=this.db.prepare("SELECT * FROM paper_orders WHERE account_id=? ORDER BY rowid DESC LIMIT 100").all(id);
    const values=positions.map(position=>{
      const mark=marks.find(item=>item.symbol===position.symbol);
      return {...position,mark:mark||null,market_value_paise:mark?position.quantity*mark.price_paise:null};
    });
    const marketTotal=values.reduce((sum,item)=>sum+(item.market_value_paise||0),0);
    const costTotal=values.reduce((sum,item)=>sum+item.cost_paise,0);
    const valued=values.every(item=>item.mark&&Number.isSafeInteger(item.market_value_paise))&&
      [marketTotal,costTotal,account.cash_paise+marketTotal,marketTotal-costTotal].every(Number.isSafeInteger);
    return {account,marks,positions:values,orders,
      valuation:valued?{
        equity_paise:account.cash_paise+marketTotal,
        unrealized_pnl_paise:marketTotal-costTotal,
        realized_pnl_paise:account.realized_pnl_paise,
        as_of:values.length?values.map(item=>item.mark.as_of).sort()[0]:null,
        source:"manual price marks; simulated fills"
      }:null};
  }
  recordPaperMark(id,input) {
    const symbol=nonempty(input.symbol,"symbol",32).toUpperCase();
    if(!/^[A-Z0-9][A-Z0-9._:-]{0,31}$/.test(symbol))throw new InputError("Use a simple instrument symbol");
    const price=boundedInteger(input.pricePaise,"pricePaise",1,1_000_000_000);
    let url;
    try {url=new URL(nonempty(input.sourceUrl,"sourceUrl",1000))}catch{throw new InputError("Provide a source URL for this manual price")}
    if(!["http:","https:"].includes(url.protocol)||url.username||url.password)
      throw new InputError("Price source must be an HTTP(S) URL without credentials");
    const asOf=nonempty(input.asOf,"asOf",40),timestamp=Date.parse(asOf);
    if(!Number.isFinite(timestamp)||timestamp>Date.now()+5*60*1000)
      throw new InputError("Mark time must be valid and cannot be in the future");
    const markId=randomUUID();
    this.transaction(()=>{
      const account=this.db.prepare("SELECT * FROM paper_accounts WHERE id=?").get(id);
      if(!account||account.version!==input.expectedVersion)throw new InputError("Paper account changed; reload",409);
      this.db.prepare("INSERT INTO paper_marks VALUES (?,?,?,?,?,?,?)")
        .run(markId,id,symbol,price,url.href,new Date(timestamp).toISOString(),now());
      this.db.prepare("UPDATE paper_accounts SET version=version+1 WHERE id=?").run(id);
      this.event("finance.mark.manual",markId,"finance",`Manual paper price recorded for ${symbol}; source not independently checked`);
    });
    return this.paperAccountDetail(id);
  }
  simulatePaperOrder(id,input) {
    const requestId=nonempty(input.requestId,"requestId",120);
    const side=input.side;
    if(!["buy","sell"].includes(side))throw new InputError("Choose buy or sell");
    const quantity=boundedInteger(input.quantity,"quantity",1,1_000_000);
    const fee=boundedInteger(input.feePaise,"feePaise",0,1_000_000_000);
    const markId=nonempty(input.markId,"markId",120);
    let order;
    this.transaction(()=>{
      const existing=this.db.prepare("SELECT * FROM paper_orders WHERE account_id=? AND request_id=?").get(id,requestId);
      if(existing){
        if(existing.mark_id!==markId||existing.side!==side||existing.quantity!==quantity||existing.fee_paise!==fee)
          throw new InputError("This paper order request ID already has different details",409);
        order=existing;return;
      }
      const account=this.db.prepare("SELECT * FROM paper_accounts WHERE id=?").get(id);
      if(!account||account.version!==input.expectedVersion)throw new InputError("Paper account changed; reload",409);
      const mark=this.db.prepare("SELECT * FROM paper_marks WHERE id=? AND account_id=?").get(markId,id);
      if(!mark||Date.now()-Date.parse(mark.as_of)>24*60*60*1000||
        this.db.prepare("SELECT id FROM paper_marks WHERE account_id=? AND symbol=? ORDER BY rowid DESC LIMIT 1").get(id,mark.symbol)?.id!==markId)
        throw new InputError("Choose a current, most recent manual mark for this paper account",409);
      const gross=quantity*mark.price_paise;
      if(!Number.isSafeInteger(gross)||!Number.isSafeInteger(gross+fee))throw new InputError("Paper amount exceeds the safe accounting range");
      const before=this.db.prepare("SELECT * FROM paper_positions WHERE account_id=? AND symbol=?").get(id,mark.symbol);
      const prior=before||{quantity:0,cost_paise:0};
      let cash,after,basis=0,realized=0;
      if(side==="buy"){
        if(BigInt(gross)*10_000n>BigInt(account.starting_cash_paise)*BigInt(account.max_trade_bps))
          throw new InputError("Paper purchase exceeds the account's per-trade limit",409);
        cash=account.cash_paise-gross-fee;
        after={quantity:prior.quantity+quantity,cost_paise:prior.cost_paise+gross+fee};
        if(cash<0||!Number.isSafeInteger(after.quantity)||!Number.isSafeInteger(after.cost_paise))
          throw new InputError("Insufficient paper cash or accounting range exceeded",409);
      } else {
        if(prior.quantity<quantity)throw new InputError("Paper selling cannot exceed the held long position",409);
        if(fee>gross)throw new InputError("Paper fees cannot exceed sale proceeds",409);
        basis=Number(BigInt(prior.cost_paise)*BigInt(quantity)/BigInt(prior.quantity));
        realized=gross-fee-basis;
        cash=account.cash_paise+gross-fee;
        after={quantity:prior.quantity-quantity,cost_paise:prior.cost_paise-basis};
        if(!Number.isSafeInteger(cash))throw new InputError("Paper cash exceeds the safe accounting range",409);
      }
      this.db.prepare("INSERT INTO paper_positions(account_id,symbol,quantity,cost_paise) VALUES (?,?,?,?) ON CONFLICT(account_id,symbol) DO UPDATE SET quantity=excluded.quantity,cost_paise=excluded.cost_paise")
        .run(id,mark.symbol,after.quantity,after.cost_paise);
      if(!Number.isSafeInteger(account.realized_pnl_paise+realized))
        throw new InputError("Paper P&L exceeds the safe accounting range",409);
      this.db.prepare("UPDATE paper_accounts SET cash_paise=?,realized_pnl_paise=realized_pnl_paise+?,version=version+1 WHERE id=?")
        .run(cash,realized,id);
      const orderId=randomUUID();
      this.db.prepare("INSERT INTO paper_orders(id,account_id,request_id,mark_id,symbol,side,quantity,price_paise,fee_paise,gross_paise,cash_after_paise,position_after,realized_pnl_paise,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(orderId,id,requestId,markId,mark.symbol,side,quantity,mark.price_paise,fee,gross,cash,after.quantity,realized,now());
      this.event("finance.paper-order",orderId,"finance",`Simulated ${side} ${quantity} ${mark.symbol} at a manually supplied mark; no broker order`);
      order=this.db.prepare("SELECT * FROM paper_orders WHERE id=?").get(orderId);
    });
    return {order,detail:this.paperAccountDetail(id)};
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
    const goalId=input.goalId?nonempty(input.goalId,"goalId",120):null;
    if(goalId){
      const goal=this.db.prepare("SELECT * FROM goals WHERE id=? AND status='active'").get(goalId);
      if(!goal||goal.hub_id&&goal.hub_id!==hubId||goal.project_id&&goal.project_id!==project)
        throw new InputError("Choose an active goal in this hub and project");
    }
    this.transaction(() => {
      this.db.prepare("INSERT INTO missions(id,hub_id,project,title,objective,criteria,created_at,updated_at,goal_id) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(id,hubId,project,title,objective,JSON.stringify(criteria.map(c=>c.trim())),time,time,goalId);
      this.event("mission.created",id,hubId,`New mission: ${title}`);
    });
    return this.db.prepare("SELECT * FROM missions WHERE id=?").get(id);
  }
  missionDetail(id) {
    const mission=this.db.prepare("SELECT * FROM missions WHERE id=?").get(id);
    if(!mission)throw new InputError("Mission not found",404);
    return {
      mission:{...mission,criteria:JSON.parse(mission.criteria)},
      tasks:this.db.prepare("SELECT * FROM mission_tasks WHERE mission_id=? ORDER BY rowid").all(id),
      evidence:this.db.prepare("SELECT * FROM mission_evidence WHERE mission_id=? ORDER BY created_at,id").all(id),
      dependencies:this.db.prepare("SELECT d.* FROM task_dependencies d JOIN mission_tasks t ON t.id=d.task_id WHERE t.mission_id=?").all(id),
      runs:this.db.prepare("SELECT * FROM mission_runs WHERE mission_id=? ORDER BY created_at,id").all(id),
      artifacts:this.db.prepare("SELECT a.* FROM run_artifacts a JOIN mission_runs r ON r.id=a.run_id WHERE r.mission_id=? ORDER BY a.run_id,a.path").all(id),
      reviewBranches:this.db.prepare("SELECT * FROM project_review_branches WHERE mission_id=? ORDER BY created_at").all(id),
      handoffs:this.db.prepare(`SELECT h.*,e.title AS source_evidence_title,e.content AS source_evidence_content
        FROM handoffs h JOIN mission_evidence e ON e.id=h.source_evidence_id
        WHERE h.source_mission_id=? OR h.target_mission_id=? ORDER BY h.created_at,h.id`).all(id,id)
    };
  }
  checkedMission(id,version) {
    const mission=this.missionDetail(id).mission;
    if(!Number.isInteger(version)||version<1)throw new InputError("Expected mission version is required");
    if(mission.version!==version)throw new InputError("Mission changed; reload before editing",409);
    if(["accepted","cancelled"].includes(mission.status))throw new InputError("This mission is closed",409);
    return mission;
  }
  advanceMission(id,status) {
    this.db.prepare("UPDATE missions SET status=?,version=version+1,updated_at=? WHERE id=?").run(status,now(),id);
  }
  createTask(id,input) {
    const title=nonempty(input.title,"title",140),objective=nonempty(input.objective,"objective",4000);
    const assignmentId=input.assignmentId?nonempty(input.assignmentId,"assignmentId",120):null;
    const requiredHandoffId=input.requiredHandoffId?nonempty(input.requiredHandoffId,"requiredHandoffId",120):null;
    const autoOnHandoff=input.autoOnHandoff===true;
    if(input.autoOnHandoff!==undefined&&typeof input.autoOnHandoff!=="boolean")
      throw new InputError("Automatic handoff dispatch must be true or false");
    if(autoOnHandoff&&(!requiredHandoffId||!assignmentId))
      throw new InputError("Automatic dispatch needs a required handoff and assigned specialist");
    const taskId=randomUUID(),time=now();
    const dependsOn=input.dependsOn??[];
    if(!Array.isArray(dependsOn)||dependsOn.length>8||new Set(dependsOn).size!==dependsOn.length)
      throw new InputError("Choose up to eight distinct task prerequisites");
    this.transaction(()=>{
      const mission=this.checkedMission(id,input.expectedVersion);
      if(assignmentId){
        const assignment=this.db.prepare("SELECT hub_id FROM assignments WHERE id=?").get(assignmentId);
        if(!assignment||assignment.hub_id!==mission.hub_id)throw new InputError("Assignment must belong to the mission hub");
      }
      if(requiredHandoffId){
        const handoff=this.db.prepare("SELECT * FROM handoffs WHERE id=? AND target_mission_id=?").get(requiredHandoffId,id);
        if(!handoff||!["offered","accepted"].includes(handoff.status))
          throw new InputError("Choose an offered handoff for this receiving mission",409);
      }
      this.db.prepare("INSERT INTO mission_tasks(id,mission_id,assignment_id,title,objective,created_at,updated_at,required_handoff_id,auto_on_handoff) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(taskId,id,assignmentId,title,objective,time,time,requiredHandoffId,autoOnHandoff?1:0);
      for(const predecessor of dependsOn){
        if(typeof predecessor!=="string"||!this.db.prepare("SELECT 1 FROM mission_tasks WHERE id=? AND mission_id=?").get(predecessor,id))
          throw new InputError("Task prerequisite must belong to this mission");
        this.db.prepare("INSERT INTO task_dependencies VALUES (?,?)").run(taskId,predecessor);
      }
      this.advanceMission(id,mission.status==="intake"?"planned":mission.status);
      this.event("task.queued",taskId,mission.hub_id,`Task queued for mission ${mission.title}: ${title}`);
    });
    return this.missionDetail(id);
  }
  queueRun(id,taskId,input) {
    const timeout= input.timeoutSeconds??600;
    if(!Number.isInteger(timeout)||timeout<30||timeout>3600)throw new InputError("Run timeout must be 30–3600 seconds");
    const runId=randomUUID();
    this.transaction(()=>{
      const mission=this.checkedMission(id,input.expectedVersion);
      const codeRun=mission.hub_id==="dev";
      const project=mission.project?this.db.prepare("SELECT * FROM projects WHERE id=?").get(mission.project):null;
      if(codeRun&&(!project||project.kind!=="software"||!project.repository_path))
        throw new InputError("Link a Git repository to the Dev software project first");
      const task=this.db.prepare("SELECT * FROM mission_tasks WHERE id=? AND mission_id=?").get(taskId,id);
      if(!task||!["queued","blocked"].includes(task.status)||!task.assignment_id)
        throw new InputError("Choose a queued or blocked task with an assigned specialist",409);
      if(this.db.prepare("SELECT 1 FROM mission_runs WHERE task_id=? AND status IN ('queued','starting','running')").get(taskId))
        throw new InputError("This task already has an active run",409);
      const assignment=this.db.prepare("SELECT * FROM assignments WHERE id=?").get(task.assignment_id);
      if(assignment?.hub_id!==mission.hub_id||!(codeRun?["codex","opencode"].includes(assignment.runtime):["opencode","openclaw"].includes(assignment.runtime)))
        throw new InputError(codeRun?"Assign a supported Codex or OpenCode specialist":"Assign an OpenCode or restricted OpenClaw specialist for a text-only hub run");
      const prerequisites=this.db.prepare("SELECT t.status FROM task_dependencies d JOIN mission_tasks t ON t.id=d.prerequisite_id WHERE d.task_id=?").all(taskId);
      if(prerequisites.some(item=>item.status!=="accepted"))throw new InputError("Accept prerequisite tasks before running this task",409);
      if(task.required_handoff_id&&!this.acceptedHandoffs(id).some(item=>item.id===task.required_handoff_id))
        throw new InputError("Required cross-hub handoff is not accepted or its evidence changed",409);
      if(project?.monthly_run_limit!==null&&project?.monthly_run_limit!==undefined){
        const count=this.db.prepare(`SELECT count(*) AS total FROM mission_runs r JOIN missions m ON m.id=r.mission_id
          WHERE m.project=? AND r.created_at>=?`).get(project.id,now().slice(0,7)+"-01T00:00:00.000Z").total;
        if(count>=project.monthly_run_limit)throw new InputError("Project monthly run quota reached",409);
      }
      this.db.prepare("INSERT INTO mission_runs(id,mission_id,task_id,assignment_id,runtime,status,timeout_seconds,created_at) VALUES (?,?,?,?,?,'queued',?,?)")
        .run(runId,id,taskId,assignment.id,assignment.runtime,timeout,now());
      this.db.prepare("UPDATE mission_tasks SET status='queued',updated_at=? WHERE id=?").run(now(),taskId);
      this.advanceMission(id,"planned");
      this.event("run.queued",runId,mission.hub_id,`${assignment.runtime} ${codeRun?"worktree":"text-only"} run queued for task ${task.title}`);
    });
    return this.db.prepare("SELECT * FROM mission_runs WHERE id=?").get(runId);
  }
  queuedRuns(){return this.db.prepare("SELECT * FROM mission_runs WHERE status='queued' ORDER BY created_at,id").all()}
  reconcileAutoHandoffRuns(handoffId=null) {
    const tasks=this.db.prepare(`SELECT t.id,t.mission_id,m.hub_id
      FROM mission_tasks t JOIN handoffs h ON h.id=t.required_handoff_id
      JOIN missions m ON m.id=t.mission_id
      WHERE t.auto_on_handoff=1 AND h.status='accepted'
        AND (? IS NULL OR h.id=?) AND t.status IN ('queued','blocked')
        AND m.status NOT IN ('accepted','cancelled')
        AND NOT EXISTS (SELECT 1 FROM mission_runs r WHERE r.task_id=t.id)
      ORDER BY t.created_at,t.id`).all(handoffId,handoffId);
    const queued=[];
    for(const task of tasks) {
      try {queued.push(this.queueRun(task.mission_id,task.id,{expectedVersion:this.missionDetail(task.mission_id).mission.version,timeoutSeconds:600}))}
      catch(error) {
        if(!(error instanceof InputError))throw error;
        this.event("handoff.dispatch-deferred",task.id,task.hub_id,`Automatic handoff dispatch deferred: ${error.message}`);
      }
    }
    return queued;
  }
  runContext(id) {
    const run=this.db.prepare("SELECT * FROM mission_runs WHERE id=?").get(id);
    if(!run)throw new InputError("Run not found",404);
    const detail=this.missionDetail(run.mission_id);
    const task=detail.tasks.find(item=>item.id===run.task_id);
    const assignment=this.db.prepare("SELECT * FROM assignments WHERE id=?").get(run.assignment_id);
    const persona=this.db.prepare("SELECT * FROM personas WHERE path=?").get(assignment.persona_path);
    const project=this.db.prepare("SELECT * FROM projects WHERE id=?").get(detail.mission.project);
    const notes=this.notesFor({hubId:detail.mission.hub_id,project:detail.mission.project,principal:"worker"});
    const handoffs=this.acceptedHandoffs(detail.mission.id);
    return {run,mission:detail.mission,task,assignment,persona,project,notes,handoffs};
  }
  acceptedHandoffs(missionId) {
    return this.db.prepare(`SELECT h.id,h.title,h.purpose,h.from_hub_id,h.evidence_sha256 AS receipt_sha256,e.title AS evidence_title,
      e.content AS evidence_content,e.sha256 AS evidence_sha256,e.run_id,e.artifact_path,e.verified_sha256,
      e.verification FROM handoffs h JOIN mission_evidence e ON e.id=h.source_evidence_id
      WHERE h.target_mission_id=? AND h.status='accepted' ORDER BY h.created_at,h.id LIMIT 10`).all(missionId)
      .filter(h=>createHash("sha256").update(h.evidence_content).digest("hex")===h.evidence_sha256&&
        h.receipt_sha256===h.evidence_sha256&&
        this.verifyEvidenceReceipt(h));
  }
  verifyRecordedOutput(runId,expectedSha) {
    if(!runId||!expectedSha)return false;
    const run=this.db.prepare("SELECT status,output_text,output_sha256 FROM mission_runs WHERE id=?").get(runId);
    return run?.status==="succeeded"&&typeof run.output_text==="string"&&run.output_sha256===expectedSha&&
      createHash("sha256").update(run.output_text).digest("hex")===expectedSha;
  }
  verifyEvidenceReceipt(evidence) {
    if(evidence.verification==="file-hash-verified")
      return this.verifyRecordedFile(evidence.run_id,evidence.artifact_path,evidence.verified_sha256);
    if(evidence.verification==="runtime-output-hash-verified")
      return evidence.verified_sha256===(evidence.sha256||evidence.evidence_sha256)&&
        this.verifyRecordedOutput(evidence.run_id,evidence.verified_sha256);
    return true;
  }
  offerHandoff(input) {
    const source=nonempty(input.sourceMissionId,"sourceMissionId",120);
    const target=nonempty(input.targetMissionId,"targetMissionId",120);
    const evidenceId=nonempty(input.evidenceId,"evidenceId",120);
    const title=nonempty(input.title,"title",140),purpose=nonempty(input.purpose,"purpose",2000);
    const id=randomUUID(),time=now();
    this.transaction(()=>{
      const from=this.missionDetail(source),to=this.missionDetail(target);
      const evidence=from.evidence.find(item=>item.id===evidenceId);
      const task=from.tasks.find(item=>item.id===evidence?.task_id);
      if(from.mission.status!=="accepted"||!evidence||evidence.status!=="reviewed"||task?.status!=="accepted")
        throw new InputError("Only reviewed evidence from an accepted mission and task can be handed off",409);
      if(from.mission.hub_id===to.mission.hub_id||["accepted","cancelled"].includes(to.mission.status))
        throw new InputError("Choose an open mission in a different receiving hub",409);
      if(createHash("sha256").update(evidence.content).digest("hex")!==evidence.sha256||!this.verifyEvidenceReceipt(evidence))
        throw new InputError("Source evidence integrity check failed",409);
      this.db.prepare(`INSERT INTO handoffs(id,source_mission_id,source_evidence_id,target_mission_id,
        from_hub_id,to_hub_id,title,purpose,evidence_sha256,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(id,source,evidenceId,target,from.mission.hub_id,to.mission.hub_id,title,purpose,evidence.sha256,time);
      this.event("handoff.offered",id,to.mission.hub_id,`${from.mission.hub_id} offered reviewed evidence to ${to.mission.hub_id}: ${title}`);
    });
    return this.db.prepare("SELECT * FROM handoffs WHERE id=?").get(id);
  }
  reviewHandoff(id,input) {
    const decision=nonempty(input.decision,"decision",20),note=nonempty(input.responseNote,"responseNote",2000);
    if(!["accepted","declined"].includes(decision))throw new InputError("Choose accepted or declined");
    this.transaction(()=>{
      const handoff=this.db.prepare("SELECT * FROM handoffs WHERE id=?").get(id);
      if(!handoff)throw new InputError("Handoff not found",404);
      if(handoff.status!=="offered"||handoff.version!==input.expectedVersion)
        throw new InputError("Handoff changed; reload",409);
      const target=this.missionDetail(handoff.target_mission_id).mission;
      if(["accepted","cancelled"].includes(target.status))throw new InputError("Receiving mission is closed",409);
      const evidence=this.db.prepare("SELECT * FROM mission_evidence WHERE id=?").get(handoff.source_evidence_id);
      if(decision==="accepted"&&(!evidence||evidence.status!=="reviewed"||evidence.sha256!==handoff.evidence_sha256||
        createHash("sha256").update(evidence.content).digest("hex")!==handoff.evidence_sha256||
        !this.verifyEvidenceReceipt(evidence)))
        throw new InputError("Source evidence changed; this handoff cannot be accepted",409);
      this.db.prepare("UPDATE handoffs SET status=?,version=version+1,response_note=?,responded_at=? WHERE id=?")
        .run(decision,note,now(),id);
      this.advanceMission(target.id,target.status);
      this.event(`handoff.${decision}`,id,target.hub_id,`Receiving hub ${decision} the evidence handoff: ${handoff.title}`);
    });
    return this.db.prepare("SELECT * FROM handoffs WHERE id=?").get(id);
  }
  claimRun(id) {
    this.transaction(()=>{
      const context=this.runContext(id);
      if(context.run.status!=="queued")throw new InputError("Run is no longer queued",409);
      if(["cancelled","accepted"].includes(context.mission.status))throw new InputError("Mission is closed",409);
      this.db.prepare("UPDATE mission_runs SET status='starting',started_at=? WHERE id=?").run(now(),id);
      this.db.prepare("UPDATE mission_tasks SET status='running',updated_at=? WHERE id=?").run(now(),context.task.id);
      this.advanceMission(context.mission.id,"running");
      this.event("run.starting",id,context.mission.hub_id,`Preparing isolated workspace for ${context.task.title}`);
    });
    return this.runContext(id);
  }
  preparedRun(id,workspace,baseCommit) {
    this.db.prepare("UPDATE mission_runs SET workspace=?,base_commit=? WHERE id=? AND status='starting'").run(workspace,baseCommit,id);
  }
  runningRun(id,pid) {
    this.db.prepare("UPDATE mission_runs SET status='running',pid=? WHERE id=? AND status='starting'").run(pid,id);
  }
  appendRunLog(id,channel,message) {
    if(!["agent","progress","system"].includes(channel))throw new InputError("Invalid log channel");
    if(!this.db.prepare("SELECT 1 FROM mission_runs WHERE id=?").get(id))return;
    this.db.prepare("INSERT INTO run_logs(run_id,channel,message,occurred_at) VALUES (?,?,?,?)")
      .run(id,channel,String(message).slice(0,2000),now());
  }
  runLogs(missionId,runId) {
    const run=this.db.prepare("SELECT * FROM mission_runs WHERE id=? AND mission_id=?").get(runId,missionId);
    if(!run)throw new InputError("Run not found in mission",404);
    return {run,logs:this.db.prepare("SELECT * FROM run_logs WHERE run_id=? ORDER BY seq DESC LIMIT 200").all(runId).reverse(),
      artifacts:this.db.prepare("SELECT * FROM run_artifacts WHERE run_id=? ORDER BY path").all(runId)};
  }
  completeRun(id,{status,exitCode=null,result="",artifacts=[],outputText=null}) {
    if(!["succeeded","failed","interrupted"].includes(status))throw new InputError("Invalid run result");
    this.transaction(()=>{
      const {run,task,mission}=this.runContext(id);
      if(!["starting","running"].includes(run.status))return;
      for(const artifact of artifacts)
        this.db.prepare("INSERT INTO run_artifacts(run_id,path,sha256,bytes,status) VALUES (?,?,?,?,?)")
          .run(id,artifact.path,artifact.sha256,artifact.bytes,artifact.status);
      const output=typeof outputText==="string"&&outputText.trim()&&outputText.length<=12000?outputText.trim():null;
      this.db.prepare("UPDATE mission_runs SET status=?,exit_code=?,result=?,ended_at=?,output_text=?,output_sha256=? WHERE id=?")
        .run(status,exitCode,String(result).slice(0,2000),now(),output,
          output?createHash("sha256").update(output).digest("hex"):null,id);
      this.db.prepare("UPDATE mission_tasks SET status=?,updated_at=? WHERE id=?")
        .run(status==="succeeded"?"awaiting-review":"blocked",now(),task.id);
      this.advanceMission(mission.id,status==="succeeded"?"in-review":"blocked");
      this.event(`run.${status}`,id,mission.hub_id,`${run.runtime} run ${status} for task ${task.title}; outcome needs review`);
    });
  }
  stopRun(missionId,runId,input) {
    this.transaction(()=>{
      const mission=this.checkedMission(missionId,input.expectedVersion);
      const run=this.db.prepare("SELECT * FROM mission_runs WHERE id=? AND mission_id=?").get(runId,missionId);
      if(!run||!["queued","starting","running"].includes(run.status))throw new InputError("Run is not active",409);
      this.db.prepare("UPDATE mission_runs SET status='cancelled',result='Stopped by owner; inspect workspace for partial changes',ended_at=? WHERE id=?")
        .run(now(),runId);
      this.db.prepare("UPDATE mission_tasks SET status='blocked',updated_at=? WHERE id=?").run(now(),run.task_id);
      this.advanceMission(missionId,"blocked");
      this.event("run.cancelled",runId,mission.hub_id,"Owner stopped run; partial effects remain to be inspected");
    });
    return this.missionDetail(missionId);
  }
  recoverRuns() {
    const active=this.db.prepare("SELECT * FROM mission_runs WHERE status IN ('starting','running')").all();
    for(const run of active)this.completeRun(run.id,{status:"interrupted",result:"AGAS restarted during this run; inspect workspace and reconcile any partial work"});
    return active.length;
  }
  submitEvidence(id,input) {
    const taskId=nonempty(input.taskId,"taskId",120),title=nonempty(input.title,"title",140);
    const content=nonempty(input.content,"content",12000),kind=nonempty(input.kind,"kind",30);
    if(!["artifact","test-log","observation"].includes(kind))throw new InputError("Unknown evidence kind");
    const criterionIndex=input.criterionIndex;
    const evidenceId=randomUUID(),time=now(),sha256=createHash("sha256").update(content).digest("hex");
    this.transaction(()=>{
      const mission=this.checkedMission(id,input.expectedVersion);
      if(!Number.isInteger(criterionIndex)||criterionIndex<0||criterionIndex>=mission.criteria.length)
        throw new InputError("Choose a mission acceptance criterion");
      const task=this.db.prepare("SELECT * FROM mission_tasks WHERE id=? AND mission_id=?").get(taskId,id);
      if(!task||!["queued","awaiting-review"].includes(task.status))throw new InputError("Choose an open mission task");
      this.db.prepare("INSERT INTO mission_evidence(id,mission_id,task_id,criterion_index,kind,title,content,sha256,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(evidenceId,id,taskId,criterionIndex,kind,title,content,sha256,time);
      this.db.prepare("UPDATE mission_tasks SET status='awaiting-review',updated_at=? WHERE id=?").run(time,taskId);
      this.advanceMission(id,"in-review");
      this.event("evidence.submitted",evidenceId,mission.hub_id,`Evidence submitted for criterion ${criterionIndex+1}; owner review required`);
    });
    return this.missionDetail(id);
  }
  verifyRecordedFile(runId,path,expectedSha) {
    const run=this.db.prepare("SELECT workspace FROM mission_runs WHERE id=?").get(runId);
    if(!run?.workspace||typeof path!=="string"||!path||!expectedSha)return false;
    const full=resolve(run.workspace,path);
    if(!full.startsWith(run.workspace+sep))return false;
    try {
      const info=lstatSync(full);
      if(!info.isFile()||info.size>10*1024*1024)return false;
      const actual=realpathSync(full);
      if(actual!==full&&!actual.startsWith(run.workspace+sep))return false;
      return createHash("sha256").update(readFileSync(full)).digest("hex")===expectedSha;
    } catch {return false}
  }
  reviewBranchContext(missionId,runId) {
    const detail=this.missionDetail(missionId),run=detail.runs.find(item=>item.id===runId);
    const project=this.db.prepare("SELECT * FROM projects WHERE id=?").get(detail.mission.project);
    if(detail.mission.status!=="accepted"||detail.mission.hub_id!=="dev"||!project?.repository_path||
      run?.status!=="succeeded"||!run.workspace||!run.base_commit||
      !detail.tasks.some(task=>task.id===run.task_id&&task.status==="accepted"))
      throw new InputError("Accept the Dev mission and its completed run before creating a review branch",409);
    const artifacts=detail.artifacts.filter(item=>item.run_id===runId);
    if(!artifacts.length||artifacts.some(item=>item.status!=="recorded"||
      !this.verifyRecordedFile(runId,item.path,item.sha256)||
      !detail.evidence.some(e=>e.run_id===runId&&e.artifact_path===item.path&&e.status==="reviewed"&&
        e.verification==="file-hash-verified"&&e.verified_sha256===item.sha256)))
      throw new InputError("Every changed file needs a reviewed, unchanged artifact receipt",409);
    return {mission:detail.mission,project,run,artifacts,
      existing:detail.reviewBranches.find(item=>item.run_id===runId)};
  }
  recordReviewBranch(missionId,runId,branch,commitSha,baseCommit) {
    this.transaction(()=>{
      const context=this.reviewBranchContext(missionId,runId);
      if(context.existing){
        if(context.existing.branch===branch&&context.existing.commit_sha===commitSha)return;
        throw new InputError("This run already has a different review branch",409);
      }
      this.db.prepare("INSERT INTO project_review_branches VALUES (?,?,?,?,?,?)")
        .run(runId,missionId,branch,commitSha,baseCommit,now());
      this.event("project.review-branch",runId,"dev",`Owner created ${branch} for accepted mission ${context.mission.title}`);
    });
    return this.db.prepare("SELECT * FROM project_review_branches WHERE run_id=?").get(runId);
  }
  submitRunArtifact(id,input) {
    const taskId=nonempty(input.taskId,"taskId",120),runId=nonempty(input.runId,"runId",120);
    const path=nonempty(input.path,"path",1000),title=nonempty(input.title,"title",140);
    const criterionIndex=input.criterionIndex,evidenceId=randomUUID(),time=now();
    this.transaction(()=>{
      const mission=this.checkedMission(id,input.expectedVersion);
      if(!Number.isInteger(criterionIndex)||criterionIndex<0||criterionIndex>=mission.criteria.length)
        throw new InputError("Choose a mission acceptance criterion");
      const run=this.db.prepare("SELECT * FROM mission_runs WHERE id=? AND mission_id=? AND task_id=? AND status='succeeded'")
        .get(runId,id,taskId);
      const artifact=this.db.prepare("SELECT * FROM run_artifacts WHERE run_id=? AND path=? AND status='recorded'").get(runId,path);
      if(!run||!artifact||!this.verifyRecordedFile(runId,path,artifact.sha256))
        throw new InputError("Run artifact is missing or changed; inspect the workspace",409);
      const task=this.db.prepare("SELECT * FROM mission_tasks WHERE id=? AND mission_id=? AND status='awaiting-review'").get(taskId,id);
      if(!task)throw new InputError("Task is not awaiting review",409);
      const content=`Recorded file: ${path}\nRun: ${runId}\nSHA-256: ${artifact.sha256}`;
      this.db.prepare(`INSERT INTO mission_evidence(
        id,mission_id,task_id,criterion_index,kind,title,content,sha256,created_at,
        run_id,artifact_path,verified_sha256,verification
      ) VALUES (?,?,?,?,'artifact',?,?,?,?,?,?,?,'file-hash-verified')`)
        .run(evidenceId,id,taskId,criterionIndex,title,content,createHash("sha256").update(content).digest("hex"),time,
          runId,path,artifact.sha256);
      this.advanceMission(id,"in-review");
      this.event("artifact.verified",evidenceId,mission.hub_id,`File bytes verified for ${path}; owner must assess criterion ${criterionIndex+1}`);
    });
    return this.missionDetail(id);
  }
  submitRunOutput(id,input) {
    const runId=nonempty(input.runId,"runId",120),title=nonempty(input.title,"title",140);
    const criterionIndex=input.criterionIndex,evidenceId=randomUUID(),time=now();
    this.transaction(()=>{
      const mission=this.checkedMission(id,input.expectedVersion);
      if(mission.hub_id==="dev")throw new InputError("Dev work needs a recorded file receipt",409);
      if(!Number.isInteger(criterionIndex)||criterionIndex<0||criterionIndex>=mission.criteria.length)
        throw new InputError("Choose a mission acceptance criterion");
      const run=this.db.prepare("SELECT * FROM mission_runs WHERE id=? AND mission_id=? AND status='succeeded'").get(runId,id);
      if(!run||!this.verifyRecordedOutput(runId,run.output_sha256))
        throw new InputError("Run output is missing or changed; inspect the run",409);
      const task=this.db.prepare("SELECT * FROM mission_tasks WHERE id=? AND mission_id=? AND status='awaiting-review'")
        .get(run.task_id,id);
      if(!task)throw new InputError("Task is not awaiting review",409);
      this.db.prepare(`INSERT INTO mission_evidence(
        id,mission_id,task_id,criterion_index,kind,title,content,sha256,created_at,
        run_id,verified_sha256,verification
      ) VALUES (?,?,?,?,'artifact',?,?,?,?,?,?,'runtime-output-hash-verified')`)
        .run(evidenceId,id,task.id,criterionIndex,title,run.output_text,run.output_sha256,time,
          runId,run.output_sha256);
      this.advanceMission(id,"in-review");
      this.event("output.verified",evidenceId,mission.hub_id,`Run output hash verified; owner must assess criterion ${criterionIndex+1}`);
    });
    return this.missionDetail(id);
  }
  reviewEvidence(id,evidenceId,input) {
    const note=nonempty(input.reviewNote,"reviewNote",2000),decision=nonempty(input.decision,"decision",20);
    if(!["reviewed","rejected"].includes(decision))throw new InputError("Invalid review decision");
    this.transaction(()=>{
      const mission=this.checkedMission(id,input.expectedVersion);
      const evidence=this.db.prepare("SELECT * FROM mission_evidence WHERE id=? AND mission_id=?").get(evidenceId,id);
      if(!evidence)throw new InputError("Evidence not found",404);
      if(evidence.status!=="submitted")throw new InputError("Evidence has already been reviewed",409);
      if(createHash("sha256").update(evidence.content).digest("hex")!==evidence.sha256)
        throw new InputError("Evidence integrity check failed",409);
      if(!this.verifyEvidenceReceipt(evidence))
        throw new InputError("Recorded run output has changed; it cannot be reviewed",409);
      this.db.prepare("UPDATE mission_evidence SET status=?,review_note=?,reviewed_at=? WHERE id=?")
        .run(decision,note,now(),evidenceId);
      this.advanceMission(id,mission.status);
      this.event(`evidence.${decision}`,evidenceId,mission.hub_id,`Owner ${decision} evidence: ${evidence.title}`);
    });
    return this.missionDetail(id);
  }
  acceptTask(id,taskId,input) {
    this.transaction(()=>{
      const mission=this.checkedMission(id,input.expectedVersion);
      const task=this.db.prepare("SELECT * FROM mission_tasks WHERE id=? AND mission_id=?").get(taskId,id);
      if(!task)throw new InputError("Task not found",404);
      if(task.status!=="awaiting-review")throw new InputError("Task needs submitted evidence",409);
      if(task.required_handoff_id&&!this.acceptedHandoffs(id).some(item=>item.id===task.required_handoff_id))
        throw new InputError("Required cross-hub evidence changed; task cannot be accepted",409);
      const evidence=this.db.prepare("SELECT status FROM mission_evidence WHERE task_id=?").all(taskId);
      if(evidence.some(item=>item.status==="submitted")||!evidence.some(item=>item.status==="reviewed"))
        throw new InputError("Task requires reviewed evidence with no pending submissions",409);
      for(const item of this.db.prepare("SELECT * FROM mission_evidence WHERE task_id=? AND status='reviewed'").all(taskId))
        if(!this.verifyEvidenceReceipt(item))
          throw new InputError("Reviewed artifact changed; submit fresh evidence",409);
      this.db.prepare("UPDATE mission_tasks SET status='accepted',updated_at=? WHERE id=?").run(now(),taskId);
      this.advanceMission(id,mission.status);
      this.event("task.accepted",taskId,mission.hub_id,`Owner accepted task: ${task.title}`);
    });
    return this.missionDetail(id);
  }
  acceptMission(id,input) {
    this.transaction(()=>{
      const mission=this.checkedMission(id,input.expectedVersion),detail=this.missionDetail(id);
      if(!detail.tasks.length||detail.tasks.some(task=>task.status!=="accepted"))
        throw new InputError("All mission tasks need owner acceptance",409);
      for(const task of detail.tasks.filter(item=>item.required_handoff_id))
        if(!this.acceptedHandoffs(id).some(item=>item.id===task.required_handoff_id))
          throw new InputError("Required cross-hub evidence changed; mission cannot be accepted",409);
      for(let index=0;index<mission.criteria.length;index++){
        if(!detail.evidence.some(e=>e.criterion_index===index&&e.status==="reviewed"&&
          detail.tasks.some(task=>task.id===e.task_id&&task.status==="accepted")))
          throw new InputError(`Criterion ${index+1} needs reviewed evidence from an accepted task`,409);
      }
      for(const item of detail.evidence.filter(e=>e.status==="reviewed"))
        if(!this.verifyEvidenceReceipt(item))
          throw new InputError("Accepted artifact changed; submit fresh evidence",409);
      this.advanceMission(id,"accepted");
      this.event("mission.owner-accepted",id,mission.hub_id,`Owner accepted mission ${mission.title}; evidence was reviewed by owner, not independently verified`);
    });
    return this.missionDetail(id);
  }
  cancelMission(id,input) {
    this.transaction(()=>{
      const mission=this.checkedMission(id,input.expectedVersion);
      this.db.prepare("UPDATE mission_runs SET status='cancelled',result='Mission cancelled; inspect partial work',ended_at=? WHERE mission_id=? AND status IN ('queued','starting','running')").run(now(),id);
      this.db.prepare("UPDATE mission_tasks SET status='cancelled',updated_at=? WHERE mission_id=? AND status IN ('queued','running','blocked','awaiting-review')").run(now(),id);
      this.advanceMission(id,"cancelled");
      this.event("mission.cancelled",id,mission.hub_id,`Owner cancelled mission: ${mission.title}`);
    });
    return this.missionDetail(id);
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
  queueCeoReply(messageId,runtime) {
    if(!["codex","opencode","openclaw"].includes(runtime))throw new InputError("Select a supported conversation runtime");
    this.transaction(()=>{
      const message=this.db.prepare("SELECT * FROM messages WHERE id=?").get(messageId);
      if(!message)throw new InputError("CEO message not found",404);
      const existing=this.db.prepare("SELECT * FROM ceo_replies WHERE message_id=?").get(messageId);
      if(existing&&!["failed","interrupted"].includes(existing.status))throw new InputError("This request already has an active or completed reply",409);
      if(existing)this.db.prepare("UPDATE ceo_replies SET runtime=?,status='queued',reply='',error='',created_at=?,completed_at=NULL WHERE message_id=?")
        .run(runtime,now(),messageId);
      else this.db.prepare("INSERT INTO ceo_replies(message_id,runtime,status,created_at) VALUES (?,?,'queued',?)")
        .run(messageId,runtime,now());
      this.db.prepare("UPDATE messages SET status='queued' WHERE id=?").run(messageId);
      this.event("ceo.reply-queued",messageId,message.hub_id,`${message.hub_id} CEO reply queued with ${runtime}`);
    });
    return this.db.prepare("SELECT * FROM ceo_replies WHERE message_id=?").get(messageId);
  }
  queuedCeoReplies(){return this.db.prepare("SELECT * FROM ceo_replies WHERE status='queued' ORDER BY created_at").all()}
  claimCeoReply(messageId) {
    let message,reply;
    this.transaction(()=>{
      reply=this.db.prepare("SELECT * FROM ceo_replies WHERE message_id=?").get(messageId);
      if(reply?.status!=="queued")throw new InputError("CEO reply is not queued",409);
      message=this.db.prepare("SELECT * FROM messages WHERE id=?").get(messageId);
      this.db.prepare("UPDATE ceo_replies SET status='running' WHERE message_id=?").run(messageId);
      this.db.prepare("UPDATE messages SET status='running' WHERE id=?").run(messageId);
    });
    return {message,reply,notes:this.notesFor({hubId:message.hub_id,principal:"agent"}),
      history:this.db.prepare("SELECT m.text,r.reply FROM messages m JOIN ceo_replies r ON r.message_id=m.id WHERE m.hub_id=? AND r.status='completed' AND m.id<>? ORDER BY m.created_at DESC LIMIT 6")
        .all(message.hub_id,messageId).reverse()};
  }
  completeCeoReply(messageId,{status,reply="",error=""}) {
    if(!["completed","failed","interrupted"].includes(status))throw new InputError("Invalid CEO reply state");
    this.transaction(()=>{
      const message=this.db.prepare("SELECT * FROM messages WHERE id=?").get(messageId);
      const record=this.db.prepare("SELECT * FROM ceo_replies WHERE message_id=?").get(messageId);
      if(!message||record?.status!=="running")return;
      this.db.prepare("UPDATE ceo_replies SET status=?,reply=?,error=?,completed_at=? WHERE message_id=?")
        .run(status,reply.slice(0,8000),error.slice(0,500),now(),messageId);
      this.db.prepare("UPDATE messages SET status=? WHERE id=?").run(status,messageId);
      this.event(`ceo.reply-${status}`,messageId,message.hub_id,
        status==="completed"?`${message.hub_id} CEO replied through ${record.runtime}; executive notified`:
          `${message.hub_id} CEO ${status}; request remains reviewable`);
    });
  }
  recoverCeoReplies() {
    for(const item of this.db.prepare("SELECT message_id FROM ceo_replies WHERE status='running'").all())
      this.completeCeoReply(item.message_id,{status:"interrupted",error:"AGAS restarted during the response; retry after inspecting the request"});
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
  importNoteEdit({id,title,content,scope,ownerId,revision,path,sourceHash,baselineHash}) {
    this.transaction(()=>{
      const note=this.noteForOwner(id);
      if(note.scope!==scope||note.owner_id!==ownerId||note.revision!==revision||
        this.projectionHash(path)!==baselineHash)
        throw new InputError("Vault note revision or scope changed; resolve the conflict in AGAS",409);
      const nextTitle=nonempty(title,"title",140),nextContent=nonempty(content,"content",30000);
      this.db.prepare("UPDATE notes SET title=?,content=?,revision=revision+1,updated_at=? WHERE id=?")
        .run(nextTitle,nextContent,now(),id);
      this.recordProjection(path,sourceHash);
      this.event("note.imported",id,note.scope==="hub"?note.owner_id:null,`Reviewed vault edit imported: ${nextTitle}`);
    });
    return this.noteForOwner(id);
  }
  projectionHash(path) {
    return this.db.prepare("SELECT sha256 FROM vault_projection WHERE path=?").get(path)?.sha256||null;
  }
  recordProjection(path,sha256) {
    this.db.prepare("INSERT INTO vault_projection(path,sha256,projected_at) VALUES (?,?,?) ON CONFLICT(path) DO UPDATE SET sha256=excluded.sha256,projected_at=excluded.projected_at")
      .run(path,sha256,now());
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
    const existing=this.db.prepare("SELECT * FROM assignments WHERE hub_id=? AND persona_path=?").get(hub,path);
    if(existing?.runtime===runtime)return existing;
    const id=existing?.id||randomUUID();
    this.transaction(() => {
      if(existing)this.db.prepare("UPDATE assignments SET runtime=?,status='configured' WHERE id=?").run(runtime,id);
      else this.db.prepare("INSERT INTO assignments VALUES (?,?,?,?,'configured')").run(id,hub,path,runtime);
      this.event("agent.configured",id,hub,`Configured ${path.split("/").pop()} for ${hub}; readiness pending`);
    });
    return this.db.prepare("SELECT * FROM assignments WHERE id=?").get(id);
  }
  close() { this.db.close(); }
}
