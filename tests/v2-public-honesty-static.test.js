const assert = require('assert');
const fs = require('fs');
const path = require('path');

const home = fs.readFileSync(path.join(__dirname, '..', 'app/v2/home/page.tsx'), 'utf8');
const providerSetup = fs.readFileSync(path.join(__dirname, '..', 'app/v2/provider-setup/page.tsx'), 'utf8');
const marketplaceModels = fs.readFileSync(path.join(__dirname, '..', 'app/marketplace/models/page.tsx'), 'utf8');
const sharedI18n = fs.readFileSync(path.join(__dirname, '..', 'app/lib/i18n.tsx'), 'utf8');
const retiredPublicHandoff = path.join(__dirname, '..', 'public/dcp-v2');
const retiredBrandGuide = path.join(__dirname, '..', 'public/docs/DCP-BRAND-GUIDELINES-v3.html');
const retiredBrandPage = path.join(__dirname, '..', 'app/docs/brand/page.tsx');

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
  'Watch the round-trip',
  'working inference call',
  '100–270 tok/s',
  '100-270 tok/s',
  'scaleX(.34)',
  'scaleX(0.34)',
  'CAPACITY_CLASSES',
  'mp-table',
  'GPU class',
  'NVIDIA H100',
  'NVIDIA L40S',
  'RTX 4090',
  'Token-metered or quoted',
  'hardware classes the router can draw from',
].forEach((claim) => {
  assert(!home.includes(claim), `v2 home should not present simulated live marketplace telemetry: ${claim}`);
});

assert(home.includes('scaleX(0)'), 'v2 home should not render a non-zero fake verified-capacity meter');
assert(home.includes('Check live status'), 'v2 home should route live-capacity questions to the status page');
assert(home.includes('CAPACITY_GATES'), 'v2 home should explain the real gates for published capacity');
assert(home.includes('endpoint_reachable'), 'v2 home should name endpoint reachability as a capacity gate');
assert(home.includes('verified_online'), 'v2 home should name earned-online verification as a capacity gate');
assert(home.includes('No provider is listed until the inference path itself is proven.'), 'v2 home should explain empty marketplace state honestly');

[
  'useState(41)',
  'COUNTER_INTERVAL_MS',
  'setProvCount',
  'providers registered',
  'Live network',
  'Math.random',
  'illustrative MOCK data',
  'We detected the basics from your browser',
  'auto-detected',
  '~210',
  'tok/sec',
  'How tiers work',
  'bigger your share',
  'className="os detected"',
  '✓ your device',
  'Pulled model weights · 4.1 GB',
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
assert(!home.includes('NDMO'), 'v2 home should not imply a specific NDMO compliance artifact before it exists');
assert(home.includes('Customer data-classification workbook'), 'v2 home should keep the enterprise classification offer generic and accurate');
assert(!sharedI18n.includes('50+ models'), 'shared public footer should not publish a stale numeric model-count claim');
assert(sharedI18n.includes('Arabic-first model catalog'), 'shared public footer should describe the catalog without a stale model-count claim');

[
  'Save 33',
  'Save up to 51%',
  'vs AWS Bedrock',
  'DCP vs Competitors',
  'Buyer Economics',
  'HYPERSCALER_SAR_PER_HR',
  'PRICING_COMPARISON',
  'Vast.ai',
  'RunPod',
  'AWS Bedrock',
  'Your savings',
].forEach((claim) => {
  assert(!marketplaceModels.includes(claim), `legacy marketplace model catalog should not publish unsourced competitor savings copy: ${claim}`);
});

assert(!fs.existsSync(retiredPublicHandoff), 'retired v2 design handoff/prototype files must not be published under public/dcp-v2');
assert(!fs.existsSync(retiredBrandGuide), 'retired brand guideline HTML must not be published under public/docs');
assert(!fs.existsSync(retiredBrandPage), 'retired brand guideline iframe page must not remain as an app route');

console.log('v2 public honesty static checks passed');
