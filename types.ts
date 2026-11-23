
export interface Supplier {
  id: string;
  name: string;
  franco: number; // Free shipping threshold
  rank: StockPointRank;
}

export interface PurchasePrice {
  quantity: 1 | 6 | 12 | 24;
  price: number;
}

export interface Product {
  sku: string;
  name: string;
  supplierId: string;
  prices: PurchasePrice[];
}

/** Order line status. Static version: Placed / Out Of Stock / Supplier; dynamic version: OneStock line item states. */
export type OrderStatus = string;
export type StockPointType = 'warehouse' | 'supplier';
export type StockPointRank = 'P1' | 'P2' | 'P3';
export type ConsolidationMode = 'cheapest_price' | 'cheapest_price_franco';

/** Execution scenario. A condition that was removed is empty (statuses) or undefined (other fields). */
export interface OrchestrationConfig {
  /** Order line statuses to take; empty = no status condition. */
  statuses: OrderStatus[];
  stockPointType?: StockPointType;
  stockPointRank?: StockPointRank;
  consolidationMode: ConsolidationMode;
  blockIfFrancoNotMet: boolean;
  /** Suppliers to use; undefined = no supplier condition, [] = all suppliers. */
  selectedSupplierIds?: string[];
  /** Order creation date; undefined = no date condition. */
  orderDate?: OrderDateFilter;
  /** Sales channels to take; undefined = no condition. */
  salesChannels?: string[];
  /** Order types to take (an order matches when one of its types is listed); undefined = no condition. */
  orderTypes?: string[];
  /** Customer name or email contains one of these comma-separated texts; undefined = no condition. */
  customerQuery?: string;
  /** Item SKU or name contains one of these comma-separated texts; undefined = no condition. */
  itemQuery?: string;
  /** Conditions on information fields, all to be met. */
  infoConditions?: InfoCondition[];
  /**
   * Other groups of order conditions, combined with OR: an order line is taken when it meets the order conditions
   * above (group 1) or all the conditions of one of these groups. Stock point conditions apply to every group.
   */
  orGroups?: OrderConditions[];
}

/** Order conditions of one group (all to be met). */
export type OrderConditions = Pick<
  OrchestrationConfig,
  'statuses' | 'orderDate' | 'salesChannels' | 'orderTypes' | 'customerQuery' | 'itemQuery' | 'infoConditions'
>;

/** The order conditions of a configuration (group 1). */
export function pickOrderConditions(c: OrderConditions): OrderConditions {
  return {
    statuses: c.statuses, orderDate: c.orderDate, salesChannels: c.salesChannels, orderTypes: c.orderTypes,
    customerQuery: c.customerQuery, itemQuery: c.itemQuery, infoConditions: c.infoConditions,
  };
}

/**
 * Order creation date condition.
 * relative: from D-fromDays to D-toDays included (D = day of the run), e.g. 7 → 1 for "D-7 to D-1".
 * absolute: from / to days (YYYY-MM-DD) included; either may be empty.
 */
export type OrderDateFilter =
  | { mode: 'relative'; fromDays: number; toDays: number }
  | { mode: 'absolute'; from?: string; to?: string };

export interface Condition {
  id: string;
  field: string;
  operator: string;
  value: string;
  joiner?: 'AND' | 'OR';
  infoFieldName?: string;
  infoFieldType?: string;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  rules: string[];
  metrics: {
    fulfillmentRate: number;
    shippingCost: number;
    deliveryTime: number;
    carbonFootprint: number;
    orderCount: number;
    itemCount: number;
    totalPurchaseAmount?: number;
  };
  config?: OrchestrationConfig;
  lastExecuted?: string;
  nextExecution?: string;
  status?: 'Active' | 'Draft' | 'Scheduled';
  /** Execution days (0 = Sunday … 6 = Saturday) and times (HH:MM). */
  schedule?: { days: number[]; times: string[] };
}

export interface Order {
  id: string;
  client: string;
  priority: 'P1' | 'P2' | 'P3';
  sku: string;
  quantity: number;
  date: string;
  channel: string;
  status: string;
  proposedStockPoint?: string;
  types?: string[];
}

export enum Step {
  StrategyManagement = 0,
  OrchestrationScenarios = 1,
  ResultsVisualization = 2
}

// ---------- Data used by the simulation and the price management (static or dynamic source) ----------

