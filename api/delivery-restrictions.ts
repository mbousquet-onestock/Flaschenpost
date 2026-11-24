// GET /api/delivery-restrictions → { restrictions: [{ id, itemFilter: { feature: [{ op, value }] }, carriers: [{ name, option }] }] }
// from OneStock GET /v3/delivery_restrictions (item_filter.feature, carrier_blacklist).
import { handle, json, tenantOf } from './_lib/http.js';
import { call } from './_lib/onestock.js';

export const GET = handle(async (req) => {
  const t = tenantOf(req);
  const r = await call(t, '/delivery_restrictions', {});
  const restrictions = ((r?.delivery_restrictions ?? []) as any[]).map((x) => ({
    id: String(x.id ?? x._id ?? ''),
    itemFilter: Object.fromEntries(
      Object.entries((x.item_filter?.feature ?? {}) as Record<string, any[]>).map(([feature, conds]) => [
        feature,
        (Array.isArray(conds) ? conds : [conds]).filter((c) => c && c.op).map((c) => ({ op: String(c.op), value: c.value })),
      ]),
    ),
    carriers: ((x.carrier_blacklist ?? []) as any[]).filter((c) => c?.name).map((c) => ({ name: String(c.name), ...(c.option ? { option: String(c.option) } : {}) })),
  }));
  return json({ restrictions: restrictions.filter((x) => x.carriers.length && Object.keys(x.itemFilter).length) });
});
