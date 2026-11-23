// OneStock UI extension context: environment + site_id of the back-office session that opened the extension.
// Read, in order: URL query or hash parameters (site_id / siteId, env / environment), then a postMessage
// sent by the host window ({ site_id, env } at the root or under `context`). In development only, a manual
// context can be stored locally (see setDevContext).
export type HostContext = { env: string; siteId: string; source: 'url' | 'host' | 'dev' };

const DEV_KEY = 'wave-orchestrator.dev-context';

function pick(o: Record<string, unknown> | URLSearchParams | null | undefined, keys: string[]): string | undefined {
  if (!o) return undefined;
  for (const k of keys) {
    const v = o instanceof URLSearchParams ? o.get(k) : o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

const SITE_KEYS = ['site_id', 'siteId', 'siteID', 'site'];
const ENV_KEYS = ['env', 'environment', 'environment_name'];

/** Normalises host environment labels: production → prod, qualification → qualif. */
export function normalizeEnv(env: string): string {
  const e = env.toLowerCase();
  if (['production', 'prd', 'live'].includes(e)) return 'prod';
  if (['qualification', 'qa', 'recette', 'staging'].includes(e)) return 'qualif';
  return e;
}

function fromObject(o: Record<string, unknown> | URLSearchParams | null | undefined, source: HostContext['source']): HostContext | null {
  const siteId = pick(o, SITE_KEYS);
  const env = pick(o, ENV_KEYS);
  return siteId && env ? { siteId: siteId.toLowerCase(), env: normalizeEnv(env), source } : null;
}

export function setDevContext(ctx: { env: string; siteId: string } | null) {
  try {
    if (ctx) localStorage.setItem(DEV_KEY, JSON.stringify(ctx));
    else localStorage.removeItem(DEV_KEY);
  } catch {
    /* storage unavailable */
  }
}

function devContext(): HostContext | null {
  if (!import.meta.env.DEV) return null;
  try {
    const v = JSON.parse(localStorage.getItem(DEV_KEY) || 'null');
    return v ? fromObject(v, 'dev') : null;
  } catch {
    return null;
  }
}

/** Resolves the context; waits up to `timeoutMs` for the host's postMessage when the URL carries none. */
export function resolveHostContext(timeoutMs = 2000): Promise<HostContext | null> {
  const url = new URL(window.location.href);
  const direct = fromObject(url.searchParams, 'url') || fromObject(new URLSearchParams(url.hash.replace(/^#/, '')), 'url');
  if (direct) return Promise.resolve(direct);
  if (window.parent === window) return Promise.resolve(devContext());

  return new Promise((resolve) => {
    const done = (ctx: HostContext | null) => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve(ctx);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent || !e.data || typeof e.data !== 'object') return;
      const data = e.data as Record<string, unknown>;
      const ctx = fromObject(data, 'host') || fromObject(data.context as Record<string, unknown>, 'host') || fromObject(data.payload as Record<string, unknown>, 'host');
      if (ctx) done(ctx);
    };
    const timer = setTimeout(() => done(devContext()), timeoutMs);
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'wave-orchestrator:ready', request: 'context' }, '*');
  });
}
