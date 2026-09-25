/** Desktop-only contract. The renderer has no direct filesystem or process access. */
export type AgasWorkspace = { id: string; name: string; url: string; status: 'unconfigured' | 'reachable' | 'unreachable' };
export type SurfaceBounds = { x: number; y: number; width: number; height: number };
export type AgasDesktop = {
  list: () => Promise<AgasWorkspace[]>;
  configure: (id: string, url: string) => Promise<void>;
  open: (id: string, bounds: SurfaceBounds) => Promise<void>;
  resize: (bounds: SurfaceBounds) => Promise<void>;
  close: () => Promise<void>;
};
declare global { interface Window { agas?: AgasDesktop; } }
