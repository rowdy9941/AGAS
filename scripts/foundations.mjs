import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(readFileSync(path.join(root, 'runtime/foundations.lock.json'), 'utf8'));
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
function output(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'Git inspection failed');
  return result.stdout.trim();
}
const action = process.argv[2] ?? 'fetch';
if (action === 'fetch') {
  mkdirSync(path.join(root, 'foundations'), { recursive: true });
  for (const source of lock.sources) {
    const destination = path.join(root, source.path);
    if (!existsSync(destination)) {
      run('git', ['init', destination]);
      run('git', ['remote', 'add', 'origin', source.url], destination);
      run('git', ['fetch', '--depth=1', 'origin', source.commit], destination);
      run('git', ['checkout', '--detach', 'FETCH_HEAD'], destination);
    }
    if (output(['rev-parse', 'HEAD'], destination) !== source.commit) throw new Error(`${source.id}: wrong source commit; refusing to overwrite`);
    console.log(`${source.id}: pinned ${source.commit}`);
  }
  const ui = path.join(root, 'foundations/aionui');
  const patch = path.join(root, 'integrations/aionui/agas.patch');
  if (existsSync(patch)) {
    const alreadyApplied = spawnSync('git', ['apply', '--reverse', '--check', patch], { cwd: ui, stdio: 'ignore' }).status === 0;
    if (!alreadyApplied) {
      run('git', ['apply', '--check', patch], ui);
      run('git', ['apply', patch], ui);
    }
  }
} else if (action === 'install') {
  run('bun', ['install', '--frozen-lockfile'], path.join(root, 'foundations/aionui'));
  run('pnpm', ['install', '--frozen-lockfile'], path.join(root, 'foundations/paperclip'));
  run('node', ['scripts/brand.mjs']);
  run('cargo', ['install', '--path', 'crates/aionui-app', '--locked'], path.join(root, 'foundations/aioncore'));
} else if (action === 'desktop') {
  run('bun', ['run', 'start'], path.join(root, 'foundations/aionui'));
} else if (action === 'build') {
  run('node', ['scripts/brand.mjs']);
  run('bun', ['run', 'package'], path.join(root, 'foundations/aionui'));
} else if (action === 'paperclip') {
  run('pnpm', ['dev'], path.join(root, 'foundations/paperclip'));
} else throw new Error(`Unknown command: ${action}`);
