-- Migration 004: Job lifecycle state machine + per-job billing records
-- DCP-911 | Backend Architect
--
-- The jobs table already has status (pending/assigned/running/completed/failed).
-- This migration extends the lifecycle with:
--   lifecycle_status: tracks billing phase (pending → billed → disputed)
--
-- Platform take rate: 15% (per platform pricing model)
--   gross_cost = renter charge
--   platform_fee = 15% of gross
--   provider_earning = 85% of gross
--
-- NOTE: billing_records table and lifecycle_status column are auto-created
-- by db.js on startup (CREATE TABLE IF NOT EXISTS / ALTER TABLE IF NOT EXISTS).
-- This file is the canonical reference definition.

-- billing_records: immutable per-job billing audit trail
CREATE TABLE IF NOT EXISTS billing_records (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  renter_id INTEGER,
  provider_id INTEGER,
  model_id TEXT,
  token_count INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  gross_cost_halala INTEGER NOT NULL DEFAULT 0,
  platform_fee_halala INTEGER NOT NULL DEFAULT 0,
  provider_earning_halala INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'SAR',
  status TEXT NOT NULL DEFAULT 'pending_release'
    CHECK(status IN ('pending_release', 'released', 'disputed', 'refunded')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME,
  FOREIGN KEY (job_id) REFERENCES jobs(job_id),
  FOREIGN KEY (renter_id) REFERENCES renters(id),
  FOREIGN KEY (provider_id) REFERENCES providers(id)
);

CREATE INDEX IF NOT EXISTS idx_billing_records_job ON billing_records(job_id);
CREATE INDEX IF NOT EXISTS idx_billing_records_provider ON billing_records(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_records_renter ON billing_records(renter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_records_status ON billing_records(status, created_at DESC);

-- Extend jobs with billing lifecycle tracking
ALTER TABLE jobs ADD COLUMN lifecycle_status TEXT DEFAULT 'pending';
