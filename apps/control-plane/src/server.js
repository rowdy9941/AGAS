import { createServer } from "node:http";
import { createApp } from "./app.js";
import { createPersistentServices } from "../../../packages/core/src/control-plane.js";
import { RuntimeExecutor } from "../../../packages/runtime/src/runtime-executor.js";
import { Dispatcher } from "../../../packages/runtime/src/dispatcher.js";

const host = process.env.AGAS_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.AGAS_PORT ?? "4310", 10);
const databasePath = process.env.AGAS_DB_PATH ?? "./data/agas.db";
const configuredToken = process.env.AGAS_BOOTSTRAP_TOKEN;
const isLoopback = ["127.0.0.1", "::1", "localhost"].includes(host);
const bootstrapToken = configuredToken ?? "agas-dev-token";
const runtimeMode = process.env.AGAS_RUNTIME_EXECUTION ?? "simulator";
const workspaceRoot = process.env.AGAS_WORKSPACE_ROOT ?? process.cwd();

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error("AGAS_PORT must be an integer between 0 and 65535");
}
if (!configuredToken && !isLoopback) {
  throw new Error("AGAS_BOOTSTRAP_TOKEN is required when AGAS_HOST is not loopback");
}

const { controlPlane, auth, database } = createPersistentServices({ databasePath, bootstrapToken });
const executor = new RuntimeExecutor({ registry: controlPlane.registry, mode: runtimeMode, workspaceRoot });
const dispatcher = new Dispatcher({ executions: controlPlane.executions, executor });
const server = createServer(createApp(controlPlane, { auth }));
server.listen(port, host, () => {
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  console.log(`AGAS control plane listening on http://${host}:${actualPort}`);
  console.log(`Persistent state: ${databasePath}`);
  console.log(`Runtime execution: ${runtimeMode}`);
  if (!configuredToken) console.warn("Development authentication enabled; use Bearer agas-dev-token");
  dispatcher.start();
});

function shutdown(signal) {
  dispatcher.stop();
  server.close((error) => {
    database.close();
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
  setTimeout(() => process.exit(1), 5_000).unref();
  console.log(`Received ${signal}; shutting down`);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
