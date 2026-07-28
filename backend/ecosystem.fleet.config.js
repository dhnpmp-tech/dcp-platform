// Fleet watcher — pm2 config (separate process: a watcher crash must not
// take down mission dispatch or the API):
//   pm2 start backend/ecosystem.fleet.config.js
//
// Rollout (design doc section 5): starts in DRY-RUN. Live execution is
// per-provider via DCP_FLEET_LIVE_PROVIDERS (Node 2 first), then
// DCP_FLEET_DRYRUN=0 fleet-wide after a clean week.
module.exports = {
  apps: [
    {
      name: 'dcp-fleet-watcher',
      script: 'src/fleet/run.js',
      cwd: '/root/dc1-platform/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      error_file: '/root/dc1-platform/backend/logs/fleet-watcher-error.log',
      out_file: '/root/dc1-platform/backend/logs/fleet-watcher.log',
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',

        // SAFETY DEFAULT: dry-run ('1') logs every action without executing.
        DCP_FLEET_DRYRUN: process.env.DCP_FLEET_DRYRUN || '1',
        // Staged rollout: comma-separated provider ids allowed to execute
        // even in dry-run. 1774351995321 = Tareq Node 2.
        DCP_FLEET_LIVE_PROVIDERS: process.env.DCP_FLEET_LIVE_PROVIDERS || '',

        DCP_FLEET_TICK_MS: process.env.DCP_FLEET_TICK_MS || '30000',

        // Brain (optional): without any backend the watcher runs
        // deterministic-only. Two interchangeable backends:
        //   - OpenAI-compatible (DCP_FLEET_BRAIN_BASE_URL): dogfood DCP
        //     inference. STOPGAP until Node 3: point at Node 2's in-Kingdom
        //     Bonsai over the WG mesh. Critical recovery is deterministic, so
        //     the brain-on-the-node-it-watches circular dep only costs the
        //     diagnosis narrative if that node is down — never the fix.
        //   - Anthropic (ANTHROPIC_API_KEY): highest reliability; set this and
        //     clear BASE_URL to switch back once Node 3 carries inference.
        DCP_FLEET_BRAIN_BASE_URL: process.env.DCP_FLEET_BRAIN_BASE_URL || 'http://10.8.0.6:8080/v1',
        DCP_FLEET_BRAIN_MODEL: process.env.DCP_FLEET_BRAIN_MODEL || 'ternary-bonsai-27b',
        DCP_FLEET_BRAIN_MAX_TOKENS: process.env.DCP_FLEET_BRAIN_MAX_TOKENS || '2048',
        DCP_FLEET_BRAIN_TIMEOUT_MS: process.env.DCP_FLEET_BRAIN_TIMEOUT_MS || '30000',
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',

        // Alerts ride the existing notifications service (Telegram).
        DCP_TG_BOT_TOKEN: process.env.DCP_TG_BOT_TOKEN || '',
        DCP_TG_CHAT_ID: process.env.DCP_TG_CHAT_ID || '',
        DCP_TG_TOPIC_ALERTS: process.env.DCP_TG_TOPIC_ALERTS || '4',
      },
    },
  ],
};
