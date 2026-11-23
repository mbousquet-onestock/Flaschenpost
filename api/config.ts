// GET  /api/config  → connection and settings of the current site (never returns the password)
// PUT  /api/config  → save data mode, user, password, line statuses, supplier type (settings key required)
import { encrypt } from './_lib/crypto.js';
import { getConfig, ready } from './_lib/db.js';
import { body, handle, HttpError, json, requireAdmin, tenantOf } from './_lib/http.js';

export const GET = handle(async (req) => {
  const t = tenantOf(req);
  const c = await getConfig(t);
  return json({
    env: t.env,
    siteId: t.siteId,
    apiUser: c?.api_user ?? '',
    hasPassword: !!c?.api_password_enc,
    connected: !!c?.token,
    tokenAt: c?.token_at ?? null,
    lineStatuses: c?.line_statuses ?? [],
    supplierType: c?.supplier_type ?? 'supplier',
    dataMode: c?.data_mode ?? null,
    updatedAt: c?.updated_at ?? null,
  });
});

type Put = { apiUser?: string; password?: string; lineStatuses?: string[]; supplierType?: string; dataMode?: 'static' | 'dynamic' };

export const PUT = handle(async (req) => {
  requireAdmin(req);
  const t = tenantOf(req);
  const b = await body<Put>(req);
  if (b.lineStatuses && (!Array.isArray(b.lineStatuses) || b.lineStatuses.some((s) => typeof s !== 'string' || !s.trim() || s.length > 64)))
    throw new HttpError(400, 'Invalid line statuses');
  if (b.supplierType !== undefined && !/^[\w-]{1,64}$/.test(b.supplierType)) throw new HttpError(400, 'Invalid supplier type');
  if (b.dataMode !== undefined && !['static', 'dynamic'].includes(b.dataMode)) throw new HttpError(400, 'Invalid data mode');
  if (b.apiUser !== undefined && b.apiUser.length > 128) throw new HttpError(400, 'Invalid user');

  const db = await ready();
  const statuses = b.lineStatuses ? [...new Set(b.lineStatuses.map((s) => s.trim()))] : null;
  const pwd = b.password ? encrypt(b.password) : null;
  const userChanged = b.apiUser !== undefined || !!b.password;
  await db`
    insert into tenant_config (env, site_id, api_user, api_password_enc, line_statuses, supplier_type, data_mode)
    values (${t.env}, ${t.siteId}, ${b.apiUser ?? null}, ${pwd}, ${db.json(statuses ?? [])}, ${b.supplierType ?? 'supplier'}, ${b.dataMode ?? null})
    on conflict (env, site_id) do update set
      api_user = coalesce(${b.apiUser ?? null}, tenant_config.api_user),
      api_password_enc = coalesce(${pwd}, tenant_config.api_password_enc),
      line_statuses = coalesce(${statuses ? db.json(statuses) : null}, tenant_config.line_statuses),
      supplier_type = coalesce(${b.supplierType ?? null}, tenant_config.supplier_type),
      data_mode = coalesce(${b.dataMode ?? null}, tenant_config.data_mode),
      token = case when ${userChanged} then null else tenant_config.token end,
      updated_at = now()`;
  return json({ ok: true });
});
