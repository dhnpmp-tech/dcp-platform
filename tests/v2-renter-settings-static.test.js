const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app/v2/renter/settings/page.tsx'), 'utf8');

const forbidden = [
  'MEMBERS',
  'NextWave Commerce',
  'nextwave',
  'acme-prod',
  'Fatima',
  'fatima@',
  'Hassan',
  'Reem',
  'SAR 2,184',
  'SAR 2.72',
  'SAR 412',
  'NextWave Commerce LLC',
  'finance@nextwave.sa',
  '1010382947',
  'VAT-310234567890003',
  'King Abdullah Road',
  'Riyadh 11564',
  'Alert at SAR 100',
  'Marketing & product updates',
  'Invite member',
  'Delete workspace',
  'Transfer ownership',
  'Discard changes',
  "bd: '3'",
  'mock',
  'fallback',
];

for (const text of forbidden) {
  assert(!source.includes(text), `v2 renter settings must not ship prototype data or fake controls: ${text}`);
}

assert(source.includes('/renters/me?key='), 'v2 renter settings should load renter account data');
assert(source.includes('/renters/balance?key='), 'v2 renter settings should load wallet summary data');
assert(source.includes('/renters/me/notifications?key='), 'v2 renter settings should load real notifications');
assert(source.includes('/renters/settings'), 'v2 renter settings should save webhook_url through the supported settings route');
assert(source.includes('/renters/me/notifications/read-all'), 'v2 renter settings should mark notifications read through the backend route');
assert(source.includes('/renters/me/data-export?key='), 'v2 renter settings should link to the data export route');
assert(source.includes("loadState === 'missing-key'"), 'v2 renter settings should render an explicit missing-key state');
assert(source.includes('Profile edits are read-only for launch'), 'v2 renter settings should be honest about missing profile save routes');
assert(source.includes('Deletion is intentionally not exposed here'), 'v2 renter settings should not expose account deletion without a v2 confirmation flow');

console.log('v2 renter settings static checks passed');
