const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app/(site)/renter/settings/page.tsx'), 'utf8');

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

assert(source.includes("const headers = { 'x-renter-key': renterKey }"), 'v2 renter settings should use header-authenticated renter requests');
assert(source.includes('`${base}/renters/me`'), 'v2 renter settings should load renter account data');
assert(source.includes('`${base}/renters/balance`'), 'v2 renter settings should load wallet summary data');
assert(source.includes('`${base}/renters/me/notifications?limit=10`'), 'v2 renter settings should load real notifications');
assert(source.includes('/renters/settings'), 'v2 renter settings should save webhook_url through the supported settings route');
assert(source.includes('/renters/me/notifications/read-all'), 'v2 renter settings should mark notifications read through the backend route');
assert(source.includes('`${getApiBase()}/renters/me/data-export`'), 'v2 renter settings should use the data export route');
assert(source.includes("loadState === 'missing-key'"), 'v2 renter settings should render an explicit missing-key state');
assert(source.includes('Profile edits are read-only for launch'), 'v2 renter settings should be honest about missing profile save routes');
assert(source.includes('setConfirmDelete(true)'), 'v2 renter settings should gate account deletion behind an explicit confirmation flow');
assert(source.includes('`${getApiBase()}/renters/me`'), 'v2 renter settings should use the supported account deletion request route');
assert(source.includes("method: 'DELETE'"), 'v2 renter settings should send account deletion as a DELETE request');
assert(source.includes('Confirm delete'), 'v2 renter settings should require an explicit confirm-delete action');

console.log('v2 renter settings static checks passed');
