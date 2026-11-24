// POST /api/stock-check { requestName, itemIds, endpointIds? }
// Calls OneStock GET /v3/stock_export with the stock query (request_name), filtered on the items (and stock
// locations), with_details = true to get the raw stock, buffers, reservations and dispositions behind each
// quantity. Adds the names of the stock locations (GET /v3/endpoints).
import { body, handle, HttpError, json, tenantOf } from './_lib/http.js';
import { call } from './_lib/onestock.js';

type Stock = {
  endpoint_id?: string;
  item_id?: string;
  quantity?: number;
  type?: string;
  eta_start?: number;
  eta_end?: number;
  details?: {
    raw_stock?: number;
    endpoint_reservation?: number;
    global_reservation?: number;
    buffer?: Record<string, { applied?: number; type?: string; value?: number }>;
    dispositions?: { name: string; quantity: number }[];
  };
};

const ids = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);

export const POST = handle(async (req) => {
  const t = tenantOf(req);
  const b = await body<{ requestName?: string; itemIds?: string[]; endpointIds?: string[] }>(req);
  const requestName = (b.requestName ?? '').trim();
  const itemIds = ids(b.itemIds);
  const endpointIds = ids(b.endpointIds);
  if (!/^[\w.:-]{1,100}$/.test(requestName)) throw new HttpError(400, 'Enter the name of a stock query');
  if (!itemIds.length || itemIds.length > 50) throw new HttpError(400, 'Between 1 and 50 items are expected');
  if (endpointIds.length > 200) throw new HttpError(400, 'At most 200 stock locations');

  const filter = { item_filter: { ids: itemIds }, ...(endpointIds.length ? { endpoint_filter: { ids: endpointIds } } : {}) };
  const payload = { request_name: requestName, aggregates: { '*': filter } };
  let r: any;
  let withDetails = true;
  try {
    r = await call(t, '/stock_export', { ...payload, with_details: true });
  } catch (e) {
    // Details are only allowed on light requests: retry without them.
    if (!(e instanceof HttpError) || !/\((400|422)\)/.test(e.message)) throw e;
    withDetails = false;
    r = await call(t, '/stock_export', payload);
  }
  const stocks = ((r?.stocks ?? []) as Stock[]).map((s) => ({
    endpointId: s.endpoint_id ?? null,
    itemId: s.item_id ?? null,
    quantity: Number(s.quantity) || 0,
    type: s.type ?? null,
    etaStart: s.eta_start ?? null,
    etaEnd: s.eta_end ?? null,
    rawStock: s.details?.raw_stock ?? null,
    endpointReservation: s.details?.endpoint_reservation ?? null,
    globalReservation: s.details?.global_reservation ?? null,
    buffers: Object.entries(s.details?.buffer ?? {}).map(([level, x]) => ({ level, applied: Number(x.applied) || 0, type: x.type ?? null, value: x.value ?? null })),
    dispositions: s.details?.dispositions ?? [],
  }));

  // Names of the stock locations found.
  const found = [...new Set(stocks.map((s) => s.endpointId).filter((x): x is string => !!x))];
  const names: Record<string, string> = {};
  if (found.length) {
    try {
      const e = await call(t, '/endpoints', { endpoint_ids: found, fields: ['_id', 'name'], pagination: { limit: Math.min(found.length, 200), start: 0 } });
      for (const x of (e?.endpoints ?? []) as { id: string; name?: string }[]) if (x.name) names[x.id] = x.name;
    } catch {
      /* names are optional */
    }
  }
  return json({ requestName, withDetails, stocks, endpointNames: names });
});
