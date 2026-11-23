// Data source of the app, chosen in the settings tab (saved per environment + site ID):
//  - static: mock data from constants.tsx, edits kept in the browser;
//  - dynamic: OneStock API through the Vercel functions, settings and prices in the database.
// VITE_DATA_MODE only sets the default mode of a site that has none saved.
import { MOCK_ORDERS, MOCK_PRODUCTS, MOCK_SCENARIOS, MOCK_SUPPLIERS } from '../constants';
import type { Dataset, ItemRef, ItemWeight, PriceTier, Scenario, Settings, SettingsUpdate, SupplierRef, SupplierTerm } from '../types';
import { api } from './api';
import type { HostContext } from './context';
import { t } from './i18n';

export type DataMode = 'static' | 'dynamic';
export const DEFAULT_MODE: DataMode = import.meta.env.VITE_DATA_MODE === 'dynamic' ? 'dynamic' : 'static';

export type SupplierList = { suppliers: SupplierRef[]; warning?: string };
export type PricesPayload = { prices?: PriceTier[]; terms?: SupplierTerm[]; weights?: ItemWeight[]; replaceSuppliers?: string[] };
export type PricesData = { prices: PriceTier[]; terms: SupplierTerm[]; weights: ItemWeight[] };

export interface DataSource {
  mode: DataMode;
  context: HostContext | null;
  loadDataset(): Promise<Dataset>;
  /** OneStock supplier stock points and suppliers entered in the app; `warning` when OneStock could not be read. */
  listSuppliers(): Promise<SupplierList>;
  /** Creates or renames suppliers entered in the app (manual entry, Excel import). */
  saveSuppliers(list: { id: string; name: string }[]): Promise<void>;
  /** Deletes a supplier entered in the app, with its prices and franco. */
  deleteSupplier(id: string): Promise<void>;
  listItems(): Promise<ItemRef[]>;
  getPrices(): Promise<PricesData>;
  savePrices(p: PricesPayload): Promise<void>;
  deletePrice(supplierId: string, itemId: string, minQty?: number): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(s: SettingsUpdate): Promise<void>;
  testConnection(apiUser?: string, password?: string): Promise<void>;
  /** Wave strategies: per site in the database (dynamic), in the browser (static). */
  listStrategies(): Promise<Scenario[]>;
  saveStrategy(s: Scenario): Promise<void>;
  deleteStrategy(id: string): Promise<void>;
}

/* ------------------------------------------------------------------ static ------------------------------------------------------------------ */

const STATIC_KEY = 'wave-orchestrator.static-data';
const STATIC_STATUSES = ['Placed', 'Out Of Stock', 'Supplier'];

type StaticStore = { prices?: PriceTier[]; terms?: SupplierTerm[]; weights?: ItemWeight[]; lineStatuses?: string[]; strategies?: Scenario[]; localSuppliers?: { id: string; name: string }[] };

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
const defaultTerms = (): SupplierTerm[] =>
  MOCK_SUPPLIERS.map((s) => ({ supplierId: s.id, franco: round(s.franco), shipping: { mode: 'fixed' as const, amount: 80 } }));
