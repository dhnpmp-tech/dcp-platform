const assert = require('assert');
const fs = require('fs');
const path = require('path');

const adminRoute = fs.readFileSync(path.join(__dirname, '..', 'src/routes/admin.js'), 'utf8');

const rbacIndex = adminRoute.indexOf('router.use(requireAdminRbac)');
const policyRouteIndex = adminRoute.indexOf("router.get('/access/policy'");

assert(rbacIndex >= 0, 'admin routes should be guarded by requireAdminRbac');
assert(policyRouteIndex > rbacIndex, 'access policy route should be mounted behind admin RBAC');
assert(adminRoute.includes('buildAdminAccessPolicySnapshot'), 'admin access policy should use a dedicated snapshot builder');
assert(adminRoute.includes('DC1_ADMIN_TOKEN'), 'access policy should report admin token configuration');
assert(adminRoute.includes('ADMIN_IP_ALLOWLIST'), 'access policy should report admin IP allowlist configuration');
assert(adminRoute.includes('MISSION_AGENT_KEY'), 'access policy should report mission agent key configuration');
assert(adminRoute.includes('DCP_MISSION_STRICT_WRITE_AUTH'), 'access policy should expose the strict mission write gate');
assert(adminRoute.includes('mission_agent_key_configured'), 'access policy should return only mission agent key posture');
assert(adminRoute.includes('strict_admin_or_agent_key'), 'access policy should describe the strict write path');
assert(adminRoute.includes('legacy_authenticated_write'), 'access policy should describe the legacy write path');
assert(adminRoute.includes('blocked_by_legacy_mission_write_policy'), 'agent guarded writes should be blocked while legacy mission writes are enabled');
assert(adminRoute.includes('backend_gate_ready'), 'agent guarded writes should report ready when strict mission writes are enabled');
assert(adminRoute.includes('enable DCP_MISSION_STRICT_WRITE_AUTH'), 'access policy should name the next hardening gate');
assert(!/mission_agent_key\s*:\s*process\.env\.MISSION_AGENT_KEY/.test(adminRoute), 'access policy must not return the mission agent key value');
assert(!/admin_token\s*:\s*process\.env\.DC1_ADMIN_TOKEN/.test(adminRoute), 'access policy must not return the admin token value');

console.log('admin access policy static checks passed');
