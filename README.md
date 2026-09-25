# AGAS — Accessible General AI System

**BY RAGHUNATH.D** · [Implementation status](docs/rebuild/STATUS.md) · [Approved architecture](docs/rebuild/approved-plan.md)

AGAS is being rebuilt as a real desktop application on the pinned AionUI/AionCore source. The finalized artwork is [brand/AGAS_Logo.jpg](brand/AGAS_Logo.jpg). This branch connects the desktop shell to actual local application interfaces and generates its Agency specialist catalog from the upstream source. The original control-plane prototype remains available for reference, but its simulator is not evidence that a real mission ran.

## Development setup

Prerequisites: Node.js 22+, Python 3, Bun, pnpm, and Rust/Cargo. The pinned sources are recorded in [runtime/foundations.lock.json](runtime/foundations.lock.json). Setup fetches those commits, applies the checked AGAS desktop patch, installs development dependencies, creates the AGAS icons, and builds the local AionCore command.

```bash
npm run setup
npm start
```

`npm start` starts the real Paperclip development server at `http://127.0.0.1:3100`, checks its `/api/health` response, and starts the Electron desktop. In **Agent UI**, choose Paperclip to open its native interface; other local applications can be configured with their own loopback URLs. AGAS only accepts explicit `localhost`, `127.0.0.1`, or `[::1]` application addresses. A configured native app retains its own session and interface.

```bash
npm run foundations:fetch   # fetch pinned source and apply the desktop patch
npm run catalog:build       # regenerate the 279 Agency specialists from source
npm run build:desktop       # build Electron/Vite assets (not an installer)
npm run legacy:start        # run the historical prototype for comparison only
npm run check               # tests for that historical prototype
```

The catalog keeps the original persona body, source file, source commit, and SHA-256 of each source file. Its **Create Assistant** action creates a real AionCore assistant and saves that original body as its rule; using it requires a configured agent backend. Durable hubs, context/MCP handoffs, missions, and a clean-machine installer are still under implementation. This branch is not a production release.

AionUI and AionCore are Apache-2.0 licensed; Paperclip and Agency are MIT licensed. Their pinned upstream source histories and copyright notices remain intact in the fetched checkouts. AGAS-specific work is in the `integrations/`, `scripts/`, `brand/`, and `docs/rebuild/` paths. Do not infer AGAS-specific license rights over these upstream applications from the root prototype's MIT license.
