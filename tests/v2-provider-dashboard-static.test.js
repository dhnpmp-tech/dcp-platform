const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app/(site)/provider/dashboard/page.tsx'), 'utf8');

const forbidden = [
  'const JOBS',
  'buildEarn',
  'mockEarn',
  'illustrative MOCK',
  'keep mock',
  'NextWave Commerce',
  'Musbah Legal',
  'Haya Therapy',
  'Najdi Heritage',
  "Qira'a Learning",
  'j_ac81',
  'studio-main',
  'studio-bench',
  'office-mac',
  'garage-3090',
  'riyadh-studio-01',
  "bd: '4'",
  "bd: 'Silver'",
  'Yazeed',
  'SAR 194',
  'SAR 1,424',
  'SAR 5,826',
  '42180',
  '99.4%',
  'Mon · SAR 428',
  'View all 63',
  '12% vs yesterday',
  '8% vs last week',
  '14% vs last month',
];

for (const text of forbidden) {
  assert(!source.includes(text), `v2 provider dashboard must not ship prototype data: ${text}`);
}

assert(source.includes("dataState === 'missing-key'"), 'v2 provider dashboard should render a missing-key state');
assert(source.includes('/providers/me?'), 'v2 provider dashboard should load provider account data');
assert(source.includes('/providers/me/metrics?'), 'v2 provider dashboard should load provider metrics');
assert(source.includes('/providers/earnings-daily?'), 'v2 provider dashboard should load real earnings series');
assert(source.includes('mapRig'), 'v2 provider dashboard should derive rig display from the provider response');
assert(source.includes('No settled provider jobs yet'), 'v2 provider dashboard should render an empty jobs state');
assert(source.includes('No earnings series yet'), 'v2 provider dashboard should render an empty chart state');

console.log('v2 provider dashboard static checks passed');
