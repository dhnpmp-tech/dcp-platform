# DCP Subscription Pricing — Dual SKU Architecture

**Decided:** 2026-05-20 by Peter + Tareq
**Status:** Backend shipped (flag-gated); pricing page live; Moyasar wiring pending

---

## TL;DR

DCP sells inference two ways, on one balance:

1. **Pay-as-you-go (PAYG)** — per million tokens, billed from prepaid SAR
   credit. Every signup gets **100 SAR starter credit** with no card
   required. This is the default and only path until a user opts into a
   subscription.

2. **Monthly subscription** — recurring SAR charge that grants the same SAR
   in platform credit + applies a **uniform discount** to every model's PAYG
   per-token rate. Three tiers, 15% / 22% / 30% off. Models still bill at
   their **own** rate — premium models cost more than small models on every
   tier; the discount percentage is the same across the catalog.

| Tier        | Monthly SAR | Discount | Effective rate at __default__ (19 halala/M) |
|-------------|-------------|----------|---------------------------------------------|
| PAYG        | —           | 0%       | 19 halala/M                                 |
| Starter     | 375         | 15%      | 17 halala/M                                 |
| Growth      | 1,500       | 22%      | 15 halala/M                                 |
| Scale       | 5,625       | 30%      | 14 halala/M                                 |
| Above Scale | custom      | TBD      | sales-led                                   |

Unused subscription credit rolls over 30 days past period end, then
expires. PAYG top-up credit never expires. Above Scale buyers get custom
contracts.

---

## Why subscription gives "tokens at a discount" (not a flat bundle)

The naive design — "5,625 SAR for 4 billion tokens, mix any models you want" —
breaks the moment a Scale buyer routes 100% of their volume to the most
expensive model (Qwen 3.6-27B-MTP at higher PAYG rate). The bundle's
effective per-M rate would drop below cost and DCP would subsidise heavy
premium-model usage.

The chosen design avoids this:

```
effective_rate(model, tier) = payg_rate(model) × (1 − discount(tier))
```

A Growth subscriber running Qwen 3.6-27B-MTP at, say, 50 halala/M PAYG pays
50 × 0.78 = **39 halala/M** on their subscription credit. A Growth subscriber
running TinyLlama at 10 halala/M PAYG pays 10 × 0.78 = **8 halala/M**. The
discount is uniform; the absolute cost varies by model.

Cost-plus rule still applies: every tier's effective per-M rate must be ≥
(infra cost + margin) for the worst-case provider GPU on that route. See
`feedback_cost_plus_pricing.md`.

---

## How the debit works on each request

Every inference request goes through `backend/src/routes/v1.js`:

1. **Resolve rates.** Look up `token_rate_halala` for the requested model
   from the `cost_rates` table (this is the PAYG rate, source of truth).
2. **Apply subscription discount.** If renter has an active subscription
   and the `SUBSCRIPTION_BILLING_ENABLED` env flag is on, multiply the rate
   by `(1 − discount_bps/10000)`. `Math.ceil` rounds in favour of the
   platform — we never charge less than `base × (1 − d)`.
3. **Pre-flight gate.** Reject with HTTP 402 if
   `(PAYG balance + remaining subscription credit) < estimated cost`. The
   402 envelope includes both balances and a billing URL.
4. **Cost computation.** `toUsageSnapshot` multiplies the actual usage
   (prompt + completion tokens) by the discounted rates.
5. **Debit.** `debitRenterSafe` runs inside a transaction:
   - If active sub: drain oldest-expiring `subscription_credits` rows
     first, return remaining shortfall.
   - Apply the shortfall (or full cost when no sub) against
     `renters.balance_halala`.

This means subscription credit is consumed first, in order of expiry, so
the soonest-expiring balance burns down before the platform sees any
churn-pressure from "I lost my month's credit."

---

## Schema (migration 016)

```sql
renter_subscriptions
  id, renter_id, tier ('starter'|'growth'|'scale'), monthly_sar,
  discount_bps, period_start, period_end,
  status ('pending'|'active'|'past_due'|'cancelled'|'expired'),
  moyasar_subscription_id, cancel_at_period_end, created_at, updated_at

subscription_credits
  id, subscription_id, renter_id, granted_at, amount_halala,
  consumed_halala, expires_at, source ('monthly_grant'|'adjustment'|'promo'),
  created_at

moyasar_webhook_events
  event_id (PK for idempotency), event_type, payload_json,
  received_at, applied_at
```

Indexes:
- `uq_renter_subscriptions_one_open` — partial unique index ensuring at
  most one open (pending/active/past_due) subscription per renter.
- `idx_subscription_credits_renter_remaining` — partial index for the hot
  path: "what credit can renter X spend right now?"

The schema is mirrored both in `migrations/016_renter_subscriptions.sql`
(authoritative for prod re-creates) and inlined into `src/db.js` (boot-time
table-creates, matching the migration-015 pattern).

---

## API surface

`backend/src/routes/subscriptions.js` exposes:

- `GET /api/subscriptions/tiers` — public catalog. Returns 3 tiers with
  effective per-model rates derived from `cost_rates`. Used by the
  `/pricing` page on dcp.sa.
- `GET /api/subscriptions/me` — caller's active sub + remaining credit
  balance + grant expiry timeline. Requires Bearer / `x-renter-key` /
  `?key=` auth.
- `POST /api/subscriptions/upgrade` — body `{ tier: 'starter' | 'growth' |
  'scale' }`. Creates a `pending` row; Moyasar webhook flips status to
  `active` and triggers the first credit grant.

Idempotency for the webhook flow is enforced via
`moyasar_webhook_events.event_id` (PK INSERT OR IGNORE).

---

## Feature flag rollout

`SUBSCRIPTION_BILLING_ENABLED=true` activates the discount + credit drain
path in v1.js. With the flag off, behaviour is byte-identical to pre-016:
no sub lookup, no credit drain, PAYG works exactly as before. The plan:

1. Ship schema + service + endpoints (this PR) with flag off.
2. Verify staging: register a synthetic renter, create a Growth sub,
   activate via direct DB call (no Moyasar yet), make 10 inference
   requests, confirm credits drain and PAYG stays untouched.
3. Land Moyasar webhook handler (waits on Peter's Moyasar wiring).
4. Flip flag on in production once the webhook is verified end-to-end.

---

## Open items

| Item | Owner | Notes |
|------|-------|-------|
| Moyasar recurring billing wiring | Peter | Today |
| Subscription tier prices vetted vs infra cost | Tareq | Per worst-case GPU; cost-plus rule |
| Saudi lawyer signoff on ToS/Privacy v2 | DPO | Drafts at `/legal/terms-v2`, `/legal/privacy-v2` |
| Dashboard "upgrade" button + tier picker UI | Frontend | After webhook lands |
| Annual prepay discount (+10%?) | Peter | Surfaced but not implemented |
| `subscription_credit_topup_sent` digest line | Backend | Add to dailyDigest.js |

---

## Reference

- `backend/migrations/016_renter_subscriptions.sql`
- `backend/src/services/subscriptionService.js`
- `backend/src/routes/subscriptions.js`
- `backend/src/routes/v1.js` (discount + credit drain integration)
- `app/pricing/page.tsx` (`SubscriptionTiersSection`)
- Competitor analysis: `/tmp/dcp-subscription-pricing-analysis.md`
- Memory: `~/.claude/projects/-Users-pp-DC1-Platform/memory/project_pricing_dual_model.md`
