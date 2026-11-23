// OneStock UI extension context: environment + site_id of the back-office session that opened the extension.
// Read, in order: URL query or hash parameters (site_id / siteId, env / environment), then a postMessage
// sent by the host window ({ site_id, env } at the root or under `context`). When the host sends none,
// the environment and site ID entered in the settings tab are used (kept in this browser).
export type HostContext = { env: string; siteId: string; source: 'url' | 'host' | 'manual' };

const MANUAL_KEY = 'wave-orchestrator.manual-context';

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

/** Saves (or clears) the environment and site ID entered in the settings tab. */
export function setManualContext(ctx: { env: string; siteId: string } | null): HostContext | null {
  try {
    if (ctx) localStorage.setItem(MANUAL_KEY, JSON.stringify(ctx));
    else localStorage.removeItem(MANUAL_KEY);
  } catch {
    /* storage unavailable */
  }
  return ctx ? fromObject(ctx, 'manual') : null;
}

export function getManualContext(): HostContext | null {
  try {
    const v = JSON.parse(localStorage.getItem(MANUAL_KEY) || 'null');
    return v ? fromObject(v, 'manual') : null;
  } catch {
    return null;
  }
}

/** Resolves the host context (URL, then postMessage), else the manual one; null when neither exists. */
export function resolveHostContext(timeoutMs = 2000): Promise<HostContext | null> {
  const url = new URL(window.location.href);
  const direct = fromObject(url.searchParams, 'url') || fromObject(new URLSearchParams(url.hash.replace(/^#/, '')), 'url');
  if (direct) return Promise.resolve(direct);
  if (window.parent === window) return Promise.resolve(getManualContext());

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
    const timer = setTimeout(() => done(getManualContext()), timeoutMs);
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'wave-orchestrator:ready', request: 'context' }, '*');
  });
}
