// Excel import / export of supplier purchase prices (SheetJS, loaded on demand).
// Workbook layout:
//   "Prices": supplier_id | supplier_name | item_id | item_name | min_qty | unit_price   (one row per price tier)
//   "Franco": supplier_id | supplier_name | franco
// Names are informative only; supplier_id and item_id are the keys.
import type * as XLSXNS from 'xlsx';
import type { ItemRef, PriceTier, SupplierRef, SupplierTerm } from '../types';

type XLSX = typeof XLSXNS;

export const PRICE_HEADERS = ['supplier_id', 'supplier_name', 'item_id', 'item_name', 'min_qty', 'unit_price'];
export const FRANCO_HEADERS = ['supplier_id', 'supplier_name', 'franco'];

const INSTRUCTIONS = [
  ['Supplier purchase prices — import file'],
  [''],
  ['Sheet "Prices": one row per price tier.'],
  ['  supplier_id  ID of the supplier stock point in OneStock (required)'],
  ['  item_id      ID (SKU) of the item in OneStock (required)'],
  ['  min_qty      Quantity from which the price applies, integer ≥ 1 (required). Use 1 for the base price.'],
  ['  unit_price   Purchase unit price excluding tax, in euros (required)'],
  ['  supplier_name, item_name  Informative only, ignored by the import'],
  ['  Degressive prices: add one row per tier, e.g. min_qty 1 → 10.00, min_qty 12 → 9.50, min_qty 24 → 9.00'],
  [''],
  ['Sheet "Franco": one row per supplier (optional).'],
  ['  franco  Order amount from which shipping is free, in euros. Leave empty for no franco.'],
];

/** Builds the workbook. With no prices, example rows are generated from the first suppliers and items. */
export function buildWorkbook(X: XLSX, suppliers: SupplierRef[], items: ItemRef[], prices?: PriceTier[], terms?: SupplierTerm[]) {
  const sName = new Map(suppliers.map((s) => [s.id, s.name]));
  const iName = new Map(items.map((i) => [i.id, i.name]));
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
    ...rows.map((p) => [p.supplierId, sName.get(p.supplierId) ?? '', p.itemId, iName.get(p.itemId) ?? '', p.minQty, p.unitPrice]),
  ]);
  priceSheet['!cols'] = [{ wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 32 }, { wch: 9 }, { wch: 11 }];
  const termRows = terms ?? suppliers.slice(0, 2).map((s, i) => ({ supplierId: s.id, franco: i === 0 ? 1500 : 2000 }));
  const francoSheet = X.utils.aoa_to_sheet([FRANCO_HEADERS, ...termRows.map((t) => [t.supplierId, sName.get(t.supplierId) ?? '', t.franco ?? ''])]);
  francoSheet['!cols'] = [{ wch: 16 }, { wch: 24 }, { wch: 10 }];
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, priceSheet, 'Prices');
  X.utils.book_append_sheet(wb, francoSheet, 'Franco');
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(INSTRUCTIONS), 'Instructions');
  return wb;
}

export async function downloadWorkbook(filename: string, suppliers: SupplierRef[], items: ItemRef[], prices?: PriceTier[], terms?: SupplierTerm[]) {
  const X = await import('xlsx');
  X.writeFile(buildWorkbook(X, suppliers, items, prices, terms), filename, { compression: true });
}

export type ParsedImport = {
  prices: PriceTier[];
  terms: SupplierTerm[];
  errors: string[];
  warnings: string[];
};

