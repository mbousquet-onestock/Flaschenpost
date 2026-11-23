// GET /api/items?q=&start=&limit= → OneStock items (id + name), for the price grid and the item picker.
import { handle, json, tenantOf } from './_lib/http.js';
import { call } from './_lib/onestock.js';

export const GET = handle(async (req) => {
  const t = tenantOf(req);
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const start = Math.max(0, Number(url.searchParams.get('start')) || 0);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const lang = (url.searchParams.get('lang') || 'en').slice(0, 5);
  const r = await call(t, '/items', {
    features: ['name'],
    lang,
    get_total: true,
    pagination: { limit, start },
    ...(q ? { pattern: q, searchable_field: [{ name: 'name', priority: 1 }] } : {}),
  });
  const items = ((r?.items ?? []) as any[]).map((i) => ({
    id: String(i.id),
    name: (i.features?.[lang]?.name?.[0] as string | undefined) ?? String(i.id),
  }));
  return json({ items, total: r?.total_items ?? items.length, start, limit });
});
