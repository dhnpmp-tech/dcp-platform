const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app/(site)/renter/wallet/page.tsx'), 'utf8');

const forbidden = [
  'TOPUP_METHODS = [\\n  {\\n    nm:',
  'const TX',
  'NextWave Commerce',
  'acme-prod',
  'Fatima',
  'fatima@',
  'SAR 2,184',
  'SAR 2.72',
  'SAR 412',
  'j_ac81',
  'allam-7b',
  'jais-13b',
  'b_2847',
  '4192',
  'USDC',
  'Base L2',
  '0x7Fe3',
  'SARIE',
  'mada',
  'Bank Aljazira',
  'prototype TX',
  "bd: '3'",
  'defaultChecked',
  'mock',
  'fallback',
];

for (const text of forbidden) {
  assert(!source.includes(text), `v2 renter wallet must not ship prototype data or fake controls: ${text}`);
}

assert(source.includes('/renters/me?key='), 'v2 renter wallet should load the authenticated renter account');
assert(source.includes('/renters/balance?key='), 'v2 renter wallet should load real wallet balances');
assert(source.includes('/renters/me/payments?key='), 'v2 renter wallet should list renter payment history');
assert(source.includes('/payments/topup'), 'v2 renter wallet should initiate real top-ups through the payments route');
assert(source.includes('/payments/auto-topup-settings'), 'v2 renter wallet should read and save real auto top-up settings');
assert(source.includes("loadState === 'missing-key'"), 'v2 renter wallet should render an explicit missing-key state');
assert(source.includes('No wallet payments have been recorded'), 'v2 renter wallet should render an honest empty transaction state');
assert(source.includes('card_on_file'), 'v2 renter wallet should gate auto top-up controls on a saved card');
assert(source.includes('Idempotency-Key'), 'v2 renter wallet should send an idempotency key for top-up initiation');

console.log('v2 renter wallet static checks passed');
