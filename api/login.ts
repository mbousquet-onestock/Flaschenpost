// POST /api/login → tests the credentials with OneStock POST /login, then stores them and the token.
// Body: { apiUser?, password? } — omitted fields fall back to the stored ones. Settings key required.
import { decrypt, encrypt } from './_lib/crypto.js';
import { getConfig, ready } from './_lib/db.js';
import { body, handle, HttpError, json, requireAdmin, tenantOf } from './_lib/http.js';
import { login } from './_lib/onestock.js';

export const POST = handle(async (req) => {
  requireAdmin(req);
  const t = tenantOf(req);
  const b = await body<{ apiUser?: string; password?: string }>(req);
  const cfg = await getConfig(t);
  const user = b.apiUser || cfg?.api_user;
  const password = b.password || (cfg?.api_password_enc ? decrypt(cfg.api_password_enc) : undefined);
  if (!user || !password) throw new HttpError(400, 'User and password are required');

  const token = await login(t, user, password);
  const db = await ready();
  await db`
    insert into tenant_config (env, site_id, api_user, api_password_enc, token, token_at)
    values (${t.env}, ${t.siteId}, ${user}, ${encrypt(password)}, ${token}, now())
    on conflict (env, site_id) do update set
      api_user = excluded.api_user, api_password_enc = excluded.api_password_enc,
      token = excluded.token, token_at = excluded.token_at, updated_at = now()`;
  return json({ ok: true });
});
