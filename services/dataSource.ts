// Data source of the app, chosen in the settings tab (saved per environment + site ID):
//  - static: mock data from constants.tsx, edits kept in the browser;
//  - dynamic: OneStock API through the Vercel functions, settings and prices in the database.
// VITE_DATA_MODE only sets the default mode of a site that has none saved.
import { MOCK_ORDERS, MOCK_PRODUCTS, MOCK_SUPPLIERS } from '../constants';
import type { Dataset, ItemRef, PriceTier, Settings, SettingsUpdate, SupplierRef, SupplierTerm } from '../types';
import { api } from './api';
import type { HostContext } from './context';

export type DataMode = 'static' | 'dynamic';
export const DEFAULT_MODE: DataMode = import.meta.env.VITE_DATA_MODE === 'dynamic' ? 'dynamic' : 'static';

export type PricesPayload = { prices?: PriceTier[]; terms?: SupplierTerm[]; replaceSuppliers?: string[] };

export interface DataSource {
  mode: DataMode;
  context: HostContext | null;
  loadDataset(): Promise<Dataset>;
  listSuppliers(): Promise<SupplierRef[]>;
  listItems(): Promise<ItemRef[]>;
  getPrices(): Promise<{ prices: PriceTier[]; terms: SupplierTerm[] }>;
  savePrices(p: PricesPayload): Promise<void>;
  deletePrice(supplierId: string, itemId: string, minQty?: number): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(s: SettingsUpdate): Promise<void>;
  testConnection(apiUser?: string, password?: string): Promise<void>;
}

/* ------------------------------------------------------------------ static ------------------------------------------------------------------ */

const STATIC_KEY = 'wave-orchestrator.static-data';
const STATIC_STATUSES = ['Placed', 'Out Of Stock', 'Supplier'];

type StaticStore = { prices?: PriceTier[]; terms?: SupplierTerm[]; lineStatuses?: string[] };

function readStore(): StaticStore {
  try {
    return JSON.parse(localStorage.getItem(STATIC_KEY) || '{}') as StaticStore;
  } catch {
    return {};
  }
}

