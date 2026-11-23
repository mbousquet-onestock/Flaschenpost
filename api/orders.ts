// GET /api/orders → order lines (line item groups) whose state is one of the configured line statuses.
// Returns one row per line item group: order id, date, item, quantity, state, sales channel, order types,
// customer, and the free "information" fields of the order, customer, order item, destination and carrier.
import { getConfig } from './_lib/db.js';
import { handle, HttpError, json, tenantOf } from './_lib/http.js';
import { call } from './_lib/onestock.js';

const PAGE = 50; // OneStock maximum for GET /orders
const MAX_PAGES = 40;

const BASE_FIELDS = ['id', 'date', 'sales_channel', 'types', 'line_item_groups.id', 'line_item_groups.item_id', 'line_item_groups.quantity', 'line_item_groups.state'];
const INFO_FIELDS = [
  'information',
  'customer',
  'order_items._id',
  'order_items.information',
  'line_item_groups.order_item_id',
  'delivery.destination.information',
  'delivery_promise.original_delivery_option.delivery_routes',
];
const CUSTOMER_FIELDS = ['customer.first_name', 'customer.last_name', 'customer.email'];

type Value = string | number | boolean;
type Info = Record<string, Value>;

/** Keeps the scalar values of an information map; objects and arrays become JSON text. */
function flat(o: unknown): Info | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const out: Info = {};
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (v === null || v === undefined) continue;
    out[k] = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : JSON.stringify(v);
  }
  return Object.keys(out).length ? out : undefined;
}

/** Carrier of the order's first delivery route: name, option and its information fields. */
function carrierInfo(o: any): Info | undefined {
  const c = o?.delivery_promise?.original_delivery_option?.delivery_routes?.[0]?.carrier ?? o?.delivery?.carrier;
  if (!c) return undefined;
  return { ...(c.name ? { name: String(c.name) } : {}), ...(c.option ? { option: String(c.option) } : {}), ...(flat(c.information) ?? {}) };
}

export const GET = handle(async (req) => {
  const t = tenantOf(req);
  const cfg = await getConfig(t);
  const statuses = cfg?.line_statuses ?? [];
  if (!statuses.length) throw new HttpError(409, 'No order line status is configured for this site');

  // Information fields are asked for first; if OneStock refuses them, the base fields are used.
  let fields = [...BASE_FIELDS, ...INFO_FIELDS];
  let infoAvailable = true;

  const lines: {
    id: string; orderId: string; date: number | string | null; sku: string; quantity: number; status: string;
    channel?: string; orderTypes?: string[]; customer?: string; info?: Record<string, Info | undefined>;
  }[] = [];
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = (f: string[]) =>
      call(t, '/orders', { fields: f, filter: { line_item_group: { state: { from: statuses } } }, pagination: { limit: PAGE, start: page * PAGE } });
    let r: any;
    try {
      r = await query(fields);
    } catch (e) {
      if (!infoAvailable || !(e instanceof HttpError) || !/\((400|422)\)/.test(e.message)) throw e;
      infoAvailable = false;
      fields = [...BASE_FIELDS, ...CUSTOMER_FIELDS];
      r = await query(fields);
    }
    const orders = (r?.orders ?? []) as any[];
    for (const o of orders) {
      const c = o.customer ?? {};
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ');
      const customer = [name, c.email ? `<${c.email}>` : ''].filter(Boolean).join(' ') || undefined;
      const itemInfo = new Map<string, Info | undefined>(((o.order_items ?? []) as any[]).map((i) => [String(i._id ?? i.id), flat(i.information)]));
      const orderInfo = {
        order: flat(o.information),
        customer: flat(c.information),
        destination: flat(o.delivery?.destination?.information),
        carrier: carrierInfo(o),
      };
      for (const g of o.line_item_groups ?? []) {
        if (!statuses.includes(g.state)) continue;
        const info = { ...orderInfo, item: g.order_item_id ? itemInfo.get(String(g.order_item_id)) : undefined };
        lines.push({
          id: String(g.id),
          orderId: String(o.id),
          date: typeof o.date === 'number' || typeof o.date === 'string' ? o.date : null,
          sku: String(g.item_id),
          quantity: Number(g.quantity) || 0,
          status: String(g.state),
          channel: o.sales_channel,
          orderTypes: Array.isArray(o.types) ? o.types.map(String) : undefined,
          customer,
          ...(Object.values(info).some(Boolean) ? { info } : {}),
        });
      }
    }
    if (orders.length < PAGE) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }
  return json({ lines, statuses, truncated, infoAvailable });
});
