// Admin live acceptance gate panel static checks
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const adminPage = fs.readFileSync(path.join(root, 'app/(site)/admin/page.tsx'), 'utf8');
const adminCss = fs.readFileSync(path.join(root, 'app/(site)/admin/admin.css'), 'utf8');
const adminRoute = fs.readFileSync(path.join(root, 'backend/src/routes/admin.js'), 'utf8');

assert(
  adminRoute.includes("router.get('/live-acceptance-gates'"),
  'backend admin route should expose read-only live acceptance gates',
);
assert(
  adminRoute.includes('buildLiveAcceptanceGateStatus()'),
  'backend route should use the shared read-only live acceptance builder',
);
assert(
  adminPage.includes("fetchJson<LiveAcceptancePayload>('/admin/live-acceptance-gates', token)"),
  'admin page should fetch the live acceptance gate packet',
);
assert(
  adminPage.includes('id="live-acceptance"'),
  'admin page should render a live acceptance gates section',
);
assert(
  adminPage.includes('claim allowed'),
  'admin page should show the claim guard count',
);
assert(
  adminPage.includes('operator runbooks'),
  'admin page should show the operator runbook count',
);
assert(
  adminPage.includes('operator_runbook'),
  'admin page should render per-gate operator runbooks',
);
assert(
  adminPage.includes('ready_to_run'),
  'admin page should show whether a gate is ready to run',
);
assert(
  adminPage.includes('It does not run paid compute, mutate routing, or unlock capability claims.'),
  'admin panel should state the read-only policy',
);
assert(
  adminCss.includes('.live-acceptance-gate-grid'),
  'admin CSS should style the live acceptance gate grid',
);
assert(
  adminCss.includes('.live-acceptance-runbook'),
  'admin CSS should style the operator runbook block',
);

console.log('admin live acceptance static checks passed');
