
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
}

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
}

export interface Dataset {
  lines: OrderLine[];
  items: ItemRef[];
  suppliers: SupplierRef[];
  prices: PriceTier[];
  /** Order line statuses offered in the execution scenario. */
  statusOptions: string[];
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
