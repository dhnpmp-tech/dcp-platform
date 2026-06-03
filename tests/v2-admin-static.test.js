const assert = require('assert');
const fs = require('fs');
const path = require('path');

const page = fs.readFileSync(path.join(__dirname, '..', 'app/v2/admin/page.tsx'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'app/v2/admin/admin.css'), 'utf8');
const auth = fs.readFileSync(path.join(__dirname, '..', 'app/v2/auth/page.tsx'), 'utf8');

assert(page.includes("localStorage.getItem('dc1_admin_token')"), 'v2 admin should guard with the admin token');
assert(page.includes('/v2/auth?role=admin&method=apikey&redirect=/v2/admin'), 'v2 admin should send missing auth to v2 admin sign-in');
assert(page.includes('/admin/dashboard'), 'v2 admin should load the verified admin dashboard API');
assert(page.includes('/admin/payments/audit?limit=40'), 'v2 admin should load the payments audit queue');
assert(page.includes('/admin/health'), 'v2 admin should load system health');
assert(page.includes('/admin/security/summary'), 'v2 admin should load security summary');
assert(page.includes('/admin/providers?page=0&limit=200'), 'v2 admin should load provider supply context');
assert(page.includes('/admin/providers/approval-queue?limit=100'), 'v2 admin should load provider approval queue context');
assert(page.includes('/admin/fleet/health'), 'v2 admin should load earned fleet health');
assert(page.includes('/admin/fleet/alerts'), 'v2 admin should load fleet alerts');
assert(page.includes('/admin/finance/reconciliation?days=7'), 'v2 admin should load finance reconciliation');
assert(page.includes('/admin/errors?limit=20'), 'v2 admin should load recent error context');
assert(page.includes('/admin/control-plane/signals?limit=5'), 'v2 admin should load control-plane signals');
assert(page.includes('buildTasks'), 'v2 admin should synthesize an ops inbox');
assert(page.includes('buildReadinessChecks'), 'v2 admin should synthesize a launch readiness board');
assert(page.includes('agentMode'), 'v2 admin should model agent permission classes per task');
assert(page.includes('Guarded write'), 'v2 admin should expose guarded-write policy language');
assert(page.includes('Task envelope'), 'v2 admin should describe the future agent action envelope');
assert(page.includes('No verified serving capacity'), 'v2 admin should expose earned-serving capacity as an operational blocker');
assert(page.includes('read-only'), 'v2 admin should label the operational readiness board as read-only');
assert(page.includes('Current console'), 'v2 admin should keep a link to the existing safe admin console');
assert(page.includes('isLegacyAdminHref'), 'v2 admin should classify old admin console links');
assert(page.includes('prefetch={false}'), 'v2 admin should not prefetch legacy admin console links');
assert(!page.includes("method: 'POST'"), 'v2 admin command center should not perform direct write operations yet');
assert(!page.includes('approval-decision'), 'v2 admin should not expose provider approval writes before the guarded v2 approval flow exists');
assert(!page.includes("router.push('/login"), 'v2 admin should not route missing operators to the old login page');

assert(auth.includes("redirect=/v2/admin"), 'v2 auth admin link should land on the v2 admin command center');
assert(!auth.includes("redirect=/admin'"), 'v2 auth should not default admin sign-in back to the old admin console');

assert(css.includes('.v2-admin'), 'v2 admin should have scoped styles');
assert(css.includes('.readiness-board'), 'v2 admin should style the readiness board');
assert(css.includes('.lane-grid'), 'v2 admin should style operational lanes');
assert(css.includes('min-height: 100dvh'), 'v2 admin should use dynamic viewport height for mobile stability');
assert(!css.includes('h-screen'), 'v2 admin should not use unstable h-screen layouts');

console.log('v2 admin static checks passed');
