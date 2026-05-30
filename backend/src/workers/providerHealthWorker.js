// providerHealthWorker.js
// Periodically checks provider health via heartbeat staleness.
// Tracks consecutive failures per provider and marks them inactive
// after 3 consecutive missed checks. Re-activates providers that
// resume sending heartbeats.
//
// Can run as:
//   1. In-process module: startProviderHealthWorker(db, intervalMs)
//   2. Standalone PM2 cron: node src/workers/providerHealthWorker.js

'use strict';

const { notifyProviderOffline, clearOfflineAlertState } = require('../services/providerOfflineNotifier');

const HEALTH_CHECK_INTERVAL_MS = Number.parseInt(
  process.env.PROVIDER_HEALTH_CHECK_INTERVAL_MS || String(5 * 60 * 1000),
  10
);

// Provider is considered alive if a heartbeat arrived within this window.
const ALIVE_THRESHOLD_SECS =
  Number.parseInt(process.env.PROVIDER_ALIVE_THRESHOLD_SECS || '300', 10); // 5 min

// Number of consecutive failed health checks before marking provider inactive.
const FAILURE_THRESHOLD =
  Number.parseInt(process.env.PROVIDER_HEALTH_FAILURE_THRESHOLD || '3', 10);

// In-memory consecutive failure counters keyed by provider id.
const failureCounts = new Map();

let healthTimer = null;

// ─── Schema bootstrap ──────────────────────────────────────────────────────────
function ensureSchema(db) {
  // Support both the raw better-sqlite3 instance and the dc1 wrapper {run,get,all,prepare,_db}
  const raw = db._db || db;

  raw.exec(`
    CREATE TABLE IF NOT EXISTS provider_health_log (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      checked_at  TEXT    NOT NULL,
      result      TEXT    NOT NULL CHECK(result IN ('ok','fail')),
      heartbeat_age_secs INTEGER,
      consecutive_failures INTEGER DEFAULT 0,
      status_changed_to TEXT,
      note      TEXT,
      FOREIGN KEY (provider_id) REFERENCES providers(id)
    )
  `);

  raw.exec(
    `CREATE INDEX IF NOT EXISTS idx_provider_health_log_provider
     ON provider_health_log(provider_id, checked_at DESC)`
  );

  try {
    db.prepare('ALTER TABLE providers ADD COLUMN consecutive_health_failures INTEGER DEFAULT 0').run();
  } catch (_) { /* already exists */ }

  try {
    db.prepare('ALTER TABLE providers ADD COLUMN last_health_check TEXT').run();
  } catch (_) { /* already exists */ }

  // Backlog gap #1: dedup state for online→offline alerts. Idempotent; also
  // added centrally in db.js migrations — duplicated here so the standalone
  // PM2 cron entry point (which only calls ensureSchema) never SELECTs a
  // missing column.
  try {
    db.prepare('ALTER TABLE providers ADD COLUMN last_offline_alert_at TEXT').run();
  } catch (_) { /* already exists */ }
}

