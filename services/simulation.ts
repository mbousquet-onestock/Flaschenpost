// Consolidation simulation: groups the selected order lines by SKU and assigns each SKU to a supplier.
//  - "Cheapest purchase price": the supplier with the lowest unit price for the SKU's quantity.
//  - "Price and Franco optimisation": starts from the cheapest prices, then moves SKUs to other suppliers
//    (dearer unit price, but franco reached or lower shipping fees) while the total purchase cost
//    (goods + shipping fees) decreases. When a supplier's franco is not reached,
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
  /** Set when the optimisation chose another supplier than the cheapest one for this SKU. */
  cheapest?: { supplierName: string; unitPrice: number };
  /** Orders whose lines make up this purchase line. */
  orderIds: string[];
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
  /** Total with the cheapest unit price per SKU, to measure what the franco optimisation saves. */
  baselineAmount: number;
  /** Number of SKUs moved away from their cheapest supplier by the optimisation. */
  reassigned: number;
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
  const ordersBySku = new Map<string, Set<string>>();
  lines.forEach((l) => {
    skuTotals.set(l.sku, (skuTotals.get(l.sku) || 0) + l.quantity);
    ordersBySku.set(l.sku, (ordersBySku.get(l.sku) ?? new Set()).add(l.orderId));
  });

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

  // Offers per SKU: unit price of each supplier for the SKU's total quantity, cheapest first.
  const offers = new Map<string, Map<string, number>>();
  const unpricedSkus: string[] = [];
  skuTotals.forEach((quantity, sku) => {
    const bySupplier = new Map<string, number>();
    tiersBySku.get(sku)?.forEach((tiers, supplierId) => {
      const unitPrice = unitPriceFor(tiers, quantity);
      if (unitPrice !== undefined) bySupplier.set(supplierId, unitPrice);
    });
    if (bySupplier.size) offers.set(sku, new Map([...bySupplier].sort((x, y) => x[1] - y[1])));
    else unpricedSkus.push(sku);
  });
  const pricedSkus = [...offers.keys()];
  const weights = new Map((data.weights ?? []).filter((w) => w.weightKg !== null).map((w) => [w.itemId, w.weightKg as number]));

  /** Goods amount, franco status and shipping fee of a supplier for a set of SKUs. */
  const basket = (supplierId: string, skus: Iterable<string>) => {
    const supplier = suppliers.get(supplierId)!;
    let goods = 0;
    let units = 0;
    let kg = 0;
    const missingWeights: string[] = [];
    for (const sku of skus) {
      const q = skuTotals.get(sku)!;
      goods += q * offers.get(sku)!.get(supplierId)!;
      units += q;
      kg += q * (weights.get(sku) ?? 0);
      if (!weights.has(sku)) missingWeights.push(sku);
    }
    const francoReached = supplier.franco === null || goods >= supplier.franco;
    const rule = supplier.shipping ?? null;
    const basis = rule?.mode === 'weight' ? kg : rule?.mode === 'quantity' ? units : 1;
    const fee = francoReached || !rule ? 0 : Math.round(rule.amount * basis * 100) / 100;
    return { goods, units, francoReached, fee, rule, basis, missingWeights: rule?.mode === 'weight' ? missingWeights : [] };
  };

  // Cost the optimisation minimises: goods + shipping fees. With blocking, the lines of a supplier below its
  // franco are not ordered: they weigh a large penalty per unit so that reaching the francos comes first.
  const BLOCK_PENALTY = 1e6;
  const costOf = (supplierId: string, skus: Set<string>) => {
    if (!skus.size) return 0;
    const b = basket(supplierId, skus);
    if (b.francoReached) return b.goods;
    return config.blockIfFrancoNotMet ? BLOCK_PENALTY * b.units : b.goods + b.fee;
  };

  /** Cheapest supplier per SKU (mode "Cheapest purchase price", and starting point of the optimisation). */
  const cheapest = new Map(pricedSkus.map((sku) => [sku, offers.get(sku)!.keys().next().value as string]));
  const assignment = new Map(cheapest);

  if (config.consolidationMode === 'cheapest_price_franco') optimise(assignment);

  /** Local search: moves SKUs between suppliers while the total cost (goods + shipping fees) decreases. */
  function optimise(assign: Map<string, string>) {
    const members = new Map<string, Set<string>>();
    assign.forEach((sup, sku) => members.set(sup, (members.get(sup) ?? new Set()).add(sku)));
    const cost = new Map<string, number>();
    members.forEach((skus, sup) => cost.set(sup, costOf(sup, skus)));

    /** Cost change of a set of moves [sku, to supplier]; applies them when `apply` is true. */
    const delta = (moves: [string, string][], apply: boolean) => {
      const trial = new Map<string, Set<string>>();
      const get = (sup: string) => {
        if (!trial.has(sup)) trial.set(sup, new Set(members.get(sup) ?? []));
        return trial.get(sup)!;
      };
      for (const [sku, to] of moves) {
        get(assign.get(sku)!).delete(sku);
        get(to).add(sku);
      }
      let d = 0;
      const after = new Map<string, number>();
      trial.forEach((skus, sup) => {
        const c = costOf(sup, skus);
        after.set(sup, c);
        d += c - (cost.get(sup) ?? 0);
      });
      if (apply) {
        moves.forEach(([sku, to]) => assign.set(sku, to));
        trial.forEach((skus, sup) => members.set(sup, skus));
        after.forEach((c, sup) => cost.set(sup, c));
      }
      return d;
    };

    const EPS = 0.005;
    for (let pass = 0; pass < 30; pass++) {
      let improved = false;
      // 1. Move one SKU to another supplier (dearer unit price, but franco reached or a lower fee).
      for (const sku of pricedSkus) {
        let best: { to: string; d: number } | undefined;
        for (const to of offers.get(sku)!.keys()) {
          if (to === assign.get(sku)) continue;
          const d = delta([[sku, to]], false);
          if (d < -EPS && (!best || d < best.d)) best = { to, d };
        }
        if (best) {
          delta([[sku, best.to]], true);
          improved = true;
        }
      }
      // 2. Empty a supplier: move all its SKUs to their cheapest other supplier, preferring suppliers already used.
      for (const [sup, skus] of [...members]) {
        if (!skus.size) continue;
        const used = new Set([...members].filter(([s, m]) => s !== sup && m.size).map(([s]) => s));
        for (const preferUsed of [true, false]) {
          const moves: [string, string][] = [];
          for (const sku of skus) {
            const alternatives = [...offers.get(sku)!.keys()].filter((s) => s !== sup && (!preferUsed || used.has(s)));
            if (!alternatives.length) break;
            moves.push([sku, alternatives[0]]);
          }
          if (moves.length !== skus.size) continue;
          if (delta(moves, false) < -EPS) {
            delta(moves, true);
            improved = true;
            break;
          }
        }
      }
      if (!improved) break;
    }
  }

  /** Purchase lines, shipping fees and total of an assignment. */
  const build = (assign: Map<string, string>) => {
    const bySupplier = new Map<string, string[]>();
    assign.forEach((sup, sku) => bySupplier.set(sup, [...(bySupplier.get(sup) ?? []), sku]));
    const rows: GroupedResult[] = [];
    const fees: Record<string, SupplierShipping> = {};
    let total = 0;
    bySupplier.forEach((skus, supplierId) => {
      const supplier = suppliers.get(supplierId)!;
      const b = basket(supplierId, skus);
      const blocked = !b.francoReached && config.blockIfFrancoNotMet;
      const fee = blocked ? 0 : b.fee;
      if (!b.francoReached && !blocked)
        fees[supplierId] = { fee, mode: b.rule?.mode ?? null, rate: b.rule?.amount ?? 0, basis: Math.round(b.basis * 1000) / 1000, missingWeights: b.missingWeights };
      if (!blocked) total += b.goods + fee;
      skus.forEach((sku, idx) => {
        const unitPrice = offers.get(sku)!.get(supplierId)!;
        const cheapestId = cheapest.get(sku)!;
        rows.push({
          sku,
          productName: names.get(sku) ?? sku,
          supplierName: supplier.name,
          supplierId,
          totalQuantity: skuTotals.get(sku)!,
          orderIds: [...(ordersBySku.get(sku) ?? [])].sort(),
          unitPrice,
          totalAmount: unitPrice * skuTotals.get(sku)!,
          francoReached: b.francoReached,
          franco: supplier.franco,
          shippingFee: idx === 0 ? fee : 0,
          ...(cheapestId !== supplierId
            ? { cheapest: { supplierName: suppliers.get(cheapestId)!.name, unitPrice: offers.get(sku)!.get(cheapestId)! } }
            : {}),
        });
      });
    });
    rows.sort((x, y) => x.supplierName.localeCompare(y.supplierName) || x.sku.localeCompare(y.sku));
    return { rows, fees, total };
  };

  const final = build(assignment);
  const baseline = config.consolidationMode === 'cheapest_price_franco' ? build(cheapest) : final;
  const results = final.rows;
  const shipping = final.fees;
  const totalPurchaseAmount = final.total;

  return {
    results,
    matchedLines: lines.length,
    matchedOrders: new Set(lines.map((l) => l.orderId)).size,
    totalLines: data.lines.length,
    skuCount: skuTotals.size,
    unpricedSkus,
    totalPurchaseAmount,
    shipping,
    baselineAmount: baseline.total,
    reassigned: results.filter((r) => r.cheapest).length,
  };
}
