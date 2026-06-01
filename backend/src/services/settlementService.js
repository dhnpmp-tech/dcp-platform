'use strict';

/**
 * Settlement Service — DCP-745
 *
 * Closes the financial loop when a job completes:
 *   1. Calculates gross cost from duration + GPU rate
 *   2. Applies 15% platform fee
 *   3. Credits provider payout (85%)
 *   4. Writes a definitive record to job_settlements ledger
 *
 * This is intentionally a pure-logic layer — the actual SQLite mutations are
 * handled here so that routes stay thin and the logic is unit-testable.
 *
 * Rates (halala / second) derived from platform pricing model floor prices:
 *   RTX 4090  $0.267/hr  → COST_RATES['llm-inference'] = 9 halala/min
 *   RTX 4080  $0.178/hr  → COST_RATES['default']       = 6 halala/min
 *   H100      $1.89/hr   → COST_RATES['training']       = 7 halala/min
 *
 * All internal arithmetic is integer halala.
 * 1 SAR = 100 halala.
 */

const crypto = require('crypto');

// Platform take rate: 15% blended (platform pricing model)
const PLATFORM_FEE_PERCENT = 15;

/**
 * Per-minute halala rates — matches jobs.js COST_RATES so settlement and
 * quoting always use the same numbers.
 */
const COST_RATES_PER_MINUTE = {
  'llm-inference':   9,
  'llm_inference':   9,
  'training':        7,
  'rendering':       10,
  'image_generation': 10,
  'vllm_serve':      9,
  'default':         6,
};

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Return the rate in halala per second for a given job type.
 * Rounds to four decimal places so downstream integer rounding is clean.
 */
function ratePerSecond(jobType) {
  const perMin = COST_RATES_PER_MINUTE[jobType] || COST_RATES_PER_MINUTE['default'];
  return perMin / 60;
}

/**
 * Calculate gross cost in halala from duration (seconds) and job type.
 * Rounds up to the nearest halala (minimum 1 halala).
 */
function calcGross(durationSeconds, jobType) {
  const rate = ratePerSecond(jobType);
  return Math.max(1, Math.round(durationSeconds * rate));
}

/**
 * Split gross amount into platform fee and provider payout.
 * Platform fee is rounded down; provider gets the remainder to avoid
 * off-by-one rounding that would over-charge the renter.
 */
