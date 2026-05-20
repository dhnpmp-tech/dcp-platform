'use strict';

/**
 * Admin pricing & subscription summary (read-only).
 *
 *   GET /api/admin/subscriptions/summary
 *
 * Surfaces MRR, active subscription counts by tier, total outstanding
 * subscription credits, and the live PAYG rate card. Ops uses this to
 * sanity-check rates and MRR without dropping into SQLite.
 *
 * Read-only by design. Rate editing remains a SQL migration until a v2
 * editor lands.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdminRbac } = require('../middleware/adminAuth');

router.use(requireAdminRbac);

router.get('/subscriptions/summary', (req, res) => {
  try {
    const nowIso = new Date().toISOString();

    let activeSubs = [];
    try {
      activeSubs = db.all(
        `SELECT tier, COUNT(*) AS count, SUM(monthly_sar) AS mrr_sar
         FROM renter_subscriptions
         WHERE status = 'active'
         GROUP BY tier
         ORDER BY tier ASC`
      );
    } catch (_) {
      activeSubs = [];
    }

    const byTier = activeSubs.map((row) => ({
      tier: row.tier,
      count: Number(row.count) || 0,
      mrr_sar: Number(row.mrr_sar) || 0,
    }));

    const mrrTotal = byTier.reduce((sum, row) => sum + row.mrr_sar, 0);
    const activeCount = byTier.reduce((sum, row) => sum + row.count, 0);

    let creditsOutstanding = 0;
    try {
      const row = db.get(
        `SELECT COALESCE(SUM(amount_halala - consumed_halala), 0) AS outstanding
         FROM subscription_credits
         WHERE expires_at > ?`,
        nowIso
      );
      creditsOutstanding = Number(row && row.outstanding) || 0;
    } catch (_) {
      creditsOutstanding = 0;
    }

    let rateCard = [];
    try {
      rateCard = db.all(
        `SELECT model, model_class, token_rate_halala
         FROM cost_rates
         WHERE is_active = 1 AND model NOT LIKE '\\_\\_%' ESCAPE '\\'
         ORDER BY
           CASE model_class
             WHEN 'tiny' THEN 1
             WHEN 'small' THEN 2
             WHEN 'medium' THEN 3
             WHEN 'large' THEN 4
             WHEN 'embedding' THEN 5
             ELSE 6
           END,
           token_rate_halala ASC,
           model ASC`
      );
    } catch (_) {
      rateCard = [];
    }

    return res.json({
      generated_at: nowIso,
      mrr_sar: mrrTotal,
      active_count: activeCount,
      by_tier: byTier,
      credits_outstanding_halala: creditsOutstanding,
      rate_card: rateCard,
    });
  } catch (error) {
    console.error('Admin subscriptions summary error:', error);
    return res.status(500).json({ error: 'failed_to_load_summary' });
  }
});

module.exports = router;
