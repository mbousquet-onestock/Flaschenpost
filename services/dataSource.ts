// Data source of the app, chosen in the settings tab (saved per environment + site ID):
//  - static: mock data from constants.tsx, edits kept in the browser;
//  - dynamic: OneStock API through the Vercel functions, settings and prices in the database.
// VITE_DATA_MODE only sets the default mode of a site that has none saved.
import { MOCK_ORDERS, MOCK_PRODUCTS, MOCK_SCENARIOS, MOCK_SUPPLIERS } from '../constants';
import type { DeliveryRestriction, Dataset, ItemRef, ItemWeight, OrderLine, StockCheckResult, NewPurchaseOrder, PurchaseOrder, PriceTier, Scenario, Settings, SettingsUpdate, SupplierRef, SupplierTerm } from '../types';
import { api } from './api';
import type { HostContext } from './context';
import { LANG, t } from './i18n';
import { ID_FEATURES } from './simulation';

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
  /** Saves the display order of the strategies. */
  reorderStrategies(ids: string[]): Promise<void>;
  /** Stock of items per stock location with a OneStock stock query (dynamic source only). */
  stockCheck(requestName: string, itemIds: string[], endpointIds: string[]): Promise<StockCheckResult>;
  /** Item features from OneStock (dynamic source; empty for the static one). */
  itemFeatures(itemIds: string[], features: string[]): Promise<Record<string, Record<string, string[]>>>;
  /** Supplier purchase orders created by launches, newest first. */
  listPurchaseOrders(): Promise<PurchaseOrder[]>;
  /** Saves the purchase orders of a launch and moves their order lines to the status after launch (settings). */
  launch(orders: NewPurchaseOrder[]): Promise<LaunchResult>;
  /** Deletes the supplier orders created before a day (YYYY-MM-DD), or all of them; returns the number deleted. */
  purgePurchaseOrders(before: string | null): Promise<number>;
}

export type LaunchResult = { purchaseOrders: PurchaseOrder[]; target: string; updated: number; failed: number };

/* ------------------------------------------------------------------ static ------------------------------------------------------------------ */

const STATIC_KEY = 'wave-orchestrator.static-data';
const STATIC_STATUSES = ['Placed', 'Out Of Stock', 'Supplier'];

type StaticStore = {
  purchaseOrders?: PurchaseOrder[];
  /** Status of sample order lines changed by a launch. */
  lineStatusChanges?: Record<string, string>;
  launchStatus?: string;
  showStockTest?: boolean;
  prices?: PriceTier[]; terms?: SupplierTerm[]; weights?: ItemWeight[]; lineStatuses?: string[]; strategies?: Scenario[]; localSuppliers?: { id: string; name: string }[] };

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
      lines: MOCK_ORDERS.map((o, i) => ({ ...o, i, status: s.lineStatusChanges?.[o.id] ?? o.status }))
        .filter((o) => statuses.includes(o.status))
        .map((o) => ({
          id: o.id, orderId: o.id, sku: o.sku, quantity: o.quantity, status: o.status, priority: o.priority, date: o.date,
          channel: o.channel, orderTypes: o.types, customer: `${o.client} <client${o.id.slice(4)}@example.com>`,
          info: sampleInfo(o.i),
        })),
      items: await this.listItems(),
      suppliers: (await this.listSuppliers()).suppliers,
      prices: s.prices ?? defaultPrices(),
      weights: s.weights ?? defaultWeights(),
      deliveryRestrictions: SAMPLE_RESTRICTIONS,
      statusOptions: statuses,
      salesChannels: [{ id: 'E-commerce', name: 'E-commerce France' }, { id: 'Retail', name: 'Retail stores' }],
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
    const s = store();
    return { apiUser: '', hasPassword: false, connected: false, tokenAt: null, lineStatuses: s.lineStatuses ?? STATIC_STATUSES, supplierType: 'supplier', launchStatus: s.launchStatus ?? '', showStockTest: s.showStockTest ?? true };
  },
  async saveSettings(u) {
    const s = store();
    save({
      ...s,
      ...(u.lineStatuses ? { lineStatuses: u.lineStatuses } : {}),
      ...(u.launchStatus !== undefined ? { launchStatus: u.launchStatus.trim() } : {}),
      ...(u.showStockTest !== undefined ? { showStockTest: u.showStockTest } : {}),
    });
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
  async stockCheck() {
    throw new Error(t('The stock test is only available with the dynamic data source.'));
  },
  async itemFeatures() {
    return {};
  },
  async reorderStrategies(ids) {
    const list = store().strategies ?? MOCK_SCENARIOS;
    const rank = new Map(ids.map((id, i) => [id, i]));
    save({ ...store(), strategies: [...list].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9)) });
  },
  async listPurchaseOrders() {
    return store().purchaseOrders ?? [];
  },
  async purgePurchaseOrders(before) {
    const s = store();
    const list = s.purchaseOrders ?? [];
    const kept = before ? list.filter((o) => o.createdAt.slice(0, 10) >= before) : [];
    save({ ...s, purchaseOrders: kept });
    return list.length - kept.length;
  },
  async launch(orders) {
    const s = store();
    const target = s.launchStatus ?? '';
    const now = new Date();
    const base = `PO-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${now.getTime().toString(36).slice(-5).toUpperCase()}`;
    const lines = orders.flatMap((o) => o.lines.flatMap((l) => l.orderLines));
    const created: PurchaseOrder[] = orders.map((o, i) => ({
      ...o,
      id: `${base}-${i + 1}`,
      createdAt: now.toISOString(),
      statusUpdate: target ? { target, updated: o.lines.reduce((n, l) => n + l.orderLines.length, 0), failed: [] } : null,
    }));
    const changes = { ...(s.lineStatusChanges ?? {}) };
    if (target) lines.forEach((l) => (changes[l.id] = target));
    save({ ...s, purchaseOrders: [...created, ...(s.purchaseOrders ?? [])], lineStatusChanges: changes });
    return { purchaseOrders: created, target, updated: target ? lines.length : 0, failed: 0 };
  },
};

