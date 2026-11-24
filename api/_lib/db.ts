// Postgres access (Vercel Postgres / Neon: DATABASE_URL or POSTGRES_URL).
import postgres from 'postgres';
import { HttpError, Tenant } from './http.js';

let client: postgres.Sql | undefined;
let schema: Promise<void> | undefined;

export function sql(): postgres.Sql {
  if (!client) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new HttpError(500, 'DATABASE_URL is not set');
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    client = postgres(url, { ssl: local ? false : 'require', max: 1, prepare: false, idle_timeout: 20 });
  }
  return client;
}

/** Creates the tables on first use. */
export async function ready(): Promise<postgres.Sql> {
  const db = sql();
  schema ||= (async () => {
    await db`
      create table if not exists tenant_config (
        env text not null,
        site_id text not null,
        api_user text,
        api_password_enc text,
        token text,
        token_at timestamptz,
        line_statuses jsonb not null default '[]'::jsonb,
        supplier_type text not null default 'supplier',
        updated_at timestamptz not null default now(),
        primary key (env, site_id)
      )`;
    await db`alter table tenant_config add column if not exists data_mode text`;
    await db`alter table tenant_config add column if not exists launch_status text`;
    await db`alter table tenant_config add column if not exists show_stock_test boolean`;
    await db`
      create table if not exists purchase_orders (
        env text not null,
        site_id text not null,
        id text not null,
        data jsonb not null,
        created_at timestamptz not null default now(),
        primary key (env, site_id, id)
      )`;
    await db`alter table supplier_terms add column if not exists shipping_mode text`;
    await db`alter table supplier_terms add column if not exists shipping_amount numeric(14, 4)`;
    await db`
      create table if not exists item_weights (
        env text not null,
        site_id text not null,
        item_id text not null,
        weight_kg numeric(14, 4) not null check (weight_kg >= 0),
        updated_at timestamptz not null default now(),
        primary key (env, site_id, item_id)
      )`;
    await db`
      create table if not exists suppliers (
        env text not null,
        site_id text not null,
        id text not null,
        name text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (env, site_id, id)
      )`;
    await db`
      create table if not exists strategies (
        env text not null,
        site_id text not null,
        id text not null,
        data jsonb not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (env, site_id, id)
      )`;
    await db`alter table strategies add column if not exists position integer`;
    await db`
      create table if not exists supplier_terms (
        env text not null,
        site_id text not null,
        supplier_id text not null,
        franco numeric(14, 2),
        updated_at timestamptz not null default now(),
        primary key (env, site_id, supplier_id)
      )`;
    await db`
      create table if not exists supplier_prices (
        env text not null,
        site_id text not null,
        supplier_id text not null,
        item_id text not null,
        min_qty integer not null check (min_qty >= 1),
        unit_price numeric(14, 4) not null check (unit_price >= 0),
        updated_at timestamptz not null default now(),
        primary key (env, site_id, supplier_id, item_id, min_qty)
      )`;
  })().catch((e) => {
    schema = undefined;
    throw e;
  });
  await schema;
  return db;
}

export type ConfigRow = {
  api_user: string | null;
  api_password_enc: string | null;
  token: string | null;
  token_at: Date | null;
  line_statuses: string[];
  supplier_type: string;
  data_mode: 'static' | 'dynamic' | null;
  launch_status: string | null;
  show_stock_test: boolean | null;
  updated_at: Date;
};

export async function getConfig(t: Tenant): Promise<ConfigRow | undefined> {
  const db = await ready();
  const rows = await db<ConfigRow[]>`
    select api_user, api_password_enc, token, token_at, line_statuses, supplier_type, data_mode, launch_status, show_stock_test, updated_at
    from tenant_config where env = ${t.env} and site_id = ${t.siteId}`;
  return rows[0];
}
