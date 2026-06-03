const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app/v2/renter/playground/page.tsx'), 'utf8');

const forbidden = [
  'const MODELS',
  'FALLBACK_BALANCE_SAR',
  'INITIAL_MESSAGES',
  'NextWave Commerce',
  'acme-prod',
  'Fatima',
  'fatima@',
  'SAR 2.72',
  'SAR 412',
  'allam-7b',
  'jais-13b',
  'https://api.dcp.sa',
  "bd: '3'",
  'mock',
  'demo',
  'fallback',
  'SAR 0.26 / 1M tok',
];

for (const text of forbidden) {
  assert(!source.includes(text), `v2 renter playground must not ship prototype data or fake controls: ${text}`);
}

assert(source.includes("fetch('/v1/models'"), 'v2 renter playground should load the live model catalog through the local v1 proxy');
assert(source.includes('/v1/chat/completions'), 'v2 renter playground should send prompts through the OpenAI-compatible route');
assert(source.includes('/renters/me?key='), 'v2 renter playground should load the authenticated renter account');
assert(source.includes('/renters/balance?key='), 'v2 renter playground should load real wallet balances');
assert(source.includes('(m.provider_count ?? 0) > 0'), 'v2 renter playground should only list models with a serving provider');
assert(source.includes("catalogState === 'empty'"), 'v2 renter playground should render an honest empty-catalog state');
assert(source.includes('Sign in with a real renter key'), 'v2 renter playground should require a real renter key before inference');
assert(source.includes('From response usage'), 'v2 renter playground should not hardcode a prototype rate label');

console.log('v2 renter playground static checks passed');
