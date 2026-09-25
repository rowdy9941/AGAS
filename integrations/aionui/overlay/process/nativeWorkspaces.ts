import { app, ipcMain, WebContentsView } from 'electron';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { AgasWorkspace, SurfaceBounds } from '@/common/platform/agas';
import { validateWorkspaceId, validateWorkspaceUrl, WORKSPACES } from './workspacePolicy';

/** Isolate each native app from AGAS preload, credentials and other app sessions. */
export function registerNativeWorkspaces(owner: BrowserWindow): void {
  let surface: WebContentsView | undefined;
  let epoch = 0;
  let saveQueue = Promise.resolve();
  const channels = new Set<string>();
  const configFile = path.join(app.getPath('userData'), 'agas', 'native-workspaces.json');
  const close = (): void => {
    epoch++;
    if (!surface) return;
    if (!owner.isDestroyed()) owner.contentView.removeChildView(surface);
    if (!surface.webContents.isDestroyed()) surface.webContents.close();
    surface = undefined;
  };
  const readConfig = async (): Promise<Record<string, string>> => {
    try {
      const value: unknown = JSON.parse(await readFile(configFile, 'utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid workspace configuration');
      const result: Record<string, string> = {};
      for (const [id, url] of Object.entries(value)) { validateWorkspaceId(id); result[id] = validateWorkspaceUrl(url); }
      return result;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const configured = process.env.AGAS_PAPERCLIP_URL;
        return configured ? { paperclip: validateWorkspaceUrl(configured) } : {};
      }
      throw error;
    }
  };
  const resize = (value: unknown): void => {
    if (!surface || owner.isDestroyed()) return;
    const bounds = value as SurfaceBounds;
    if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) throw new Error('Invalid workspace bounds');
    const zoom = owner.webContents.getZoomFactor();
    const [width, height] = owner.getContentSize();
    const x = Math.min(width, Math.max(0, Math.round(bounds.x * zoom)));
    const y = Math.min(height, Math.max(0, Math.round(bounds.y * zoom)));
    surface.setBounds({ x, y, width: Math.min(width - x, Math.max(0, Math.round(bounds.width * zoom))), height: Math.min(height - y, Math.max(0, Math.round(bounds.height * zoom))) });
  };
  const handle = (channel: string, fn: (...args: unknown[]) => unknown): void => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      if (event.sender !== owner.webContents || event.senderFrame !== owner.webContents.mainFrame) throw new Error('Native workspace access denied');
      return fn(...args);
    });
    channels.add(channel);
  };
  handle('agas:workspaces:list', async (): Promise<AgasWorkspace[]> => {
    await saveQueue;
    const config = await readConfig();
    return Promise.all(WORKSPACES.map(async (item) => {
      const url = config[item.id] ?? '';
      if (!url) return { ...item, url, status: 'unconfigured' as const };
      try {
        const response = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(2500) });
        await response.body?.cancel();
        return { ...item, url, status: response.status < 500 ? 'reachable' as const : 'unreachable' as const };
      } catch { return { ...item, url, status: 'unreachable' as const }; }
    }));
  });
  handle('agas:workspaces:configure', async (id, value) => {
    validateWorkspaceId(id);
    const url = value === '' ? '' : validateWorkspaceUrl(value);
    const save = saveQueue.then(async () => {
      const config = await readConfig();
      if (url) config[id] = url; else delete config[id];
      await mkdir(path.dirname(configFile), { recursive: true, mode: 0o700 });
      await writeFile(configFile + '.tmp', JSON.stringify(config), { mode: 0o600 });
      await rename(configFile + '.tmp', configFile);
    });
    saveQueue = save.catch(() => {});
    await save; close();
  });
  handle('agas:workspaces:open', async (id, bounds) => {
    validateWorkspaceId(id);
    close(); const request = epoch;
    await saveQueue;
    const config = await readConfig();
    if (request !== epoch || owner.isDestroyed()) return;
    const url = config[id];
    if (!url) throw new Error('Configure the native application URL first');
    const origin = new URL(url).origin;
    const originKey = createHash('sha256').update(origin).digest('hex').slice(0, 16);
    const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: `persist:agas-native-${id}-${originKey}` } });
    surface = view;
    view.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    view.webContents.session.setPermissionCheckHandler(() => false);
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const guard = (event: Electron.Event, destination: string): void => {
      try { if (new URL(destination).origin !== origin) event.preventDefault(); } catch { event.preventDefault(); }
    };
    view.webContents.on('will-navigate', guard);
    view.webContents.on('will-redirect', guard);
    view.webContents.on('will-attach-webview', (event) => event.preventDefault());
    owner.contentView.addChildView(view);
    try { resize(bounds); await view.webContents.loadURL(url); }
    catch (error) { if (surface === view) close(); throw error; }
  });
  handle('agas:workspaces:resize', resize);
  handle('agas:workspaces:close', close);
  owner.webContents.on('did-start-navigation', (_event, _url, _inPlace, mainFrame) => { if (mainFrame) close(); });
  owner.webContents.on('render-process-gone', close);
  owner.on('closed', () => { close(); for (const channel of channels) ipcMain.removeHandler(channel); });
}
