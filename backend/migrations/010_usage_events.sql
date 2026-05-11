-- 010_usage_events.sql
-- Per docs/pricing/PRICING-REDESIGN-2026-05-11.md
--
-- A row per billable inference call. Distinct from `cost_rates_usage_log`
-- (legacy) — `usage_events` is the new ledger that splits prompt vs
-- completion cost and tracks the DCP-vs-provider revenue split (70/30).
--
-- Idempotency: request_id is the dedupe key, applied as a unique index.
-- Multiple calls with the same request_id will violate the index, which
-- the billing path catches and treats as a duplicate (no double-charge).

CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  renter_id INTEGER NOT NULL,
  provider_id INTEGER,
  job_id TEXT,
  model_id TEXT NOT NULL,
  -- Token counts as billed (NOT what the upstream returned — may have
  -- been clamped/rounded by toFiniteInt safeguards).
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  -- Cost in halala. prompt_cost + completion_cost = cost_halala.
  prompt_cost_halala INTEGER NOT NULL DEFAULT 0,
  completion_cost_halala INTEGER NOT NULL DEFAULT 0,
  cost_halala INTEGER NOT NULL DEFAULT 0,
  -- Revenue share at the moment of billing. 70/30 currently; if we change
  -- the split, historical events are preserved with the rate that applied.
  provider_payout_halala INTEGER NOT NULL DEFAULT 0,
  dcp_take_halala INTEGER NOT NULL DEFAULT 0,
  -- Rate card snapshot — what we charged per 1M for this call. Useful
  -- when we change prices: refunds/audits can reproduce the math.
  price_in_halala_per_1m_tok INTEGER,
  price_out_halala_per_1m_tok INTEGER,
  occurred_at TEXT NOT NULL,
  request_id TEXT,
  source TEXT,                 -- 'v1/chat', 'v1/embeddings', etc.
  settlement_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (settlement_status IN ('pending', 'settled', 'reversed', 'failed'))
);

-- Idempotency: same request_id = same event. Renter retries on tunnel
-- timeout are common; SDKs include Idempotency-Key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_events_request_id
  ON usage_events (request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usage_events_renter_time
  ON usage_events (renter_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_usage_events_provider_time
  ON usage_events (provider_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_usage_events_model_time
  ON usage_events (model_id, occurred_at);
