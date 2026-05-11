// earnings.js — Provider earnings dashboard API + Admin platform stats
// Mounts two routers:
//   providerEarningsRouter -> /api/providers
//   adminStatsRouter       -> /api/admin

'use strict';

const express = require('express');
const db = require('../db');
const { requireAdminAuth } = require('../middleware/auth');
const { apiKeyAuth } = require('../middleware/apiKeyAuth');

// ============================================================================
// Helpers
// ============================================================================

const SAR_PER_HALALA = 0.01;
const USD_PER_SAR = 1 / 3.75;

function halalaToSar(h) {
    return Number(((h || 0) * SAR_PER_HALALA).toFixed(4));
}

function halalaToUsd(h) {
    return Number(((h || 0) * SAR_PER_HALALA * USD_PER_HALALA).toFixed(4));
}

// ============================================================================
// Provider Earnings Router
// ============================================================================

const providerEarningsRouter = express.Router();

// GET /api/providers/:id/earnings
// Auth: Bearer dcp_prov_* (provider API key)
// Provider may only access their own ID.
providerEarningsRouter.get('/:id/earnings', apiKeyAuth, (req, res) => {
    try {
        const requestedId = parseInt(req.params.id, 10);
        if (isNaN(requestedId)) {
            return res.status(400).json({ error: 'Invalid provider id' });
        }
        if (req.provider.id !== requestedId) {
            return res.status(403).json({ error: 'Forbidden: you may only access your own earnings' });
        }

        const provider = db.get(
            `SELECT id, name, total_earnings, total_jobs, claimable_earnings_halala
             FROM providers WHERE id = ? AND deleted_at IS NULL`,
            [requestedId]
        );
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        // Aggregate from jobs table (primary ledger for per-job earnings)
        const totals = db.get(
            `SELECT
                COALESCE(SUM(CASE WHEN status = 'completed' THEN COALESCE(provider_earned_halala, 0) ELSE 0 END), 0) AS earned_halala,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN COALESCE(total_tokens, 0) ELSE 0 END), 0)           AS total_tokens,
                COUNT(CASE WHEN status = 'completed' THEN 1 END)                                                      AS total_jobs_completed
             FROM jobs
             WHERE provider_id = ?`,
            [requestedId]
        ) || {};

        // Supplement token count from serve_sessions if available
        const sessionTokens = db.get(
            `SELECT COALESCE(SUM(total_tokens), 0) AS tokens
             FROM serve_sessions
             WHERE provider_id = ? AND status IN ('stopped', 'expired')`,
            [requestedId]
        ) || { tokens: 0 };

        const totalTokens = Math.max(
            Number(totals.total_tokens || 0),
            Number(sessionTokens.tokens || 0)
        );

        // Pending payout = claimable_earnings_halala (escrow ledger)
        const claimableHalala = Number(provider.claimable_earnings_halala || 0);

        // Pending withdrawal requests
        const pendingWithdrawal = db.get(
            `SELECT COALESCE(SUM(amount_halala), 0) AS pending_halala
             FROM withdrawal_requests
             WHERE provider_id = ? AND status IN ('pending', 'processing')`,
            [requestedId]
        ) || { pending_halala: 0 };

        const pendingPayoutHalala = Math.max(0, claimableHalala - Number(pendingWithdrawal.pending_halala || 0));

        // Last 30 days daily breakdown
        const last30Days = db.all(
            `SELECT
                DATE(COALESCE(completed_at, submitted_at, created_at)) AS day,
                COALESCE(SUM(COALESCE(provider_earned_halala, 0)), 0) AS earned_halala,
                COUNT(*) AS job_count
             FROM jobs
             WHERE provider_id = ?
               AND status = 'completed'
               AND DATE(COALESCE(completed_at, submitted_at, created_at)) >= DATE('now', '-30 days')
             GROUP BY day
             ORDER BY day ASC`,
            [requestedId]
        );

        // Top 5 jobs by earnings
        const topJobs = db.all(
            `SELECT
                job_id,
                model,
                COALESCE(total_tokens, 0) AS tokens,
                COALESCE(provider_earned_halala, 0) AS earned_halala,
                completed_at
             FROM jobs
             WHERE provider_id = ? AND status = 'completed' AND provider_earned_halala > 0
             ORDER BY provider_earned_halala DESC
             LIMIT 5`,
            [requestedId]
        );

        const earnedHalala = Number(totals.earned_halala || 0);

        return res.json({
            provider_id: provider.id,
            name: provider.name,
            total_earned_sar: halalaToSar(earnedHalala),
            total_earned_usd: halalaToUsd(earnedHalala),
            total_jobs: Number(totals.total_jobs_completed || 0),
            total_tokens: totalTokens,
            pending_payout_sar: halalaToSar(pendingPayoutHalala),
            last_30_days: last30Days.map(row => ({
                date: row.day,
                earned_sar: halalaToSar(row.earned_halala),
                earned_halala: Number(row.earned_halala),
                job_count: Number(row.job_count),
            })),
            top_jobs: topJobs.map(row => ({
                job_id: row.job_id,
                model: row.model,
                tokens: Number(row.tokens),
                earned_sar: halalaToSar(row.earned_halala),
                completed_at: row.completed_at,
            })),
        });
    } catch (err) {
        console.error('[GET /providers/:id/earnings]', err);
        return res.status(500).json({ error: 'Failed to fetch earnings' });
    }
});

