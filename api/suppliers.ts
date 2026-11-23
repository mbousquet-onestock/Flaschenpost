// Suppliers of a site: supplier stock points of OneStock (classification endpoint_type = configured type)
// plus suppliers entered in the app (manual entry or Excel import), each with its franco.
// GET    /api/suppliers          → { suppliers: [{ id, name, franco, shipping, source }], warning? }
// POST   /api/suppliers          → create or rename local suppliers { suppliers: [{ id, name }] }
// DELETE /api/suppliers?id=      → delete a local supplier with its prices and franco
import { getConfig, ready } from './_lib/db.js';
import { body, handle, HttpError, json, tenantOf } from './_lib/http.js';
import { call } from './_lib/onestock.js';

const PAGE = 100;
const validId = (s: unknown): s is string => typeof s === 'string' && /^[\w.@:/ -]{1,128}$/.test(s.trim());

export const GET = handle(async (req) => {
  const t = tenantOf(req);
  const cfg = await getConfig(t);
  const db = await ready();

  const endpoints: { id: string; name?: string }[] = [];
  let warning: string | undefined;
  if (cfg?.api_user) {
    try {
      const type = cfg.supplier_type || 'supplier';
      for (let start = 0; start < 5000; start += PAGE) {
        const r = await call(t, '/endpoints', {
          fields: ['_id', 'name'],
          classification: [{ endpoint_type: [[type]] }],
          pagination: { limit: PAGE, start },
        });
        const page = (r?.endpoints ?? []) as { id: string; name?: string }[];
        endpoints.push(...page);
        if (page.length < PAGE) break;
      }
    } catch (e) {
      warning = `OneStock stock points unavailable: ${(e as Error).message}`;
    }
  }

  const local = await db<{ id: string; name: string }[]>`
    select id, name from suppliers where env = ${t.env} and site_id = ${t.siteId} order by name`;
  const terms = await db<{ supplier_id: string; franco: string | null; shipping_mode: string | null; shipping_amount: string | null }[]>`
    select supplier_id, franco, shipping_mode, shipping_amount from supplier_terms where env = ${t.env} and site_id = ${t.siteId}`;
  const byId = new Map(
    terms.map((r) => [
      r.supplier_id,
      {
        franco: r.franco === null ? null : Number(r.franco),
        shipping: r.shipping_mode && r.shipping_amount !== null ? { mode: r.shipping_mode, amount: Number(r.shipping_amount) } : null,
      },
    ]),
  );

  const seen = new Set<string>();
  const suppliers = [
    ...endpoints.map((e) => ({ id: e.id, name: e.name || e.id, source: 'onestock' as const })),
    ...local.map((l) => ({ id: l.id, name: l.name, source: 'local' as const })),
  ]
    .filter((s) => !seen.has(s.id) && seen.add(s.id))
    .map((s) => ({ ...s, franco: byId.get(s.id)?.franco ?? null, shipping: byId.get(s.id)?.shipping ?? null }));
  return json({ suppliers, ...(warning ? { warning } : {}) });
});

export const POST = handle(async (req) => {
  const t = tenantOf(req);
  const b = await body<{ suppliers?: { id: string; name?: string }[] }>(req);
  const list = b.suppliers ?? [];
  if (!list.length || list.length > 2000) throw new HttpError(400, 'Between 1 and 2000 suppliers are expected');
  list.forEach((s, i) => {
    if (!validId(s.id)) throw new HttpError(400, `Supplier ${i + 1}: invalid ID`);
    if (s.name !== undefined && (typeof s.name !== 'string' || s.name.length > 200)) throw new HttpError(400, `Supplier ${i + 1}: invalid name`);
  });
  const rows = [...new Map(list.map((s) => [s.id.trim(), { env: t.env, site_id: t.siteId, id: s.id.trim(), name: (s.name || '').trim() || s.id.trim() }])).values()];
  const db = await ready();
  await db`
    insert into suppliers ${db(rows, 'env', 'site_id', 'id', 'name')}
    on conflict (env, site_id, id) do update set name = excluded.name, updated_at = now()`;
  return json({ ok: true, suppliers: rows.length });
});

export const DELETE = handle(async (req) => {
  const t = tenantOf(req);
  const id = new URL(req.url).searchParams.get('id');
  if (!id) throw new HttpError(400, 'id is required');
  const db = await ready();
  await db.begin(async (tx) => {
    await tx`delete from supplier_prices where env = ${t.env} and site_id = ${t.siteId} and supplier_id = ${id}`;
    await tx`delete from supplier_terms where env = ${t.env} and site_id = ${t.siteId} and supplier_id = ${id}`;
    await tx`delete from suppliers where env = ${t.env} and site_id = ${t.siteId} and id = ${id}`;
  });
  return json({ ok: true });
});
