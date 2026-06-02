const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app/v2/provider/payouts/page.tsx'), 'utf8');

const forbidden = [
  'PAYOUTS',
  'Yazeed',
  'riyadh-studio',
  'SAR 218',
  'SAR 194',
  'SAR 5,826',
  'SAR 428.40',
  'SAR 1,482',
  'Bank Aljazira',
  'SA03 8000',
  '2847',
  'INV-2025',
  'VAT-300',
  'Riyadh Studio',
  '638 jobs',
  'Gold tier',
  'Mon · 8 Dec',
  '187 jobs',
  '14 rigs',
  'mock',
  'fallback',
  "bd: '4'",
  "bd: 'Silver'",
];

for (const text of forbidden) {
  assert(!source.includes(text), `v2 provider payouts must not ship prototype data: ${text}`);
}

assert(source.includes('/providers/me?key='), 'v2 provider payouts should load provider account data');
assert(source.includes('/providers/earnings?key='), 'v2 provider payouts should load provider payout balances');
assert(source.includes('/providers/me/withdrawals?key='), 'v2 provider payouts should load withdrawal history');
assert(source.includes('/providers/me/withdraw?key='), 'v2 provider payouts should submit withdrawal requests to the live route');
assert(source.includes("loadState === 'missing-key'"), 'v2 provider payouts should render a missing-key state');
assert(source.includes('No payout account on file'), 'v2 provider payouts should render an empty payout-account state');
assert(source.includes('No withdrawal requests yet'), 'v2 provider payouts should render an empty withdrawals state');
assert(source.includes('Automatic payout preferences need a backend preference endpoint'), 'v2 provider payouts should be honest about unavailable auto-schedule controls');
assert(source.includes('Withdrawal requests stay pending until admin review'), 'v2 provider payouts should describe the admin-reviewed payout flow');

console.log('v2 provider payouts static checks passed');
