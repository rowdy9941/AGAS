# AGAS rebuild — implementation checkpoint

Approved by Raghunath on 25 September 2026. Work is on `rebuild/agas-foundations`; `main` remains the reviewed prototype. The finalized source artwork is `brand/AGAS_Logo.jpg` (SHA-256 `aa4995e57353d1e1b9a09125f642daea1c64325d8fcf6052a246b5b8c1d57a97`). UI identity is **AGAS — Accessible General AI System, BY RAGHUNATH.D**.

## Reproducible desktop slice

`runtime/foundations.lock.json` pins the AionUI fork, AionCore v0.2.2, actual Paperclip, and Agency. `node scripts/foundations.mjs fetch` fetches the pinned commits, applies all AGAS patches in `integrations/aionui/patches/`, and generates the Agency catalog. The source patch has been replayed and reverse-checked on a clean checkout. `scripts/brand.mjs` derives desktop/PWA icons from the original image. The AionUI source keeps its copyright/license notices.

The new **Agent UI** has a native local-application panel and a searchable catalog of 279 original Agency personas, each with a source path, pinned commit, and source SHA-256. The local application panel is built to open Paperclip, Hermes, OpenClaw, or OpenCode at explicit loopback URLs inside sandboxed, session-separated Electron views. A catalog specialist can be created as a real AionCore assistant with the original prompt saved as its rule; AionCore requires an available configured agent backend. Creation rolls back when the rule cannot be saved. `npm start` launches a Paperclip development server, waits for its health response, then starts the actual Electron app after setup. The old console starts only with `npm run legacy:start`.

Checks in this workspace: TypeScript and lint passed (zero errors); all 13 i18n locales and key types validated; the desktop suite passed 4,998 tests (5 skipped), including Agency assistant and native IPC tests; Electron/Vite production assets built with a 4 GB Node heap and include the catalog. The root prototype's 35 tests passed after scoping discovery to its own `test/` directory. Paperclip dependency installation and its plugin SDK build completed with pinned pnpm 9.15.4. The managed sandbox denies the `tsx` launcher's Unix IPC pipe, so `npm start` could not complete here. The sandbox also prevented Electron's executable download, and Rust/Cargo is unavailable. A real Electron UI session, live AionCore assistant creation, full Paperclip integration test, bundled AionCore binary, and clean-machine installer have not been verified in this environment.

## Next product gates

Verify actual desktop launch with Paperclip and AionCore on a host with Electron/Rust. Build runtime lifecycle and cancellation with real child processes; activate original Agency personas in native runtimes; implement persistent hubs and scoped context/MCP handoffs; execute missions with recipient acknowledgement and evidence-backed acceptance; assemble and test installers on clean supported operating systems. Simulated outcomes are not release evidence.
