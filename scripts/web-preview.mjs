import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'node:net';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const paperclipDir = path.join(root, 'foundations/paperclip');
const desktopDir = path.join(root, 'foundations/aionui');

function port(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be a valid TCP port`);
  }
  return value;
}

const paperclipPort = port('AGAS_PAPERCLIP_PORT', 3100);
const webPort = port('AGAS_WEBUI_PORT', 25809);
if (paperclipPort === webPort) throw new Error('AGAS_PAPERCLIP_PORT and AGAS_WEBUI_PORT must differ');

async function requireFreePort(value) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(value, '127.0.0.1', resolve);
  });
  await new Promise((resolve) => server.close(resolve));
}

if (!existsSync(path.join(desktopDir, 'node_modules')) || !existsSync(path.join(paperclipDir, 'node_modules'))) {
  throw new Error('Run npm run setup to install the pinned AionUI, AionCore and Paperclip sources.');
}
if (!existsSync(path.join(desktopDir, 'out/renderer/index.html'))) {
  throw new Error('Run npm run build:desktop before launching the browser preview.');
}
await requireFreePort(paperclipPort);
await requireFreePort(webPort);

const dataDir = path.resolve(process.env.AGAS_PREVIEW_DATA_DIR ?? path.join(root, 'data/web-preview'));
mkdirSync(dataDir, { recursive: true });
const paperclipUrl = `http://127.0.0.1:${paperclipPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const env = {
  ...process.env,
  PATH: `${path.join(root, 'scripts/bin')}${path.delimiter}${process.env.PATH ?? ''}`,
  PORT: String(paperclipPort),
  AGAS_PAPERCLIP_URL: paperclipUrl,
  PAPERCLIP_TELEMETRY_DISABLED: '1',
  AIONUI_PORT: String(webPort),
  AIONUI_HOST: '127.0.0.1',
  AIONUI_ALLOW_REMOTE: '0',
  AIONUI_DATA_DIR: dataDir,
};

const children = new Set();
let stopping = false;
function start(command, args, cwd) {
  const child = spawn(command, args, {
    cwd, env, shell: false, detached: process.platform !== 'win32',
    stdio: process.env.AGAS_PREVIEW_QUIET === '1' ? ['ignore', 'ignore', 'inherit'] : 'inherit',
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      if (process.platform === 'win32') child.kill('SIGTERM');
      else if (child.pid) process.kill(-child.pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') console.error(error);
    }
  }
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

async function waitFor(url, accept, label, deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok && accept(await response.json())) return;
    } catch { /* The real service is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} did not become ready at ${url}`);
}

const paperclip = start('corepack', [
  'pnpm', '--filter', '@paperclipai/server', 'exec', 'tsx', '../scripts/dev-runner.ts', 'dev', '--bind', 'loopback',
], paperclipDir);
paperclip.on('error', (error) => {
  console.error(`Paperclip failed to start: ${error.message}`);
  stop();
  process.exitCode = 1;
});
paperclip.on('exit', (code) => {
  if (!stopping) {
    console.error(`Paperclip exited unexpectedly (${code}).`);
    stop();
    process.exitCode = code || 1;
  }
});

try {
  await waitFor(`${paperclipUrl}/api/health`,
    (body) => body?.status === 'ok' && typeof body.serverVersion === 'string', 'Paperclip', 150_000);
  if (!stopping) {
    const web = start('bun', ['run', 'webui', '--no-build', '--no-open'], desktopDir);
    const webExited = new Promise((resolve) => web.once('exit', resolve));
    web.on('error', (error) => {
      console.error(`AGAS WebUI failed to start: ${error.message}`);
      stop();
      process.exitCode = 1;
    });
    web.on('exit', (code) => {
      if (!stopping) {
        console.error(`AGAS WebUI exited unexpectedly (${code}).`);
        stop();
        process.exitCode = code || 1;
      }
    });
    await waitFor(`${webUrl}/api/auth/status`,
      (body) => body !== null && typeof body === 'object' && typeof body.needs_setup === 'boolean',
      'AionCore through the AGAS WebUI', 120_000);
    if (!stopping) {
      console.log(`AGAS browser preview: ${webUrl}`);
      console.log(`Paperclip workspace:  ${paperclipUrl}`);
      console.log('The WebUI uses a real AionCore backend; native Agent UI embedding requires Electron.');
      const exitCode = await webExited;
      if (!stopping) process.exitCode = exitCode || 0;
    }
  }
} catch (error) {
  if (!stopping) console.error(error);
  process.exitCode = 1;
} finally {
  stop();
}