/** Sample bottle weights between 1.2 and 1.6 kg, stable per SKU. */
const defaultWeights = (): ItemWeight[] => MOCK_PRODUCTS.map((p, i) => ({ itemId: p.sku, weightKg: round(1.2 + ((i * 7) % 5) / 10) }));

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
      suppliers: (await this.listSuppliers()).suppliers,
      prices: s.prices ?? defaultPrices(),
      weights: s.weights ?? defaultWeights(),
      statusOptions: statuses,
    };
  },
  async listSuppliers() {
    const terms = new Map((store().terms ?? defaultTerms()).map((x) => [x.supplierId, x]));
    const franco = (id: string) => terms.get(id)?.franco ?? null;
    const shipping = (id: string) => terms.get(id)?.shipping ?? null;
    const sample = MOCK_SUPPLIERS.map((s) => ({ id: s.id, name: s.name, rank: s.rank, franco: franco(s.id), shipping: shipping(s.id), source: 'onestock' as const }));
    const local = (store().localSuppliers ?? [])
      .filter((l) => !sample.some((s) => s.id === l.id))
      .map((l) => ({ id: l.id, name: l.name, franco: franco(l.id), shipping: shipping(l.id), source: 'local' as const }));
    return { suppliers: [...sample, ...local] };
  },
  async saveSuppliers(list) {
    const cur = new Map((store().localSuppliers ?? []).map((l) => [l.id, l]));
    list.forEach((l) => cur.set(l.id, l));
    save({ ...store(), localSuppliers: [...cur.values()] });
  },
  async deleteSupplier(id) {
    const s = store();
    save({
      ...s,
      localSuppliers: (s.localSuppliers ?? []).filter((l) => l.id !== id),
      prices: (s.prices ?? defaultPrices()).filter((p) => p.supplierId !== id),
      terms: (s.terms ?? defaultTerms()).filter((x) => x.supplierId !== id),
    });
  },
  async listItems() {
    return MOCK_PRODUCTS.map((p) => ({ id: p.sku, name: p.name }));
  },
  async getPrices() {
    const s = store();
    return { prices: s.prices ?? defaultPrices(), terms: s.terms ?? defaultTerms(), weights: s.weights ?? defaultWeights() };
  },
  async savePrices({ prices = [], terms = [], weights = [], replaceSuppliers = [] }) {
    const s = store();
    const key = (p: PriceTier) => `${p.supplierId}|${p.itemId}|${p.minQty}`;
    const next = new Map((s.prices ?? defaultPrices()).filter((p) => !replaceSuppliers.includes(p.supplierId)).map((p) => [key(p), p]));
    prices.forEach((p) => next.set(key(p), p));
    const nextTerms = new Map((s.terms ?? defaultTerms()).map((t) => [t.supplierId, t]));
    terms.forEach((t) => nextTerms.set(t.supplierId, t));
    const nextWeights = new Map((s.weights ?? defaultWeights()).map((w) => [w.itemId, w]));
    weights.forEach((w) => (w.weightKg === null ? nextWeights.delete(w.itemId) : nextWeights.set(w.itemId, w)));
    save({ ...s, prices: [...next.values()], terms: [...nextTerms.values()], weights: [...nextWeights.values()] });
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
    throw new Error(t('The connection to OneStock is only available in the dynamic version.'));
  },
  async listStrategies() {
    return store().strategies ?? MOCK_SCENARIOS;
  },
  async saveStrategy(st) {
    const list = store().strategies ?? MOCK_SCENARIOS;
    const next = list.some((x) => x.id === st.id) ? list.map((x) => (x.id === st.id ? st : x)) : [...list, st];
    save({ ...store(), strategies: next });
  },
  async deleteStrategy(id) {
    save({ ...store(), strategies: (store().strategies ?? MOCK_SCENARIOS).filter((x) => x.id !== id) });
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
        source.listSuppliers().then((r) => r.suppliers),
        source.getPrices(),
        source.getSettings(),
        source.listItems().catch(() => [] as ItemRef[]),
      ]);
      return { lines: orders.lines, truncated: orders.truncated, suppliers, prices: prices.prices, weights: prices.weights, items, statusOptions: settings.lineStatuses };
    },
    async listSuppliers() {
      return api<SupplierList>(ctx, 'suppliers');
    },
    async saveSuppliers(list) {
      await api(ctx, 'suppliers', { method: 'POST', body: { suppliers: list } });
    },
    async deleteSupplier(id) {
      await api(ctx, 'suppliers', { method: 'DELETE', query: { id } });
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
      return api<PricesData>(ctx, 'prices');
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
    async listStrategies() {
      return (await api<{ strategies: Scenario[] }>(ctx, 'strategies')).strategies;
    },
    async saveStrategy(st) {
      await api(ctx, 'strategies', { method: 'PUT', body: st });
    },
    async deleteStrategy(id) {
      await api(ctx, 'strategies', { method: 'DELETE', query: { id } });
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
