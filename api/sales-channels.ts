// GET /api/sales-channels → { salesChannels: [{ id, name }] } from OneStock GET /v3/sales_channels.
import { handle, json, tenantOf } from './_lib/http.js';
import { call } from './_lib/onestock.js';

export const GET = handle(async (req) => {
  const t = tenantOf(req);
  const r = await call(t, '/sales_channels', { fields: ['id', 'name'] });
  // The documentation shows both a list (sales_channels) and a single object (sales_channel).
  const raw = (Array.isArray(r?.sales_channels) ? r.sales_channels : r?.sales_channel ? [r.sales_channel] : []) as { id?: unknown; name?: unknown }[];
  const salesChannels = raw
    .filter((c) => c.id !== undefined && c.id !== null)
    .map((c) => ({ id: String(c.id), name: typeof c.name === 'string' && c.name ? c.name : String(c.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return json({ salesChannels });
});
