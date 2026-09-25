/** Native surfaces only point to explicit loopback applications. */
export function validateWorkspaceUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid workspace URL');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Workspace requires HTTP or HTTPS');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Workspace must use loopback');
  if (url.username || url.password || url.hash || url.search) throw new Error('Credentials and query tokens are not allowed in workspace URLs');
  return url.href;
}
export const WORKSPACES = [
  { id: 'paperclip', name: 'Paperclip' },
  { id: 'hermes', name: 'Hermes' },
  { id: 'openclaw', name: 'OpenClaw' },
  { id: 'opencode', name: 'OpenCode' },
] as const;
export function validateWorkspaceId(value: unknown): asserts value is string {
  if (!WORKSPACES.some((entry) => entry.id === value)) throw new Error('Unknown native workspace');
}
