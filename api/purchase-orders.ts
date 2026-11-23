// Supplier purchase orders created by the Launch of a strategy.
// GET  /api/purchase-orders  → { purchaseOrders: PurchaseOrder[] } (newest first)
// POST /api/purchase-orders  → { orders: PurchaseOrder[] without id/date/statusUpdate }
//   Saves the purchase orders and, when a status after launch is set in the settings, moves each OneStock
//   order line (line item group) of these orders to that status: PATCH /line_item_groups/{id} { from, to }.
import { getConfig, ready } from './_lib/db.js';
import { body, handle, HttpError, json, tenantOf } from './_lib/http.js';
import { call } from './_lib/onestock.js';

type OrderLine = { id: string; orderId: string; status: string; quantity: number };
type PurchaseOrder = {
  id?: string;
  createdAt?: string;
  supplierId: string;
  supplierName: string;
  strategyId?: string;
  strategyName?: string;
  lines: { sku: string; productName?: string; quantity: number; unitPrice: number; amount: number; orderLines: OrderLine[] }[];
  goodsAmount: number;
  shippingFee: number;
  total: number;
  statusUpdate?: { target: string; updated: number; failed: { lineId: string; orderId: string; error: string }[] } | null;
};

const MAX_LINES = 600; // order lines updated per launch (one OneStock call each)
const CONCURRENCY = 6;

export const GET = handle(async (req) => {
  const t = tenantOf(req);
  const db = await ready();
  const rows = await db<{ data: PurchaseOrder }[]>`
    select data from purchase_orders where env = ${t.env} and site_id = ${t.siteId} order by created_at desc, id desc limit 500`;
  return json({ purchaseOrders: rows.map((r) => r.data) });
});

export const POST = handle(async (req) => {
  const t = tenantOf(req);
  const b = await body<{ orders?: PurchaseOrder[] }>(req);
  const orders = b.orders ?? [];
  if (!orders.length || orders.length > 200) throw new HttpError(400, 'Between 1 and 200 purchase orders are expected');
  orders.forEach((o, i) => {
    if (typeof o.supplierId !== 'string' || !Array.isArray(o.lines) || !o.lines.length) throw new HttpError(400, `Purchase order ${i + 1}: supplier and lines are required`);
  });
  if (JSON.stringify(orders).length > 2_000_000) throw new HttpError(400, 'Request too large');

  const cfg = await getConfig(t);
  const target = cfg?.launch_status || '';
  const orderLines = orders.flatMap((o) => o.lines.flatMap((l) => l.orderLines ?? []));
  if (target && orderLines.length > MAX_LINES) throw new HttpError(400, `Too many order lines to update at once (${orderLines.length}, max ${MAX_LINES})`);

  // Move the order lines to the status after launch.
  const failed = new Map<string, string>();
  if (target) {
    const queue = orderLines.filter((l) => l.status !== target);
    const worker = async () => {
      for (let l = queue.shift(); l; l = queue.shift()) {
        try {
          await call(t, `/line_item_groups/${encodeURIComponent(l.id)}`, { line_item_group: { from: l.status, to: target } }, 'PATCH');
        } catch (e) {
          failed.set(l.id, (e as Error).message.slice(0, 300));
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  }

  const stamp = new Date();
  const base = `PO-${stamp.toISOString().slice(0, 10).replace(/-/g, '')}-${stamp.getTime().toString(36).slice(-5).toUpperCase()}`;
  const saved: PurchaseOrder[] = orders.map((o, i) => {
    const lines = o.lines.flatMap((l) => l.orderLines ?? []);
    return {
      ...o,
      id: `${base}-${i + 1}`,
      createdAt: stamp.toISOString(),
      statusUpdate: target
        ? {
            target,
            updated: lines.filter((l) => !failed.has(l.id)).length,
            failed: lines.filter((l) => failed.has(l.id)).map((l) => ({ lineId: l.id, orderId: l.orderId, error: failed.get(l.id)! })),
          }
        : null,
    };
  });
  const db = await ready();
  await db`
    insert into purchase_orders ${db(saved.map((o) => ({ env: t.env, site_id: t.siteId, id: o.id!, data: db.json(o as never) })), 'env', 'site_id', 'id', 'data')}`;
  return json({ purchaseOrders: saved, target, updated: orderLines.length - failed.size, failed: failed.size });
});
