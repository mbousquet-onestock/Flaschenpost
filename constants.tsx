
import { Order, Scenario, Supplier, Product, PurchasePrice } from './types';

export const COLORS = {
  primary: '#00A79D', // OneStock Teal
  secondary: '#2D3E50', // Dark Blue
  accent: '#F39C12', // Orange
  success: '#27AE60',
  error: '#E74C3C',
};

export const SHIPPING_FEE = 80;

// --- MOCK DATA GENERATION ---

export const MOCK_SUPPLIERS: Supplier[] = Array.from({ length: 10 }).map((_, i) => ({
  id: `SUP-${i + 1}`,
  name: `Supplier ${String.fromCharCode(65 + i)}`,
  franco: i < 2 ? 100000 : 2000 + (Math.random() * 500 - 250), // Force first 2 suppliers to have very high franco
  rank: (i < 3 ? 'P1' : i < 7 ? 'P2' : 'P3') as 'P1' | 'P2' | 'P3',
}));

const WINE_NAMES = [
  'Château Margaux', 'Pétrus', 'Domaine de la Romanée-Conti', 'Château d\'Yquem', 'Château Mouton Rothschild',
  'Château Haut-Brion', 'Château Lafite Rothschild', 'Château Cheval Blanc', 'Château Latour', 'Château Ausone',
  'Champagne Krug', 'Champagne Dom Pérignon', 'Champagne Louis Roederer', 'Champagne Bollinger', 'Champagne Taittinger',
  'Gevrey-Chambertin', 'Meursault', 'Puligny-Montrachet', 'Chassagne-Montrachet', 'Vosne-Romanée',
  'Saint-Émilion Grand Cru', 'Pomerol', 'Pauillac', 'Saint-Julien', 'Margaux',
  'Châteauneuf-du-Pape', 'Hermitage', 'Côte-Rôtie', 'Condrieu', 'Gigondas'
];

export const MOCK_PRODUCTS: Product[] = Array.from({ length: 100 }).map((_, i) => {
  const basePrice = 15 + Math.random() * 150;
  const supplierId = MOCK_SUPPLIERS[Math.floor(Math.random() * MOCK_SUPPLIERS.length)].id;
  const wineName = WINE_NAMES[i % WINE_NAMES.length];
  const year = 2015 + Math.floor(Math.random() * 8);
  
  const prices: PurchasePrice[] = [
    { quantity: 1, price: basePrice },
    { quantity: 6, price: basePrice * 0.95 },
    { quantity: 12, price: basePrice * 0.90 },
    { quantity: 24, price: basePrice * 0.85 },
  ];

  return {
    sku: `WINE-${String(i + 1).padStart(3, '0')}`,
    name: `${wineName} ${year}`,
    supplierId,
    prices,
  };
});

export const MOCK_ORDERS: Order[] = Array.from({ length: 200 }).map((_, i) => {
  const product = MOCK_PRODUCTS[Math.floor(Math.random() * MOCK_PRODUCTS.length)];
  const statusOptions = ['Placed', 'Out Of Stock', 'Supplier'];
  
  return {
    id: `ORD-${String(i + 1).padStart(3, '0')}`,
    client: `Client ${i + 1}`,
    priority: (i % 3 === 0 ? 'P1' : i % 3 === 1 ? 'P2' : 'P3') as 'P1' | 'P2' | 'P3',
    sku: product.sku,
    quantity: 1 + Math.floor(Math.random() * 12),
    date: '2023-10-25',
    channel: i % 2 === 0 ? 'Retail' : 'E-commerce',
    status: statusOptions[Math.floor(Math.random() * statusOptions.length)],
  };
});

export const ORCHESTRATION_STRATEGIES = [
  { id: 'os-1', name: 'Suppliers P1', rulesCount: 3 },
  { id: 'os-2', name: 'Supplier A', rulesCount: 5 },
  { id: 'os-3', name: 'All suppliers', rulesCount: 7 },
  { id: 'os-4', name: 'Home Delivery - France', rulesCount: 5 },
  { id: 'os-5', name: 'Spare Parts', rulesCount: 6 },
  { id: 'os-6', name: 'Home Delivery - Standard - Italia', rulesCount: 4 },
];

export const MOCK_SCENARIOS: Scenario[] = [
  {
    id: 'SC-1',
    name: 'Suppliers P1',
    description: 'Focuses exclusively on P1 priority suppliers for critical fulfillment.',
    rules: ['P1 Suppliers only', 'Express handling', 'Direct routing'],
    metrics: { fulfillmentRate: 85, shippingCost: 4.5, deliveryTime: 3.2, carbonFootprint: 1.2, orderCount: 450, itemCount: 1205, totalPurchaseAmount: 12500 },
    lastExecuted: '2023-10-24 08:00',
    nextExecution: '2023-10-25 08:00',
    status: 'Active',
    config: { statuses: ['Placed', 'Out Of Stock'], stockPointType: 'supplier', stockPointRank: 'P1', consolidationMode: 'cheapest_price_franco', blockIfFrancoNotMet: true }
  },
  {
    id: 'SC-2',
    name: 'Supplier A',
    description: 'Focuses exclusively on Supplier A for targeted fulfillment.',
    rules: ['Supplier A only', 'Standard handling', 'Optimized routing'],
    metrics: { fulfillmentRate: 92, shippingCost: 7.8, deliveryTime: 1.1, carbonFootprint: 2.5, orderCount: 380, itemCount: 940, totalPurchaseAmount: 9800 },
    lastExecuted: '2023-10-24 10:00',
    nextExecution: '2023-10-25 10:00',
    status: 'Active',
    config: { statuses: ['Placed', 'Out Of Stock', 'Supplier'], stockPointType: 'supplier', stockPointRank: 'P2', consolidationMode: 'cheapest_price_franco', blockIfFrancoNotMet: false, selectedSupplierIds: ['SUP-1'] }
  },
  {
    id: 'SC-3',
    name: 'All suppliers',
    description: 'Full supplier network utilization for maximum order coverage.',
    rules: ['All Suppliers (P1-P3)', 'Eco handling', 'Network routing'],
    metrics: { fulfillmentRate: 78, shippingCost: 5.2, deliveryTime: 4.5, carbonFootprint: 0.6, orderCount: 290, itemCount: 710, totalPurchaseAmount: 7200 },
    lastExecuted: '2023-10-23 09:00',
    status: 'Draft',
    config: { statuses: ['Placed', 'Out Of Stock', 'Supplier'], stockPointType: 'supplier', stockPointRank: 'P3', consolidationMode: 'cheapest_price_franco', blockIfFrancoNotMet: false }
  }
];

export const FIELDS = [
  'Carrier information',
  'Carrier option',
  'Customer information',
  'Delivery method',
  'Delivery Promise',
  'Destination country',
  'Destination information',
  'Destination state',
  'Destination zipcode',
  'Item information',
  'Item quantity',
  'Item unit price',
  'Items price',
  'Order delivery type',
  'Order information',
  'Order original price',
  'Order price',
  'Order sales channel',
  'Order type',
  'Origin country',
  'Origin information',
  'Origin state',
  'Origin zipcode'
];

export const OPERATORS = ['is', 'is not', 'contains', 'in', 'not in', 'greater than', 'less than'];
