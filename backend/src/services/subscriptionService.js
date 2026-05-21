'use strict';

/**
 * Subscription Service — DCP dual-pricing SKU.
 *
 * Companion to creditService.js (PAYG ledger). Handles the monthly
 * subscription side: tier registry, active-sub lookup, credit grant on
 * Moyasar webhook events, expiry sweep, and the discount-aware debit
 * helper that v1.js uses on every inference request.
 *
 * Pricing decision (Peter 2026-05-20): 3 tiers, models bill at OWN rate
 * (no flat bundle), 30-day rollover on unused credit. See
 * memory/project_pricing_dual_model.md.
 */

const TIERS = Object.freeze({
  starter: { tier: 'starter', monthly_sar: 375,  discount_bps: 1500, monthly_halala: 37500  },
  growth:  { tier: 'growth',  monthly_sar: 1500, discount_bps: 2200, monthly_halala: 150000 },
  scale:   { tier: 'scale',   monthly_sar: 5625, discount_bps: 3000, monthly_halala: 562500 },
});
const ROLLOVER_DAYS = 30;

function getTier(tierKey) {
  return TIERS[String(tierKey || '').toLowerCase()] || null;
}

function listTiers() {
  return Object.values(TIERS).map((t) => ({
    tier: t.tier,
    monthly_sar: t.monthly_sar,
    discount_pct: t.discount_bps / 100,
    discount_bps: t.discount_bps,
  }));
}

