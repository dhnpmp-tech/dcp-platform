'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { isAdminRequest } = require('../middleware/auth');
const { toUsdStringFromHalala } = require('../lib/model-catalog-contract');
const {
  computeDryRunSummary,
  executeOpenRouterSettlement,
} = require('../services/openrouterSettlementService');
const { safeErrorPayload } = require('../lib/error-response');

function requireAdmin(req, res, next) {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ error: 'Admin token required' });
  }
  return next();
}

router.use(requireAdmin);

function withUsdPricingFromHalala(value) {
  return {
    currency: 'USD',
    usd: toUsdStringFromHalala(value),
  };
}

function withUsdPricingFromPersistedOrHalala(usdValue, halalaValue) {
  const parsed = typeof usdValue === 'number' ? usdValue : Number(usdValue);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return {
      currency: 'USD',
      usd: parsed.toFixed(6),
    };
  }
  return withUsdPricingFromHalala(halalaValue);
}

function enrichDryRunSummary(summary) {
  if (!summary || typeof summary !== 'object') return summary;
  return {
    ...summary,
    pricing: {
      currency: 'USD',
      usd_expected_total: toUsdStringFromHalala(summary.expected_total_halala),
      usd_reconciled_total: toUsdStringFromHalala(summary.reconciled_halala),
      usd_discrepancy_total: toUsdStringFromHalala(Math.abs(Number(summary.discrepancy_halala || 0))),
    },
    top_renters: Array.isArray(summary.top_renters)
      ? summary.top_renters.map((row) => ({
        ...row,
        pricing: withUsdPricingFromHalala(row.total_halala),
      }))
      : [],
  };
}

function enrichSettlement(settlement) {
  if (!settlement || typeof settlement !== 'object') return settlement;
  return {
    ...settlement,
    pricing: {
      currency: 'USD',
      usd_expected_total: toUsdStringFromHalala(settlement.expected_total_halala),
      usd_reconciled_total: toUsdStringFromHalala(settlement.reconciled_halala),
      usd_discrepancy_total: toUsdStringFromHalala(Math.abs(Number(settlement.discrepancy_halala || 0))),
    },
  };
}

function enrichInvoice(invoice) {
  if (!invoice || typeof invoice !== 'object') return invoice;
  return { ...invoice, pricing: withUsdPricingFromHalala(invoice.amount_halala) };
}

function enrichTopup(topup) {
  if (!topup || typeof topup !== 'object') return topup;
  return { ...topup, pricing: withUsdPricingFromHalala(topup.amount_halala) };
}

function enrichSettlementItem(item) {
  if (!item || typeof item !== 'object') return item;
  return {
    ...item,
    pricing: withUsdPricingFromPersistedOrHalala(item.usd_total, item.cost_halala),
  };
}

router.post('/settlements/dry-run', (req, res) => {
  try {
    const summary = enrichDryRunSummary(computeDryRunSummary(db._db || db, {
      periodStart: req.body?.period_start,
      periodEnd: req.body?.period_end,
      expectedTotalHalala: req.body?.expected_total_halala,
    }));
    return res.json({ dry_run: true, summary });
  } catch (error) {
    console.error('[openrouter-settlement] dry-run error:', error);
    return res.status(500).json(safeErrorPayload(error, 'Failed to compute OpenRouter dry run'));
  }
});

router.post('/settlements/run', (req, res) => {
  try {
    const result = executeOpenRouterSettlement(db._db || db, {
      periodStart: req.body?.period_start,
      periodEnd: req.body?.period_end,
      mode: req.body?.mode,
      cadence: req.body?.cadence,
      expectedTotalHalala: req.body?.expected_total_halala,
    });

    if (result.error) {
      return res.status(500).json({
        error: 'OpenRouter settlement failed',
        detail: result.error,
        settlement: result.settlement,
        alerts: result.alerts || [],
      });
    }

    return res.json({
      settlement: enrichSettlement(result.settlement),
      summary: enrichDryRunSummary(result.summary),
      invoice: enrichInvoice(result.invoice),
      topup: enrichTopup(result.topup),
      alerts: result.alerts || [],
    });
  } catch (error) {
    console.error('[openrouter-settlement] run error:', error);
    return res.status(500).json(safeErrorPayload(error, 'Failed to execute OpenRouter settlement'));
  }
});

router.get('/settlements', (req, res) => {
  try {
    const limitRaw = Number(req.query.limit || 20);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;
    const rows = db.all(
      `SELECT *
         FROM openrouter_settlements
        ORDER BY created_at DESC
        LIMIT ?`,
      limit
    );
    return res.json({ settlements: rows.map((row) => enrichSettlement(row)), count: rows.length });
  } catch (error) {
    console.error('[openrouter-settlement] list error:', error);
    return res.status(500).json(safeErrorPayload(error, 'Failed to list OpenRouter settlements'));
  }
});

router.get('/settlements/:id', (req, res) => {
  try {
    const settlement = db.get('SELECT * FROM openrouter_settlements WHERE id = ?', req.params.id);
    if (!settlement) return res.status(404).json({ error: 'Settlement not found' });

    const items = db.all(
      `SELECT i.usage_id, i.renter_id, i.provider_id, i.cost_halala, i.created_at, u.usd_total
         FROM openrouter_settlement_items i
    LEFT JOIN openrouter_usage_ledger u ON u.id = i.usage_id
        WHERE i.settlement_id = ?
        ORDER BY i.created_at ASC`,
      settlement.id
    );
    const alerts = db.all(
      `SELECT severity, code, message, created_at
         FROM openrouter_settlement_alerts
        WHERE settlement_id = ?
        ORDER BY created_at ASC`,
      settlement.id
    );
    const invoice = db.get(
      'SELECT * FROM openrouter_settlement_invoices WHERE settlement_id = ?',
      settlement.id
    ) || null;
    const topup = db.get(
      'SELECT * FROM openrouter_settlement_topups WHERE settlement_id = ?',
      settlement.id
    ) || null;

    return res.json({
      settlement: enrichSettlement(settlement),
      items: items.map((item) => enrichSettlementItem(item)),
      alerts,
      invoice: enrichInvoice(invoice),
      topup: enrichTopup(topup),
    });
  } catch (error) {
    console.error('[openrouter-settlement] details error:', error);
    return res.status(500).json(safeErrorPayload(error, 'Failed to fetch OpenRouter settlement details'));
  }
});

module.exports = router;
