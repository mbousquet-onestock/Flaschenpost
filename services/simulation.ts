// Consolidation simulation: groups the selected order lines by SKU and assigns each SKU to a supplier
// using the purchase price tiers and the franco of each supplier. When a supplier's franco is not reached,
// its shipping fee is added: a fixed amount, an amount per kg (item weights) or an amount per unit.
import type { Dataset, OrchestrationConfig, PriceTier, ShippingMode } from '../types';

/** Shipping fee of a supplier whose franco is not reached. */
export interface SupplierShipping {
  fee: number;
  /** null when the supplier has no shipping fee defined. */
  mode: ShippingMode | null;
  /** € per order, per kg or per unit. */
  rate: number;
  /** Units (quantity mode) or kg (weight mode) the rate applies to. */
  basis: number;
  /** Items without a weight, counted as 0 kg (weight mode). */
  missingWeights: string[];
}

export interface GroupedResult {
  sku: string;
  productName: string;
  supplierName: string;
  supplierId: string;
  totalQuantity: number;
  unitPrice: number;
  totalAmount: number;
  francoReached: boolean;
  franco: number | null;
  shippingFee?: number;
}

export interface SimulationResult {
  results: GroupedResult[];
  matchedLines: number;
  matchedOrders: number;
  totalLines: number;
  skuCount: number;
  unpricedSkus: string[];
  totalPurchaseAmount: number;
  /** Per supplier whose franco is not reached (and orders not blocked). */
  shipping: Record<string, SupplierShipping>;
}

/** Unit price for a quantity: the tier with the highest minimum quantity reached, else the lowest tier. */
export function unitPriceFor(tiers: PriceTier[], quantity: number): number | undefined {
  if (!tiers.length) return undefined;
  const sorted = [...tiers].sort((a, b) => b.minQty - a.minQty);
  return (sorted.find((t) => quantity >= t.minQty) ?? sorted[sorted.length - 1]).unitPrice;
}

export function simulate(data: Dataset, config: OrchestrationConfig): SimulationResult {
  const lines = data.lines.filter((l) => {
    if (config.statuses.length && !config.statuses.includes(l.status)) return false;
    if (!l.priority || !config.stockPointRank) return true;
    if (config.stockPointRank === 'P1') return l.priority === 'P1';
    if (config.stockPointRank === 'P2') return l.priority !== 'P3';
    return true;
  });

  const skuTotals = new Map<string, number>();
  lines.forEach((l) => skuTotals.set(l.sku, (skuTotals.get(l.sku) || 0) + l.quantity));

  const selected = config.selectedSupplierIds || [];
  const suppliers = new Map(data.suppliers.map((s) => [s.id, s]));
  const names = new Map(data.items.map((i) => [i.id, i.name]));
  const tiersBySku = new Map<string, Map<string, PriceTier[]>>();
  data.prices.forEach((p) => {
    if (!suppliers.has(p.supplierId)) return;
    if (selected.length && !selected.includes(p.supplierId)) return;
    const bySupplier = tiersBySku.get(p.itemId) ?? new Map<string, PriceTier[]>();
    bySupplier.set(p.supplierId, [...(bySupplier.get(p.supplierId) ?? []), p]);
    tiersBySku.set(p.itemId, bySupplier);
  });

  const groups = new Map<string, GroupedResult[]>();
  const unpricedSkus: string[] = [];
  skuTotals.forEach((quantity, sku) => {
    // Cheapest supplier for this quantity
    let best: { supplierId: string; unitPrice: number } | undefined;
    tiersBySku.get(sku)?.forEach((tiers, supplierId) => {
      const unitPrice = unitPriceFor(tiers, quantity);
      if (unitPrice !== undefined && (!best || unitPrice < best.unitPrice)) best = { supplierId, unitPrice };
    });
    if (!best) {
      unpricedSkus.push(sku);
      return;
    }
    const supplier = suppliers.get(best.supplierId)!;
    const list = groups.get(supplier.id) ?? [];
    list.push({
      sku,
      productName: names.get(sku) ?? sku,
      supplierName: supplier.name,
      supplierId: supplier.id,
      totalQuantity: quantity,
      unitPrice: best.unitPrice,
      totalAmount: best.unitPrice * quantity,
      francoReached: false,
      franco: supplier.franco,
    });
    groups.set(supplier.id, list);
  });

  const weights = new Map((data.weights ?? []).filter((w) => w.weightKg !== null).map((w) => [w.itemId, w.weightKg as number]));
  const results: GroupedResult[] = [];
  const shipping: Record<string, SupplierShipping> = {};
  groups.forEach((items, supplierId) => {
    const total = items.reduce((s, i) => s + i.totalAmount, 0);
    const francoReached = items[0].franco === null || total >= items[0].franco;
    let fee = 0;
    if (!francoReached && !config.blockIfFrancoNotMet) {
      const rule = suppliers.get(supplierId)?.shipping ?? null;
      const units = items.reduce((s, i) => s + i.totalQuantity, 0);
      const missingWeights = rule?.mode === 'weight' ? items.filter((i) => !weights.has(i.sku)).map((i) => i.sku) : [];
      const kg = items.reduce((s, i) => s + i.totalQuantity * (weights.get(i.sku) ?? 0), 0);
      const basis = rule?.mode === 'weight' ? kg : rule?.mode === 'quantity' ? units : 1;
      fee = rule ? Math.round(rule.amount * basis * 100) / 100 : 0;
      shipping[supplierId] = { fee, mode: rule?.mode ?? null, rate: rule?.amount ?? 0, basis: Math.round(basis * 1000) / 1000, missingWeights };
    }
    items.forEach((item, idx) => results.push({ ...item, francoReached, shippingFee: idx === 0 ? fee : 0 }));
  });
  results.sort((a, b) => a.supplierName.localeCompare(b.supplierName) || a.sku.localeCompare(b.sku));

  const totalPurchaseAmount = results.reduce(
    (sum, r) => (config.blockIfFrancoNotMet && !r.francoReached ? sum : sum + r.totalAmount + (r.shippingFee || 0)),
    0,
  );

  return {
    results,
    matchedLines: lines.length,
    matchedOrders: new Set(lines.map((l) => l.orderId)).size,
    totalLines: data.lines.length,
    skuCount: skuTotals.size,
    unpricedSkus,
    totalPurchaseAmount,
    shipping,
  };
}
