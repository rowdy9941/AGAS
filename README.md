# AGAS — Accessible General AI System

**BY RAGHUNATH.D** · [Implementation status](docs/rebuild/STATUS.md) · [Approved architecture](docs/rebuild/approved-plan.md)

AGAS is being rebuilt as a real desktop application on the pinned AionUI/AionCore source. The finalized artwork is [brand/AGAS_Logo.jpg](brand/AGAS_Logo.jpg). This branch connects the desktop shell to actual local application interfaces and generates its Agency specialist catalog from the upstream source. The original control-plane prototype remains available for reference, but its simulator is not evidence that a real mission ran.

## Development setup

Prerequisites: Node.js 24.11+, Python 3, Bun, Corepack (for pnpm 9.15.4), and Rust/Cargo. The pinned sources are recorded in [runtime/foundations.lock.json](runtime/foundations.lock.json). Setup fetches those commits, applies the checked AGAS desktop patch, installs development dependencies, builds Paperclip's native runner and the local AionCore command, and creates the AGAS icons. First-time setup compiles substantial Rust code. This is a **source development setup**, not a one-click installer.

On Ubuntu, prepare these tools before running setup. Use the official [Node.js/nvm](https://github.com/nvm-sh/nvm#install--update-script), [Bun](https://bun.sh/docs/installation), and [Rust](https://www.rust-lang.org/tools/install) installers if they are not already installed:

```bash
sudo apt update
sudo apt install -y curl unzip python3 git build-essential
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm install 24
nvm use 24
npm install --global corepack
curl -fsSL https://bun.com/install | bash
export PATH="$HOME/.bun/bin:$PATH"
if ! command -v cargo >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
fi
[ ! -s "$HOME/.cargo/env" ] || . "$HOME/.cargo/env"
```

Run `node -v`, `bun --version`, `corepack --version`, and `cargo --version` to verify your shell sees each tool. In a new terminal, run `nvm use` from this checkout to select the version in `.nvmrc`. If the source checkouts were downloaded during an earlier failed attempt, keep your existing clone: `npm run setup` reuses the pinned sources. The setup preflight now reports missing tools before fetching sources, and `npm run build:desktop` explains missing AionUI dependencies before using `sharp`.

```bash
npm run setup
npm start
```

`npm start` starts the real Paperclip development server at `http://127.0.0.1:3100`, checks its `/api/health` response, and starts the Electron desktop. In **Agent UI**, choose Paperclip to open its native interface; other local applications can be configured with their own loopback URLs. AGAS only accepts explicit `localhost`, `127.0.0.1`, or `[::1]` application addresses. A configured native app retains its own session and interface.

For a **browser preview of the current AionUI foundation**, after `npm run setup`:

```bash
npm run build:desktop
npm run smoke:preview
npm run preview:web
```

Open `http://127.0.0.1:25809` on the same machine. The preview launches a real Paperclip development server and AionCore-backed AionUI WebUI, and stores its separate local development data in `data/web-preview/`. The first-run WebUI password is printed by AionUI in your terminal; change it after login. Paperclip is available separately at `http://127.0.0.1:3100`. The browser preview binds only to loopback. **Electron-only Agent UI embedding is unavailable in the browser**; use `npm start` to test native workspaces. This preview is not a publicly hosted AGAS release, and the smoke command checks service readiness only, not mission completion or restart persistence.

```bash
npm run foundations:fetch   # fetch pinned source and apply the desktop patch
npm run catalog:build       # regenerate the 279 Agency specialists from source
npm run build:desktop       # build Electron/Vite assets (not an installer)
npm run legacy:start        # run the historical prototype for comparison only
npm run check               # tests for that historical prototype
```

The catalog keeps the original persona body, source file, source commit, and SHA-256 of each source file. Its **Create Assistant** action creates a real AionCore assistant and saves that original body as its rule; using it requires a configured agent backend. Durable hubs, context/MCP handoffs, missions, and a clean-machine installer are still under implementation. This branch is not a production release.

AionUI and AionCore are Apache-2.0 licensed; Paperclip and Agency are MIT licensed. Their pinned upstream source histories and copyright notices remain intact in the fetched checkouts. AGAS-specific work is in the `integrations/`, `scripts/`, `brand/`, and `docs/rebuild/` paths. Do not infer AGAS-specific license rights over these upstream applications from the root prototype's MIT license.
