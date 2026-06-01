// Transaction History API — DCP-771
// Provides paginated transaction history and CSV export for renters and providers.
// Renter data sourced from renter_credit_ledger; provider data from jobs + withdrawal_requests.
'use strict';

const express = require('express');
const db = require('../db');

const renterRouter = express.Router();
const providerRouter = express.Router();

// 1 USD = 3.75 SAR = 375 halala
const HALALA_PER_USD = 375;
// 15% platform take rate (platform pricing model)
const PLATFORM_FEE_RATE = 0.15;

// ─── HELPERS ────────────────────────────────────────────────────────────────

function toFiniteInt(value, { min = 0, max = null, defaultVal = null } = {}) {
  const num = parseInt(value, 10);
  if (!Number.isFinite(num)) return defaultVal;
  if (min != null && num < min) return defaultVal;
  if (max != null && num > max) return max;
  return num;
}

function parseIsoDate(value) {
  if (!value || typeof value !== 'string') return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function halalaToUsd(halala) {
  return Math.round((halala / HALALA_PER_USD) * 100) / 100;
}

function halalaToSar(halala) {
  return Math.round((halala / 100) * 100) / 100;
}

function csvField(value) {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

// ─── AUTH ────────────────────────────────────────────────────────────────────

function authenticateRenter(req, res) {
  const key = req.headers['x-renter-key'] || req.query.key;
  if (!key) {
    res.status(401).json({ error: 'API key required (x-renter-key header or ?key= query param)' });
    return null;
  }
  const renter = db.get(
    "SELECT id FROM renters WHERE api_key = ? AND status = 'active'",
    key
  );
  if (!renter) {
    res.status(403).json({ error: 'Invalid or inactive renter API key' });
    return null;
  }
  return renter;
}

function authenticateProvider(req, res) {
  const key = req.headers['x-provider-key'] || req.query.key;
  if (!key) {
    res.status(401).json({ error: 'API key required (x-provider-key header or ?key= query param)' });
    return null;
  }
  const provider = db.get(
    "SELECT id FROM providers WHERE api_key = ? AND deleted_at IS NULL",
    key
  );
  if (!provider) {
    res.status(403).json({ error: 'Invalid or inactive provider API key' });
    return null;
  }
  return provider;
}

// ─── RENTER ROUTES ───────────────────────────────────────────────────────────

/**
 * GET /api/renters/:id/transactions
 * Paginated list of all renter credits and debits.
 * Query: from, to (ISO dates), type (source filter), limit (max 500), offset
 */
renterRouter.get('/:id/transactions', (req, res) => {
  try {
    const authed = authenticateRenter(req, res);
    if (!authed) return;

    const renterId = parseInt(req.params.id, 10);
    if (authed.id !== renterId) {
      return res.status(403).json({ error: 'Access denied: key does not match renter ID' });
    }

    const limit = toFiniteInt(req.query.limit, { min: 1, max: 500, defaultVal: 50 });
    const offset = toFiniteInt(req.query.offset, { min: 0, defaultVal: 0 });
    const fromDate = parseIsoDate(req.query.from);
    const toDate = parseIsoDate(req.query.to);
    const typeFilter = typeof req.query.type === 'string' ? req.query.type.slice(0, 64) : null;

    const conditions = ['renter_id = ?'];
    const params = [renterId];
    if (fromDate) { conditions.push('created_at >= ?'); params.push(fromDate); }
    if (toDate)   { conditions.push('created_at <= ?'); params.push(toDate); }
    if (typeFilter) { conditions.push('source = ?'); params.push(typeFilter); }

    const where = conditions.join(' AND ');

    // Window function computes running balance (balance_after) ordered by time asc.
    // The outer query pages the DESC result while preserving correct balance values.
    const rows = db.all(`
      SELECT id, source AS type, direction, amount_halala, job_id,
             note AS description, created_at, balance_after_halala
      FROM (
        SELECT id, source, direction, amount_halala, job_id, note, created_at,
               SUM(CASE WHEN direction = 'credit' THEN amount_halala ELSE -amount_halala END)
                 OVER (PARTITION BY renter_id
                       ORDER BY created_at ASC, id ASC
                       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance_after_halala
        FROM renter_credit_ledger
        WHERE ${where}
      )
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `, ...params, limit, offset);

    const countRow = db.get(
      `SELECT COUNT(*) AS count FROM renter_credit_ledger WHERE ${where}`,
      ...params
    );

    const transactions = rows.map((row) => ({
      id: row.id,
      type: row.type,
      direction: row.direction,
      amount_usd: halalaToUsd(row.amount_halala),
      amount_sar: halalaToSar(row.amount_halala),
      description: row.description || null,
      job_id: row.job_id || null,
      created_at: row.created_at,
      balance_after_usd: halalaToUsd(row.balance_after_halala),
      balance_after_sar: halalaToSar(row.balance_after_halala),
    }));

    return res.json({
      transactions,
      pagination: {
        total: countRow.count,
        limit,
        offset,
        has_more: offset + limit < countRow.count,
      },
    });
  } catch (err) {
    console.error('[transactions] renter list error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/renters/:id/transactions/export
 * CSV download of all renter transactions.
 * Query: from, to (ISO dates), format (csv — only format supported)
 */
renterRouter.get('/:id/transactions/export', (req, res) => {
  try {
    const authed = authenticateRenter(req, res);
    if (!authed) return;

    const renterId = parseInt(req.params.id, 10);
    if (authed.id !== renterId) {
      return res.status(403).json({ error: 'Access denied: key does not match renter ID' });
    }

    const fromDate = parseIsoDate(req.query.from);
    const toDate = parseIsoDate(req.query.to);

    const conditions = ['renter_id = ?'];
    const params = [renterId];
    if (fromDate) { conditions.push('created_at >= ?'); params.push(fromDate); }
    if (toDate)   { conditions.push('created_at <= ?'); params.push(toDate); }

    const where = conditions.join(' AND ');

    const rows = db.all(`
      SELECT id, source AS type, direction, amount_halala, job_id,
             note AS description, created_at, balance_after_halala
      FROM (
        SELECT id, source, direction, amount_halala, job_id, note, created_at,
               SUM(CASE WHEN direction = 'credit' THEN amount_halala ELSE -amount_halala END)
                 OVER (PARTITION BY renter_id
                       ORDER BY created_at ASC, id ASC
                       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance_after_halala
        FROM renter_credit_ledger
        WHERE ${where}
      )
      ORDER BY created_at ASC, id ASC
    `, ...params);

    const csvHeaders = ['Date', 'Type', 'Direction', 'Description', 'Amount USD', 'Amount SAR', 'Balance After (SAR)'];
    const csvLines = [csvHeaders.map(csvField).join(',')];
    for (const row of rows) {
      csvLines.push([
        csvField(row.created_at),
        csvField(row.type),
        csvField(row.direction),
        csvField(row.description || ''),
        csvField(halalaToUsd(row.amount_halala).toFixed(2)),
        csvField(halalaToSar(row.amount_halala).toFixed(2)),
        csvField(halalaToSar(row.balance_after_halala).toFixed(2)),
      ].join(','));
    }

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="dcp-transactions-renter-${renterId}-${date}.csv"`);
    return res.send(csvLines.join('\r\n'));
  } catch (err) {
    console.error('[transactions] renter export error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/renters/:id/summary
 * Monthly spending summary for the renter.
 */
renterRouter.get('/:id/summary', (req, res) => {
  try {
    const authed = authenticateRenter(req, res);
    if (!authed) return;

    const renterId = parseInt(req.params.id, 10);
    if (authed.id !== renterId) {
      return res.status(403).json({ error: 'Access denied: key does not match renter ID' });
    }

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

    const currentMonthRow = db.get(
      `SELECT COALESCE(SUM(amount_halala), 0) AS halala
       FROM renter_credit_ledger
       WHERE renter_id = ? AND direction = 'debit' AND created_at >= ?`,
      renterId, currentMonthStart
    );

    const lastMonthRow = db.get(
      `SELECT COALESCE(SUM(amount_halala), 0) AS halala
       FROM renter_credit_ledger
       WHERE renter_id = ? AND direction = 'debit' AND created_at >= ? AND created_at < ?`,
      renterId, lastMonthStart, currentMonthStart
    );

    const jobStatsRow = db.get(
      `SELECT COUNT(*) AS total_jobs, COALESCE(AVG(amount_halala), 0) AS avg_halala
       FROM renter_credit_ledger
       WHERE renter_id = ? AND direction = 'debit' AND source = 'job_charge'`,
      renterId
    );

    return res.json({
      current_month_usd: halalaToUsd(currentMonthRow.halala),
      current_month_sar: halalaToSar(currentMonthRow.halala),
      last_month_usd: halalaToUsd(lastMonthRow.halala),
      last_month_sar: halalaToSar(lastMonthRow.halala),
      total_jobs: jobStatsRow.total_jobs,
      avg_job_cost_usd: halalaToUsd(Math.round(jobStatsRow.avg_halala)),
      avg_job_cost_sar: halalaToSar(Math.round(jobStatsRow.avg_halala)),
    });
  } catch (err) {
    console.error('[transactions] renter summary error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PROVIDER ROUTES ─────────────────────────────────────────────────────────

/**
 * GET /api/providers/:id/transactions
 * Paginated earnings history (completed jobs).
 * Query: from, to (ISO dates), limit (max 500), offset
 */
providerRouter.get('/:id/transactions', (req, res) => {
  try {
    const authed = authenticateProvider(req, res);
    if (!authed) return;

    const providerId = parseInt(req.params.id, 10);
    if (authed.id !== providerId) {
      return res.status(403).json({ error: 'Access denied: key does not match provider ID' });
    }

    const limit = toFiniteInt(req.query.limit, { min: 1, max: 500, defaultVal: 50 });
    const offset = toFiniteInt(req.query.offset, { min: 0, defaultVal: 0 });
    const fromDate = parseIsoDate(req.query.from);
    const toDate = parseIsoDate(req.query.to);

    const conditions = ["provider_id = ? AND status IN ('completed', 'done')"];
    const params = [providerId];
    if (fromDate) { conditions.push('completed_at >= ?'); params.push(fromDate); }
    if (toDate)   { conditions.push('completed_at <= ?'); params.push(toDate); }

    const where = conditions.join(' AND ');

    const rows = db.all(`
      SELECT id, job_id, cost_halala, completed_at AS created_at
      FROM jobs
      WHERE ${where}
      ORDER BY completed_at DESC, id DESC
      LIMIT ? OFFSET ?
    `, ...params, limit, offset);

    const countRow = db.get(`SELECT COUNT(*) AS count FROM jobs WHERE ${where}`, ...params);

    const transactions = rows.map((row) => {
      const gross = row.cost_halala || 0;
      const fee = Math.round(gross * PLATFORM_FEE_RATE);
      const net = gross - fee;
      return {
        id: row.id,
        job_id: row.job_id,
        amount_usd: halalaToUsd(gross),
        amount_sar: halalaToSar(gross),
        platform_fee_usd: halalaToUsd(fee),
        platform_fee_sar: halalaToSar(fee),
        net_amount_usd: halalaToUsd(net),
        net_amount_sar: halalaToSar(net),
        created_at: row.created_at,
      };
    });

    return res.json({
      transactions,
      pagination: {
        total: countRow.count,
        limit,
        offset,
        has_more: offset + limit < countRow.count,
      },
    });
  } catch (err) {
    console.error('[transactions] provider list error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/providers/:id/transactions/export
 * CSV download of provider earnings history.
 * Query: from, to (ISO dates), format (csv — only format supported)
 */
providerRouter.get('/:id/transactions/export', (req, res) => {
  try {
    const authed = authenticateProvider(req, res);
    if (!authed) return;

    const providerId = parseInt(req.params.id, 10);
    if (authed.id !== providerId) {
      return res.status(403).json({ error: 'Access denied: key does not match provider ID' });
    }

    const fromDate = parseIsoDate(req.query.from);
    const toDate = parseIsoDate(req.query.to);

    const conditions = ["provider_id = ? AND status IN ('completed', 'done')"];
    const params = [providerId];
    if (fromDate) { conditions.push('completed_at >= ?'); params.push(fromDate); }
    if (toDate)   { conditions.push('completed_at <= ?'); params.push(toDate); }

    const where = conditions.join(' AND ');

    const rows = db.all(`
      SELECT id, job_id, cost_halala, completed_at
      FROM jobs
      WHERE ${where}
      ORDER BY completed_at ASC, id ASC
    `, ...params);

    const csvHeaders = ['Date', 'Job ID', 'Gross USD', 'Gross SAR', 'Platform Fee USD', 'Platform Fee SAR', 'Net Amount USD', 'Net Amount SAR'];
    const csvLines = [csvHeaders.map(csvField).join(',')];
    for (const row of rows) {
      const gross = row.cost_halala || 0;
      const fee = Math.round(gross * PLATFORM_FEE_RATE);
      const net = gross - fee;
      csvLines.push([
        csvField(row.completed_at),
        csvField(row.job_id),
        csvField(halalaToUsd(gross).toFixed(2)),
        csvField(halalaToSar(gross).toFixed(2)),
        csvField(halalaToUsd(fee).toFixed(2)),
        csvField(halalaToSar(fee).toFixed(2)),
        csvField(halalaToUsd(net).toFixed(2)),
        csvField(halalaToSar(net).toFixed(2)),
      ].join(','));
    }

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="dcp-earnings-provider-${providerId}-${date}.csv"`);
    return res.send(csvLines.join('\r\n'));
  } catch (err) {
    console.error('[transactions] provider export error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/providers/:id/earnings/summary
 * Provider earnings summary: pending payout, total paid, current month, lifetime.
 */
providerRouter.get('/:id/earnings/summary', (req, res) => {
  try {
    const authed = authenticateProvider(req, res);
    if (!authed) return;

    const providerId = parseInt(req.params.id, 10);
    if (authed.id !== providerId) {
      return res.status(403).json({ error: 'Access denied: key does not match provider ID' });
    }

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const providerRow = db.get(
      'SELECT claimable_earnings_halala FROM providers WHERE id = ?',
      providerId
    );

    const currentMonthRow = db.get(
      `SELECT COALESCE(SUM(cost_halala), 0) AS gross
       FROM jobs
       WHERE provider_id = ? AND status IN ('completed', 'done') AND completed_at >= ?`,
      providerId, currentMonthStart
    );

    const lifetimeRow = db.get(
      `SELECT COALESCE(SUM(cost_halala), 0) AS gross
       FROM jobs
       WHERE provider_id = ? AND status IN ('completed', 'done')`,
      providerId
    );

    const paidRow = db.get(
      `SELECT COALESCE(SUM(amount_halala), 0) AS paid
       FROM withdrawal_requests
       WHERE provider_id = ? AND status = 'paid'`,
      providerId
    );

    const pendingHalala = providerRow?.claimable_earnings_halala || 0;
    const paidHalala = paidRow.paid;
    const currentNet = Math.round((currentMonthRow.gross || 0) * (1 - PLATFORM_FEE_RATE));
    const lifetimeNet = Math.round((lifetimeRow.gross || 0) * (1 - PLATFORM_FEE_RATE));

    return res.json({
      pending_payout_usd: halalaToUsd(pendingHalala),
      pending_payout_sar: halalaToSar(pendingHalala),
      total_paid_usd: halalaToUsd(paidHalala),
      total_paid_sar: halalaToSar(paidHalala),
      current_month_net_usd: halalaToUsd(currentNet),
      current_month_net_sar: halalaToSar(currentNet),
      lifetime_earnings_net_usd: halalaToUsd(lifetimeNet),
      lifetime_earnings_net_sar: halalaToSar(lifetimeNet),
      platform_fee_rate: PLATFORM_FEE_RATE,
    });
  } catch (err) {
    console.error('[transactions] provider earnings summary error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = { renterRouter, providerRouter };
