// Excel import / export of supplier purchase prices (SheetJS, loaded on demand).
// Workbook layout:
//   "Prices": supplier_id | supplier_name | item_id | item_name | min_qty | unit_price | weight_kg   (one row per price tier)
//   "Franco": supplier_id | supplier_name | franco | shipping_mode | shipping_amount
// Names are informative only; supplier_id and item_id are the keys.
import type * as XLSXNS from 'xlsx';
import type { ItemRef, ItemWeight, PriceTier, ShippingMode, SupplierRef, SupplierTerm } from '../types';
import { t } from './i18n';

type XLSX = typeof XLSXNS;

export const PRICE_HEADERS = ['supplier_id', 'supplier_name', 'item_id', 'item_name', 'min_qty', 'unit_price', 'weight_kg'];
export const FRANCO_HEADERS = ['supplier_id', 'supplier_name', 'franco', 'shipping_mode', 'shipping_amount'];

const INSTRUCTIONS = [
  ['Supplier purchase prices — import file'],
  [''],
  ['Sheet "Prices": one row per price tier.'],
  ['  supplier_id  ID of the supplier (required): a OneStock supplier stock point, or a new supplier that the import creates'],
  ['  item_id      ID (SKU) of the item in OneStock (required)'],
  ['  min_qty      Quantity from which the price applies, integer ≥ 1 (required). Use 1 for the base price.'],
  ['  unit_price   Purchase unit price excluding tax, in euros (required)'],
  ['  supplier_name  Name given to a supplier created by the import (optional)'],
  ['  item_name    Informative only, ignored by the import'],
  ['  weight_kg    Weight of one unit of the item in kg (optional), used by the shipping fees per kg'],
  ['  Degressive prices: add one row per tier, e.g. min_qty 1 → 10.00, min_qty 12 → 9.50, min_qty 24 → 9.00'],
  [''],
  ['Sheet "Franco": one row per supplier (optional).'],
  ['  franco           Order amount from which shipping is free, in euros. Leave empty for no franco.'],
  ['  shipping_mode    Shipping fee charged when the franco is not reached: fixed, weight or quantity. Empty: no fee.'],
  ['                   fixed = amount per order, weight = amount per kg, quantity = amount per unit ordered'],
  ['  shipping_amount  Amount of the shipping fee in euros (per order, per kg or per unit)'],
  ['  Without the shipping_mode column, the shipping fee stored for the supplier is kept.'],
];

/** Builds the workbook. With no prices, example rows are generated from the first suppliers and items. */
export function buildWorkbook(X: XLSX, knownSuppliers: SupplierRef[], knownItems: ItemRef[], prices?: PriceTier[], terms?: SupplierTerm[], weights?: ItemWeight[]) {
  // Without suppliers or items yet, the example uses fictitious ones.
  const suppliers: SupplierRef[] = knownSuppliers.length || prices
    ? knownSuppliers
    : [{ id: 'SUPPLIER_A', name: 'Supplier A', franco: null }, { id: 'SUPPLIER_B', name: 'Supplier B', franco: null }];
  const items: ItemRef[] = knownItems.length || prices ? knownItems : [1, 2, 3, 4].map((i) => ({ id: `SKU-00${i}`, name: `Item ${i}` }));
  const sName = new Map(suppliers.map((s) => [s.id, s.name]));
  const iName = new Map(items.map((i) => [i.id, i.name]));
  const weight = new Map((weights ?? []).map((w) => [w.itemId, w.weightKg]));
  if (!prices) items.slice(0, 4).forEach((it, i) => weight.set(it.id, [1.25, 1.4, 0.8, 2][i]));
  let rows: PriceTier[] = prices ?? [];
  if (!prices) {
    suppliers.slice(0, 2).forEach((s, si) =>
      items.slice(si * 2, si * 2 + 2).forEach((it, ii) => {
        const base = 10 + si * 5 + ii * 3;
        [1, 12, 24].forEach((q, qi) => rows.push({ supplierId: s.id, itemId: it.id, minQty: q, unitPrice: Math.round(base * (1 - qi * 0.05) * 100) / 100 }));
      }),
    );
  }
  const priceSheet = X.utils.aoa_to_sheet([
    PRICE_HEADERS,
    ...rows.map((p) => [p.supplierId, sName.get(p.supplierId) ?? '', p.itemId, iName.get(p.itemId) ?? '', p.minQty, p.unitPrice, weight.get(p.itemId) ?? '']),
  ]);
  priceSheet['!cols'] = [{ wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 32 }, { wch: 9 }, { wch: 11 }, { wch: 10 }];
  const termRows: SupplierTerm[] =
    terms ??
    suppliers.slice(0, 2).map((s, i) => ({
      supplierId: s.id,
      franco: i === 0 ? 1500 : 2000,
      shipping: i === 0 ? { mode: 'fixed' as const, amount: 80 } : { mode: 'weight' as const, amount: 0.6 },
    }));
  const francoSheet = X.utils.aoa_to_sheet([
    FRANCO_HEADERS,
    ...termRows.map((x) => [x.supplierId, sName.get(x.supplierId) ?? '', x.franco ?? '', x.shipping?.mode ?? '', x.shipping?.amount ?? '']),
  ]);
  francoSheet['!cols'] = [{ wch: 16 }, { wch: 24 }, { wch: 10 }, { wch: 14 }, { wch: 16 }];
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, priceSheet, 'Prices');
  X.utils.book_append_sheet(wb, francoSheet, 'Franco');
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(INSTRUCTIONS), 'Instructions');
  return wb;
}

