import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store.js";

test("goals align organization, project and mission; achievement needs accepted work",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-goals-")),path=join(root,"agas.db");
  let store=new Store(path);
  const project=store.createProject({hubId:"dev",title:"Product",description:"Deliver software",kind:"software"});
  const parent=store.createGoal({title:"Deliver useful products",objective:"Operate a development portfolio",measure:"One accepted project mission"});
  const goal=store.createGoal({parentId:parent.id,hubId:"dev",projectId:project.id,title:"Ship a file",
    objective:"Create a demonstrable output",measure:"A reviewed mission is accepted"});
  assert.throws(()=>store.createMission({hubId:"content",project:"",goalId:goal.id,title:"Wrong goal",objective:"No",criteria:["Result"]}),/active goal/);
  const mission=store.createMission({hubId:"dev",project:project.id,goalId:goal.id,title:"Implement",objective:"Complete work",criteria:["Accepted evidence"]});
  assert.throws(()=>store.completeGoal(goal.id,{expectedVersion:1}),/Accept linked missions/);
  assert.throws(()=>store.completeGoal(parent.id,{expectedVersion:1}),/complete child goals/);
  let detail=store.createTask(mission.id,{title:"Build",objective:"Produce result",expectedVersion:1});
  detail=store.submitEvidence(mission.id,{taskId:detail.tasks[0].id,criterionIndex:0,kind:"observation",
    title:"Inspected result",content:"Owner independently inspected the result",expectedVersion:2});
  detail=store.reviewEvidence(mission.id,detail.evidence[0].id,{decision:"reviewed",reviewNote:"Owner checked",expectedVersion:3});
  detail=store.acceptTask(mission.id,detail.tasks[0].id,{expectedVersion:4});
  store.acceptMission(mission.id,{expectedVersion:5});
  assert.equal(store.completeGoal(goal.id,{expectedVersion:1}).status,"achieved");
  assert.equal(store.completeGoal(parent.id,{expectedVersion:1}).status,"achieved");
  store.close();
  store=new Store(path);
  assert.equal(store.overview().goals.filter(item=>item.status==="achieved").length,2);
  assert.equal(store.missionDetail(mission.id).mission.goal_id,goal.id);
  store.close();
});

test("task prerequisites and a monthly run quota prevent premature or unlimited starts",async()=>{
  const root=await mkdtemp(join(tmpdir(),"agas-quota-")),path=join(root,"agas.db"),store=new Store(path);
  const project=store.createProject({hubId:"dev",title:"Product",description:"A trusted repo",kind:"software"});
  store.linkProjectRepository(project.id,root);
  store.setRunLimit(project.id,{monthlyRunLimit:1});
  const mission=store.createMission({hubId:"dev",project:project.id,title:"Two steps",objective:"Create and then use a result",criteria:["First result","Second result"]});
  const assignment=store.assignPersona({hubId:"dev",path:"engineering/engineering-frontend-developer.md",runtime:"codex"});
  let detail=store.createTask(mission.id,{title:"First",objective:"Produce a base",assignmentId:assignment.id,expectedVersion:1});
  const first=detail.tasks[0].id;
  detail=store.createTask(mission.id,{title:"Second",objective:"Use the base",assignmentId:assignment.id,
    dependsOn:[first],expectedVersion:2});
  const second=detail.tasks[1].id;
  assert.equal(detail.dependencies[0].task_id,second);
  assert.equal(detail.dependencies[0].prerequisite_id,first);
  assert.throws(()=>store.queueRun(mission.id,second,{expectedVersion:3,timeoutSeconds:30}),/prerequisite/);
  const run=store.queueRun(mission.id,first,{expectedVersion:3,timeoutSeconds:30});
  store.claimRun(run.id);
  store.completeRun(run.id,{status:"failed",result:"Worker failed"});
  const version=store.missionDetail(mission.id).mission.version;
  assert.throws(()=>store.queueRun(mission.id,first,{expectedVersion:version,timeoutSeconds:30}),/monthly run quota/);
  store.setRunLimit(project.id,{monthlyRunLimit:2});
  const retried=store.queueRun(mission.id,first,{expectedVersion:version,timeoutSeconds:30});
  assert.equal(retried.status,"queued");
  store.close();
  const restored=new Store(path);
  assert.equal(restored.overview().projects[0].monthly_run_limit,2);
  assert.equal(restored.missionDetail(mission.id).dependencies[0].prerequisite_id,first);
  restored.close();
});
