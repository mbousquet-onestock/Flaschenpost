// Calls to the OneStock API on behalf of a tenant (env + site_id), with token caching in the database.
import { decrypt } from './crypto.js';
import { getConfig, ready } from './db.js';
import { HttpError, Tenant } from './http.js';

const API_VERSION = 'v3';

/** prod → https://c00.api.onestock-retail.com, any other env → https://c00.api.<env>.onestock-retail.com */
export function baseUrl(t: Tenant): string {
  // Local tests only: e.g. ONESTOCK_BASE_URL_TEMPLATE=http://localhost:4010/{env}/{site_id}
  const tpl = process.env.ONESTOCK_BASE_URL_TEMPLATE;
  if (tpl) return tpl.replace('{env}', t.env).replace('{site_id}', t.siteId) + `/${API_VERSION}`;
  const host = t.env === 'prod' || t.env === 'production' ? 'api.onestock-retail.com' : `api.${t.env}.onestock-retail.com`;
  return `https://${t.siteId}.${host}/${API_VERSION}`;
}

async function post(url: string, payload: unknown, getOverride: boolean) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(getOverride ? { 'X-HTTP-Method-Override': 'GET' } : {}) },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(25_000),
  }).catch((e) => {
    throw new HttpError(502, `OneStock API unreachable: ${(e as Error).message}`);
  });
  const text = await res.text();
  let data: any = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, ok: res.ok, data, text };
}

/** POST /login. Returns the token or throws a 401/502 HttpError. */
export async function login(t: Tenant, user: string, password: string): Promise<string> {
  const r = await post(`${baseUrl(t)}/login`, { site_id: t.siteId, user_id: user, password }, false);
  if (r.ok && r.data?.token) return r.data.token as string;
  if (r.status === 400 || r.status === 401 || r.status === 403) throw new HttpError(401, 'OneStock login refused: check the user and password');
  throw new HttpError(502, `OneStock login failed (${r.status})`);
}

async function freshToken(t: Tenant): Promise<string> {
  const cfg = await getConfig(t);
  if (!cfg?.api_user || !cfg.api_password_enc) throw new HttpError(409, 'The OneStock connection is not configured for this site');
  const token = await login(t, cfg.api_user, decrypt(cfg.api_password_enc));
  const db = await ready();
  await db`update tenant_config set token = ${token}, token_at = now() where env = ${t.env} and site_id = ${t.siteId}`;
  return token;
}

/** Calls a OneStock route. GET routes are sent as POST + X-HTTP-Method-Override: GET (body allowed). */
export async function call(t: Tenant, path: string, payload: Record<string, unknown>, method: 'GET' | 'POST' = 'GET') {
  const cfg = await getConfig(t);
  let token = cfg?.token || (await freshToken(t));
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await post(`${baseUrl(t)}${path}`, { ...payload, site_id: t.siteId, token }, method === 'GET');
    if (r.ok) return r.data;
    if (r.status === 401 && attempt === 0) {
      token = await freshToken(t);
      continue;
    }
    throw new HttpError(502, `OneStock ${path} failed (${r.status}): ${(r.data?.message || r.text || '').toString().slice(0, 300)}`);
  }
  throw new HttpError(502, `OneStock ${path} failed`);
}
