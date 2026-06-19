const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app/(site)/provider/rigs/page.tsx'), 'utf8');

const forbidden = [
  'const RIGS',
  'studio-main',
  'studio-bench',
  'office-mac',
  'garage-3090',
  'RTX 4090',
  'RTX 4080',
  'RTX 3090',
  'Yazeed',
  'riyadh-studio',
  'SAR 218',
  'SAR 194',
  'SAR 5,826',
  'rig_8f3a',
  'mock',
  'fallback',
  "bd: '4'",
  "bd: 'Silver'",
];

for (const text of forbidden) {
  assert(!source.includes(text), `v2 provider rigs must not ship prototype data: ${text}`);
}

assert(source.includes('/providers/me?key='), 'v2 provider rigs should load provider account data');
assert(source.includes("loadState === 'missing-key'"), 'v2 provider rigs should render a missing-key state');
assert(source.includes('No rig data yet'), 'v2 provider rigs should render an empty fleet state');
assert(source.includes('mapProviderToRig'), 'v2 provider rigs should derive the rig row from the provider response');
assert(source.includes('/api/providers/download/setup?key='), 'v2 provider rigs should generate re-pair commands from the live setup route');

console.log('v2 provider rigs static checks passed');
