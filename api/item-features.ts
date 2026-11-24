// POST /api/item-features { itemIds, features, lang? } → { features: { itemId: { feature: [values] } } }
// from OneStock GET /v3/items (item_ids, features), used to evaluate the delivery restrictions.
import { body, handle, HttpError, json, tenantOf } from './_lib/http.js';
import { call } from './_lib/onestock.js';

const PAGE = 100;

export const POST = handle(async (req) => {
  const t = tenantOf(req);
  const b = await body<{ itemIds?: string[]; features?: string[]; lang?: string }>(req);
  const itemIds = [...new Set((b.itemIds ?? []).map(String).filter(Boolean))];
  const features = [...new Set((b.features ?? []).map(String).filter((f) => /^[\w.-]{1,64}$/.test(f)))];
  const lang = /^[a-z]{2}$/.test(b.lang ?? '') ? b.lang! : 'en';
  if (itemIds.length > 1000) throw new HttpError(400, 'At most 1000 items');
  const out: Record<string, Record<string, string[]>> = {};
  if (!itemIds.length || !features.length) return json({ features: out });
  for (let i = 0; i < itemIds.length; i += PAGE) {
    const ids = itemIds.slice(i, i + PAGE);
    const r = await call(t, '/items', { item_ids: ids, features, lang, pagination: { limit: PAGE, start: 0 } });
    for (const item of (r?.items ?? []) as any[]) {
      // Features of the requested language, else of the first language returned.
      const byLang = item.features ?? {};
      const f = byLang[lang] ?? Object.values(byLang)[0] ?? {};
      out[String(item.id)] = Object.fromEntries(Object.entries(f as Record<string, unknown>).map(([k, v]) => [k, (Array.isArray(v) ? v : [v]).map(String)]));
    }
  }
  return json({ features: out });
});
