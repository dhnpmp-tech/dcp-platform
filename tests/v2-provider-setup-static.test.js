const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app/v2/provider-setup/page.tsx'), 'utf8');

const forbidden = [
  'prov_8f3a',
  'INSTALL_KEY',
  'VERIFY_DELAY_MS',
  'Simulate link tapped',
  'setVerified(true)',
  'Windows 11',
  'RTX 4090',
  'first job is already routing',
  'earning now',
  'illustrative MOCK data',
  'We detected the basics from your browser',
  'auto-detected',
  '280 Mbps',
  '~210',
  'tok/sec',
  'Based on ~210',
  'How tiers work',
  'bigger your share',
  'Everyone starts at Bronze',
  'className="os detected"',
  '✓ your device',
  'Scanning hardware…',
  'Installed inference engine',
  'Pulled model weights · 4.1 GB',
  'Opened secure tunnel — no port forwarding',
];

for (const text of forbidden) {
  assert(!source.includes(text), `v2 provider setup must not ship prototype shortcut: ${text}`);
}

assert(source.includes('getProviderKey'), 'v2 provider setup should read the authenticated provider key');
assert(source.includes('/providers/send-otp'), 'v2 provider setup should send real provider magic links');
assert(source.includes('/providers/me?key='), 'v2 provider setup should validate provider API keys');
assert(source.includes('/providers/download/setup?key='), 'v2 provider setup should generate installer commands from the live setup route');
assert(source.includes('/providers/status?key='), 'v2 provider setup should verify daemon status through the backend');
assert(source.includes('Check again'), 'v2 provider setup should expose a manual status recheck');
assert(source.includes('isVerifiedProviderStatus'), 'v2 provider setup should gate success on backend status');
assert(source.includes('Backend waits for the daemon'), 'v2 provider setup should describe installer proof as a pending backend report');
assert(source.includes('planning rate selected above'), 'v2 provider setup should label the earnings estimator as planning guidance before measured throughput');
assert(source.includes('published payout split remains 85% provider and 15% platform'), 'v2 provider setup should keep reliability separate from payout split changes');

console.log('v2 provider setup static checks passed');
