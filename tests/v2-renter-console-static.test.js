const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dashboard = fs.readFileSync(path.join(__dirname, '..', 'app/(site)/renter/dashboard/page.tsx'), 'utf8');
const keys = fs.readFileSync(path.join(__dirname, '..', 'app/(site)/renter/keys/page.tsx'), 'utf8');

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
assert(dashboard.includes("const headers = { 'x-renter-key': key }"), 'v2 renter dashboard should use header-authenticated renter requests');
assert(dashboard.includes('`${base}/renters/me`'), 'v2 renter dashboard should load the authenticated renter account');
assert(dashboard.includes('`${base}/renters/me/live`'), 'v2 renter dashboard should load live jobs from the backend');
assert(dashboard.includes('`${base}/pods?key=${encodeURIComponent(key)}`'), 'v2 renter dashboard should load active pod runway from the backend');
assert(dashboard.includes("dataState === 'missing-key'"), 'v2 renter dashboard should render an explicit missing-key state');
assert(dashboard.includes('Platform readiness'), 'v2 renter dashboard should render the Fireworks/Tinker platform readiness board');
assert(dashboard.includes('Fireworks/Tinker rails'), 'v2 renter dashboard should label the connected product rails');
assert(dashboard.includes('/v1/models'), 'v2 renter dashboard should read model catalog readiness');
assert(dashboard.includes('/v1/prompt-cache/settlement/readiness'), 'v2 renter dashboard should read prompt-cache settlement readiness');
assert(dashboard.includes('`${base}/batches/readiness`'), 'v2 renter dashboard should read renter batch readiness');
assert(dashboard.includes('`${base}/lora/readiness`'), 'v2 renter dashboard should read LoRA readiness');
assert(dashboard.includes('No billing, routing, training, discount, or launch mutation happens from this dashboard.'), 'v2 renter dashboard should state the readiness board is read-only');

assert(!keys.includes('Restore'), 'v2 renter keys should not offer a fake restore action for revoked keys');
assert(keys.includes("const headers = { 'x-renter-key': key }"), 'v2 renter keys should use header-authenticated renter requests');
assert(keys.includes('`${base}/renters/me`'), 'v2 renter keys should load renter metadata for the console shell');
assert(keys.includes('`${base}/renters/me/keys`'), 'v2 renter keys should list scoped keys from the backend');
assert(keys.includes("method: 'POST'"), 'v2 renter keys should create scoped keys through the backend');
assert(keys.includes("method: 'DELETE'"), 'v2 renter keys should revoke scoped keys through the backend');
assert(keys.includes('newKeySecret'), 'v2 renter keys should reveal newly created secrets only after creation');
assert(keys.includes("loadState === 'missing-key'"), 'v2 renter keys should render an explicit missing-key state');

console.log('v2 renter console static checks passed');
