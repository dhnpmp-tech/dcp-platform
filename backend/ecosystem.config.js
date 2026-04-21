module.exports = {
  apps: [
    {
      name: 'dc1-provider-onboarding',
      script: '/bin/sh',
      args: '-lc "/root/dc1-platform/infra/setup-model-cache.sh && node src/server.js"',
      cwd: '/root/dc1-platform/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      error_file: '/root/dc1-platform/backend/logs/error.log',
      out_file: '/root/dc1-platform/backend/logs/out.log',
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
        DC1_PROVIDER_PORT: 8083,

        // ── Auth ────────────────────────────────────────────────────────────
        // REQUIRED — generate with: openssl rand -hex 32
        // Never commit real admin tokens to source control
        DC1_ADMIN_TOKEN: '',  // REQUIRED — set in VPS env; generate: openssl rand -hex 32

        // ── HMAC Job Signing (DCP-3) ─────────────────────────────────────────
        // REQUIRED — generate with: openssl rand -hex 32
        // Without this, daemon downloads get empty HMAC secret and job signing is broken
        DC1_HMAC_SECRET: '',  // REQUIRED — set in VPS env; generate: openssl rand -hex 32

        // ── Moyasar Payment Gateway (DCP-31) ────────────────────────────────
        // Get keys from: https://dashboard.moyasar.com/settings/api-keys
        // Test key prefix: sk_test_  |  Live key prefix: sk_live_
        MOYASAR_SECRET_KEY: '',  // Optional — set for live payments
        // Webhook HMAC secret from Moyasar dashboard (defaults to MOYASAR_SECRET_KEY if unset)
        MOYASAR_WEBHOOK_SECRET: '',  // Optional — set for Moyasar webhook verification

        // ── Frontend URL (for Moyasar payment callbacks) ─────────────────────
        FRONTEND_URL: 'https://dcp.sa',

        // ── CORS Extra Origins ────────────────────────────────────────────────
        // dcp.sa is the live frontend domain — must be in CORS allowlist
        CORS_ORIGINS: 'https://dcp.sa,https://www.dcp.sa',

        // ── Backend URL (injected into daemon downloads) ──────────────────────
        // Set to HTTPS once api.dcp.sa DNS + SSL setup is complete
        BACKEND_URL: process.env.BACKEND_URL || 'https://api.dcp.sa',

        // ── Resend Email Service (DCP-54) ─────────────────────────────────────
        // Get API key from: https://resend.com/api-keys
        // Free tier: 100 emails/day — used for welcome emails on registration
        RESEND_API_KEY: '',  // Optional — set for transactional emails via Resend

        // ── On-chain Escrow / Base L2 (DCP-75) ───────────────────────────────
        // Leave ESCROW_CONTRACT_ADDRESS unset to use off-chain SQLite escrow only.
        // Set all three to enable on-chain settlement via Escrow.sol on Base Sepolia.
        // Deploy contract: cd contracts && npx hardhat run scripts/deploy.js --network base-sepolia
        // Generate oracle key: node -e "const{ethers}=require('ethers'); console.log(ethers.Wallet.createRandom().privateKey)"
        ESCROW_CONTRACT_ADDRESS: '',
        ESCROW_ORACLE_PRIVATE_KEY: '',  // Required if ESCROW_CONTRACT_ADDRESS is set
        BASE_RPC_URL: 'https://sepolia.base.org',

        // ── P2P Network (DCP-612) ─────────────────────────────────────────────
        // Bootstrap multiaddr MUST be supplied via the host environment — never
        // commit a real multiaddr (includes IP + libp2p peer identity) to the
        // repo. Example format (for operators only, supplied out-of-band):
        //   /ip4/<IP>/tcp/4001/p2p/<PEER_ID>
        // P2P_DISCOVERY_ENABLED also reads from env so it can be disabled in
        // CI/dev without editing this file.
        DCP_P2P_BOOTSTRAP: process.env.DCP_P2P_BOOTSTRAP || '',
        P2P_DISCOVERY_ENABLED: process.env.P2P_DISCOVERY_ENABLED || 'true'
      }
    },
    {
      name: 'dcp-vps-health-cron',
      script: '/bin/bash',
      args: '-lc "/root/dc1-platform/scripts/vps-health.sh >> /root/dc1-platform/backend/logs/vps-health.log 2>&1"',
      cwd: '/root/dc1-platform/backend',
      instances: 1,
      autorestart: false,
      cron_restart: '*/5 * * * *',
      watch: false,
      max_memory_restart: '100M',
      env: {
        NODE_ENV: 'production',

        // Telegram bot token used by scripts/vps-health.sh to send threshold alerts
        TELEGRAM_BOT_TOKEN: ''  // Optional — set for VPS health alert Telegram notifications
      }
    },
    {
      name: 'dcp-job-volume-cleanup-cron',
      script: '/bin/sh',
      args: '-lc "node /root/dc1-platform/backend/src/scripts/cleanup-job-volumes.js >> /root/dc1-platform/backend/logs/volume-cleanup.log 2>&1"',
      cwd: '/root/dc1-platform/backend',
      instances: 1,
      autorestart: false,
      cron_restart: '30 2 * * *',
      watch: false,
      max_memory_restart: '100M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'dcp-stale-provider-sweep-cron',
      script: '/bin/sh',
      args: '-lc "node /root/dc1-platform/backend/src/scripts/sweep-stale-providers.js >> /root/dc1-platform/backend/logs/stale-provider-sweep.log 2>&1"',
      cwd: '/root/dc1-platform/backend',
      instances: 1,
      autorestart: false,
      cron_restart: '*/5 * * * *',
      watch: false,
      max_memory_restart: '100M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'dcp-runtime-route-parity-cron',
      script: '/bin/sh',
      args: '-lc "ROUTE_PARITY_BASE_URL=${ROUTE_PARITY_BASE_URL:-https://api.dcp.sa} ROUTE_PARITY_ARTIFACT_DIR=/root/dc1-platform/docs/reports/runtime-parity ROUTE_PARITY_TIMEOUT_MS=12000 ROUTE_PARITY_MAX_FAILURES=0 ROUTE_PARITY_LATENCY_THRESHOLD_MS=4000 ROUTE_PARITY_MAX_LATENCY_BREACHES=0 node /root/dc1-platform/backend/src/scripts/run-runtime-route-parity-monitor.js >> /root/dc1-platform/backend/logs/runtime-route-parity.log 2>&1"',
      cwd: '/root/dc1-platform/backend',
      instances: 1,
      autorestart: false,
      cron_restart: '*/15 * * * *',
      watch: false,
      max_memory_restart: '100M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'dcp-v1-reliability-scoreboard-cron',
      script: '/bin/sh',
      args: '-lc "cd /root/dc1-platform/backend && node /root/dc1-platform/backend/src/scripts/generate-v1-reliability-scoreboard.js --output-dir docs/reports/reliability >> /root/dc1-platform/backend/logs/v1-reliability-scoreboard.log 2>&1"',
      cwd: '/root/dc1-platform/backend',
      instances: 1,
      autorestart: false,
      cron_restart: '15 2 * * *',
      watch: false,
      max_memory_restart: '100M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      // Provider health monitoring cron — 3-strike deactivation + auto-reactivation.
      name: 'dcp-provider-health-cron',
      script: '/bin/sh',
      args: '-lc "node /root/dc1-platform/backend/src/workers/providerHealthWorker.js >> /root/dc1-platform/backend/logs/provider-health.log 2>&1"',
      cwd: '/root/dc1-platform/backend',
      instances: 1,
      autorestart: false,
      cron_restart: '*/5 * * * *',
      watch: false,
      max_memory_restart: '100M',
      env: {
        NODE_ENV: 'production',
        PROVIDER_ALIVE_THRESHOLD_SECS: '300',
        PROVIDER_HEALTH_FAILURE_THRESHOLD: '3'
      }
    },
    {
      name: 'dcp-db-backup-cron',
      script: '/bin/bash',
      args: '-lc "/root/dc1-platform/scripts/backup-db.sh"',
      cwd: '/root/dc1-platform/backend',
      instances: 1,
      autorestart: false,
      cron_restart: '0 3 * * *',
      watch: false,
      max_memory_restart: '100M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'dcp-log-rotation-cron',
      script: '/bin/bash',
      args: '-lc "/root/dc1-platform/scripts/rotate-logs.sh"',
      cwd: '/root/dc1-platform/backend',
      instances: 1,
      autorestart: false,
      cron_restart: '0 4 * * *',
      watch: false,
      max_memory_restart: '100M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      // Referral bonus processor — daily at 01:00 UTC.
      // Calculates 5% of referred providers' daily earnings and credits referrers.
      name: 'dcp-referral-bonus-cron',
      script: '/bin/sh',
      args: '-lc "node /root/dc1-platform/backend/src/scripts/process-referral-bonuses.js >> /root/dc1-platform/backend/logs/referral-bonus.log 2>&1"',
      cwd: '/root/dc1-platform/backend',
      instances: 1,
      autorestart: false,
      cron_restart: '0 1 * * *',
      watch: false,
      max_memory_restart: '100M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
