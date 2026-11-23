// Client for the Vercel API (/api/*) of the dynamic version.
import type { HostContext } from './context';

const ADMIN_KEY = 'wave-orchestrator.settings-key';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function getAdminKey(): string {
  try {
    return sessionStorage.getItem(ADMIN_KEY) || '';
  } catch {
    return '';
  }
}

export function setAdminKey(key: string) {
  try {
    sessionStorage.setItem(ADMIN_KEY, key);
  } catch {
    /* storage unavailable */
  }
}

export async function api<T>(ctx: HostContext, path: string, init: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> } = {}): Promise<T> {
  const url = new URL(`/api/${path}`, window.location.origin);
  for (const [k, v] of Object.entries(init.query || {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method: init.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-OneStock-Env': ctx.env,
      'X-OneStock-Site': ctx.siteId,
      ...(getAdminKey() ? { 'X-Admin-Key': getAdminKey() } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}
