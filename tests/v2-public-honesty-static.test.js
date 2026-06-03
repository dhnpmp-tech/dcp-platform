const assert = require('assert');
const fs = require('fs');
const path = require('path');

const home = fs.readFileSync(path.join(__dirname, '..', 'app/v2/home/page.tsx'), 'utf8');
const providerSetup = fs.readFileSync(path.join(__dirname, '..', 'app/v2/provider-setup/page.tsx'), 'utf8');
const retiredPublicHandoff = path.join(__dirname, '..', 'public/dcp-v2');

[
  'href="/setup"',
  'href="/earn"',
  'href="/marketplace/models"',
].forEach((legacyHref) => {
  assert(!home.includes(legacyHref), `v2 home should not link visitors back through ${legacyHref}`);
});

[
  '/v2/setup',
  '/v2/provider-setup',
  '/v2/renter/playground',
].forEach((v2Href) => {
  assert(home.includes(v2Href), `v2 home should keep public CTAs on ${v2Href}`);
});

[
  'Aramco',
  'KAUST',
  'NEOM',
  'Tuwaiq',
  'Mansouri',
  'Jeddah Studios',
].forEach((name) => {
  assert(!home.includes(name), `v2 home should not use real or invented provider names: ${name}`);
});

[
  'MARKET_ROWS',
  'Mesh utilisation',
  'last 5 min',
  'Available headroom',
  'Browse live models',
  'Math.random',
  'util-pct',
  'headroom',
  'Try the live demo',
  'Try the demo',
  'working inference call',
  '100–270 tok/s',
  '100-270 tok/s',
].forEach((claim) => {
  assert(!home.includes(claim), `v2 home should not present simulated live marketplace telemetry: ${claim}`);
});

[
  'useState(41)',
  'COUNTER_INTERVAL_MS',
  'setProvCount',
  'providers registered',
  'Live network',
  'Math.random',
].forEach((claim) => {
  assert(!providerSetup.includes(claim), `v2 provider setup should not show a fake live provider counter: ${claim}`);
});

[
  '75% provider',
  '82% rev-share',
  'You keep · 75%',
  'You earn ~82%',
  '٧٥٪',
  '٨٢٪',
].forEach((claim) => {
  assert(!home.includes(claim), `v2 home should not publish stale rev-share copy: ${claim}`);
  assert(!providerSetup.includes(claim), `v2 provider setup should not publish stale rev-share copy: ${claim}`);
});

assert(home.includes('85% provider'), 'v2 home should show the current provider share');
assert(home.includes('15% platform'), 'v2 home should show the current platform share');
assert(providerSetup.includes('const PROVIDER_SHARE = 0.85'), 'provider setup estimator should use the current provider share');
assert(providerSetup.includes('const PLATFORM_SHARE = 0.15'), 'provider setup estimator should use the current platform share');
assert(!fs.existsSync(retiredPublicHandoff), 'retired v2 design handoff/prototype files must not be published under public/dcp-v2');

console.log('v2 public honesty static checks passed');