/** Sample delivery restrictions of the static data (carriers of the sample orders: chronopost 18, colissimo standard). */
const SAMPLE_RESTRICTIONS: DeliveryRestriction[] = [
  { id: 'sample-heavy', itemFilter: { weight: [{ op: 'gt', value: 1.5 }] }, carriers: [{ name: 'colissimo', option: 'standard' }] },
  { id: 'sample-sku', itemFilter: { sku: [{ op: 'eq', value: 'WINE-003' }] }, carriers: [{ name: 'chronopost', option: '18' }] },
];

/** Sample "information" fields of the static data. */
function sampleInfo(i: number): OrderLine['info'] {
  return {
    order: { gift: i % 4 === 0 ? 'yes' : 'no', priority_level: (i % 3) + 1 },
    customer: { loyalty: ['gold', 'silver', 'none'][i % 3] },
    item: { color: ['red', 'white', 'rose'][i % 3] },
    destination: { country: i % 5 === 0 ? 'BE' : 'FR' },
    carrier: { name: i % 2 ? 'chronopost' : 'colissimo', option: i % 2 ? '18' : 'standard' },
  };
}

/* ------------------------------------------------------------------ dynamic ------------------------------------------------------------------ */

const ITEM_PAGE = 100;
const MAX_ITEMS = 3000;

function dynamicSource(ctx: HostContext): DataSource {
  let itemsCache: Promise<ItemRef[]> | undefined;
  const source: DataSource = {
    mode: 'dynamic',
    context: ctx,
    async loadDataset() {
      const [orders, suppliers, prices, settings, items, salesChannels] = await Promise.all([
        api<{ lines: Dataset['lines']; truncated: boolean }>(ctx, 'orders'),
        source.listSuppliers().then((r) => r.suppliers),
        source.getPrices(),
        source.getSettings(),
        source.listItems().catch(() => [] as ItemRef[]),
        // Optional: without it, the channels found in the orders are offered.
        api<{ salesChannels: { id: string; name: string }[] }>(ctx, 'sales-channels').then((r) => r.salesChannels, () => []),
      ]);
      // Delivery restrictions (optional) and the features of the ordered items they test.
      const deliveryRestrictions = await api<{ restrictions: DeliveryRestriction[] }>(ctx, 'delivery-restrictions').then((r) => r.restrictions, () => []);
      // "sku" is the item ID: only the other features are read from OneStock.
      const featureNames = [...new Set(deliveryRestrictions.flatMap((r) => Object.keys(r.itemFilter)))].filter((f) => !ID_FEATURES.includes(f));
      const skus = [...new Set(orders.lines.map((l) => l.sku))].slice(0, 1000);
      const itemFeatures = featureNames.length && skus.length
        ? await api<{ features: Record<string, Record<string, string[]>> }>(ctx, 'item-features', { method: 'POST', body: { itemIds: skus, features: featureNames, lang: LANG } })
            .then((r) => r.features, () => ({}))
        : {};
      return {
        lines: orders.lines, truncated: orders.truncated, suppliers, prices: prices.prices, weights: prices.weights, items,
        statusOptions: settings.lineStatuses, salesChannels, deliveryRestrictions, itemFeatures,
      };
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
    async reorderStrategies(ids) {
      await api(ctx, 'strategies', { method: 'PATCH', body: { order: ids } });
    },
    async itemFeatures(itemIds, features) {
      if (!itemIds.length || !features.length) return {};
      return (await api<{ features: Record<string, Record<string, string[]>> }>(ctx, 'item-features', { method: 'POST', body: { itemIds, features, lang: LANG } })).features;
    },
    async stockCheck(requestName, itemIds, endpointIds) {
      return api<StockCheckResult>(ctx, 'stock-check', { method: 'POST', body: { requestName, itemIds, endpointIds } });
    },
    async listPurchaseOrders() {
      return (await api<{ purchaseOrders: PurchaseOrder[] }>(ctx, 'purchase-orders')).purchaseOrders;
    },
    async purgePurchaseOrders(before) {
      const r = await api<{ deleted: number }>(ctx, 'purchase-orders', { method: 'DELETE', query: before ? { before } : { all: 1 } });
      return r.deleted;
    },
    async launch(orders) {
      return api<LaunchResult>(ctx, 'purchase-orders', { method: 'POST', body: { orders } });
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
