'use strict';

/**
 * cronHeartbeat.js — minimal per-cron last-run tracking.
 *
 * Each setInterval cron in server.js calls recordCronTick at the end of
 * its execution with the outcome + a small summary. Stored in the
 * cron_heartbeats table (migration 022).
 *
 * Read by heartbeat_mvp.py — if last_run_at is more than 2 × interval_ms
 * stale, the probe alerts to topic 4 so ops can investigate (stuck PM2
 * process, missed setInterval timer, etc).
 */

const db = require('../db');

/**
 * @param {string} cronId         e.g. 'auto_topup_sweep'
 * @param {object} args
 * @param {'ok'|'error'} args.outcome
 * @param {number} args.intervalMs Expected cadence (used by the probe to set the staleness threshold).
 * @param {object|null} [args.summary]  Plain object — serialized to JSON. Should be small.
 * @param {string|null} [args.error]    Error message when outcome='error'.
 */
function recordCronTick(cronId, { outcome, intervalMs, summary = null, error = null } = {}) {
  if (!cronId) throw new Error('recordCronTick: cronId required');
  if (outcome !== 'ok' && outcome !== 'error') throw new Error('recordCronTick: outcome must be ok or error');
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error('recordCronTick: intervalMs required');

  const now = Date.now() / 1000;
  const summaryJson = summary ? JSON.stringify(summary).slice(0, 2000) : null;
  const errMsg = error ? String(error).slice(0, 500) : null;

  // Reset consecutive_errors on success; increment on error. UPSERT pattern.
  const existing = db.get('SELECT consecutive_errors FROM cron_heartbeats WHERE cron_id = ?', cronId);
  const nextConsecutive = outcome === 'ok' ? 0 : ((existing?.consecutive_errors || 0) + 1);

  db.prepare(`
    INSERT INTO cron_heartbeats
      (cron_id, last_run_at, last_outcome, last_summary, last_error, interval_ms, consecutive_errors)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cron_id) DO UPDATE SET
      last_run_at        = excluded.last_run_at,
      last_outcome       = excluded.last_outcome,
      last_summary       = excluded.last_summary,
      last_error         = excluded.last_error,
      interval_ms        = excluded.interval_ms,
      consecutive_errors = excluded.consecutive_errors
  `).run(cronId, now, outcome, summaryJson, errMsg, intervalMs, nextConsecutive);
}

module.exports = { recordCronTick };
