// Wave strategies of a site (environment + site ID).
// GET    /api/strategies        → { strategies: Scenario[] }
// PUT    /api/strategies        → upsert one strategy (body = strategy, with its id)
// PATCH  /api/strategies        → save the display order { order: [id, …] }
// DELETE /api/strategies?id=    → delete one strategy
import { ready } from './_lib/db.js';
import { body, handle, HttpError, json, tenantOf } from './_lib/http.js';

const MAX_BYTES = 64 * 1024;

export const GET = handle(async (req) => {
  const t = tenantOf(req);
  const db = await ready();
  const rows = await db<{ data: Record<string, unknown> }[]>`
    select data from strategies where env = ${t.env} and site_id = ${t.siteId} order by position nulls last, created_at, id`;
  return json({ strategies: rows.map((r) => r.data) });
});

export const PUT = handle(async (req) => {
  const t = tenantOf(req);
  const s = await body<Record<string, unknown>>(req);
  if (typeof s.id !== 'string' || !/^[\w-]{1,64}$/.test(s.id)) throw new HttpError(400, 'Invalid strategy id');
  if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 200) throw new HttpError(400, 'Invalid strategy name');
  if (JSON.stringify(s).length > MAX_BYTES) throw new HttpError(400, 'Strategy too large');
  const db = await ready();
  await db`
    insert into strategies (env, site_id, id, data)
    values (${t.env}, ${t.siteId}, ${s.id}, ${db.json(s as never)})
    on conflict (env, site_id, id) do update set data = excluded.data, updated_at = now()`;
  return json({ ok: true });
});

// PATCH /api/strategies  { order: [id, …] } → saves the display order of the strategies.
export const PATCH = handle(async (req) => {
  const t = tenantOf(req);
  const { order } = await body<{ order?: string[] }>(req);
  if (!Array.isArray(order) || order.length > 1000 || order.some((id) => typeof id !== 'string')) throw new HttpError(400, 'order must be a list of strategy IDs');
  const db = await ready();
  await db.begin(async (tx) => {
    for (const [position, id] of order.entries())
      await tx`update strategies set position = ${position} where env = ${t.env} and site_id = ${t.siteId} and id = ${id}`;
  });
  return json({ ok: true });
});

export const DELETE = handle(async (req) => {
  const t = tenantOf(req);
  const id = new URL(req.url).searchParams.get('id');
  if (!id) throw new HttpError(400, 'id is required');
  const db = await ready();
  const r = await db`delete from strategies where env = ${t.env} and site_id = ${t.siteId} and id = ${id}`;
  return json({ ok: true, deleted: r.count });
});
