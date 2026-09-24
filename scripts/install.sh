#!/usr/bin/env sh
set -eu

node -e "const major=Number(process.versions.node.split('.')[0]); if(major<22){console.error('AGAS requires Node.js 22 or newer'); process.exit(1)}"
npm ci --omit=dev
mkdir -p data/vault workspace
printf '%s\n' "AGAS installed. Set AGAS_BOOTSTRAP_TOKEN and run: npm start"
