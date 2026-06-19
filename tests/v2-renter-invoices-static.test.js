const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app/(site)/renter/invoices/page.tsx'), 'utf8');

const forbidden = [
  'const INV',
  'NextWave Commerce',
  'nextwave',
  'acme-prod',
  'Fatima',
  'fatima@',
  'SAR 2,184',
  'SAR 2.72',
  'SAR 412',
  'NextWave Commerce LLC',
  '1010382947',
  'VAT-310234567890003',
  'King Abdullah Road',
  'Riyadh 11564',
  'PDF',
  'XML',
  'mock',
  'fallback',
];

for (const text of forbidden) {
  assert(!source.includes(text), `v2 renter invoices must not ship prototype data or fake controls: ${text}`);
}

assert(source.includes('/renters/me?key='), 'v2 renter invoices should load renter account data');
assert(source.includes('/renters/balance?key='), 'v2 renter invoices should load wallet summary data');
assert(source.includes('/renters/me/invoices?key='), 'v2 renter invoices should load invoice history from the backend');
assert(source.includes('/renters/me/invoices/${i.numericId}/csv?key='), 'v2 renter invoices should link to the real CSV invoice export route');
assert(source.includes("loadState === 'missing-key'"), 'v2 renter invoices should render an explicit missing-key state');
assert(source.includes('No invoice rows yet'), 'v2 renter invoices should render an honest empty invoice state');
assert(source.includes('Legal billing profile fields are not configured yet'), 'v2 renter invoices should not invent CR/VAT/address data');

console.log('v2 renter invoices static checks passed');
