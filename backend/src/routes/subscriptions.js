'use strict';

/**
 * Subscription router — DCP dual pricing SKU surface.
 *
 *   GET  /api/subscriptions/tiers       Public tier catalog (no auth).
 *   GET  /api/subscriptions/me          Caller's current sub + credit balance.
 *   POST /api/subscriptions/upgrade     Create pending sub (activated by
 *                                        Moyasar webhook on payment success).
 *
 * Authenticated routes accept the renter API key via:
 *   - Authorization: Bearer <key>
 *   - x-renter-key: <key>
 *   - ?key=<key>
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const svc = require('../services/subscriptionService');
const { publicEndpointLimiter } = require('../middleware/rateLimiter');

const SAR_USD_RATE = 3.75;

function getRenterKey(req) {
  const auth = req.headers.authorization || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return req.headers['x-renter-key'] || req.query.key || null;
}

function resolveRenter(req, res) {
  const key = getRenterKey(req);
  if (!key) {
    res.status(401).json({ error: 'missing_api_key',
      message: 'Provide Authorization: Bearer <key>, x-renter-key header, or ?key=' });
    return null;
  }
  const renter = db.get(
    'SELECT id, name, email, balance_halala, status FROM renters WHERE api_key = ? AND status = ?',
    key, 'active'
  );
  if (!renter) {
    res.status(401).json({ error: 'invalid_api_key' });
    return null;
  }
  return renter;
}

// Class-level rate card. Source of truth: cost_rates.model_class +
// migration 017 seeds. Used when the UI wants a compact view ("Medium
// models cost $0.40/M PAYG") instead of listing every individual model.
const MODEL_CLASS_LABELS = {
  tiny:      { label: 'Tiny',      examples: 'TinyLlama 1B, qwen2.5vl:3b, Gemma-2B' },
  small:     { label: 'Small',     examples: 'qwen3:8b, Mistral-7B, Llama-3-8B, ALLaM-7B' },
  medium:    { label: 'Medium',    examples: 'Qwen 3.6-27B-MTP, Qwen2.5-Coder-32B' },
  large:     { label: 'Large',     examples: 'Future 70B class' },
  embedding: { label: 'Embedding', examples: 'bge-m3' },
};
const CLASS_ORDER = ['tiny', 'small', 'medium', 'large', 'embedding'];

function buildClassProjection(modelRates) {
  // Group rates by class, take the representative (max) rate per class so
  // the tier table reflects the worst-case PAYG cost a buyer would see.
  const byClass = new Map();
  for (const m of modelRates || []) {
    const klass = m.model_class || 'small';
    const prev = byClass.get(klass) || { rate: 0, models: [] };
    byClass.set(klass, {
      rate: Math.max(prev.rate, m.token_rate_halala),
      models: [...prev.models, m.model],
    });
  }
  return CLASS_ORDER
    .filter((k) => byClass.has(k))
    .map((k) => ({
      model_class: k,
      label: MODEL_CLASS_LABELS[k]?.label || k,
      examples: MODEL_CLASS_LABELS[k]?.examples || '',
      payg_halala_per_M: byClass.get(k).rate,
      payg_usd_per_M: Number((byClass.get(k).rate / 100 / SAR_USD_RATE).toFixed(4)),
      models: byClass.get(k).models,
    }));
}

function buildTierProjection(modelRates) {
  const tiers = svc.listTiers();
  const classes = buildClassProjection(modelRates);
  return tiers.map((t) => {
    const classRates = classes.map((c) => ({
      model_class: c.model_class,
      label: c.label,
      payg_halala_per_M: c.payg_halala_per_M,
      effective_halala_per_M: svc.computeDiscountedRateHalala(c.payg_halala_per_M, t.discount_bps),
    }));
    const perModelRates = (modelRates || []).map((m) => ({
      model: m.model,
      model_class: m.model_class || 'small',
      payg_halala_per_M: m.token_rate_halala,
      effective_halala_per_M: svc.computeDiscountedRateHalala(m.token_rate_halala, t.discount_bps),
    }));
    return {
      tier: t.tier,
      monthly_sar: t.monthly_sar,
      monthly_usd: Number((t.monthly_sar / SAR_USD_RATE).toFixed(2)),
      discount_pct: t.discount_pct,
      discount_bps: t.discount_bps,
      included_credit_halala: t.monthly_sar * 100,
      rollover_days: svc.ROLLOVER_DAYS,
      classes_at_discount: classRates,
      models_at_discount: perModelRates,
    };
  });
}

router.get('/tiers', publicEndpointLimiter, (req, res) => {
  let modelRates = [];
  try {
    modelRates = db.all(
      `SELECT model, token_rate_halala, model_class FROM cost_rates
        WHERE is_active = 1 AND model NOT LIKE '\\_\\_%' ESCAPE '\\'
        ORDER BY model_class, token_rate_halala ASC`
    );
  } catch (_) { modelRates = []; }

  return res.json({
    generated_at: new Date().toISOString(),
    sar_usd_rate: SAR_USD_RATE,
    free_trial_sar: 100,
    free_trial_halala: 10000,
    payg_unit: 'halala per million tokens',
    discount_mechanic:
      'Models bill at their own per-M-token rate × (1 − tier discount). ' +
      'Not a flat bundle: premium models cost more even on Scale.',
    rollover_policy:
      'Unused monthly credit rolls over 30 days past period end, then expires. ' +
      'Top-up (PAYG) credit never expires.',
    classes: buildClassProjection(modelRates),
    tiers: buildTierProjection(modelRates),
  });
});

router.get('/me', (req, res) => {
  const renter = resolveRenter(req, res);
  if (!renter) return;
  const nowIso = new Date().toISOString();
  const sub = svc.getOpenSubscription(db, renter.id);
  if (!sub) {
    return res.json({
      has_subscription: false,
      payg_balance_halala: renter.balance_halala,
      payg_balance_sar: renter.balance_halala / 100,
      subscription: null,
      credits: { remaining_halala: 0, grants: [] },
    });
  }
  const tier = svc.getTier(sub.tier);
  const remaining = svc.getRemainingCreditTotal(db, renter.id, nowIso);
  const grants = svc.getAvailableCredits(db, renter.id, nowIso).map((g) => ({
    id: g.id,
    granted_at: g.granted_at,
    expires_at: g.expires_at,
    remaining_halala: g.amount_halala - g.consumed_halala,
  }));
  return res.json({
    has_subscription: true,
    payg_balance_halala: renter.balance_halala,
    payg_balance_sar: renter.balance_halala / 100,
    subscription: {
      id: sub.id,
      tier: sub.tier,
      monthly_sar: sub.monthly_sar,
      discount_pct: tier ? tier.discount_bps / 100 : null,
      status: sub.status,
      period_start: sub.period_start,
      period_end: sub.period_end,
      cancel_at_period_end: Boolean(sub.cancel_at_period_end),
      moyasar_subscription_id: sub.moyasar_subscription_id,
    },
    credits: { remaining_halala: remaining, grants },
  });
});

router.post('/upgrade', express.json(), (req, res) => {
  const renter = resolveRenter(req, res);
  if (!renter) return;
  const tierKey = String(req.body?.tier || '').toLowerCase();
  const tier = svc.getTier(tierKey);
  if (!tier) {
    return res.status(400).json({
      error: 'invalid_tier',
      message: 'tier must be one of: starter, growth, scale',
      tiers: svc.listTiers(),
    });
  }
  const nowIso = new Date().toISOString();
  // Codex P1 review: sweep stale `pending` rows (>1h old, abandoned
  // checkouts) before the existence check, so a renter who walked away
  // from Moyasar can retry upgrading without manual DB intervention.
  svc.cancelStalePendings(db, renter.id, nowIso);
  const existing = svc.getOpenSubscription(db, renter.id);
  if (existing) {
    return res.status(409).json({
      error: 'subscription_exists',
      message: `Renter already has an open subscription (#${existing.id}, ${existing.status}). ` +
        'Cancel it or change tier via /me before opening a new one.',
      subscription_id: existing.id,
    });
  }
  let pending;
  try {
    pending = svc.createPendingSubscription(db, { renterId: renter.id, tierKey, nowIso });
  } catch (e) {
    return res.status(500).json({ error: 'create_failed', message: String(e && e.message || e) });
  }
  // TODO: Moyasar checkout session creation lands once Peter's wiring is in.
  // For now we return the pending sub; webhook flips status → 'active' on
  // payment success and grants the first credit batch.
  return res.status(201).json({
    subscription: {
      id: pending.id,
      tier: pending.tier,
      monthly_sar: pending.monthly_sar,
      discount_pct: tier.discount_bps / 100,
      status: pending.status,
      period_start: pending.period_start,
      period_end: pending.period_end,
    },
    next_step:
      'Moyasar checkout session will be created here once payment wiring lands. ' +
      'Subscription stays in pending state until webhook confirms payment.',
    checkout_url: null,
  });
});

module.exports = router;