function writeStore(s: StaticStore) {
  try {
    localStorage.setItem(STATIC_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: edits last for the session only */
  }
}

let memory: StaticStore | undefined;
const store = () => (memory ||= readStore());
const save = (s: StaticStore) => {
  memory = s;
  writeStore(s);
};

const round = (n: number) => Math.round(n * 100) / 100;
const defaultPrices = (): PriceTier[] =>
  MOCK_PRODUCTS.flatMap((p) => p.prices.map((t) => ({ supplierId: p.supplierId, itemId: p.sku, minQty: t.quantity, unitPrice: round(t.price) })));
const defaultTerms = (): SupplierTerm[] => MOCK_SUPPLIERS.map((s) => ({ supplierId: s.id, franco: round(s.franco) }));

export const staticSource: DataSource = {
  mode: 'static',
  context: null,
  async loadDataset() {
    const s = store();
    const statuses = s.lineStatuses ?? STATIC_STATUSES;
    return {
      lines: MOCK_ORDERS.filter((o) => statuses.includes(o.status)).map((o) => ({
        id: o.id, orderId: o.id, sku: o.sku, quantity: o.quantity, status: o.status, priority: o.priority,
      })),
      items: await this.listItems(),
      suppliers: await this.listSuppliers(),
      prices: s.prices ?? defaultPrices(),
      statusOptions: statuses,
    };
  },
  async listSuppliers() {
    const terms = new Map((store().terms ?? defaultTerms()).map((t) => [t.supplierId, t.franco]));
    return MOCK_SUPPLIERS.map((s) => ({ id: s.id, name: s.name, rank: s.rank, franco: terms.has(s.id) ? terms.get(s.id)! : null }));
  },
  async listItems() {
    return MOCK_PRODUCTS.map((p) => ({ id: p.sku, name: p.name }));
  },
  async getPrices() {
    const s = store();
    return { prices: s.prices ?? defaultPrices(), terms: s.terms ?? defaultTerms() };
  },
  async savePrices({ prices = [], terms = [], replaceSuppliers = [] }) {
    const s = store();
    const key = (p: PriceTier) => `${p.supplierId}|${p.itemId}|${p.minQty}`;
    const next = new Map((s.prices ?? defaultPrices()).filter((p) => !replaceSuppliers.includes(p.supplierId)).map((p) => [key(p), p]));
    prices.forEach((p) => next.set(key(p), p));
    const nextTerms = new Map((s.terms ?? defaultTerms()).map((t) => [t.supplierId, t]));
    terms.forEach((t) => nextTerms.set(t.supplierId, t));
    save({ ...s, prices: [...next.values()], terms: [...nextTerms.values()] });
  },
  async deletePrice(supplierId, itemId, minQty) {
    const s = store();
    save({
      ...s,
      prices: (s.prices ?? defaultPrices()).filter(
        (p) => !(p.supplierId === supplierId && p.itemId === itemId && (minQty === undefined || p.minQty === minQty)),
      ),
    });
  },
  async getSettings() {
    return { apiUser: '', hasPassword: false, connected: false, tokenAt: null, lineStatuses: store().lineStatuses ?? STATIC_STATUSES, supplierType: 'supplier' };
  },
  async saveSettings(u) {
    if (u.lineStatuses) save({ ...store(), lineStatuses: u.lineStatuses });
  },
  async testConnection() {
    throw new Error('The connection to OneStock is only available in the dynamic version.');
  },
};

/* ------------------------------------------------------------------ dynamic ------------------------------------------------------------------ */

const ITEM_PAGE = 100;
const MAX_ITEMS = 3000;

function dynamicSource(ctx: HostContext): DataSource {
  let itemsCache: Promise<ItemRef[]> | undefined;
  const source: DataSource = {
    mode: 'dynamic',
    context: ctx,
    async loadDataset() {
      const [orders, suppliers, prices, settings, items] = await Promise.all([
        api<{ lines: Dataset['lines']; truncated: boolean }>(ctx, 'orders'),
        source.listSuppliers(),
        source.getPrices(),
        source.getSettings(),
        source.listItems().catch(() => [] as ItemRef[]),
      ]);
      return { lines: orders.lines, truncated: orders.truncated, suppliers, prices: prices.prices, items, statusOptions: settings.lineStatuses };
    },
    async listSuppliers() {
      return (await api<{ suppliers: SupplierRef[] }>(ctx, 'suppliers')).suppliers;
    },
    listItems() {
      itemsCache ||= (async () => {
        const all: ItemRef[] = [];
        for (let start = 0; start < MAX_ITEMS; start += ITEM_PAGE) {
          const r = await api<{ items: ItemRef[]; total: number }>(ctx, 'items', { query: { start, limit: ITEM_PAGE } });
          all.push(...r.items);
          if (r.items.length < ITEM_PAGE || all.length >= r.total) break;
        }
        return all;
      })().catch((e) => {
        itemsCache = undefined;
        throw e;
      });
      return itemsCache;
    },
    async getPrices() {
      return api<{ prices: PriceTier[]; terms: SupplierTerm[] }>(ctx, 'prices');
    },
    async savePrices(p) {
      await api(ctx, 'prices', { method: 'PUT', body: p });
    },
    async deletePrice(supplierId, itemId, minQty) {
      await api(ctx, 'prices', { method: 'DELETE', query: { supplier_id: supplierId, item_id: itemId, min_qty: minQty } });
    },
    async getSettings() {
      return api<Settings>(ctx, 'config');
    },
    async saveSettings(u) {
      await api(ctx, 'config', { method: 'PUT', body: u });
    },
    async testConnection(apiUser, password) {
      await api(ctx, 'login', { method: 'POST', body: { apiUser, password } });
      itemsCache = undefined;
    },
  };
  return source;
}

export function createDataSource(mode: DataMode, ctx: HostContext | null): DataSource {
  return mode === 'dynamic' && ctx ? dynamicSource(ctx) : staticSource;
}

/** Saved mode of the site; null when none is saved or the API is unavailable (static deployment). */
export async function loadSavedMode(ctx: HostContext): Promise<DataMode | null> {
  try {
    const c = await api<Settings>(ctx, 'config');
    return c.dataMode ?? null;
  } catch {
    return null;
  }
}

/** Settings stored in the database for a site (connection, mode), independent of the active mode. */
export const siteSettings = (ctx: HostContext) => ({
  get: () => api<Settings>(ctx, 'config'),
  save: (u: SettingsUpdate) => api(ctx, 'config', { method: 'PUT', body: u }),
  testConnection: (apiUser?: string, password?: string) => api(ctx, 'login', { method: 'POST', body: { apiUser, password } }),
});
