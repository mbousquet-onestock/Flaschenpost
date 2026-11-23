// Supplier purchase prices (tiered by quantity), supplier terms (franco and shipping fee charged when the
// franco is not reached) and item weights (for shipping fees per kg), per site.
// GET    /api/prices[?supplier_id=]   → { prices, terms: [{ supplierId, franco, shipping }], weights: [{ itemId, weightKg }] }
// PUT    /api/prices                  → upsert { prices?, terms?, weights?, replaceSuppliers? } (import or manual edit)
//                                        a term is saved whole: franco and shipping together
// DELETE /api/prices?supplier_id=&item_id=[&min_qty=] → remove price tiers
import { ready } from './_lib/db.js';
import { body, handle, HttpError, json, tenantOf } from './_lib/http.js';

type Price = { supplierId: string; itemId: string; minQty: number; unitPrice: number };
type Shipping = { mode: 'fixed' | 'weight' | 'quantity'; amount: number } | null;
type Term = { supplierId: string; franco: number | null; shipping?: Shipping };
type Weight = { itemId: string; weightKg: number | null };
type Put = { prices?: Price[]; terms?: Term[]; weights?: Weight[]; replaceSuppliers?: string[] };

const id = (s: unknown) => typeof s === 'string' && s.trim().length > 0 && s.length <= 128;
const amount = (n: unknown) => typeof n === 'number' && isFinite(n) && n >= 0;
const MODES = ['fixed', 'weight', 'quantity'];
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
  const termRows = await db<{ supplierId: string; franco: number | null; mode: string | null; amount: number | null }[]>`
    select supplier_id as "supplierId", franco::float8 as franco, shipping_mode as mode, shipping_amount::float8 as amount
    from supplier_terms where env = ${t.env} and site_id = ${t.siteId}`;
  const weights = await db`
    select item_id as "itemId", weight_kg::float8 as "weightKg" from item_weights where env = ${t.env} and site_id = ${t.siteId}`;
  const terms = termRows.map((r) => ({
    supplierId: r.supplierId,
    franco: r.franco,
    shipping: r.mode && r.amount !== null ? { mode: r.mode, amount: r.amount } : null,
  }));
  return json({ prices, terms, weights });
});

export const PUT = handle(async (req) => {
  const t = tenantOf(req);
  const b = await body<Put>(req);
  const prices = b.prices ?? [];
  const terms = b.terms ?? [];
  const weights = b.weights ?? [];
  const replace = b.replaceSuppliers ?? [];
  if (prices.length > MAX_ROWS || weights.length > MAX_ROWS) throw new HttpError(400, `Too many rows (max ${MAX_ROWS})`);
  prices.forEach((p, i) => {
    if (!id(p.supplierId) || !id(p.itemId)) throw new HttpError(400, `Row ${i + 1}: supplier and item are required`);
    if (!Number.isInteger(p.minQty) || p.minQty < 1) throw new HttpError(400, `Row ${i + 1}: minimum quantity must be an integer ≥ 1`);
    if (!amount(p.unitPrice)) throw new HttpError(400, `Row ${i + 1}: invalid unit price`);
  });
  terms.forEach((x, i) => {
    if (!id(x.supplierId)) throw new HttpError(400, `Franco row ${i + 1}: supplier is required`);
    if (x.franco !== null && !amount(x.franco)) throw new HttpError(400, `Franco row ${i + 1}: invalid amount`);
    if (x.shipping && (!MODES.includes(x.shipping.mode) || !amount(x.shipping.amount))) throw new HttpError(400, `Franco row ${i + 1}: invalid shipping fee`);
  });
  weights.forEach((w, i) => {
    if (!id(w.itemId)) throw new HttpError(400, `Weight row ${i + 1}: item is required`);
    if (w.weightKg !== null && !amount(w.weightKg)) throw new HttpError(400, `Weight row ${i + 1}: invalid weight`);
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
      const rows = terms.map((x) => ({
        env: t.env, site_id: t.siteId, supplier_id: x.supplierId.trim(), franco: x.franco,
        shipping_mode: x.shipping?.mode ?? null, shipping_amount: x.shipping?.amount ?? null,
      }));
      await tx`
        insert into supplier_terms ${tx(rows, 'env', 'site_id', 'supplier_id', 'franco', 'shipping_mode', 'shipping_amount')}
        on conflict (env, site_id, supplier_id) do update set
          franco = excluded.franco, shipping_mode = excluded.shipping_mode, shipping_amount = excluded.shipping_amount, updated_at = now()`;
    }
    const set = weights.filter((w) => w.weightKg !== null);
    const unset = weights.filter((w) => w.weightKg === null).map((w) => w.itemId.trim());
    for (let i = 0; i < set.length; i += 1000) {
      const rows = set.slice(i, i + 1000).map((w) => ({ env: t.env, site_id: t.siteId, item_id: w.itemId.trim(), weight_kg: w.weightKg }));
      await tx`
        insert into item_weights ${tx(rows, 'env', 'site_id', 'item_id', 'weight_kg')}
        on conflict (env, site_id, item_id) do update set weight_kg = excluded.weight_kg, updated_at = now()`;
    }
    if (unset.length) await tx`delete from item_weights where env = ${t.env} and site_id = ${t.siteId} and item_id in ${tx(unset)}`;
  });
  return json({ ok: true, prices: prices.length, terms: terms.length, weights: weights.length });
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
