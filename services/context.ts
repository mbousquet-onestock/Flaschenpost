// OneStock UI extension context (see "UI Extensibility - How to develop UI Extensions").
//
// OneStock loads the extension in an iframe with URL parameters
//   extension_id, user_id, site_id, lang, timezone, locale, parent_url, injection_point_path, host_app
// The inline script of index.html posts { type: "extension_ready" } to parent_url's origin as soon as the
// page loads, and keeps the host's reply { type: "onestock_data", data: { api_url, extension_signature, … } }.
// The environment is derived from api_url: https://c00.api.qualif.onestock-retail.com → qualif,
// https://c00.api.onestock-retail.com → prod.
//
// Outside OneStock (or when the host sends nothing), the URL parameters env + site_id are used, then the
// environment and site ID entered in the settings tab (kept in this browser).
export type HostContext = {
  env: string;
  siteId: string;
  source: 'host' | 'url' | 'manual';
  apiUrl?: string;
  signature?: string;
  extensionId?: string;
  userId?: string;
  lang?: string;
};

type Handshake = { origin: string; data: Record<string, unknown> | null };
declare global {
  interface Window {
    __onestockHandshake?: Handshake;
  }
}

const MANUAL_KEY = 'wave-orchestrator.manual-context';
const HOST_TIMEOUT_MS = 15000;

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Normalises environment labels: production → prod, qualification → qualif. */
export function normalizeEnv(env: string): string {
  const e = env.toLowerCase();
  if (['production', 'prd', 'live'].includes(e)) return 'prod';
  if (['qualification', 'qa', 'recette', 'staging'].includes(e)) return 'qualif';
  return e;
}

/** Environment of a OneStock API URL, or undefined when the host is not a OneStock API host. */
export function envFromApiUrl(apiUrl: string | undefined): string | undefined {
  if (!apiUrl) return undefined;
  try {
    const m = new URL(apiUrl).hostname.match(/^[a-z0-9_-]+\.api\.(?:([a-z0-9-]+)\.)?onestock-retail\.com$/i);
    return m ? normalizeEnv(m[1] || 'prod') : undefined;
  } catch {
    return undefined;
  }
}

const valid = (env?: string, siteId?: string) => !!env && !!siteId && /^[a-z0-9-]{1,20}$/.test(env) && /^[a-z0-9_-]{1,32}$/.test(siteId);

export function setManualContext(ctx: { env: string; siteId: string } | null): HostContext | null {
  try {
    if (ctx) localStorage.setItem(MANUAL_KEY, JSON.stringify(ctx));
    else localStorage.removeItem(MANUAL_KEY);
  } catch {
    /* storage unavailable */
  }
  return ctx && valid(ctx.env, ctx.siteId) ? { env: ctx.env, siteId: ctx.siteId, source: 'manual' } : null;
}

export function getManualContext(): HostContext | null {
  try {
    const v = JSON.parse(localStorage.getItem(MANUAL_KEY) || 'null');
    return v && valid(v.env, v.siteId) ? { env: v.env, siteId: v.siteId, source: 'manual' } : null;
  } catch {
    return null;
  }
}

/** Waits for the host's onestock_data (already received or arriving within the timeout). */
function hostData(timeoutMs: number): Promise<Record<string, unknown> | null> {
  const hs = window.__onestockHandshake;
  if (!hs) return Promise.resolve(null);
  if (hs.data) return Promise.resolve(hs.data);
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener('onestock-data', done);
      clearTimeout(timer);
      resolve(hs.data);
    };
    const timer = setTimeout(done, timeoutMs);
    window.addEventListener('onestock-data', done);
  });
}

export async function resolveHostContext(): Promise<HostContext | null> {
  const params = new URLSearchParams(window.location.search);
  const siteParam = str(params.get('site_id'))?.toLowerCase();

  const data = await hostData(HOST_TIMEOUT_MS);
  if (data) {
    const apiUrl = str(data.api_url);
    const siteId = siteParam || str(data.site_id)?.toLowerCase();
    const env = envFromApiUrl(apiUrl) || (str(data.env) && normalizeEnv(str(data.env)!));
    if (valid(env, siteId))
      return {
        env: env!,
        siteId: siteId!,
        source: 'host',
        apiUrl,
        signature: str(data.extension_signature),
        extensionId: str(params.get('extension_id')),
        userId: str(params.get('user_id')),
        lang: str(params.get('lang')),
      };
  }

  const envParam = str(params.get('env') || params.get('environment'));
  if (valid(envParam && normalizeEnv(envParam), siteParam)) return { env: normalizeEnv(envParam!), siteId: siteParam!, source: 'url' };

  const manual = getManualContext();
  // Inside OneStock, the manual environment only applies to the site that opened the extension.
  if (manual && (!siteParam || manual.siteId === siteParam)) return manual;
  return null;
}
