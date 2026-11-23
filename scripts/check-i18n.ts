import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
// Lists the texts passed to t() that have no French translation (npm run i18n:check).
import { fr } from '../services/i18n.fr';
const files: string[] = [];
const walk = (d: string) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) && files.push(p); });
['App.tsx', 'components', 'services'].forEach((x) => (x.endsWith('.tsx') ? files.push(x) : walk(x)));
const keys = new Set<string>();
const re = /\bt\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(re)) keys.add(eval(m[1]));
const dynamic = ['Status', 'Type', 'Rank', 'Suppliers', 'Order information', 'Stock point', 'Warehouse', 'Supplier', 'Active', 'Scheduled', 'Draft',
  'Cheapest purchase price', 'Price and Franco optimisation', 'Groups quantities to reach the best unit price tier per SKU.',
  'Optimises both the unit price and reaching the free shipping threshold (Franco).', 'Static', 'Dynamic',
  'Sample orders, items and suppliers. Prices and statuses are kept in this browser.',
  'Orders, items and suppliers from the OneStock API of the environment below. Settings and prices saved in the database.'];
dynamic.forEach((k) => keys.add(k));
const missing = [...keys].filter((k) => !(k in fr) && k !== 'c00');
const unused = Object.keys(fr).filter((k) => !keys.has(k));
console.log(`${keys.size} texts, ${missing.length} missing, ${unused.length} unused`);
missing.forEach((k) => console.log('missing:', k));
unused.forEach((k) => console.log('unused:', k));
if (missing.length) process.exit(1);
