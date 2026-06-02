const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app/v2/renter/usage/page.tsx'), 'utf8');

const forbidden = [
  'BY_MODEL',
  'BY_KEY',
  'const JOBS',
  'NextWave Commerce',
  'acme-prod',
  'Fatima',
  'fatima@',
  'SAR 2,184',
  'SAR 2.72',
  'SAR 412',
  '14,820',
  'SAR 2,456',
  'allam-7b',
  'jais-13b',
  'falcon-h1',
  'production-server',
  'analytics-readonly',
  'batch-runner',
  'j_ac81',
  'j_ac7f',
  'Last 24 hours · 1,284 jobs',
  "bd: '3'",
  'mock',
  'fallback',
];

for (const text of forbidden) {
  assert(!source.includes(text), `v2 renter usage must not ship prototype data or fake controls: ${text}`);
}

assert(source.includes('/renters/me?key='), 'v2 renter usage should load renter account data');
assert(source.includes('/renters/balance?key='), 'v2 renter usage should load wallet balance data');
assert(source.includes('/renters/me/analytics?key='), 'v2 renter usage should load analytics data');
assert(source.includes('/renters/me/jobs?key='), 'v2 renter usage should load real job history');
assert(source.includes('/renters/me/usage?key='), 'v2 renter usage should load v1 API usage history');
assert(source.includes('/renters/me/jobs/export?key='), 'v2 renter usage should export from the backend CSV route');
assert(source.includes("loadState === 'missing-key'"), 'v2 renter usage should render an explicit missing-key state');
assert(source.includes('No jobs match the current account and filters'), 'v2 renter usage should render an honest empty jobs state');
assert(source.includes('No v1 inference usage has been recorded'), 'v2 renter usage should render an honest empty v1 usage state');

console.log('v2 renter usage static checks passed');
