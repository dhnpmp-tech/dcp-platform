-- 023_payment_refund_requests.sql
-- Renter-initiated refund request queue for paid top-ups.

CREATE TABLE IF NOT EXISTS payment_refund_requests (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  renter_id INTEGER NOT NULL,
  amount_halala INTEGER NOT NULL CHECK(amount_halala > 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','processing','approved','rejected')),
  requested_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT,
  admin_note TEXT,
  moyasar_refund_id TEXT,
  gateway_response TEXT,
  FOREIGN KEY (payment_id) REFERENCES payments(payment_id),
  FOREIGN KEY (renter_id) REFERENCES renters(id)
);

CREATE INDEX IF NOT EXISTS idx_payment_refund_requests_renter
  ON payment_refund_requests(renter_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_refund_requests_status
  ON payment_refund_requests(status, requested_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_refund_requests_open_payment
  ON payment_refund_requests(payment_id)
  WHERE status IN ('pending','processing');