// GET /api/providers/:id/earnings/history?limit=50&offset=0
// Auth: Bearer dcp_prov_* (provider API key)
// Paginated job-level earnings history. renter_id is masked for privacy.
providerEarningsRouter.get('/:id/earnings/history', apiKeyAuth, (req, res) => {
    try {
        const requestedId = parseInt(req.params.id, 10);
        if (isNaN(requestedId)) {
            return res.status(400).json({ error: 'Invalid provider id' });
        }
        if (req.provider.id !== requestedId) {
            return res.status(403).json({ error: 'Forbidden: you may only access your own earnings' });
        }

        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

        const total = db.get(
            `SELECT COUNT(*) AS count FROM jobs WHERE provider_id = ? AND status = 'completed'`,
            [requestedId]
        ) || { count: 0 };

        const rows = db.all(
            `SELECT
                job_id,
                SUBSTR(CAST(renter_id AS TEXT), 1, 3) || '***' AS renter_id_masked,
                model,
                started_at,
                COALESCE(actual_duration_minutes, duration_minutes, 0) * 60 AS duration_sec,
                COALESCE(total_tokens, 0) AS tokens,
                COALESCE(provider_earned_halala, 0) AS earned_halala,
                completed_at
             FROM jobs
             WHERE provider_id = ? AND status = 'completed'
             ORDER BY COALESCE(completed_at, created_at) DESC
             LIMIT ? OFFSET ?`,
            [requestedId, limit, offset]
        );

        return res.json({
            provider_id: requestedId,
            total: Number(total.count),
            limit,
            offset,
            items: rows.map(row => ({
                job_id: row.job_id,
                renter_id: row.renter_id_masked,
                model: row.model,
                started_at: row.started_at,
                duration_sec: Number(row.duration_sec || 0),
                tokens: Number(row.tokens),
                earned_sar: halalaToSar(row.earned_halala),
                earned_halala: Number(row.earned_halala),
                completed_at: row.completed_at,
            })),
        });
    } catch (err) {
        console.error('[GET /providers/:id/earnings/history]', err);
        return res.status(500).json({ error: 'Failed to fetch earnings history' });
    }
});

// ============================================================================
// Admin Stats Router
// ============================================================================

const adminStatsRouter = express.Router();

