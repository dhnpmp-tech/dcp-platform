const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app/v2/provider/profile/page.tsx'), 'utf8');

const forbidden = [
  'INITIAL_PROFILE',
  'INITIAL_STATS',
  'Riyadh Studio',
  'riyadh-studio',
  'yazeed@example.sa',
  'Yazeed',
  '+966 50',
  'SA03 8000',
  'Bank Aljazira',
  'VAT-300',
  'Silver',
  'Bronze',
  'Gold',
  'Platinum',
  'SAR 218',
  'SAR 194',
  'SAR 5,826',
  '638',
  '1862',
  'Aug 2024',
  "bd: '4'",
  "bd: 'Silver'",
  'mock',
  'fallback',
];

for (const text of forbidden) {
  assert(!source.includes(text), `v2 provider profile must not ship prototype data: ${text}`);
}

assert(source.includes('/providers/me?key='), 'v2 provider profile should load provider account data');
assert(source.includes("loadState === 'missing-key'"), 'v2 provider profile should render a missing-key state');
assert(source.includes('No payout account on file'), 'v2 provider profile should render an empty payout-account state');
assert(source.includes('this page stays read-only'), 'v2 provider profile should be honest about missing update routes');
assert(source.includes('maskIban'), 'v2 provider profile should mask payout IBAN values');
assert(source.includes('maskWallet'), 'v2 provider profile should mask wallet values');
assert(!source.includes('Save profile'), 'v2 provider profile should not show a non-persistent save button');

console.log('v2 provider profile static checks passed');
