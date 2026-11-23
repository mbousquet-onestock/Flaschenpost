// Shared helpers for the Vercel functions (Web Request/Response signature).
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

/** Wraps a handler so thrown HttpErrors become JSON error responses. */
export const handle =
  (fn: (req: Request) => Promise<Response>) =>
  async (req: Request): Promise<Response> => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Internal error' }, 500);
    }
  };

export type Tenant = { env: string; siteId: string };

/** Connection context sent by the front-end: environment + OneStock site ID. */
export function tenantOf(req: Request): Tenant {
  const url = new URL(req.url);
  const env = (req.headers.get('x-onestock-env') || url.searchParams.get('env') || '').toLowerCase();
  const siteId = (req.headers.get('x-onestock-site') || url.searchParams.get('site_id') || '').toLowerCase();
  if (!/^[a-z0-9-]{1,20}$/.test(env)) throw new HttpError(400, 'Missing or invalid environment');
  if (!/^[a-z0-9_-]{1,32}$/.test(siteId)) throw new HttpError(400, 'Missing or invalid site_id');
  return { env, siteId };
}

/** Settings changes require X-Admin-Key when SETTINGS_ADMIN_KEY is configured on the deployment. */
export function requireAdmin(req: Request) {
  const key = process.env.SETTINGS_ADMIN_KEY;
  if (key && req.headers.get('x-admin-key') !== key) throw new HttpError(403, 'Invalid settings key');
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}