// GET /api/admin/stats
// Auth: DC1_ADMIN_TOKEN header (X-Admin-Token or Authorization: Bearer)
adminStatsRouter.get('/stats', requireAdminAuth, (req, res) => {
    try {
        const now = new Date();
        const fiveMinAgo = new Date(now - 5 * 60 * 1000).toISOString();

        // Provider counts
        const providerCounts = db.get(
            `SELECT
                COUNT(*) AS total_registered,
                COUNT(CASE WHEN status = 'active' AND deleted_at IS NULL AND last_heartbeat > ? THEN 1 END) AS total_active
             FROM providers
             WHERE deleted_at IS NULL`,
            [fiveMinAgo]
        ) || {};

        // Renter counts
        const renterCount = db.get(
            `SELECT COUNT(*) AS total FROM renters WHERE deleted_at IS NULL`
        ) || { total: 0 };

        // Job & revenue aggregates
        const jobStats = db.get(
            `SELECT
                COUNT(*) AS total_jobs,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN COALESCE(total_tokens, 0) ELSE 0 END), 0) AS total_tokens,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN COALESCE(actual_cost_halala, 0) ELSE 0 END), 0) AS total_revenue_halala,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN COALESCE(dc1_fee_halala, 0) ELSE 0 END), 0) AS platform_fees_halala,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_jobs,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) AS failed_jobs
             FROM jobs`
        ) || {};

        // Supplement token count from serve_sessions
        const sessionTokens = db.get(
            `SELECT COALESCE(SUM(total_tokens), 0) AS tokens FROM serve_sessions WHERE status IN ('stopped', 'expired')`
        ) || { tokens: 0 };

        const totalTokens = Math.max(
            Number(jobStats.total_tokens || 0),
            Number(sessionTokens.tokens || 0)
        );

        // Job completion rate
        const totalJobs = Number(jobStats.total_jobs || 0);
        const completedJobs = Number(jobStats.completed_jobs || 0);
        const avgCompletionRate = totalJobs > 0 ? ((completedJobs / totalJobs) * 100).toFixed(1) : '0.0';

        // Average tokens/sec across completed jobs with timing data
        const throughputRow = db.get(
            `SELECT AVG(COALESCE(total_tokens, 0) / MAX(COALESCE(actual_duration_minutes, duration_minutes, 1) * 60.0, 1)) AS avg_tokens_per_sec
             FROM jobs
             WHERE status = 'completed'
               AND COALESCE(actual_duration_minutes, duration_minutes) > 0
               AND COALESCE(total_tokens, 0) > 0`
        ) || {};

        // Last 7 days daily revenue
        const last7Days = db.all(
            `SELECT
                DATE(COALESCE(completed_at, created_at)) AS day,
                COALESCE(SUM(COALESCE(actual_cost_halala, 0)), 0) AS revenue_halala,
                COALESCE(SUM(COALESCE(dc1_fee_halala, 0)), 0) AS fees_halala,
                COUNT(*) AS job_count
             FROM jobs
             WHERE status = 'completed'
               AND DATE(COALESCE(completed_at, created_at)) >= DATE('now', '-7 days')
             GROUP BY day
             ORDER BY day ASC`
        );

        // Top GPU models by job count
        const topGpuModels = db.all(
            `SELECT
                p.gpu_model,
                COUNT(j.id) AS job_count,
                COALESCE(SUM(COALESCE(j.actual_cost_halala, 0)), 0) AS revenue_halala
             FROM jobs j
             JOIN providers p ON j.provider_id = p.id
             WHERE j.status = 'completed'
               AND p.gpu_model IS NOT NULL
             GROUP BY p.gpu_model
             ORDER BY job_count DESC
             LIMIT 10`
        );

        const totalRevenueHalala = Number(jobStats.total_revenue_halala || 0);
        const platformFeesHalala = Number(jobStats.platform_fees_halala || 0);

        return res.json({
            generated_at: now.toISOString(),
            providers: {
                total_registered: Number(providerCounts.total_registered || 0),
                total_active: Number(providerCounts.total_active || 0),
            },
            renters: {
                total: Number(renterCount.total || 0),
            },
            jobs: {
                total: totalJobs,
                completed: completedJobs,
                failed: Number(jobStats.failed_jobs || 0),
            },
            revenue: {
                total_revenue_sar: halalaToSar(totalRevenueHalala),
                total_revenue_usd: halalaToUsd(totalRevenueHalala),
                platform_fees_sar: halalaToSar(platformFeesHalala),
            },
            tokens: {
                total_tokens_generated: totalTokens,
            },
            last_7_days: last7Days.map(row => ({
                date: row.day,
                revenue_sar: halalaToSar(row.revenue_halala),
                revenue_halala: Number(row.revenue_halala),
                fees_sar: halalaToSar(row.fees_halala),
                job_count: Number(row.job_count),
            })),
            top_gpu_models: topGpuModels.map(row => ({
                gpu_model: row.gpu_model,
                job_count: Number(row.job_count),
                revenue_sar: halalaToSar(row.revenue_halala),
            })),
            system_health: {
                avg_job_completion_rate_pct: parseFloat(avgCompletionRate),
                avg_tokens_per_sec: Number((throughputRow.avg_tokens_per_sec || 0).toFixed(2)),
            },
        });
    } catch (err) {
        console.error('[GET /admin/stats]', err);
        return res.status(500).json({ error: 'Failed to fetch platform stats' });
    }
});

