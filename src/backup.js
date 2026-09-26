import { backup, DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
const inside=(root,path)=>path===root||path.startsWith(root+sep);
const exists=async path=>!!(await lstat(path).catch(error=>{if(error.code==="ENOENT")return null;throw error}));
function safeRelative(path) {
  if(typeof path!=="string"||!path||isAbsolute(path)||path.split(/[\\/]/).some(part=>!part||part==="."||part===".."))
    throw new Error("Backup manifest contains an unsafe path");
  return path.replaceAll("\\","/");
}

async function copyTree(source,dest,prefix,files) {
  if(!await exists(source))return;
  const info=await lstat(source);
  if(!info.isDirectory()||info.isSymbolicLink())throw new Error(`Backup source is not a plain directory: ${source}`);
  await mkdir(dest,{recursive:true,mode:0o700});
  for(const entry of await readdir(source,{withFileTypes:true})) {
    const from=join(source,entry.name),to=join(dest,entry.name),name=join(prefix,entry.name);
    if(entry.isDirectory())await copyTree(from,to,name,files);
    else if(entry.isFile()) {
      const before=await readFile(from);
      await copyFile(from,to);
      const copied=await readFile(to),after=await readFile(from);
      if(digest(before)!==digest(copied)||digest(before)!==digest(after))throw new Error(`File changed during backup: ${name}`);
      files.push({path:name,bytes:copied.length,sha256:digest(copied)});
    } else throw new Error(`Backup cannot snapshot a symbolic link or special file: ${name}`);
  }
}

async function verifyArtifacts(database,workspaceRoot) {
  const rows=database.prepare(`SELECT r.id,r.workspace,a.path,a.sha256 FROM run_artifacts a
    JOIN mission_runs r ON r.id=a.run_id WHERE a.status='recorded'`).all();
  for(const row of rows) {
    if(!row.workspace||basename(row.workspace)!==row.id)throw new Error("Run workspace is unavailable for a recorded artifact");
    const root=join(workspaceRoot,row.id),file=resolve(root,row.path);
    if(!inside(root,file)||file===root||digest(await readFile(file))!==row.sha256)
      throw new Error(`Recorded run artifact changed: ${row.id}/${row.path}`);
  }
}

export async function createSnapshot({database,vault,workspaces,output}) {
  const db=resolve(database),vaultRoot=resolve(vault),workspaceRoot=resolve(workspaces),destination=resolve(output);
  if(!await exists(db))throw new Error("AGAS database does not exist");
  if(await exists(destination))throw new Error("Backup destination already exists");
  if([dirname(db),vaultRoot,workspaceRoot].some(root=>inside(root,destination)))
    throw new Error("Backup destination must be outside AGAS data folders");
  const staging=destination+`.partial-${randomUUID()}`;
  const files=[];
  await mkdir(dirname(staging),{recursive:true,mode:0o700});
  try {
    await mkdir(staging,{mode:0o700});
    await mkdir(join(staging,"data"),{mode:0o700});
    const source=new DatabaseSync(db);
    try {
      if(source.prepare("SELECT count(*) AS n FROM mission_runs WHERE status IN ('queued','starting','running')").get().n)
        throw new Error("Stop or reconcile active AGAS runs before backup");
      await backup(source,join(staging,"data","agas.db"));
    } finally {source.close()}
    const snapshot=new DatabaseSync(join(staging,"data","agas.db"));
    try {
      if(snapshot.prepare("PRAGMA integrity_check").get().integrity_check!=="ok")throw new Error("Database backup failed integrity check");
      await copyTree(vaultRoot,join(staging,"data","AGAS Vault"),join("data","AGAS Vault"),files);
      await copyTree(workspaceRoot,join(staging,"data","workspaces"),join("data","workspaces"),files);
      await verifyArtifacts(snapshot,join(staging,"data","workspaces"));
    } finally {snapshot.close()}
    const dbBytes=await readFile(join(staging,"data","agas.db"));
    files.push({path:join("data","agas.db"),bytes:dbBytes.length,sha256:digest(dbBytes)});
    const manifest={format:"agas-snapshot-v1",createdAt:new Date().toISOString(),files:files.sort((a,b)=>a.path.localeCompare(b.path))};
    await writeFile(join(staging,"manifest.json"),JSON.stringify(manifest,null,2)+"\n",{mode:0o600});
    await rename(staging,destination);
    return manifest;
  } catch(error) {await rm(staging,{recursive:true,force:true});throw error}
}

export async function restoreSnapshot({bundle,destination}) {
  const source=resolve(bundle),target=resolve(destination);
  if(await exists(target))throw new Error("Restore destination already exists");
  if(inside(source,target)||inside(target,source))throw new Error("Restore destination must be separate from the snapshot");
  const manifest=JSON.parse(await readFile(join(source,"manifest.json"),"utf8"));
  if(manifest.format!=="agas-snapshot-v1"||!Array.isArray(manifest.files)||!manifest.files.some(file=>file.path===join("data","agas.db")))
    throw new Error("Unsupported AGAS snapshot");
  const staging=target+`.partial-${randomUUID()}`;
  await mkdir(dirname(staging),{recursive:true,mode:0o700});
  try {
    await mkdir(staging,{mode:0o700});
    for(const file of manifest.files) {
      const name=safeRelative(file.path),from=resolve(source,name),to=resolve(staging,name);
      if(!inside(source,from)||!inside(staging,to)||!(await lstat(from)).isFile())throw new Error("Invalid backup entry");
      const bytes=await readFile(from);
      if(bytes.length!==file.bytes||digest(bytes)!==file.sha256)throw new Error(`Backup checksum mismatch: ${name}`);
      await mkdir(dirname(to),{recursive:true,mode:0o700});
      await writeFile(to,bytes,{mode:0o600});
    }
    const db=new DatabaseSync(join(staging,"data","agas.db"));
    try {
      if(db.prepare("PRAGMA integrity_check").get().integrity_check!=="ok")throw new Error("Restored database failed integrity check");
      db.exec("BEGIN IMMEDIATE");
      try {
        for(const run of db.prepare("SELECT id FROM mission_runs WHERE workspace IS NOT NULL").all())
          db.prepare("UPDATE mission_runs SET workspace=? WHERE id=?").run(join(target,"data","workspaces",run.id),run.id);
        // Git repositories were external to the backup; owners relink them after restore.
        db.prepare("UPDATE projects SET repository_path=NULL WHERE repository_path IS NOT NULL").run();
        db.exec("COMMIT");
      } catch(error) {db.exec("ROLLBACK");throw error}
      await verifyArtifacts(db,join(staging,"data","workspaces"));
    } finally {db.close()}
    await rename(staging,target);
    return {root:target,files:manifest.files.length,createdAt:manifest.createdAt};
  } catch(error) {await rm(staging,{recursive:true,force:true});throw error}
}