export async function downloadWorkbook(filename: string, suppliers: SupplierRef[], items: ItemRef[], prices?: PriceTier[], terms?: SupplierTerm[], weights?: ItemWeight[]) {
  const X = await import('xlsx');
  X.writeFile(buildWorkbook(X, suppliers, items, prices, terms, weights), filename, { compression: true });
}

export type ParsedImport = {
  prices: PriceTier[];
  terms: SupplierTerm[];
  /** Item weights given in the weight_kg column. */
  weights: ItemWeight[];
  /** Suppliers of the file that do not exist yet: created by the import. */
  newSuppliers: { id: string; name: string }[];
  errors: string[];
  warnings: string[];
};

const ALIASES: Record<string, string[]> = {
  supplier_name: ['supplier_name', 'nom_fournisseur', 'fournisseur_nom', 'raison_sociale'],
  supplier_id: ['supplier_id', 'supplier', 'fournisseur', 'fournisseur_id', 'id_fournisseur', 'stock_point', 'endpoint_id'],
  item_id: ['item_id', 'item', 'sku', 'article', 'article_id', 'id_article', 'ean'],
  min_qty: ['min_qty', 'min_quantity', 'quantity', 'qty', 'qte', 'qte_min', 'quantite', 'quantite_min', 'quantité_min'],
  unit_price: ['unit_price', 'price', 'prix', 'prix_unitaire', 'prix_achat', 'tarif'],
  franco: ['franco', 'free_shipping', 'franco_de_port'],
  weight_kg: ['weight_kg', 'weight', 'poids', 'poids_kg'],
  shipping_mode: ['shipping_mode', 'mode_frais_port', 'mode_port', 'frais_port_mode'],
  shipping_amount: ['shipping_amount', 'shipping_fee', 'frais_port', 'montant_frais_port'],
};

const norm = (h: unknown) => String(h ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');

function num(v: unknown): number | undefined {
  if (typeof v === 'number') return isFinite(v) ? v : undefined;
  const s = String(v ?? '').trim().replace(/\s|€/g, '').replace(',', '.');
  if (!s) return undefined;
  const n = Number(s);
  return isFinite(n) ? n : undefined;
}

function rowsOf(X: XLSX, ws: XLSXNS.WorkSheet | undefined) {
  if (!ws) return { rows: [] as Record<string, unknown>[], cols: {} as Record<string, string> };
  const raw = X.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: true });
  const headers = Object.keys(raw[0] ?? {});
  const cols: Record<string, string> = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    const h = headers.find((x) => names.includes(norm(x)));
    if (h) cols[key] = h;
  }
  return { rows: raw, cols };
}

/** Accepts English and French values: fixed / forfait, weight / poids / kg, quantity / quantité / unité. */
function shippingMode(v: string): ShippingMode | undefined {
  const s = v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (['fixed', 'forfait', 'fixe', 'order', 'commande'].includes(s)) return 'fixed';
  if (['weight', 'poids', 'kg'].includes(s)) return 'weight';
  if (['quantity', 'quantite', 'qty', 'unit', 'unite', 'piece'].includes(s)) return 'quantity';
  return undefined;
}

