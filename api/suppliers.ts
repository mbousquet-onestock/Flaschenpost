// GET /api/suppliers → stock points whose classification endpoint_type is the configured supplier type,
// merged with the franco saved for each supplier.
import { getConfig, ready } from './_lib/db.js';
import { handle, json, tenantOf } from './_lib/http.js';
import { call } from './_lib/onestock.js';

const PAGE = 100;

export const GET = handle(async (req) => {
  const t = tenantOf(req);
  const cfg = await getConfig(t);
  const type = cfg?.supplier_type || 'supplier';
  const endpoints: { id: string; name?: string }[] = [];
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
  const db = await ready();
  const terms = await db<{ supplier_id: string; franco: string | null }[]>`
    select supplier_id, franco from supplier_terms where env = ${t.env} and site_id = ${t.siteId}`;
  const franco = new Map(terms.map((r) => [r.supplier_id, r.franco === null ? null : Number(r.franco)]));
  return json({
    suppliers: endpoints.map((e) => ({ id: e.id, name: e.name || e.id, franco: franco.get(e.id) ?? null })),
  });
});
