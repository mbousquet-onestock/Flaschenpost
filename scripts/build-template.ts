// Generates public/templates/supplier-prices-example.xlsx from the sample suppliers and items.
import * as XLSX from 'xlsx';
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildWorkbook } from '../services/excel';
import { MOCK_PRODUCTS, MOCK_SUPPLIERS } from '../constants';

mkdirSync('public/templates', { recursive: true });
const wb = buildWorkbook(
  XLSX,
  MOCK_SUPPLIERS.map((s) => ({ id: s.id, name: s.name, franco: null })),
  MOCK_PRODUCTS.map((p) => ({ id: p.sku, name: p.name })),
);
writeFileSync('public/templates/supplier-prices-example.xlsx', XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }));
console.log('public/templates/supplier-prices-example.xlsx');
