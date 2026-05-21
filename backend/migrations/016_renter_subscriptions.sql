-- 016_renter_subscriptions.sql
-- Dual pricing SKU: PAYG (renters.balance_halala) + monthly subscription
-- (this migration). Subscription = SAR monthly fee → SAR credit grant +
-- per-tier discount applied to PAYG per-model rates. Models bill at their
-- OWN rate (not a flat bundle rate). Credit grants roll over 30 days then
-- expire. Decision: Peter 2026-05-20.

CREATE TABLE IF NOT EXISTS renter_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  renter_id INTEGER NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('starter','growth','scale')),
  monthly_sar INTEGER NOT NULL,           -- 375 / 1500 / 5625
  discount_bps INTEGER NOT NULL,          -- basis points: 1500 / 2200 / 3000
  period_start TEXT NOT NULL,             -- ISO8601 of current period start
  period_end TEXT NOT NULL,               -- ISO8601 of current period end
  status TEXT NOT NULL CHECK (status IN ('pending','active','past_due','cancelled','expired'))
    DEFAULT 'pending',
  moyasar_subscription_id TEXT UNIQUE,    -- Moyasar's recurring sub id; null until webhook confirms
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (renter_id) REFERENCES renters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_renter_subscriptions_renter
  ON renter_subscriptions(renter_id);
CREATE INDEX IF NOT EXISTS idx_renter_subscriptions_status
  ON renter_subscriptions(status);
-- Only one active/pending sub per renter at a time. past_due included so a
-- failed-payment sub still blocks a second upgrade attempt; cancellation
-- transitions to 'cancelled' which is excluded here.
CREATE UNIQUE INDEX IF NOT EXISTS uq_renter_subscriptions_one_open
  ON renter_subscriptions(renter_id)
  WHERE status IN ('pending','active','past_due');

-- One row per monthly grant. Period rollover = create new row, leave old row
-- to expire naturally at expires_at (= old period_end + 30 days). Debit
-- order: oldest expires_at first (to clear soon-to-expire balance).
CREATE TABLE IF NOT EXISTS subscription_credits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL,
  renter_id INTEGER NOT NULL,             -- denormalised for cheap per-renter lookup
  granted_at TEXT NOT NULL,
  amount_halala INTEGER NOT NULL,         -- = monthly_sar * 100
  consumed_halala INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,               -- period_end + 30 days
  source TEXT NOT NULL DEFAULT 'monthly_grant'
    CHECK (source IN ('monthly_grant','adjustment','promo')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (subscription_id) REFERENCES renter_subscriptions(id) ON DELETE CASCADE,
  FOREIGN KEY (renter_id) REFERENCES renters(id) ON DELETE CASCADE
);

-- Hot path: "what credit can this renter spend right now, oldest-expiring first"
CREATE INDEX IF NOT EXISTS idx_subscription_credits_renter_remaining
  ON subscription_credits(renter_id, expires_at)
  WHERE consumed_halala < amount_halala;
CREATE INDEX IF NOT EXISTS idx_subscription_credits_subscription
  ON subscription_credits(subscription_id);

-- Idempotency for Moyasar webhook events. Every event id we've already
-- applied lives here; insert OR IGNORE before doing any state change.
CREATE TABLE IF NOT EXISTS moyasar_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  received_at TEXT NOT NULL,
  applied_at TEXT
);
