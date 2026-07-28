const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dashboard = fs.readFileSync(path.join(__dirname, '..', 'app/(site)/renter/dashboard/page.tsx'), 'utf8');
const keys = fs.readFileSync(path.join(__dirname, '..', 'app/(site)/renter/keys/page.tsx'), 'utf8');
const renterShell = fs.readFileSync(path.join(__dirname, '..', 'app/(site)/renter/RenterShell.tsx'), 'utf8');
const renterLayout = fs.readFileSync(path.join(__dirname, '..', 'app/(site)/renter/layout.tsx'), 'utf8');
const sharedShellCss = fs.readFileSync(path.join(__dirname, '..', 'app/(site)/styles/renter-shell.css'), 'utf8');

const renterPageFiles = [
  'dashboard/page.tsx',
  'playground/page.tsx',
  'keys/page.tsx',
  'usage/page.tsx',
  'pods/page.tsx',
  'fine-tuning/page.tsx',
  'batches/page.tsx',
  'wallet/page.tsx',
  'invoices/page.tsx',
  'settings/page.tsx',
];

const renterCssFiles = [
  'dashboard/dashboard.css',
  'playground/playground.css',
  'keys/keys.css',
  'usage/usage.css',
  'pods/pods.css',
  'fine-tuning/fine-tuning.css',
  'batches/batches.css',
  'wallet/wallet.css',
  'invoices/invoices.css',
  'settings/settings.css',
];

const prototypeStrings = [
  'NextWave Commerce',
  'acme-prod',
  'Fatima',
  'fatima@',
  'SAR 2,184',
  'SAR 2.72',
  'SAR 412',
  '41.20',
  '18% vs yesterday',
  '9% vs last month',
  '414k',
  'dcp-renter-XXXXXXXXXXXXXXXXXXXX',
];

for (const text of prototypeStrings) {
  assert(!dashboard.includes(text), `v2 renter dashboard must not ship prototype data: ${text}`);
  assert(!keys.includes(text), `v2 renter keys must not ship prototype data: ${text}`);
}

assert(!dashboard.includes('buildSpend'), 'v2 renter dashboard must not keep generated mock spend data');
assert(!dashboard.includes('const LIVE'), 'v2 renter dashboard must not keep mock live jobs');
assert(dashboard.includes("const headers = { 'x-renter-key': key }"), 'v2 renter dashboard should use header-authenticated renter requests');
assert(dashboard.includes('`${base}/renters/me`'), 'v2 renter dashboard should load the authenticated renter account');
assert(dashboard.includes('`${base}/renters/me/live`'), 'v2 renter dashboard should load live jobs from the backend');
assert(dashboard.includes('`${base}/pods?key=${encodeURIComponent(key)}`'), 'v2 renter dashboard should load active pod runway from the backend');
assert(dashboard.includes("dataState === 'missing-key'"), 'v2 renter dashboard should render an explicit missing-key state');
assert(dashboard.includes('Platform readiness'), 'v2 renter dashboard should render the Fireworks/Tinker platform readiness board');
assert(dashboard.includes('Fireworks/Tinker rails'), 'v2 renter dashboard should label the connected product rails');
assert(dashboard.includes('/v1/models'), 'v2 renter dashboard should read model catalog readiness');
assert(dashboard.includes('/v1/prompt-cache/settlement/readiness'), 'v2 renter dashboard should read prompt-cache settlement readiness');
assert(dashboard.includes('`${base}/batches/readiness`'), 'v2 renter dashboard should read renter batch readiness');
assert(dashboard.includes('`${base}/lora/readiness`'), 'v2 renter dashboard should read LoRA readiness');
assert(dashboard.includes('No billing, routing, training, discount, or launch mutation happens from this dashboard.'), 'v2 renter dashboard should state the readiness board is read-only');

assert(!keys.includes('Restore'), 'v2 renter keys should not offer a fake restore action for revoked keys');
assert(keys.includes("const headers = { 'x-renter-key': key }"), 'v2 renter keys should use header-authenticated renter requests');
assert(keys.includes('`${base}/renters/me`'), 'v2 renter keys should load renter metadata for the console shell');
assert(keys.includes('`${base}/renters/me/keys`'), 'v2 renter keys should list scoped keys from the backend');
assert(keys.includes("method: 'POST'"), 'v2 renter keys should create scoped keys through the backend');
assert(keys.includes("method: 'DELETE'"), 'v2 renter keys should revoke scoped keys through the backend');
assert(keys.includes('newKeySecret'), 'v2 renter keys should reveal newly created secrets only after creation');
assert(keys.includes("loadState === 'missing-key'"), 'v2 renter keys should render an explicit missing-key state');

assert(renterLayout.includes("import '../styles/renter-shell.css'"), 'renter route layout should import the single shared shell stylesheet');
assert(renterLayout.includes('<RenterShell>{children}</RenterShell>'), 'renter route layout should wrap every renter page in the shared shell');
assert(renterShell.includes('usePathname'), 'renter shell should derive active navigation from the current pathname');
assert(renterShell.includes("fetch(`${base}/renters/me`"), 'renter shell should load account identity from the canonical renter endpoint');
assert(renterShell.includes("fetch(`${base}/renters/balance`"), 'renter shell should load credit state from the canonical renter balance endpoint');
assert(renterShell.includes("label: 'Batch'"), 'shared renter nav should expose Batch on every renter page');
assert(renterShell.includes("label: 'Credit'"), 'shared renter nav should use Credit, not Wallet SAR, as the wallet label');
assert(renterShell.includes('en="+ Add credit"'), 'shared renter sidebar should keep the add-credit CTA on every renter page');
assert(!fs.existsSync(path.join(__dirname, '..', 'app/(site)/renter/pods/PodShell.tsx')), 'legacy pod-local shell module should not remain as a second chrome source');

for (const rel of renterPageFiles) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app/(site)/renter', rel), 'utf8');
  assert(source.includes('<main className="rt-main'), `${rel} should render only its renter main column`);
  assert(!source.includes('<aside className={`rt-sb'), `${rel} should not render page-local sidebar markup`);
  assert(!source.includes('<aside className="rt-sb'), `${rel} should not render page-local sidebar markup`);
  assert(!source.includes('<nav className="rt-nav"'), `${rel} should not render page-local renter nav markup`);
  assert(!source.includes('<header className="rt-tb"'), `${rel} should not render page-local topbar markup`);
  assert(!source.includes('rt-backdrop'), `${rel} should not render page-local mobile drawer backdrop`);
}

for (const rel of renterCssFiles) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app/(site)/renter', rel), 'utf8');
  assert(!/\.rt-(app|sb|nav|tb|backdrop)\b/.test(source), `${rel} should not define shared renter shell selectors`);
}

assert(/\.rt-sb\b/.test(sharedShellCss), 'shared shell CSS should define the sidebar once');
assert(/\.rt-nav\b/.test(sharedShellCss), 'shared shell CSS should define the nav once');
assert(/\.rt-tb\b/.test(sharedShellCss), 'shared shell CSS should define the topbar once');

console.log('v2 renter console static checks passed');
