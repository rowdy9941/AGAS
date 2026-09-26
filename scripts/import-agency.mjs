import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { Store } from "../src/store.js";
import { agencyIndex, importAgencyCheckout } from "../src/agency.js";

const folder=process.argv[2];
if(!folder){console.error("Usage: npm run import:agency -- /path/to/agency-agents [database path]");process.exitCode=2}
else {
  const root=resolve(folder);
  const actual=execFileSync("git",["-C",root,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
  if(actual!==agencyIndex.commit)throw new Error(`Agency checkout must be at pinned commit ${agencyIndex.commit}; got ${actual}`);
  const db=new Store(resolve(process.argv[3]||process.env.AGAS_DB_PATH||"data/agas.db"));
  try {console.log(`Imported ${importAgencyCheckout(db,root)} pinned Agency personas.`)} finally {db.close()}
}
