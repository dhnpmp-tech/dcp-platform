const assert = require('assert');
const fs = require('fs');
const path = require('path');

const adminRoute = fs.readFileSync(path.join(__dirname, '..', 'src/routes/admin.js'), 'utf8');

const rbacIndex = adminRoute.indexOf('router.use(requireAdminRbac)');
const postureRouteIndex = adminRoute.indexOf("router.get('/notifications/posture'");
const postureBuilderIndex = adminRoute.indexOf('function buildNotificationPostureSnapshot');
const legacyConfigIndex = adminRoute.indexOf("router.get('/notifications/config'");
const postureSlice = adminRoute.slice(postureBuilderIndex, legacyConfigIndex);

assert(rbacIndex >= 0, 'admin routes should be guarded by requireAdminRbac');
assert(postureRouteIndex > rbacIndex, 'notification posture route should be mounted behind admin RBAC');
assert(postureBuilderIndex >= 0, 'notification posture should use a dedicated snapshot builder');
assert(postureSlice.includes('secret_exposed: false'), 'notification posture should explicitly report secret non-exposure');
assert(postureSlice.includes('safeUrlHost(config.webhook_url)'), 'notification posture should reduce webhook URL to a host');
assert(postureSlice.includes('redactedTail(config.telegram_chat_id)'), 'notification posture should redact Telegram chat identifiers');
assert(postureSlice.includes('ready_for_human_approved_alerts'), 'notification posture should expose agent notify readiness');
assert(postureSlice.includes('blocked_until_channel_configured'), 'notification posture should expose blocked notify readiness');
assert(postureSlice.includes('admin_only_test_send'), 'notification posture should keep notification tests admin-only');
assert(!/webhook_url\s*:/.test(postureSlice), 'notification posture must not return raw webhook_url fields');
assert(!/telegram_chat_id\s*:/.test(postureSlice), 'notification posture must not return raw telegram_chat_id fields');
assert(!/telegram_bot_token\s*:/.test(postureSlice), 'notification posture must not return raw telegram_bot_token fields');

console.log('admin notification posture static checks passed');
