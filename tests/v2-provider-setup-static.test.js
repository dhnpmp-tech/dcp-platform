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

console.log('v2 provider setup static checks passed');