// ============================================================================
// GET /api/providers/:id/payout-queue
// Migration 010: aggregate from usage_events (the new ledger with 70/30
// split tracking). Returns pending + settled totals over the last 90 days,
// plus a daily breakdown for the dashboard chart.
//
// Auth: Bearer dcp_prov_* (provider API key). Provider may only see their
// own.
// ============================================================================
providerEarningsRouter.get('/:id/payout-queue', apiKeyAuth, (req, res) => {
    try {
        const requestedId = parseInt(req.params.id, 10);
        if (isNaN(requestedId)) {
            return res.status(400).json({ error: 'Invalid provider id' });
        }
        if (req.provider.id !== requestedId) {
            return res.status(403).json({ error: 'Forbidden: you may only access your own payouts' });
        }

        // Aggregate totals by settlement_status. usage_events may not exist
        // yet on databases that haven't run migration 010 — handle gracefully.
        let totals;
        try {
            totals = db.all(
                `SELECT settlement_status,
                        COUNT(*) AS event_count,
                        COALESCE(SUM(provider_payout_halala), 0) AS payout_halala,
                        COALESCE(SUM(prompt_tokens + completion_tokens), 0) AS tokens
                   FROM usage_events
                  WHERE provider_id = ?
                    AND occurred_at >= datetime('now', '-90 days')
                  GROUP BY settlement_status`,
                [requestedId]
            ) || [];
        } catch (err) {
            const msg = String(err?.message || '');
            if (/no such table.*usage_events/i.test(msg)) {
                return res.json({
                    provider_id: requestedId,
                    pending_payout_halala: 0,
                    pending_payout_sar: 0,
                    settled_payout_halala: 0,
                    settled_payout_sar: 0,
                    event_count: 0,
                    tokens: 0,
                    note: 'usage_events not yet populated — migration 010 pending',
                });
            }
            throw err;
        }

        const byStatus = Object.fromEntries(totals.map(r => [r.settlement_status, r]));
        const pending = byStatus.pending || { payout_halala: 0, event_count: 0, tokens: 0 };
        const settled = byStatus.settled || { payout_halala: 0, event_count: 0, tokens: 0 };
        const failed = byStatus.failed || { payout_halala: 0, event_count: 0, tokens: 0 };

        // Daily breakdown over the last 30 days for a sparkline.
        const daily = db.all(
            `SELECT DATE(occurred_at) AS day,
                    COALESCE(SUM(provider_payout_halala), 0) AS payout_halala,
                    COUNT(*) AS event_count
               FROM usage_events
              WHERE provider_id = ?
                AND occurred_at >= datetime('now', '-30 days')
                AND settlement_status IN ('pending', 'settled')
              GROUP BY DATE(occurred_at)
              ORDER BY day ASC`,
            [requestedId]
        ) || [];

        return res.json({
            provider_id: requestedId,
            pending_payout_halala: Number(pending.payout_halala || 0),
            pending_payout_sar: halalaToSar(pending.payout_halala),
            settled_payout_halala: Number(settled.payout_halala || 0),
            settled_payout_sar: halalaToSar(settled.payout_halala),
            failed_payout_halala: Number(failed.payout_halala || 0),
            event_count: Number(pending.event_count || 0) + Number(settled.event_count || 0),
            tokens: Number(pending.tokens || 0) + Number(settled.tokens || 0),
            revenue_share_pct: 70,
            daily: daily.map(d => ({
                day: d.day,
                payout_halala: Number(d.payout_halala || 0),
                payout_sar: halalaToSar(d.payout_halala),
                event_count: Number(d.event_count || 0),
            })),
        });
    } catch (err) {
        console.error('[GET /providers/:id/payout-queue]', err);
        return res.status(500).json({ error: 'Failed to fetch payout queue' });
    }
});

module.exports = { providerEarningsRouter, adminStatsRouter };
