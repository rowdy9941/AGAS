import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'node:net';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const paperclipPort = Number(process.env.AGAS_PAPERCLIP_PORT ?? 3100);
const webPort = Number(process.env.AGAS_WEBUI_PORT ?? 25809);
async function requireFreePort(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  await new Promise((resolve) => server.close(resolve));
}
await requireFreePort(paperclipPort);
await requireFreePort(webPort);
const child = spawn(process.execPath, [path.join(root, 'scripts/web-preview.mjs')], {
  cwd: root,
  env: { ...process.env, AGAS_PREVIEW_QUIET: '1' },
  stdio: 'inherit',
});
let exited = false;
child.once('exit', (code) => {
  exited = true;
  if (code !== 0) console.error(`AGAS preview exited before smoke completion (${code}).`);
});

async function probe(url, check) {
  const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
  if (!response.ok) return false;
  return check(await response.json());
}

async function waitFor(name, url, check) {
  const deadline = Date.now() + 390_000;
  while (!exited && Date.now() < deadline) {
    try {
      if (await probe(url, check)) {
        console.log(`${name}: live response from ${url}`);
        return;
      }
    } catch { /* A real service is not ready yet. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${name}: no live response at ${url}`);
}

try {
  await waitFor('Paperclip', `http://127.0.0.1:${paperclipPort}/api/health`,
    (body) => body?.status === 'ok' && typeof body.serverVersion === 'string');
  await waitFor('AionCore via AGAS WebUI', `http://127.0.0.1:${webPort}/api/auth/status`,
    (body) => typeof body?.needs_setup === 'boolean');
  if (exited) throw new Error('The preview stopped before both services could be checked');
  console.log('Live foundation smoke passed. Electron, Paperclip persistence, and missions are separate gates.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (!exited) {
    const completion = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await Promise.race([completion, new Promise((resolve) => setTimeout(resolve, 10_000))]);
    if (!exited) child.kill('SIGKILL');
  }
}
