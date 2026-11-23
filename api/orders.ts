// GET /api/orders → order lines (line item groups) whose state is one of the configured line statuses.
// Returns one row per line item group: order id, date, item, quantity, state.
import { getConfig } from './_lib/db.js';
import { handle, HttpError, json, tenantOf } from './_lib/http.js';
import { call } from './_lib/onestock.js';

const PAGE = 50; // OneStock maximum for GET /orders
const MAX_PAGES = 40;

export const GET = handle(async (req) => {
  const t = tenantOf(req);
  const cfg = await getConfig(t);
  const statuses = cfg?.line_statuses ?? [];
  if (!statuses.length) throw new HttpError(409, 'No order line status is configured for this site');

  const lines: { id: string; orderId: string; date: number | null; sku: string; quantity: number; status: string; channel?: string }[] = [];
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await call(t, '/orders', {
      fields: [
        'id',
        'date',
        'sales_channel',
        'line_item_groups.id',
        'line_item_groups.item_id',
        'line_item_groups.quantity',
        'line_item_groups.state',
      ],
      filter: { line_item_group: { state: { from: statuses } } },
      pagination: { limit: PAGE, start: page * PAGE },
    });
    const orders = (r?.orders ?? []) as any[];
    for (const o of orders) {
      for (const g of o.line_item_groups ?? []) {
        if (!statuses.includes(g.state)) continue;
        lines.push({
          id: String(g.id),
          orderId: String(o.id),
          date: typeof o.date === 'number' ? o.date : null,
          sku: String(g.item_id),
          quantity: Number(g.quantity) || 0,
          status: String(g.state),
          channel: o.sales_channel,
        });
      }
    }
    if (orders.length < PAGE) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }
  return json({ lines, statuses, truncated });
});
