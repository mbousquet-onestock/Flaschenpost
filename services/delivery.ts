// Delivery restrictions: a restriction forbids carriers (name + service) for the items matching its feature
// filter. For each customer order whose planned carrier (delivery promise) is forbidden for one of its items,
// the simulation proposes another carrier allowed for every item, or else several parcels with different carriers.
import type { Carrier, DeliveryRestriction, FeatureCondition, OrderLine } from '../types';

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
export const carrierLabel = (c: Carrier) => (c.option ? `${c.name} · ${c.option}` : c.name);
const sameCarrier = (a: Carrier, b: Carrier) => norm(a.name) === norm(b.name) && (!b.option || !a.option || norm(a.option) === norm(b.option));

/** Values of an item feature; "sku" falls back to the item ID. */
export type FeatureLookup = (sku: string, feature: string) => string[];

function conditionMet(values: string[], c: FeatureCondition): boolean {
  const list = (Array.isArray(c.value) ? c.value : [c.value]).map(String);
  const nums = values.map((v) => Number(String(v).replace(',', '.'))).filter((n) => !isNaN(n));
  const target = Number(String(list[0]).replace(',', '.'));
  switch (norm(c.op)) {
    case 'eq': return values.some((v) => list.some((x) => norm(x) === norm(v)));
    case 'neq': case 'ne': return !values.some((v) => list.some((x) => norm(x) === norm(v)));
    case 'in': return values.some((v) => list.some((x) => norm(x) === norm(v)));
    case 'nin': case 'not_in': return !values.some((v) => list.some((x) => norm(x) === norm(v)));
    case 'gt': return nums.some((n) => n > target);
    case 'gte': return nums.some((n) => n >= target);
    case 'lt': return nums.some((n) => n < target);
    case 'lte': return nums.some((n) => n <= target);
    case 'contains': return values.some((v) => list.some((x) => norm(v).includes(norm(x))));
    default: return false;
  }
}

/** Whether a restriction applies to an item: every feature condition met (an unknown feature does not match). */
export function restrictionApplies(r: DeliveryRestriction, sku: string, features: FeatureLookup): boolean {
  const entries = Object.entries(r.itemFilter);
  if (!entries.length) return false;
  return entries.every(([feature, conditions]) => {
    const values = features(sku, feature);
    return values.length > 0 && conditions.every((c) => conditionMet(values, c));
  });
}

/** Carriers forbidden for an item, with the restriction that forbids each of them. */
export function forbiddenFor(sku: string, restrictions: DeliveryRestriction[], features: FeatureLookup): { carrier: Carrier; restrictionId: string }[] {
  return restrictions.filter((r) => restrictionApplies(r, sku, features)).flatMap((r) => r.carriers.map((carrier) => ({ carrier, restrictionId: r.id })));
}

export interface DeliveryIssue {
  orderId: string;
  planned: Carrier;
  items: { sku: string; forbidden: boolean; restrictionIds: string[] }[];
  /** switch: one carrier for the whole order; split: several parcels; none: some items have no allowed carrier. */
  proposal:
    | { type: 'switch'; carrier: Carrier }
    | { type: 'split'; parcels: { carrier: Carrier; skus: string[] }[] }
    | { type: 'none'; skus: string[]; parcels: { carrier: Carrier; skus: string[] }[] };
}

/** Orders whose planned carrier is forbidden for one of their items, with a proposal for each. */
export function deliveryIssues(lines: OrderLine[], restrictions: DeliveryRestriction[], features: FeatureLookup): DeliveryIssue[] {
  if (!restrictions.length) return [];
  const plannedOf = (l: OrderLine): Carrier | null => {
    const c = l.info?.carrier;
    return c?.name ? { name: String(c.name), ...(c.option ? { option: String(c.option) } : {}) } : null;
  };
  // Carriers known on the site: planned on the orders and named by the restrictions.
  const known: Carrier[] = [];
  const addKnown = (c: Carrier) => {
    if (c.option && !known.some((k) => norm(k.name) === norm(c.name) && norm(k.option) === norm(c.option))) known.push(c);
  };
  lines.forEach((l) => { const c = plannedOf(l); if (c) addKnown(c); });
  restrictions.forEach((r) => r.carriers.forEach(addKnown));

  const forbiddenCache = new Map<string, ReturnType<typeof forbiddenFor>>();
  const forbidden = (sku: string) => {
    if (!forbiddenCache.has(sku)) forbiddenCache.set(sku, forbiddenFor(sku, restrictions, features));
    return forbiddenCache.get(sku)!;
  };
  const allowed = (sku: string, c: Carrier) => !forbidden(sku).some((f) => sameCarrier(c, f.carrier));

  const byOrder = new Map<string, OrderLine[]>();
  lines.forEach((l) => byOrder.set(l.orderId, [...(byOrder.get(l.orderId) ?? []), l]));

  const issues: DeliveryIssue[] = [];
  byOrder.forEach((orderLines, orderId) => {
    const planned = orderLines.map(plannedOf).find(Boolean);
    if (!planned) return;
    const skus = [...new Set(orderLines.map((l) => l.sku))];
    if (skus.every((s) => allowed(s, planned))) return;
    const items = skus.map((sku) => {
      const hits = forbidden(sku).filter((f) => sameCarrier(planned, f.carrier));
      return { sku, forbidden: hits.length > 0, restrictionIds: [...new Set(hits.map((h) => h.restrictionId))] };
    });
    // Same carrier with another service first, then the others.
    const candidates = known
      .filter((c) => !(norm(c.name) === norm(planned.name) && norm(c.option) === norm(planned.option)))
      .sort((a, b) => Number(norm(b.name) === norm(planned.name)) - Number(norm(a.name) === norm(planned.name)));
    const single = candidates.find((c) => skus.every((s) => allowed(s, c)));
    if (single) return issues.push({ orderId, planned, items, proposal: { type: 'switch', carrier: single } });

    // Several parcels: allowed items stay with the planned carrier, the others go to the first allowed carrier.
    const parcels = new Map<string, { carrier: Carrier; skus: string[] }>();
    const none: string[] = [];
    skus.forEach((sku) => {
      const c = allowed(sku, planned) ? planned : candidates.find((x) => allowed(sku, x));
      if (!c) return none.push(sku);
      const key = carrierLabel(c);
      parcels.set(key, { carrier: c, skus: [...(parcels.get(key)?.skus ?? []), sku] });
    });
    issues.push({ orderId, planned, items, proposal: none.length ? { type: 'none', skus: none, parcels: [...parcels.values()] } : { type: 'split', parcels: [...parcels.values()] } });
  });
  return issues;
}