// ─── Core health check cycle ───────────────────────────────────────────────────
function runHealthCheck(db) {
  const now = new Date();
  const nowIso = now.toISOString();

  const providers = db.all(
    `SELECT id, name, email, status, last_heartbeat, consecutive_health_failures, last_offline_alert_at
     FROM providers
     WHERE status NOT IN ('pending', 'deleted', 'cancelled')
       AND deleted_at IS NULL`
  );

  if (providers.length === 0) return;

  const logStmt = db.prepare(
    `INSERT INTO provider_health_log
       (provider_id, checked_at, result, heartbeat_age_secs, consecutive_failures, status_changed_to, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const markOfflineStmt = db.prepare(
    `UPDATE providers
     SET status = 'offline', consecutive_health_failures = ?, last_health_check = ?, updated_at = ?
     WHERE id = ?`
  );

  const markOnlineStmt = db.prepare(
    `UPDATE providers
     SET status = 'online', consecutive_health_failures = 0, last_health_check = ?, updated_at = ?
     WHERE id = ?`
  );

  const updateCounterStmt = db.prepare(
    `UPDATE providers
     SET consecutive_health_failures = ?, last_health_check = ?, updated_at = ?
     WHERE id = ?`
  );

  for (const provider of providers) {
    const providerId = provider.id;

    let heartbeatAgeSecs = null;
    if (provider.last_heartbeat) {
      const lastBeat = new Date(provider.last_heartbeat).getTime();
      if (Number.isFinite(lastBeat)) {
        heartbeatAgeSecs = Math.floor((now.getTime() - lastBeat) / 1000);
      }
    }

    const isAlive = heartbeatAgeSecs !== null && heartbeatAgeSecs <= ALIVE_THRESHOLD_SECS;

    if (!failureCounts.has(providerId)) {
      failureCounts.set(providerId, Number(provider.consecutive_health_failures || 0));
    }

    let currentFailures = failureCounts.get(providerId);

    if (isAlive) {
      const wasOffline = currentFailures >= FAILURE_THRESHOLD || provider.status === 'offline';
      currentFailures = 0;
      failureCounts.set(providerId, 0);

      if (wasOffline && provider.status === 'offline') {
        markOnlineStmt.run(nowIso, nowIso, providerId);
        logStmt.run(
          providerId, nowIso, 'ok', heartbeatAgeSecs, 0, 'online',
          'Provider resumed heartbeats — marked online'
        );
        // ADDITIVE: clear offline-alert dedup so the NEXT genuine offline
        // transition re-alerts. Best-effort; never breaks the online-marking.
        try {
          clearOfflineAlertState(providerId);
        } catch (err) {
          console.error(`[providerHealth] clear offline-alert state failed for provider ${providerId}: ${err.message}`);
        }
        console.log(`[providerHealth] provider ${providerId} (${provider.email}) is BACK ONLINE`);
      } else {
        updateCounterStmt.run(0, nowIso, nowIso, providerId);
        logStmt.run(
          providerId, nowIso, 'ok', heartbeatAgeSecs, 0, null,
          `Heartbeat age: ${heartbeatAgeSecs}s`
        );
      }
    } else {
      currentFailures += 1;
      failureCounts.set(providerId, currentFailures);

      const note = heartbeatAgeSecs !== null
        ? `Heartbeat stale: ${heartbeatAgeSecs}s (threshold: ${ALIVE_THRESHOLD_SECS}s)`
        : 'No heartbeat ever received';

      if (currentFailures >= FAILURE_THRESHOLD && provider.status !== 'offline') {
        markOfflineStmt.run(currentFailures, nowIso, nowIso, providerId);
        logStmt.run(
          providerId, nowIso, 'fail', heartbeatAgeSecs, currentFailures, 'offline',
          `${note} — marked offline after ${currentFailures} consecutive failures`
        );
        // ADDITIVE: this branch is exactly the online→offline transition
        // (status was not yet 'offline'). Notify the provider + platform,
        // deduped against persisted state. Wrapped so a send failure can never
        // break the offline-marking above.
        try {
          notifyProviderOffline(
            { id: providerId, name: provider.name, email: provider.email, last_heartbeat: provider.last_heartbeat },
            { source: 'provider_health_worker', lastOfflineAlertAt: provider.last_offline_alert_at }
          );
        } catch (err) {
          console.error(`[providerHealth] offline notification error for provider ${providerId}: ${err.message}`);
        }
        console.warn(
          `[providerHealth] provider ${providerId} (${provider.email}) OFFLINE after ${currentFailures} failed checks`
        );
      } else {
        updateCounterStmt.run(currentFailures, nowIso, nowIso, providerId);
        logStmt.run(
          providerId, nowIso, 'fail', heartbeatAgeSecs, currentFailures, null,
          `${note} — failure ${currentFailures}/${FAILURE_THRESHOLD}`
        );
        if (currentFailures > 1) {
          console.warn(
            `[providerHealth] provider ${providerId} (${provider.email}) missed check ${currentFailures}/${FAILURE_THRESHOLD}`
          );
        }
      }
    }
  }

  // Prune health log older than 7 days
  try {
    db.prepare(
      `DELETE FROM provider_health_log WHERE datetime(checked_at) < datetime('now', '-7 days')`
    ).run();
  } catch (_) { /* non-fatal */ }
}

// ─── Public API ────────────────────────────────────────────────────────────────

function getProviderHealthStatus(db, providerId) {
  const provider = db.get(
    `SELECT id, status, last_heartbeat, last_health_check, consecutive_health_failures
     FROM providers WHERE id = ?`,
    providerId
  );
  if (!provider) return null;

  const recentChecks = db.all(
    `SELECT checked_at, result, heartbeat_age_secs, consecutive_failures, status_changed_to, note
     FROM provider_health_log
     WHERE provider_id = ?
     ORDER BY checked_at DESC
     LIMIT 20`,
    providerId
  );

  const heartbeatAgeSecs = provider.last_heartbeat
    ? Math.floor((Date.now() - new Date(provider.last_heartbeat).getTime()) / 1000)
    : null;

  return {
    provider_id: providerId,
    status: provider.status,
    last_heartbeat: provider.last_heartbeat || null,
    heartbeat_age_secs: heartbeatAgeSecs,
    last_health_check: provider.last_health_check || null,
    consecutive_failures: Number(provider.consecutive_health_failures || 0),
    failure_threshold: FAILURE_THRESHOLD,
    recent_checks: recentChecks,
  };
}

function getOnlineProviders(db) {
  return db.all(
    `SELECT id, name, email, gpu_model, gpu_count, vram_gb, ip_address,
            cost_per_gpu_second_halala, last_heartbeat, consecutive_health_failures,
            CAST((julianday('now') - julianday(last_heartbeat)) * 86400 AS INTEGER) AS heartbeat_age_secs
     FROM providers
     WHERE status = 'online'
       AND deleted_at IS NULL
       AND (
         last_heartbeat IS NOT NULL
         AND CAST((julianday('now') - julianday(last_heartbeat)) * 86400 AS INTEGER) <= ?
       )
     ORDER BY last_heartbeat DESC`,
    ALIVE_THRESHOLD_SECS
  );
}

function startProviderHealthWorker(db, intervalMs) {
  ensureSchema(db);
  stopProviderHealthWorker();

  const safeMs =
    Number.isFinite(intervalMs) && intervalMs > 0
      ? intervalMs
      : HEALTH_CHECK_INTERVAL_MS;

  try {
    runHealthCheck(db);
  } catch (err) {
    console.error('[providerHealth] initial check failed:', err.message);
  }

  healthTimer = setInterval(() => {
    try {
      runHealthCheck(db);
    } catch (err) {
      console.error('[providerHealth] check cycle failed:', err.message);
    }
  }, safeMs);

  if (typeof healthTimer.unref === 'function') healthTimer.unref();

  console.log(`[providerHealth] worker started, interval ${safeMs}ms, threshold ${FAILURE_THRESHOLD} failures`);
  return healthTimer;
}

function stopProviderHealthWorker() {
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
}

module.exports = {
  startProviderHealthWorker,
  stopProviderHealthWorker,
  getProviderHealthStatus,
  getOnlineProviders,
  ensureSchema,
};

// ─── Standalone / PM2 cron entry point ────────────────────────────────────────
if (require.main === module) {
  const db = require('../db');
  ensureSchema(db);
  try {
    console.log('[providerHealth] standalone run started at', new Date().toISOString());
    runHealthCheck(db);
    console.log('[providerHealth] standalone run complete');
    process.exit(0);
  } catch (err) {
    console.error('[providerHealth] standalone run failed:', err.message);
    process.exit(1);
  }
}
