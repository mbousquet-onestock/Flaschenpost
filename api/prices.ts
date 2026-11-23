// Supplier purchase prices (tiered by quantity) and franco, per site.
// GET    /api/prices[?supplier_id=]        → { terms: [{supplierId, franco}], prices: [{supplierId, itemId, minQty, unitPrice}] }
// PUT    /api/prices                       → upsert { terms?, prices?, replaceSuppliers? } (import or manual edit)
// DELETE /api/prices?supplier_id=&item_id=[&min_qty=] → remove price tiers
import { ready } from './_lib/db.js';
import { body, handle, HttpError, json, tenantOf } from './_lib/http.js';

type Price = { supplierId: string; itemId: string; minQty: number; unitPrice: number };
type Term = { supplierId: string; franco: number | null };
type Put = { prices?: Price[]; terms?: Term[]; replaceSuppliers?: string[] };

const id = (s: unknown) => typeof s === 'string' && s.trim().length > 0 && s.length <= 128;
const MAX_ROWS = 20000;

export const GET = handle(async (req) => {
  const t = tenantOf(req);
  const supplier = new URL(req.url).searchParams.get('supplier_id');
  const db = await ready();
  const prices = await db`
    select supplier_id as "supplierId", item_id as "itemId", min_qty as "minQty", unit_price::float8 as "unitPrice"
    from supplier_prices
    where env = ${t.env} and site_id = ${t.siteId} ${supplier ? db`and supplier_id = ${supplier}` : db``}
    order by supplier_id, item_id, min_qty`;
  const terms = await db`
    select supplier_id as "supplierId", franco::float8 as franco
    from supplier_terms where env = ${t.env} and site_id = ${t.siteId}`;
  return json({ prices, terms });
});

export const PUT = handle(async (req) => {
  const t = tenantOf(req);
  const b = await body<Put>(req);
  const prices = b.prices ?? [];
  const terms = b.terms ?? [];
  const replace = b.replaceSuppliers ?? [];
  if (prices.length > MAX_ROWS) throw new HttpError(400, `Too many rows (max ${MAX_ROWS})`);
  prices.forEach((p, i) => {
    if (!id(p.supplierId) || !id(p.itemId)) throw new HttpError(400, `Row ${i + 1}: supplier and item are required`);
    if (!Number.isInteger(p.minQty) || p.minQty < 1) throw new HttpError(400, `Row ${i + 1}: minimum quantity must be an integer ≥ 1`);
    if (typeof p.unitPrice !== 'number' || !isFinite(p.unitPrice) || p.unitPrice < 0) throw new HttpError(400, `Row ${i + 1}: invalid unit price`);
  });
  terms.forEach((x, i) => {
    if (!id(x.supplierId)) throw new HttpError(400, `Franco row ${i + 1}: supplier is required`);
    if (x.franco !== null && (typeof x.franco !== 'number' || !isFinite(x.franco) || x.franco < 0)) throw new HttpError(400, `Franco row ${i + 1}: invalid amount`);
  });
  if (!replace.every(id)) throw new HttpError(400, 'Invalid supplier list');

  const db = await ready();
  await db.begin(async (tx) => {
    if (replace.length)
      await tx`delete from supplier_prices where env = ${t.env} and site_id = ${t.siteId} and supplier_id in ${tx(replace)}`;
    for (let i = 0; i < prices.length; i += 1000) {
      const rows = prices.slice(i, i + 1000).map((p) => ({
        env: t.env, site_id: t.siteId, supplier_id: p.supplierId.trim(), item_id: p.itemId.trim(), min_qty: p.minQty, unit_price: p.unitPrice,
      }));
      await tx`
        insert into supplier_prices ${tx(rows, 'env', 'site_id', 'supplier_id', 'item_id', 'min_qty', 'unit_price')}
        on conflict (env, site_id, supplier_id, item_id, min_qty)
        do update set unit_price = excluded.unit_price, updated_at = now()`;
    }
    if (terms.length) {
      const rows = terms.map((x) => ({ env: t.env, site_id: t.siteId, supplier_id: x.supplierId.trim(), franco: x.franco }));
      await tx`
        insert into supplier_terms ${tx(rows, 'env', 'site_id', 'supplier_id', 'franco')}
        on conflict (env, site_id, supplier_id) do update set franco = excluded.franco, updated_at = now()`;
    }
  });
  return json({ ok: true, prices: prices.length, terms: terms.length });
});

export const DELETE = handle(async (req) => {
  const t = tenantOf(req);
  const sp = new URL(req.url).searchParams;
  const supplier = sp.get('supplier_id');
  const item = sp.get('item_id');
  const minQty = sp.get('min_qty');
  if (!supplier || !item) throw new HttpError(400, 'supplier_id and item_id are required');
  const db = await ready();
  const r = await db`
    delete from supplier_prices
    where env = ${t.env} and site_id = ${t.siteId} and supplier_id = ${supplier} and item_id = ${item}
    ${minQty ? db`and min_qty = ${Number(minQty)}` : db``}`;
  return json({ ok: true, deleted: r.count });
});
