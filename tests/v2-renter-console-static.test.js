const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dashboard = fs.readFileSync(path.join(__dirname, '..', 'app/v2/renter/dashboard/page.tsx'), 'utf8');
const keys = fs.readFileSync(path.join(__dirname, '..', 'app/v2/renter/keys/page.tsx'), 'utf8');

const prototypeStrings = [
  'NextWave Commerce',
  'acme-prod',
  'Fatima',
  'fatima@',
  'SAR 2,184',
  'SAR 2.72',
  'SAR 412',
  '41.20',
  '18% vs yesterday',
  '9% vs last month',
  '414k',
  'dcp-renter-XXXXXXXXXXXXXXXXXXXX',
];

for (const text of prototypeStrings) {
  assert(!dashboard.includes(text), `v2 renter dashboard must not ship prototype data: ${text}`);
  assert(!keys.includes(text), `v2 renter keys must not ship prototype data: ${text}`);
}

assert(!dashboard.includes('buildSpend'), 'v2 renter dashboard must not keep generated mock spend data');
assert(!dashboard.includes('const LIVE'), 'v2 renter dashboard must not keep mock live jobs');
assert(dashboard.includes('/renters/me?key='), 'v2 renter dashboard should load the authenticated renter account');
assert(dashboard.includes('/renters/me/analytics?key='), 'v2 renter dashboard should load real spend analytics');
assert(dashboard.includes('/renters/me/live?key='), 'v2 renter dashboard should load live jobs from the backend');
assert(dashboard.includes("dataState === 'missing-key'"), 'v2 renter dashboard should render an explicit missing-key state');

assert(!keys.includes('Restore'), 'v2 renter keys should not offer a fake restore action for revoked keys');
assert(keys.includes('/renters/me?key='), 'v2 renter keys should load renter metadata for the console shell');
assert(keys.includes('/renters/me/keys'), 'v2 renter keys should list scoped keys from the backend');
assert(keys.includes("method: 'POST'"), 'v2 renter keys should create scoped keys through the backend');
assert(keys.includes("method: 'DELETE'"), 'v2 renter keys should revoke scoped keys through the backend');
assert(keys.includes('newKeySecret'), 'v2 renter keys should reveal newly created secrets only after creation');
assert(keys.includes("loadState === 'missing-key'"), 'v2 renter keys should render an explicit missing-key state');

console.log('v2 renter console static checks passed');
