import { existsSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";

const RUNTIMES = [
  {id:"hermes",name:"Hermes",binary:"hermes",icon:"◈"},
  {id:"openclaw",name:"OpenClaw",binary:"openclaw",icon:"✳"},
  {id:"codex",name:"Codex",binary:"codex",icon:"⌘"},
  {id:"claude",name:"Claude Code",binary:"claude",icon:"✦"},
  {id:"opencode",name:"OpenCode",binary:"opencode",icon:"◇"}
];
export function detectRuntimes(env=process.env) {
  const folders=(env.PATH||"").split(delimiter).filter(Boolean);
  const suffixes=process.platform==="win32"?(env.PATHEXT||".EXE;.CMD;.BAT").toLowerCase().split(";"):[""];
  return RUNTIMES.map(runtime=>{
    let found=null;
    for(const folder of folders) {
      for(const suffix of suffixes) {
        const candidate=join(folder,runtime.binary+suffix);
        try { if(existsSync(candidate)&&statSync(candidate).isFile()) {found=candidate;break} } catch {}
      }
      if(found)break;
    }
    return {...runtime,state:found?"detected":"not-detected",path:found,ready:false};
  });
}