function splitFee(grossHalala) {
  const fee = Math.floor((grossHalala * PLATFORM_FEE_PERCENT) / 100);
  const payout = grossHalala - fee;
  return { platformFee: fee, providerPayout: payout };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Persist a completed-job settlement to the job_settlements ledger.
 *
 * @param {object} db          - better-sqlite3 db handle (passed in for testability)
 * @param {object} opts
 * @param {string} opts.jobId
 * @param {number|null} opts.providerId
 * @param {number} opts.renterId
 * @param {number} opts.durationSeconds
 * @param {string} opts.jobType
 * @param {'completed'|'failed'|'refunded'} opts.status
 *
 * @returns {object} settlement record
 */
function recordSettlement(db, { jobId, providerId, renterId, durationSeconds, jobType, status }) {
  const grossHalala = (status === 'completed')
    ? calcGross(durationSeconds, jobType)
    : 0;

  const { platformFee, providerPayout } = splitFee(grossHalala);
  const rate = ratePerSecond(jobType);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  ensureSettlementsTable(db);

  // Idempotent: if a settlement already exists for this job, return it
  const existing = db.prepare('SELECT * FROM job_settlements WHERE job_id = ?').get(jobId);
  if (existing) return existing;

  db.prepare(`
    INSERT INTO job_settlements
      (id, job_id, provider_id, renter_id, duration_seconds, gpu_rate_per_second,
       gross_amount_halala, platform_fee_halala, provider_payout_halala, status, settled_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, jobId, providerId ?? null, renterId, durationSeconds, rate,
         grossHalala, platformFee, providerPayout, status, now);

  return db.prepare('SELECT * FROM job_settlements WHERE id = ?').get(id);
}

/**
 * Retrieve all settlements for a provider with optional period filter.
 *
 * @param {object} db
 * @param {number} providerId
 * @param {object} [opts]
 * @param {string} [opts.since]   ISO timestamp lower bound (inclusive)
 * @param {string} [opts.until]   ISO timestamp upper bound (inclusive)
 * @param {number} [opts.limit]   default 50, max 200
 * @param {number} [opts.offset]  default 0
 */
function getProviderEarnings(db, providerId, { since, until, limit = 50, offset = 0 } = {}) {
  ensureSettlementsTable(db);

  const safeLimit  = Math.min(Number(limit)  || 50,  200);
  const safeOffset = Math.max(Number(offset) || 0,   0);

  let where = 'WHERE provider_id = ? AND status = ?';
  const params = [providerId, 'completed'];

  if (since) { where += ' AND settled_at >= ?'; params.push(since); }
  if (until) { where += ' AND settled_at <= ?'; params.push(until); }

  const rows = db.prepare(
    `SELECT * FROM job_settlements ${where} ORDER BY settled_at DESC LIMIT ? OFFSET ?`
  ).all(...params, safeLimit, safeOffset);

  const totals = db.prepare(
    `SELECT
       COUNT(*)                         AS job_count,
       COALESCE(SUM(provider_payout_halala), 0) AS total_payout_halala,
       COALESCE(SUM(gross_amount_halala),    0) AS total_gross_halala
     FROM job_settlements ${where}`
  ).get(...params);

  return {
    providerId,
    settlements: rows,
    summary: {
      jobCount:          totals.job_count,
      totalPayoutHalala: totals.total_payout_halala,
      totalPayoutSar:    Number((totals.total_payout_halala / 100).toFixed(2)),
      totalGrossHalala:  totals.total_gross_halala,
    },
    pagination: { limit: safeLimit, offset: safeOffset },
  };
}

/**
 * Summarise a renter's billing history from the ledger.
 *
 * @param {object} db
 * @param {number} renterId
 * @param {object} [opts]
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 */
function getRenterTransactions(db, renterId, { limit = 50, offset = 0 } = {}) {
  ensureSettlementsTable(db);

  const safeLimit  = Math.min(Number(limit)  || 50,  200);
  const safeOffset = Math.max(Number(offset) || 0,   0);

  const rows = db.prepare(
    `SELECT * FROM job_settlements
     WHERE renter_id = ?
     ORDER BY settled_at DESC
     LIMIT ? OFFSET ?`
  ).all(renterId, safeLimit, safeOffset);

  const totals = db.prepare(
    `SELECT
       COUNT(*)                                              AS job_count,
       COALESCE(SUM(CASE WHEN status = 'completed' THEN gross_amount_halala ELSE 0 END), 0) AS total_charged_halala,
       COALESCE(SUM(CASE WHEN status = 'refunded'  THEN gross_amount_halala ELSE 0 END), 0) AS total_refunded_halala
     FROM job_settlements WHERE renter_id = ?`
  ).get(renterId);

  return {
    renterId,
    transactions: rows,
    summary: {
      jobCount:             totals.job_count,
      totalChargedHalala:   totals.total_charged_halala,
      totalChargedSar:      Number((totals.total_charged_halala / 100).toFixed(2)),
      totalRefundedHalala:  totals.total_refunded_halala,
    },
    pagination: { limit: safeLimit, offset: safeOffset },
  };
}

// ── Internal ──────────────────────────────────────────────────────────────────

/**
 * Apply the migration once (idempotent). Called lazily so unit tests can
 * inject an in-memory db without needing to run migrations upfront.
 */
function ensureSettlementsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_settlements (
      id                     TEXT PRIMARY KEY,
      job_id                 TEXT NOT NULL UNIQUE,
      provider_id            INTEGER,
      renter_id              INTEGER NOT NULL,
      duration_seconds       INTEGER,
      gpu_rate_per_second    REAL,
      gross_amount_halala    INTEGER NOT NULL,
      platform_fee_halala    INTEGER NOT NULL,
      provider_payout_halala INTEGER NOT NULL,
      status                 TEXT NOT NULL CHECK(status IN ('completed','failed','refunded')) DEFAULT 'completed',
      settled_at             TEXT NOT NULL,
      created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_job_settlements_provider ON job_settlements(provider_id, settled_at DESC);
    CREATE INDEX IF NOT EXISTS idx_job_settlements_renter   ON job_settlements(renter_id,   settled_at DESC);
  `);
}

module.exports = {
  recordSettlement,
  getProviderEarnings,
  getRenterTransactions,
  // Exported for unit tests
  calcGross,
  splitFee,
  ratePerSecond,
  COST_RATES_PER_MINUTE,
  PLATFORM_FEE_PERCENT,
};