const ALIASES: Record<string, string[]> = {
  supplier_id: ['supplier_id', 'supplier', 'fournisseur', 'fournisseur_id', 'id_fournisseur', 'stock_point', 'endpoint_id'],
  item_id: ['item_id', 'item', 'sku', 'article', 'article_id', 'id_article', 'ean'],
  min_qty: ['min_qty', 'min_quantity', 'quantity', 'qty', 'qte', 'qte_min', 'quantite', 'quantite_min', 'quantité_min'],
  unit_price: ['unit_price', 'price', 'prix', 'prix_unitaire', 'prix_achat', 'tarif'],
  franco: ['franco', 'free_shipping', 'franco_de_port'],
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

/** Parses an .xlsx/.xls/.csv file. Unknown suppliers or items are reported as errors / warnings. */
export async function parseImport(file: File, suppliers: SupplierRef[], items: ItemRef[]): Promise<ParsedImport> {
  const X = await import('xlsx');
  const wb = X.read(await file.arrayBuffer(), { type: 'array' });
  const errors: string[] = [];
  const warnings: string[] = [];
  const supplierIds = new Set(suppliers.map((s) => s.id));
  const itemIds = new Set(items.map((i) => i.id));

  const priceSheetName = wb.SheetNames.find((n) => ['prices', 'prix', 'tarifs'].includes(n.toLowerCase())) ?? wb.SheetNames[0];
  const { rows, cols } = rowsOf(X, wb.Sheets[priceSheetName]);
  const missing = ['supplier_id', 'item_id', 'min_qty', 'unit_price'].filter((c) => !cols[c]);
  const prices: PriceTier[] = [];
  if (missing.length) errors.push(`Sheet "${priceSheetName}": missing column(s) ${missing.join(', ')}`);
  else
    rows.forEach((r, i) => {
      const line = i + 2;
      const supplierId = String(r[cols.supplier_id] ?? '').trim();
      const itemId = String(r[cols.item_id] ?? '').trim();
      if (!supplierId && !itemId) return;
      const minQty = num(r[cols.min_qty]) ?? 1;
      const unitPrice = num(r[cols.unit_price]);
      if (!supplierId || !itemId) return errors.push(`Prices row ${line}: supplier_id and item_id are required`);
      if (!Number.isInteger(minQty) || minQty < 1) return errors.push(`Prices row ${line}: min_qty must be an integer ≥ 1`);
      if (unitPrice === undefined || unitPrice < 0) return errors.push(`Prices row ${line}: invalid unit_price`);
      if (!supplierIds.has(supplierId)) return errors.push(`Prices row ${line}: unknown supplier "${supplierId}"`);
      if (itemIds.size && !itemIds.has(itemId)) warnings.push(`Prices row ${line}: item "${itemId}" not found in the loaded items`);
      prices.push({ supplierId, itemId, minQty, unitPrice: Math.round(unitPrice * 10000) / 10000 });
    });

  const seen = new Set<string>();
  prices.forEach((p) => {
    const k = `${p.supplierId}|${p.itemId}|${p.minQty}`;
    if (seen.has(k)) warnings.push(`Duplicate tier ${p.supplierId} / ${p.itemId} / ${p.minQty}: the last row wins`);
    seen.add(k);
  });

  const terms: SupplierTerm[] = [];
  const francoName = wb.SheetNames.find((n) => n.toLowerCase() === 'franco');
  if (francoName) {
    const f = rowsOf(X, wb.Sheets[francoName]);
    if (!f.cols.supplier_id || !f.cols.franco) errors.push('Sheet "Franco": columns supplier_id and franco are required');
    else
      f.rows.forEach((r, i) => {
        const supplierId = String(r[f.cols.supplier_id] ?? '').trim();
        if (!supplierId) return;
        const raw = r[f.cols.franco];
        const franco = raw === '' || raw === null ? null : num(raw);
        if (franco === undefined || (franco !== null && franco < 0)) return errors.push(`Franco row ${i + 2}: invalid franco`);
        if (!supplierIds.has(supplierId)) return errors.push(`Franco row ${i + 2}: unknown supplier "${supplierId}"`);
        terms.push({ supplierId, franco });
      });
  }
  if (!prices.length && !terms.length && !errors.length) errors.push('No price found in the file');
  return { prices, terms, errors, warnings: warnings.length > 20 ? [...warnings.slice(0, 20), `… ${warnings.length - 20} more`] : warnings };
}
