import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { Store } from "../src/store.js";
import { ExecutionManager } from "../src/execution.js";
import { detectRuntimes } from "../src/runtimes.js";

const execFile=promisify(execFileCallback);
const store=new Store(":memory:");
try {
  let git=null;
  try {git=(await execFile("git",["--version"],{timeout:5000,maxBuffer:4096})).stdout.trim()}
  catch {git="Git not found on PATH"}
  const executor=new ExecutionManager(store);
  const discoveries=detectRuntimes();
  const probes=await Promise.all(discoveries.filter(item=>item.id!=="hermes")
    .map(item=>executor.readiness(item.id)));
  const runtimes=discoveries.map(item=>{
    const check=probes.find(probe=>probe.id===item.id);
    return {id:item.id,installed:item.state==="detected",admitted:check?.ready===true,
      capability:item.id==="hermes"?"native window only":item.id==="codex"?"Dev and CEO":
        item.id==="opencode"?"Dev, text and CEO":"text and CEO",
      reason:check?.reason||(!check?"No executable AGAS task adapter":"CLI and policy probe passed; a live run is still required")};
  });
  const report={product:"AGAS",os:process.platform,architecture:process.arch,node:process.version,git,
    runtimeProbes:runtimes,
    releaseGates:{localRuntimeProbe:runtimes.filter(item=>item.admitted).map(item=>item.id),
      liveProviderRunsVerified:false,cleanInstallVerified:false,externalEffectsVerified:false,
      mainReady:false},
    nextStep:"Install and sign in to at least two supported provider CLIs on this machine, run this command again, then complete real AGAS tasks and review their receipts. A successful probe alone is not a completed provider run."};
  console.log(JSON.stringify(report,null,2));
} finally {store.close()}
