import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgasServer } from "../src/server.js";

test("an edited Obsidian note imports against its AGAS revision and conflicting metadata preserves the file",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-vault-import-")),vault=join(root,"vault");
  const {server}=createAgasServer({database:join(root,"agas.db"),vault,token:"import-test",
    workspaces:join(root,"workspaces"),adapters:{}});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  async function request(path,method="GET",data) {
    const res=await fetch(base+path,{method,headers:{authorization:"Bearer import-test",
      ...(data?{"content-type":"application/json"}:{})},body:data?JSON.stringify(data):undefined});
    return {status:res.status,data:await res.json()};
  }
  try {
    const note=(await request("/api/notes","POST",{title:"Original",content:"Version one",scope:"organization",ownerId:"agas"})).data.note;
    assert.equal((await request("/api/vault/project","POST",{})).status,200);
    const file=join(vault,"07 Knowledge",`${note.id}.md`),initial=await readFile(file,"utf8");
    assert.match(initial,/revision: 1/);
    await writeFile(file,initial.replace("# Original\n\nVersion one\n","# Edited title\n\nVersion two from Obsidian\n"));
    const imported=await request("/api/vault/import","POST",{});
    assert.equal(imported.status,200);
    assert.equal(imported.data.imported.length,1);
    assert.equal(imported.data.conflicts.length,0);
    assert.equal(imported.data.projectionConflicts.length,0);
    const updated=(await request(`/api/notes/${note.id}`)).data.note;
    assert.equal(updated.title,"Edited title");
    assert.equal(updated.content,"Version two from Obsidian");
    assert.equal(updated.revision,2);
    const projected=await readFile(file,"utf8");
    assert.match(projected,/revision: 2/);
    assert.equal((await request("/api/vault/import","POST",{})).data.imported.length,0);
    const conflict=projected.replace("revision: 2","revision: 1").replace("Version two from Obsidian","Untrusted other version");
    await writeFile(file,conflict);
    const rejected=await request("/api/vault/import","POST",{});
    assert.equal(rejected.data.imported.length,0);
    assert.equal(rejected.data.conflicts.length,1);
    assert.equal((await request(`/api/notes/${note.id}`)).data.note.content,"Version two from Obsidian");
    assert.equal(await readFile(file,"utf8"),conflict);
  } finally {await new Promise(resolve=>server.close(resolve))}
});

test("a mission brief imports only its title and objective against the exact projected revision",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-mission-import-")),vault=join(root,"vault");
  const {server}=createAgasServer({database:join(root,"agas.db"),vault,token:"mission-import",
    workspaces:join(root,"workspaces"),adapters:{}});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  async function request(path,method="GET",data) {
    const res=await fetch(base+path,{method,headers:{authorization:"Bearer mission-import",
      ...(data?{"content-type":"application/json"}:{})},body:data?JSON.stringify(data):undefined});
    return {status:res.status,data:await res.json()};
  }
  try {
    const mission=(await request("/api/missions","POST",{hubId:"dev",title:"Original mission",objective:"Original objective",criteria:["Inspect reviewed work"]})).data.mission;
    assert.equal((await request("/api/vault/project","POST",{})).status,200);
    const file=join(vault,"03 Missions",`${mission.id}.md`),initial=await readFile(file,"utf8");
    await writeFile(file,initial.replace("# Original mission\n\nOriginal objective\n\nLinked goal:",
      "# Reviewed mission\n\nRevised local objective\n\nLinked goal:"));
    const imported=await request("/api/vault/import","POST",{});
    assert.equal(imported.status,200);
    assert.deepEqual(imported.data.imported,[join("03 Missions",`${mission.id}.md`)]);
    const updated=(await request(`/api/missions/${mission.id}`)).data.mission;
    assert.equal(updated.title,"Reviewed mission");
    assert.equal(updated.objective,"Revised local objective");
    assert.equal(updated.version,2);
    const projected=await readFile(file,"utf8");
    assert.match(projected,/revision: 2/);
    assert.equal((await request("/api/vault/import","POST",{})).data.imported.length,0);
    const damaged=projected.replace("## Acceptance criteria","## Changed acceptance criteria");
    await writeFile(file,damaged);
    const rejected=await request("/api/vault/import","POST",{});
    assert.deepEqual(rejected.data.conflicts,[join("03 Missions",`${mission.id}.md`)]);
    assert.equal((await request(`/api/missions/${mission.id}`)).data.mission.version,2);
    assert.equal(await readFile(file,"utf8"),damaged);
  } finally {await new Promise(resolve=>server.close(resolve))}
});
