import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'setup';
const required = mode === 'build'
  ? ['bun', 'python3']
  : ['git', 'bun', 'corepack', 'cargo', 'python3'];
const help = {
  git: 'https://git-scm.com/downloads',
  bun: 'https://bun.sh/docs/installation',
  corepack: 'Run npm install --global corepack after installing Node.js 24.',
  cargo: 'https://www.rust-lang.org/tools/install',
  python3: 'Install Python 3 with your operating system package manager.',
};
const problems = [];
const [major, minor] = process.versions.node.split('.').map(Number);

if (major < 24 || (major === 24 && minor < 11)) {
  problems.push(`Node.js 24.11 or newer is required (found ${process.version}). https://nodejs.org/en/download`);
}
for (const command of required) {
  const result = spawnSync(command, ['--version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    problems.push(`${command} is unavailable. ${help[command]}`);
  }
}

if (mode === 'build') {
  const uiPackage = path.join(root, 'foundations/aionui/package.json');
  try {
    if (!existsSync(uiPackage)) throw new Error('AionUI source is missing');
    createRequire(uiPackage).resolve('sharp');
  } catch {
    problems.push('AionUI dependencies are incomplete (sharp is missing). Run npm run setup first.');
  }
}

if (problems.length) {
  console.error('AGAS development prerequisites are not ready:');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('Fix these items, then rerun npm run setup in your existing AGAS checkout.');
  process.exitCode = 1;
} else {
  console.log(`AGAS ${mode} prerequisites are ready.`);
}
