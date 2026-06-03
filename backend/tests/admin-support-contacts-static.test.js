const assert = require('assert');
const fs = require('fs');
const path = require('path');

const adminRoute = fs.readFileSync(path.join(__dirname, '..', 'src/routes/admin.js'), 'utf8');

assert(adminRoute.includes("router.get('/support/contacts'"), 'admin route should expose a read-only support contacts endpoint');
assert(adminRoute.includes('CREATE TABLE IF NOT EXISTS support_contacts'), 'admin support endpoint should be safe when the support table is missing');
assert(adminRoute.includes('idx_support_contacts_created_at'), 'admin support endpoint should keep recent contact reads indexed');
assert(adminRoute.includes('idx_support_contacts_category'), 'admin support endpoint should keep category-filtered contact reads indexed');
assert(adminRoute.includes('FROM support_contacts'), 'admin support endpoint should read support contact submissions');
assert(adminRoute.includes('ORDER BY created_at DESC'), 'admin support endpoint should return newest support contacts first');
assert(adminRoute.includes('LIMIT ? OFFSET ?'), 'admin support endpoint should use bounded pagination');
assert(adminRoute.includes('recent_24h'), 'admin support endpoint should summarize recent support demand');
assert(adminRoute.includes('by_category'), 'admin support endpoint should summarize support categories');

[
  "router.post('/support/contacts'",
  "router.patch('/support/contacts'",
  "router.put('/support/contacts'",
  "router.delete('/support/contacts'",
  'UPDATE support_contacts',
  'DELETE FROM support_contacts',
].forEach((unsafePattern) => {
  assert(!adminRoute.includes(unsafePattern), `admin support endpoint should not mutate support contacts: ${unsafePattern}`);
});

console.log('admin support contacts static checks passed');
