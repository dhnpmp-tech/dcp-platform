/**
 * Notifications V2 — in-dashboard renter notifications.
 *
 * Why this exists: per-job completion emails were burning Resend quota
 * (~641 jobs/day = ~641 emails/day at production volume). This module
 * persists notifications to SQLite; the dashboard reads them via
 * /api/renters/me/notifications and the dailyDigest service rolls them
 * into ONE email per renter per day.
 *
 * The module is intentionally tiny + dependency-light so it can be invoked
 * from jobSweep without growing that file's responsibilities.
 *
 * Feature flag: process.env.NOTIFICATIONS_V2_ENABLED === 'true' (default off
 * during rollout, on after dailyDigest cron is verified).
 */

const FLAG = 'NOTIFICATIONS_V2_ENABLED';

function isEnabled() {
  return String(process.env[FLAG] || '').toLowerCase() === 'true';
}

function hasTable(db, tableName) {
  try {
    const row = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(tableName);
    return Boolean(row);
  } catch (_err) {
    return false;
  }
}

/**
 * Insert a notification row. Best-effort: any failure is logged and
 * swallowed so we never crash the calling sweep.
 *
 * @param {object} db better-sqlite3 instance
 * @param {object} params
 * @param {number} params.renterId
 * @param {string} params.kind   e.g. 'job_completed', 'job_failed', 'balance_low'
 * @param {number} [params.jobId]
 * @param {object} [params.payload] JSON-serializable
 * @returns {{ok: boolean, id?: number, reason?: string}}
 */
function recordNotification(db, { renterId, kind, jobId, payload }) {
  if (!db || typeof db.prepare !== 'function') {
    return { ok: false, reason: 'no_db' };
  }
  if (!renterId || !kind) {
    return { ok: false, reason: 'invalid_arguments' };
  }
  if (!hasTable(db, 'renter_notifications')) {
    return { ok: false, reason: 'table_missing' };
  }

  try {
    const payloadJson = payload === undefined || payload === null
      ? null
      : JSON.stringify(payload);
    const result = db
      .prepare(
        `INSERT INTO renter_notifications (renter_id, kind, job_id, payload)
         VALUES (?, ?, ?, ?)`
      )
      .run(renterId, kind, jobId || null, payloadJson);
    return { ok: true, id: Number(result.lastInsertRowid) };
  } catch (error) {
    console.warn('[notificationsV2] failed to insert notification:', error.message);
    return { ok: false, reason: error.message || 'insert_failed' };
  }
}

/**
 * Get the renter's balance_halala. Used by the low-balance escalation
 * path. Returns null on lookup failure so the caller can treat that as
 * "don't escalate."
 */
function getRenterBalanceHalala(db, renterId) {
  try {
    const row = db
      .prepare('SELECT balance_halala FROM renters WHERE id = ?')
      .get(renterId);
    if (!row) return null;
    return Number(row.balance_halala) || 0;
  } catch (_err) {
    return null;
  }
}

module.exports = {
  isEnabled,
  recordNotification,
  getRenterBalanceHalala,
  FLAG,
};