function getActiveSubscription(db, renterId, nowIso = new Date().toISOString()) {
  // Codex P1 review on PR #419: also gate on period_end > now. Without
  // this clause, an active/past_due row would keep applying its discount
  // forever once the 30-day term elapsed (because we don't yet have a
  // renewal/expiry worker that flips status -> 'expired'). v1.js calls
  // this on every inference request, so the persistent-underbilling path
  // would compound silently after each term boundary.
  return db
    .prepare(
      `SELECT * FROM renter_subscriptions
       WHERE renter_id = ?
         AND status IN ('active','past_due')
         AND period_end > ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(renterId, nowIso) || null;
}

function getOpenSubscription(db, renterId) {
  return db
    .prepare(
      `SELECT * FROM renter_subscriptions
       WHERE renter_id = ? AND status IN ('pending','active','past_due')
       ORDER BY id DESC LIMIT 1`
    )
    .get(renterId) || null;
}

// Codex P1 review on PR #419: POST /upgrade was creating a `pending` row
// before the Moyasar checkout existed, and the partial unique index
// treated that row as blocking future upgrade attempts. A renter who
// abandoned checkout could not retry without manual DB intervention.
// Sweep stale pendings (older than PENDING_TTL_MIN minutes) before any
// open-subscription existence check, so abandoned checkouts auto-clear.
// One hour is generous for the Moyasar handoff and short enough that a
// real user does not get stuck.
const PENDING_TTL_MIN = 60;

function cancelStalePendings(db, renterId, nowIso = new Date().toISOString()) {
  const cutoff = new Date(new Date(nowIso).getTime() - PENDING_TTL_MIN * 60_000).toISOString();
  const result = db
    .prepare(
      `UPDATE renter_subscriptions
          SET status = 'cancelled', updated_at = ?
        WHERE renter_id = ? AND status = 'pending' AND created_at < ?`
    )
    .run(nowIso, renterId, cutoff);
  return result.changes;
}

function computeDiscountedRateHalala(baseRateHalala, discountBps) {
  const base = Math.max(0, Math.floor(Number(baseRateHalala) || 0));
  const bps = Math.max(0, Math.min(10000, Math.floor(Number(discountBps) || 0)));
  // ceil so rounding favours the platform — never charge less than (base * (1 - d))
  return Math.ceil(base * (10000 - bps) / 10000);
}

function addDays(iso, days) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function createPendingSubscription(db, { renterId, tierKey, nowIso }) {
  const tier = getTier(tierKey);
  if (!tier) throw new Error(`unknown tier: ${tierKey}`);
  const existing = getOpenSubscription(db, renterId);
  if (existing) throw new Error(`renter ${renterId} already has open subscription #${existing.id}`);
  const periodStart = nowIso;
  const periodEnd = addDays(nowIso, 30);
  const result = db.prepare(
    `INSERT INTO renter_subscriptions
      (renter_id, tier, monthly_sar, discount_bps, period_start, period_end,
       status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  ).run(renterId, tier.tier, tier.monthly_sar, tier.discount_bps,
        periodStart, periodEnd, nowIso, nowIso);
  return db.prepare('SELECT * FROM renter_subscriptions WHERE id = ?').get(result.lastInsertRowid);
}

function activateSubscription(db, { subscriptionId, moyasarSubscriptionId, nowIso }) {
  const sub = db.prepare('SELECT * FROM renter_subscriptions WHERE id = ?').get(subscriptionId);
  if (!sub) throw new Error(`subscription ${subscriptionId} not found`);
  db.prepare(
    `UPDATE renter_subscriptions
        SET status = 'active', moyasar_subscription_id = ?, updated_at = ?
      WHERE id = ?`
  ).run(moyasarSubscriptionId || sub.moyasar_subscription_id, nowIso, subscriptionId);
  return grantMonthlyCredits(db, { subscriptionId, nowIso });
}

function grantMonthlyCredits(db, { subscriptionId, nowIso }) {
  const sub = db.prepare('SELECT * FROM renter_subscriptions WHERE id = ?').get(subscriptionId);
  if (!sub) throw new Error(`subscription ${subscriptionId} not found`);
  const tier = getTier(sub.tier);
  if (!tier) throw new Error(`subscription ${subscriptionId} has unknown tier ${sub.tier}`);
  const expiresAt = addDays(sub.period_end, ROLLOVER_DAYS);
  const result = db.prepare(
    `INSERT INTO subscription_credits
      (subscription_id, renter_id, granted_at, amount_halala, consumed_halala,
       expires_at, source, created_at)
     VALUES (?, ?, ?, ?, 0, ?, 'monthly_grant', ?)`
  ).run(subscriptionId, sub.renter_id, nowIso, tier.monthly_halala, expiresAt, nowIso);
  return db.prepare('SELECT * FROM subscription_credits WHERE id = ?').get(result.lastInsertRowid);
}

function advanceSubscriptionPeriod(db, { subscriptionId, nowIso }) {
  const sub = db.prepare('SELECT * FROM renter_subscriptions WHERE id = ?').get(subscriptionId);
  if (!sub) throw new Error(`subscription ${subscriptionId} not found`);
  const newStart = sub.period_end;
  const newEnd = addDays(newStart, 30);
  db.prepare(
    `UPDATE renter_subscriptions
        SET period_start = ?, period_end = ?, status = 'active', updated_at = ?
      WHERE id = ?`
  ).run(newStart, newEnd, nowIso, subscriptionId);
  return grantMonthlyCredits(db, { subscriptionId, nowIso });
}

function getAvailableCredits(db, renterId, nowIso) {
  return db.prepare(
    `SELECT * FROM subscription_credits
      WHERE renter_id = ?
        AND consumed_halala < amount_halala
        AND expires_at > ?
      ORDER BY expires_at ASC, id ASC`
  ).all(renterId, nowIso);
}

function getRemainingCreditTotal(db, renterId, nowIso) {
  const row = db.prepare(
    `SELECT COALESCE(SUM(amount_halala - consumed_halala), 0) AS remaining
       FROM subscription_credits
      WHERE renter_id = ?
        AND consumed_halala < amount_halala
        AND expires_at > ?`
  ).get(renterId, nowIso);
  return Number(row?.remaining || 0);
}

/**
 * Drain `costHalala` from oldest-expiring active credit grants. Returns the
 * shortfall (>= 0) that must come from PAYG balance. Does NOT touch the
 * renters.balance_halala column — caller (v1.js) is responsible for the
 * PAYG remainder.
 *
 * Must be called inside a transaction wrapping the full debit operation.
 */
function debitSubscriptionCredits(db, { renterId, costHalala, nowIso }) {
  let remaining = Math.max(0, Math.floor(Number(costHalala) || 0));
  if (remaining === 0) return { drained: 0, shortfall: 0, grantsTouched: [] };
  const grants = getAvailableCredits(db, renterId, nowIso);
  const grantsTouched = [];
  let drained = 0;
  for (const grant of grants) {
    if (remaining <= 0) break;
    const available = grant.amount_halala - grant.consumed_halala;
    if (available <= 0) continue;
    const take = Math.min(available, remaining);
    db.prepare(
      `UPDATE subscription_credits
          SET consumed_halala = consumed_halala + ?
        WHERE id = ? AND consumed_halala + ? <= amount_halala`
    ).run(take, grant.id, take);
    grantsTouched.push({ grant_id: grant.id, amount_halala: take });
    remaining -= take;
    drained += take;
  }
  return { drained, shortfall: remaining, grantsTouched };
}

function sweepExpiredCredits(db, nowIso) {
  // Doesn't delete — just reports count for monitoring. Index excludes
  // already-exhausted rows, and the indexed read in getAvailableCredits
  // filters by expires_at > now, so expired rows are harmless.
  return db.prepare(
    `SELECT COUNT(*) AS expired
       FROM subscription_credits
      WHERE expires_at <= ?
        AND consumed_halala < amount_halala`
  ).get(nowIso)?.expired || 0;
}

module.exports = {
  TIERS,
  ROLLOVER_DAYS,
  PENDING_TTL_MIN,
  getTier,
  listTiers,
  getActiveSubscription,
  getOpenSubscription,
  cancelStalePendings,
  computeDiscountedRateHalala,
  createPendingSubscription,
  activateSubscription,
  grantMonthlyCredits,
  advanceSubscriptionPeriod,
  getAvailableCredits,
  getRemainingCreditTotal,
  debitSubscriptionCredits,
  sweepExpiredCredits,
};
