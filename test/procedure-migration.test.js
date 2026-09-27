import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store.js";

test("an existing run and note survive the procedure schema upgrade and a second boot",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-procedure-upgrade-")),path=join(root,"agas.db");
  let store=new Store(path);
  const project=store.createProject({hubId:"business",kind:"research",title:"Existing work",description:"Earlier version"});
  const note=store.createNote({title:"Prior decision",content:"Keep this recorded",scope:"project",ownerId:project.id});
  const assignment=store.assignPersona({hubId:"business",path:"specialized/business-strategist.md",runtime:"opencode"});
  const mission=store.createMission({hubId:"business",project:project.id,title:"Earlier mission",
    objective:"Preserve work through the update",criteria:["Recorded outcome"]});
  const detail=store.createTask(mission.id,{title:"Earlier task",objective:"Record an outcome",
    assignmentId:assignment.id,expectedVersion:1});
  const queued=store.queueRun(mission.id,detail.tasks[0].id,{expectedVersion:detail.mission.version,timeoutSeconds:30});
  store.close();

  // Represent the database on disk before the procedure and prompt-receipt release.
  const legacy=new DatabaseSync(path);
  legacy.exec("DROP TABLE hub_procedures");
  legacy.exec("ALTER TABLE mission_runs DROP COLUMN procedure_receipts");
  legacy.exec("ALTER TABLE mission_runs DROP COLUMN prompt_sha256");
  legacy.close();

  for(let boot=0;boot<2;boot++){
    store=new Store(path);
    assert.equal(store.db.prepare("SELECT content FROM notes WHERE id=?").get(note.id).content,"Keep this recorded");
    assert.equal(store.missionDetail(mission.id).runs[0].id,queued.id);
    assert.equal(store.missionDetail(mission.id).runs[0].status,"queued");
    assert.equal(store.overview().procedures.length,0);
    assert.equal(store.db.prepare("SELECT procedure_receipts FROM mission_runs WHERE id=?").get(queued.id).procedure_receipts,"[]");
    store.close();
  }
  store=new Store(path);
  store.claimRun(queued.id);
  const prompt="Summarize the earlier task within its assigned scope.";
  assert.match(store.recordRunPrompt(queued.id,prompt,[]),/^[0-9a-f]{64}$/);
  store.completeRun(queued.id,{status:"succeeded",outputText:"Existing work is present"});
  assert.equal(store.missionDetail(mission.id).runs[0].output_text,"Existing work is present");
  store.close();
});
