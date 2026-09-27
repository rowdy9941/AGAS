import { resolve } from "node:path";
import { createSnapshot, restoreSnapshot } from "../src/backup.js";

const [action,first,second]=process.argv.slice(2);
try {
  if(action==="create"&&first&&!second) {
    const manifest=await createSnapshot({database:process.env.AGAS_DB_PATH||"data/agas.db",
      vault:process.env.AGAS_VAULT_PATH||"data/AGAS Vault",
      workspaces:process.env.AGAS_WORKSPACES_PATH||"data/workspaces",output:resolve(first)});
    console.log(`Snapshot complete: ${manifest.files.length} verified files at ${resolve(first)}`);
  } else if(action==="restore"&&first&&second) {
    const restored=await restoreSnapshot({bundle:resolve(first),destination:resolve(second)});
    console.log(`Restore complete: ${restored.files} files at ${restored.root}`);
    console.log("Start AGAS using the restored data directory; relink external Git repositories before new runs.");
  } else throw new Error("Usage: npm run snapshot -- create /new/snapshot | npm run snapshot -- restore /snapshot /new/agas-root");
} catch(error) {console.error(error.message);process.exitCode=1}
