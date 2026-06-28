'use strict';

/**
 * providerLivenessMonitor.js — DCP-804
 *
 * Runs every 60 seconds. Providers that have not sent a heartbeat in the last
 * STALE_THRESHOLD_SEC seconds are considered offline.
 *
 * When a provider goes stale:
 *   1. Their in-progress jobs (running / assigned) are marked failed + requeued
 *   2. Provider status is set to 'offline'
 *   3. A lifecycle event is recorded for each affected job
 *
 * The monitor is started once from server.js at boot.
 * It is NOT started when running under Jest (DC1_DB_PATH=:memory:).
 */

const db = require('../db');
const { notifyProviderOffline } = require('./providerOfflineNotifier');

const STALE_THRESHOLD_SEC = 90;   // provider offline if no heartbeat for 90s
const POLL_INTERVAL_MS    = 60_000; // check every 60s

let _intervalHandle = null;

/**
 * Run one liveness sweep synchronously. Returns a summary of what was done.
 * Exported separately so tests can call it directly.
 */
function runLivenessSweep() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - STALE_THRESHOLD_SEC * 1000).toISOString();
  const nowIso = now.toISOString();

  // Find providers that were online but haven't heartbeated recently.
  // status IN ('online','degraded') is itself the edge guard: a provider
  // already 'offline' is never re-selected here, so each row processed below
  // IS an online→offline transition this cycle.
  const staleProviders = db.all(
    `SELECT id, name, email, last_heartbeat, last_offline_alert_at
     FROM providers
     WHERE status IN ('online', 'degraded')
       AND COALESCE(is_burst, 0) = 0
       AND (last_heartbeat IS NULL OR last_heartbeat < ?)`,
    cutoff
  );

  if (staleProviders.length === 0) return { checked: 0, offlined: 0, requeued: 0 };

  let offlinedCount = 0;
  let requeuedCount = 0;

  for (const provider of staleProviders) {
    // Mark provider offline
    db.prepare(
      `UPDATE providers SET status = 'offline', updated_at = ? WHERE id = ?`
    ).run(nowIso, provider.id);
    offlinedCount++;

    const ageSeconds = provider.last_heartbeat
      ? Math.round((now - new Date(provider.last_heartbeat)) / 1000)
      : null;

    console.log(
      `[liveness] Provider #${provider.id} (${provider.name}) offline` +
      (ageSeconds != null ? ` — last heartbeat ${ageSeconds}s ago` : ' — never heartbeated')
    );

    // ADDITIVE: edge-triggered, deduped notification (backlog gap #1). Wrapped
    // so a notification failure can never break the offline-marking / requeue
    // below. We pass the dedup column we just SELECTed so the gate is decided
    // against persisted state (survives restarts).
    try {
      notifyProviderOffline(
        { id: provider.id, name: provider.name, email: provider.email, last_heartbeat: provider.last_heartbeat },
        { source: 'liveness_monitor', lastOfflineAlertAt: provider.last_offline_alert_at }
      );
    } catch (err) {
      console.error(`[liveness] offline notification error for provider #${provider.id}: ${err.message}`);
    }

    // Find active jobs for this provider
    const activeJobs = db.all(
      `SELECT id, job_id, cost_halala, renter_id
       FROM jobs
       WHERE provider_id = ? AND status IN ('running', 'assigned', 'pulling')`,
      provider.id
    );

    for (const job of activeJobs) {
      // Requeue: reset to pending so another provider can pick it up
      db.prepare(
        `UPDATE jobs
         SET status = 'pending',
             provider_id = NULL,
             assigned_at = NULL,
             picked_up_at = NULL,
             started_at = NULL,
             error = ?,
             updated_at = ?
         WHERE id = ?`
      ).run(`Provider #${provider.id} went offline — requeued`, nowIso, job.id);

      // Record lifecycle event if the table exists
      try {
        db.prepare(
          `INSERT INTO job_lifecycle_events
             (job_id, event, status, source, message, created_at)
           VALUES (?, 'job.requeued', 'pending', 'liveness_monitor', ?, ?)`
        ).run(
          job.job_id,
          `Provider #${provider.id} (${provider.name}) went offline; job requeued for dispatch`,
          nowIso
        );
      } catch (_) { /* table may not have this schema variant */ }

      requeuedCount++;
      console.log(`[liveness] Job ${job.job_id} requeued (provider #${provider.id} offline)`);
    }
  }

  return {
    checked: staleProviders.length,
    offlined: offlinedCount,
    requeued: requeuedCount,
    timestamp: nowIso,
  };
}

/**
 * Start the background liveness monitor.
 * No-op in test environments (DC1_DB_PATH=:memory: or JEST_WORKER_ID set).
 */
function start() {
  const isTest = process.env.DC1_DB_PATH === ':memory:' || process.env.JEST_WORKER_ID;
  if (isTest) return;
  if (_intervalHandle) return; // already running

  _intervalHandle = setInterval(() => {
    try {
      const result = runLivenessSweep();
      if (result.offlined > 0) {
        console.log(
          `[liveness] sweep: ${result.checked} stale, ${result.offlined} offlined, ${result.requeued} jobs requeued`
        );
      }
    } catch (err) {
      console.error('[liveness] sweep error:', err.message);
    }
  }, POLL_INTERVAL_MS);

  // Don't keep the process alive just for the monitor
  if (_intervalHandle.unref) _intervalHandle.unref();
  console.log(`[liveness] monitor started (${STALE_THRESHOLD_SEC}s threshold, ${POLL_INTERVAL_MS / 1000}s interval)`);
}

/**
 * Stop the monitor (used in tests / graceful shutdown).
 */
function stop() {
  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
  }
}

module.exports = { start, stop, runLivenessSweep, STALE_THRESHOLD_SEC };
