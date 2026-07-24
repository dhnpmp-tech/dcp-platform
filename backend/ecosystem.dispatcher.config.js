// Mission Control dispatcher — pm2 config (separate from ecosystem.config.js
// so it can be started/reloaded without touching the production API + crons):
//   pm2 start backend/ecosystem.dispatcher.config.js
//
// Secrets follow the read-through pattern from ecosystem.config.js: values are
// inherited from the VPS environment — hardcoding '' here and reloading would
// clobber the live secret.
module.exports = {
  apps: [
    {
      name: 'dc1-mission-dispatcher',
      script: 'src/dispatcher/run.js',
      cwd: '/root/dc1-platform/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      error_file: '/root/dc1-platform/backend/logs/mission-dispatcher-error.log',
      out_file: '/root/dc1-platform/backend/logs/mission-dispatcher.log',
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',

        // Local backend API (same box) — mission routes live on the provider port.
        MISSION_BASE_URL: process.env.MISSION_BASE_URL || 'http://127.0.0.1:8083',

        // REQUIRED — dispatcher-scoped key issued via:
        //   node scripts/mission-seed-agents.js --issue-keys   (or POST /api/mission/agent-keys)
        MISSION_DISPATCHER_KEY: process.env.MISSION_DISPATCHER_KEY || '',

        // SAFETY DEFAULT: dry-run ('1') logs every action without executing.
        // Flip to '0' only after reviewing one day of logs (rollout step 3→4).
        DISPATCHER_DRY_RUN: process.env.DISPATCHER_DRY_RUN || '1',

        DISPATCHER_STATE_FILE: '/root/dc1-platform/backend/data/mission-dispatcher-state.json',
        DISPATCH_INTERVAL_MS: '300000',

        // Telegram bridge (write-only). Leave unset to run without notifications —
        // the notifier degrades to a logged no-op.
        DCP_TG_BOT_TOKEN: process.env.DCP_TG_BOT_TOKEN || '',
        DCP_TG_CHAT_ID: process.env.DCP_TG_CHAT_ID || '',
        DCP_TG_TOPIC_TEAM: process.env.DCP_TG_TOPIC_TEAM || '7',
        DCP_TG_TOPIC_ALERTS: process.env.DCP_TG_TOPIC_ALERTS || '4',
      },
    },
  ],
};