export interface SupplierRef {
  id: string;
  name: string;
  /** Free shipping threshold, null when none is defined. */
  franco: number | null;
  rank?: StockPointRank;
  /** Shipping fee charged by the supplier when the franco is not reached; null when none is defined. */
  shipping?: ShippingFee | null;
  /** onestock: supplier stock point of OneStock; local: supplier entered in the app (manual or Excel import). */
  source?: 'onestock' | 'local';
}

export interface ItemRef {
  id: string;
  name: string;
}

/** Purchase price of an item at a supplier, from `minQty` units. */
export interface PriceTier {
  supplierId: string;
  itemId: string;
  minQty: number;
  unitPrice: number;
}

/** Shipping fee of a supplier: a fixed amount per order, an amount per kg, or an amount per unit ordered. */
export type ShippingMode = 'fixed' | 'weight' | 'quantity';
export interface ShippingFee {
  mode: ShippingMode;
  /** € per order (fixed), € per kg (weight) or € per unit (quantity). */
  amount: number;
}

export interface SupplierTerm {
  supplierId: string;
  franco: number | null;
  shipping?: ShippingFee | null;
}

export interface ItemWeight {
  itemId: string;
  weightKg: number | null;
}

export interface OrderLine {
  id: string;
  orderId: string;
  sku: string;
  quantity: number;
  status: string;
  priority?: 'P1' | 'P2' | 'P3';
  /** Creation date of the order: Unix timestamp (s or ms) or ISO date. */
  date?: number | string | null;
  /** Sales channel of the order. */
  channel?: string;
  /** Types of the order (e.g. ffs, ckc). */
  orderTypes?: string[];
  /** Customer: "First Last <email>". */
  customer?: string;
  /** Free "information" fields of the order, customer, order item, destination and carrier. */
  info?: Partial<Record<InfoSource, Record<string, InfoValue>>>;
}

/** Where an information field is read. */
export type InfoSource = 'order' | 'customer' | 'item' | 'destination' | 'carrier';
export type InfoValue = string | number | boolean;
export type InfoType = 'string' | 'number' | 'boolean';
export type InfoOperator = 'in' | 'not_in' | 'contains' | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'not_exists';

/** Condition on an information field, e.g. order information "gift" in ["yes"]. */
export interface InfoCondition {
  id: string;
  source: InfoSource;
  field: string;
  type: InfoType;
  operator: InfoOperator;
  values: string[];
}

export interface Dataset {
  lines: OrderLine[];
  items: ItemRef[];
  suppliers: SupplierRef[];
  prices: PriceTier[];
  /** Order line statuses offered in the execution scenario. */
  statusOptions: string[];
  /** Sales channels of the site (OneStock GET /sales_channels); empty when unavailable. */
  salesChannels?: { id: string; name: string }[];
  /** Item weights in kg, for shipping fees per kg. */
  weights?: ItemWeight[];
  truncated?: boolean;
}

export interface Settings {
  apiUser: string;
  hasPassword: boolean;
  connected: boolean;
  tokenAt: string | null;
  lineStatuses: string[];
  supplierType: string;
  /** Data source saved for the site (dynamic version only); null when not set. */
  dataMode?: 'static' | 'dynamic' | null;
  /** Status given to the order lines of a strategy when it is launched; empty = no change. */
  launchStatus?: string;
}

export interface SettingsUpdate {
  dataMode?: 'static' | 'dynamic';
  launchStatus?: string;
  apiUser?: string;
  password?: string;
  lineStatuses?: string[];
  supplierType?: string;
}

// ---------- Supplier purchase orders created by Launch ----------

/** Order line (OneStock line item group) supplied by a purchase line. */
export interface PurchaseOrderSource {
  id: string;
  orderId: string;
  status: string;
  quantity: number;
}

export interface PurchaseOrderLine {
  sku: string;
  productName?: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  orderLines: PurchaseOrderSource[];
}

export interface PurchaseOrder {
  id: string;
  createdAt: string;
  supplierId: string;
  supplierName: string;
  strategyId?: string;
  strategyName?: string;
  lines: PurchaseOrderLine[];
  goodsAmount: number;
  shippingFee: number;
  total: number;
  /** Result of the order line status change; null when no status after launch is set. */
  statusUpdate: { target: string; updated: number; failed: { lineId: string; orderId: string; error: string }[] } | null;
}

export type NewPurchaseOrder = Omit<PurchaseOrder, 'id' | 'createdAt' | 'statusUpdate'>;
