// Consolidation simulation: groups the selected order lines by SKU and assigns each SKU to a supplier
// using the purchase price tiers and the franco of each supplier.
import { SHIPPING_FEE } from '../constants';
import type { Dataset, OrchestrationConfig, PriceTier } from '../types';

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

  const results: GroupedResult[] = [];
  groups.forEach((items) => {
    const total = items.reduce((s, i) => s + i.totalAmount, 0);
    const francoReached = items[0].franco === null || total >= items[0].franco;
    items.forEach((item, idx) => {
      const shippingFee = !francoReached && idx === 0 && !config.blockIfFrancoNotMet ? SHIPPING_FEE : 0;
      results.push({ ...item, francoReached, shippingFee });
    });
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
  };
}
