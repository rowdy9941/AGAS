import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const paperclipDir = path.join(root, 'foundations/paperclip');
const desktopDir = path.join(root, 'foundations/aionui');
const port = Number(process.env.AGAS_PAPERCLIP_PORT ?? 3100);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('AGAS_PAPERCLIP_PORT must be a valid port');
if (!existsSync(path.join(desktopDir, 'node_modules')) || !existsSync(path.join(paperclipDir, 'node_modules'))) {
  throw new Error('Run npm run setup first to install the pinned desktop and Paperclip sources.');
}

const url = `http://127.0.0.1:${port}`;
const env = { ...process.env, PATH: `${path.join(root, 'scripts/bin')}${path.delimiter}${process.env.PATH ?? ''}`, PORT: String(port), AGAS_PAPERCLIP_URL: url, PAPERCLIP_TELEMETRY_DISABLED: '1' };
const children = new Set();
let stopped = false;
function start(command, args, cwd) {
  const child = spawn(command, args, { cwd, env, stdio: 'inherit' });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}
function stop() {
  if (stopped) return;
  stopped = true;
  for (const child of children) child.kill();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
const paperclip = start('corepack', ['pnpm', '--filter', '@paperclipai/server', 'exec', 'tsx', '../scripts/dev-runner.ts', 'dev', '--bind', 'loopback'], paperclipDir);
let paperclipExit = false;
paperclip.on('exit', (code) => {
  paperclipExit = true;
  if (!stopped) { console.error(`Paperclip exited before AGAS (${code}).`); stop(); process.exitCode = code || 1; }
});

async function ready() {
  const deadline = Date.now() + 150_000;
  while (!stopped && !paperclipExit && Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) });
      const health = await response.json();
      if (response.ok && health.status === 'ok' && typeof health.serverVersion === 'string') return;
    } catch { /* Paperclip is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Paperclip did not become ready at ${url}/api/health`);
}

try {
  await ready();
  if (!stopped) {
    console.log(`Paperclip ready at ${url}; starting AGAS desktop.`);
    const desktop = start('bun', ['run', 'start'], desktopDir);
    const exitCode = await new Promise((resolve) => desktop.once('exit', (code) => resolve(code)));
    process.exitCode = exitCode || 0;
  }
} catch (error) {
  if (!paperclipExit && !stopped) console.error(error);
  process.exitCode = 1;
} finally {
  stop();
}
