#!/usr/bin/env sh
set -eu

node scripts/preflight.mjs
npm run setup
npm run build:desktop
npm run smoke:preview
printf '%s\n' "AGAS development preview is ready. Run 'npm start' for Electron or 'npm run preview:web' for a localhost browser preview. This is not a packaged release."
