-- 021_billing_rewrite_and_auto_topup.sql
--
-- Two related changes shipped together because they share the renters/billing surface:
--
-- 1. BILLING ATOMICITY: replace the scattered debit/credit writes in v1.js with
--    a single transactional helper. New table `billing_attempts` provides
--    request_id-level idempotency so retries (process crash, webhook replay,
--    job-sweep) never double-bill.
--
-- 2. AUTO-TOP-UP: when a renter's balance falls below threshold, automatically
--    charge their saved Moyasar card token. Industry pattern (AWS, OpenAI,
--    Twilio): threshold + recharge amount + monthly cap.

-- ── BILLING ATOMICITY ────────────────────────────────────────────────────────

-- One row per /v1 inference request. PK on request_id makes the settlement
-- transaction idempotent under retry: INSERT OR IGNORE returns changes=0 if
-- already settled, the rest of the tx is short-circuited.
CREATE TABLE IF NOT EXISTS billing_attempts (
  request_id            TEXT    PRIMARY KEY,
  renter_id             INTEGER NOT NULL,
  provider_id           INTEGER,
  cost_halala           INTEGER NOT NULL,
  provider_earned_halala INTEGER NOT NULL,
  status                TEXT    NOT NULL CHECK(status IN ('settled','insufficient_balance','error')),
  error_code            TEXT,
  settled_at            TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_billing_attempts_renter ON billing_attempts(renter_id, settled_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_attempts_status ON billing_attempts(status, settled_at DESC);

-- ── AUTO-TOP-UP ──────────────────────────────────────────────────────────────

-- Per-renter configuration. NULL/0 columns = feature disabled.
ALTER TABLE renters ADD COLUMN auto_topup_enabled INTEGER DEFAULT 0;
ALTER TABLE renters ADD COLUMN auto_topup_threshold_halala INTEGER DEFAULT 0;
ALTER TABLE renters ADD COLUMN auto_topup_amount_halala INTEGER DEFAULT 0;
ALTER TABLE renters ADD COLUMN auto_topup_monthly_cap_halala INTEGER DEFAULT 0;
-- Tokenized card, returned by Moyasar's /v1/tokens (client-side, publishable key).
-- Stored as TEXT; never the raw PAN.
ALTER TABLE renters ADD COLUMN moyasar_card_token TEXT;
ALTER TABLE renters ADD COLUMN moyasar_card_brand TEXT;
ALTER TABLE renters ADD COLUMN moyasar_card_last4 TEXT;
ALTER TABLE renters ADD COLUMN moyasar_card_saved_at TEXT;
-- Rolling monthly window for cap enforcement.
ALTER TABLE renters ADD COLUMN auto_topup_monthly_used_halala INTEGER DEFAULT 0;
ALTER TABLE renters ADD COLUMN auto_topup_monthly_reset_at TEXT;
-- Circuit-breaker: pause auto-top-up after N consecutive failures.
ALTER TABLE renters ADD COLUMN auto_topup_consecutive_failures INTEGER DEFAULT 0;
ALTER TABLE renters ADD COLUMN auto_topup_paused_until TEXT;
ALTER TABLE renters ADD COLUMN auto_topup_last_attempt_at TEXT;

-- Per-attempt audit log so renters / support / fraud can trace every charge.
CREATE TABLE IF NOT EXISTS auto_topup_attempts (
  id              TEXT    PRIMARY KEY,
  renter_id       INTEGER NOT NULL,
  amount_halala   INTEGER NOT NULL,
  status          TEXT    NOT NULL CHECK(status IN ('initiated','paid','failed','3ds_required','capped','paused')),
  moyasar_payment_id TEXT,
  trigger_reason  TEXT,
  balance_before_halala INTEGER,
  balance_after_halala  INTEGER,
  error_code      TEXT,
  error_message   TEXT,
  gateway_response TEXT,
  created_at      TEXT    NOT NULL,
  completed_at    TEXT,
  FOREIGN KEY (renter_id) REFERENCES renters(id)
);
CREATE INDEX IF NOT EXISTS idx_auto_topup_attempts_renter ON auto_topup_attempts(renter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_topup_attempts_status ON auto_topup_attempts(status, created_at DESC);
