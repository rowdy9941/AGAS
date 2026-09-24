import { createServer } from "node:http";
import { createApp } from "./app.js";

const host = process.env.AGAS_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.AGAS_PORT ?? "4310", 10);

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error("AGAS_PORT must be an integer between 0 and 65535");
}

const server = createServer(createApp());
server.listen(port, host, () => {
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  console.log(`AGAS control plane listening on http://${host}:${actualPort}`);
});

function shutdown(signal) {
  server.close((error) => {
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