/** Parses an .xlsx/.xls/.csv file. Unknown suppliers are listed in newSuppliers; unknown items are warnings. */
export async function parseImport(file: File, suppliers: SupplierRef[], items: ItemRef[]): Promise<ParsedImport> {
  const X = await import('xlsx');
  const wb = X.read(await file.arrayBuffer(), { type: 'array' });
  const errors: string[] = [];
  const warnings: string[] = [];
  const supplierIds = new Set(suppliers.map((s) => s.id));
  const itemIds = new Set(items.map((i) => i.id));
  const newSuppliers = new Map<string, string>();
  const weights = new Map<string, number>();
  const noteSupplier = (id: string, name: unknown) => {
    if (supplierIds.has(id)) return;
    const n = String(name ?? '').trim();
    if (!newSuppliers.get(id)) newSuppliers.set(id, n);
  };

  const priceSheetName = wb.SheetNames.find((n) => ['prices', 'prix', 'tarifs'].includes(n.toLowerCase())) ?? wb.SheetNames[0];
  const { rows, cols } = rowsOf(X, wb.Sheets[priceSheetName]);
  const missing = ['supplier_id', 'item_id', 'min_qty', 'unit_price'].filter((c) => !cols[c]);
  const prices: PriceTier[] = [];
  if (missing.length) errors.push(t('Sheet "{sheet}": missing column(s) {columns}', { sheet: priceSheetName, columns: missing.join(', ') }));
  else
    rows.forEach((r, i) => {
      const line = i + 2;
      const supplierId = String(r[cols.supplier_id] ?? '').trim();
      const itemId = String(r[cols.item_id] ?? '').trim();
      if (!supplierId && !itemId) return;
      const minQty = num(r[cols.min_qty]) ?? 1;
      const unitPrice = num(r[cols.unit_price]);
      if (!supplierId || !itemId) return errors.push(t('Prices row {row}: supplier_id and item_id are required', { row: line }));
      if (!Number.isInteger(minQty) || minQty < 1) return errors.push(t('Prices row {row}: min_qty must be an integer ≥ 1', { row: line }));
      if (unitPrice === undefined || unitPrice < 0) return errors.push(t('Prices row {row}: invalid unit_price', { row: line }));
      if (supplierId.length > 128) return errors.push(t('Prices row {row}: supplier ID too long', { row: line }));
      noteSupplier(supplierId, cols.supplier_name ? r[cols.supplier_name] : '');
      if (itemIds.size && !itemIds.has(itemId)) warnings.push(t('Prices row {row}: item "{item}" not found in the loaded items', { row: line, item: itemId }));
      if (cols.weight_kg && String(r[cols.weight_kg] ?? '').trim() !== '') {
        const w = num(r[cols.weight_kg]);
        if (w === undefined || w < 0) return errors.push(t('Prices row {row}: invalid weight_kg', { row: line }));
        weights.set(itemId, w);
      }
      prices.push({ supplierId, itemId, minQty, unitPrice: Math.round(unitPrice * 10000) / 10000 });
    });

  const seen = new Set<string>();
  prices.forEach((p) => {
    const k = `${p.supplierId}|${p.itemId}|${p.minQty}`;
    if (seen.has(k)) warnings.push(t('Duplicate tier {supplier} / {item} / {qty}: the last row wins', { supplier: p.supplierId, item: p.itemId, qty: p.minQty }));
    seen.add(k);
  });

  const terms: SupplierTerm[] = [];
  const francoName = wb.SheetNames.find((n) => n.toLowerCase() === 'franco');
  if (francoName) {
    const f = rowsOf(X, wb.Sheets[francoName]);
    if (!f.cols.supplier_id || !f.cols.franco) errors.push(t('Sheet "Franco": columns supplier_id and franco are required'));
    else
      f.rows.forEach((r, i) => {
        const supplierId = String(r[f.cols.supplier_id] ?? '').trim();
        if (!supplierId) return;
        const raw = r[f.cols.franco];
        const franco = raw === '' || raw === null ? null : num(raw);
        if (franco === undefined || (franco !== null && franco < 0)) return errors.push(t('Franco row {row}: invalid franco', { row: i + 2 }));
        noteSupplier(supplierId, f.cols.supplier_name ? r[f.cols.supplier_name] : '');
        if (!f.cols.shipping_mode) return terms.push({ supplierId, franco });
        const modeRaw = String(r[f.cols.shipping_mode] ?? '').trim();
        if (!modeRaw) return terms.push({ supplierId, franco, shipping: null });
        const mode = shippingMode(modeRaw);
        if (!mode) return errors.push(t('Franco row {row}: shipping_mode must be fixed, weight or quantity', { row: i + 2 }));
        const amount = f.cols.shipping_amount ? num(r[f.cols.shipping_amount]) : undefined;
        if (amount === undefined || amount < 0) return errors.push(t('Franco row {row}: invalid shipping_amount', { row: i + 2 }));
        terms.push({ supplierId, franco, shipping: { mode, amount } });
      });
  }
  if (!prices.length && !terms.length && !errors.length) errors.push(t('No price found in the file'));
  return { prices, terms, weights: [...weights].map(([itemId, weightKg]) => ({ itemId, weightKg })), newSuppliers: [...newSuppliers].map(([id, name]) => ({ id, name: name || id })), errors, warnings: warnings.length > 20 ? [...warnings.slice(0, 20), t('… {count} more', { count: warnings.length - 20 })] : warnings };
}
