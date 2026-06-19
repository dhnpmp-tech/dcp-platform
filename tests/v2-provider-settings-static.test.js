const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app/(site)/provider/settings/page.tsx'), 'utf8');

const forbidden = [
  'MOCK_NAME',
  'MOCK_SCOPE',
  'MOCK_EMAIL',
  'Yazeed',
  'yazeed@example.sa',
  'riyadh-studio',
  'SAR 218',
  'SAR 194',
  'SAR 5,826',
  '2 of 4 rigs earning',
  'Silver',
  'jobChat',
  'jobEmbed',
  'jobRerank',
  'notifWeekly',
  'notifOffline',
  'notifPayout',
  'notifMarketing',
  '+ Connect Telegram',
  'Close account',
  'Discard changes',
  'mock',
  'fallback',
  "bd: '4'",
  "bd: 'Silver'",
];

for (const text of forbidden) {
  assert(!source.includes(text), `v2 provider settings must not ship prototype data or fake controls: ${text}`);
}

assert(source.includes('/providers/me?key='), 'v2 provider settings should load provider account data');
assert(source.includes('/providers/preferences'), 'v2 provider settings should save through the live preferences route');
assert(source.includes('/providers/${route}'), 'v2 provider settings should pause/resume through live provider routes');
assert(source.includes("loadState === 'missing-key'"), 'v2 provider settings should render a missing-key state');
assert(source.includes('run_mode'), 'v2 provider settings should persist run_mode');
assert(source.includes('scheduled_start'), 'v2 provider settings should persist scheduled_start');
assert(source.includes('scheduled_end'), 'v2 provider settings should persist scheduled_end');
assert(source.includes('gpu_usage_cap_pct'), 'v2 provider settings should persist gpu_usage_cap_pct');
assert(source.includes('vram_reserve_gb'), 'v2 provider settings should persist vram_reserve_gb');
assert(source.includes('temp_limit_c'), 'v2 provider settings should persist temp_limit_c');
assert(source.includes('intentionally not editable in v2 until backend routes exist'), 'v2 provider settings should be honest about unavailable settings');

console.log('v2 provider settings static checks passed');
