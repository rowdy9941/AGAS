#!/usr/bin/env sh
set -eu

node -e "const [major,minor]=process.versions.node.split('.').map(Number); if(major<24 || major===24 && minor<11){console.error('The AGAS development preview requires Node.js 24.11 or newer for Paperclip'); process.exit(1)}"
for dependency in git bun corepack cargo python3; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    printf 'Missing %s. Install it before preparing the AGAS development preview.\n' "$dependency" >&2
    exit 1
  fi
done
npm run setup
npm run build:desktop
npm run smoke:preview
printf '%s\n' "AGAS development preview is ready. Run 'npm start' for Electron or 'npm run preview:web' for a localhost browser preview. This is not a packaged release."
