-- 020_moyasar_payout.sql
-- Wire payout_requests to Moyasar Payouts API (POST /v1/payout_accounts, /v1/payouts).
-- providers.moyasar_payout_account_id: UUID returned by Moyasar after IBAN registration.
-- providers.payout_iban / payout_holder_name: cached locally for display + revalidation.
-- payout_requests.moyasar_payout_id: UUID of the disbursement created via /v1/payouts.
-- payout_requests.moyasar_status: raw Moyasar status (queued|initiated|paid|failed|canceled|returned).
-- payout_requests.gateway_response: last raw response JSON from Moyasar (audit).
-- DDL is idempotent — re-runs on existing rows are no-ops.

ALTER TABLE providers ADD COLUMN moyasar_payout_account_id TEXT;
ALTER TABLE providers ADD COLUMN payout_iban TEXT;
ALTER TABLE providers ADD COLUMN payout_holder_name TEXT;
ALTER TABLE providers ADD COLUMN payout_account_registered_at TEXT;

ALTER TABLE payout_requests ADD COLUMN moyasar_payout_id TEXT;
ALTER TABLE payout_requests ADD COLUMN moyasar_status TEXT;
ALTER TABLE payout_requests ADD COLUMN gateway_response TEXT;
ALTER TABLE payout_requests ADD COLUMN failure_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_providers_moyasar_payout_account
  ON providers(moyasar_payout_account_id) WHERE moyasar_payout_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payout_requests_moyasar_id
  ON payout_requests(moyasar_payout_id) WHERE moyasar_payout_id IS NOT NULL;
