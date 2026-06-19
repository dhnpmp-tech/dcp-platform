const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app/(site)/provider/earnings/page.tsx'), 'utf8');

const forbidden = [
  'buildEarn',
  'BY_RIG',
  'BY_MODEL',
  'PAYOUTS',
  'studio-main',
  'studio-bench',
  'office-mac',
  'garage-3090',
  'Yazeed',
  'riyadh-studio',
  'SAR 218',
  'SAR 194',
  'SAR 5,826',
  'Mon · SAR 428',
  '42,180',
  '•••• 2847',
  'INV-2025',
  'mock',
  'fallback',
  "bd: '4'",
  "bd: 'Silver'",
];

for (const text of forbidden) {
  assert(!source.includes(text), `v2 provider earnings must not ship prototype data: ${text}`);
}

assert(source.includes('/providers/me?key='), 'v2 provider earnings should load provider identity data');
assert(source.includes('/providers/earnings?key='), 'v2 provider earnings should load provider totals');
assert(source.includes('/providers/me/earnings/history?key='), 'v2 provider earnings should load daily earnings history');
assert(source.includes('/providers/me/withdrawals?key='), 'v2 provider earnings should load provider withdrawals');
assert(source.includes('/providers/me/metrics?key='), 'v2 provider earnings should load recent jobs for model breakdowns');
assert(source.includes("dataState === 'missing-key'"), 'v2 provider earnings should render a missing-key state');
assert(source.includes('No daily earnings yet'), 'v2 provider earnings should render an empty chart state');
assert(source.includes('No rig earnings breakdown yet'), 'v2 provider earnings should render an empty rig breakdown state');
assert(source.includes('No model earnings breakdown yet'), 'v2 provider earnings should render an empty model breakdown state');
assert(source.includes('No payout requests yet'), 'v2 provider earnings should render an empty payouts state');
assert(source.includes('modelBreakdown'), 'v2 provider earnings should derive model rows from recent jobs');
assert(source.includes('buildRigBreakdown'), 'v2 provider earnings should derive rig rows from provider account earnings');

console.log('v2 provider earnings static checks passed');
