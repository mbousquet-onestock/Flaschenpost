
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

export interface OrchestrationConfig {
  statuses: OrderStatus[];
  stockPointType: StockPointType;
  stockPointRank: StockPointRank;
  consolidationMode: ConsolidationMode;
  blockIfFrancoNotMet: boolean;
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

export interface SupplierTerm {
  supplierId: string;
  franco: number | null;
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
  truncated?: boolean;
}

export interface Settings {
  apiUser: string;
  hasPassword: boolean;
  connected: boolean;
  tokenAt: string | null;
  lineStatuses: string[];
  supplierType: string;
}

export interface SettingsUpdate {
  apiUser?: string;
  password?: string;
  lineStatuses?: string[];
  supplierType?: string;
}
