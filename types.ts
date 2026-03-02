
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

export type OrderStatus = 'Placed' | 'Out Of Stock' | 'Supplier';
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
