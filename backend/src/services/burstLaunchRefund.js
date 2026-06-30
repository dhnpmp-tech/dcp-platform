// Burst launch fail+refund — the double-charge-prevention helper extracted from
// routes/pods.js (ROADMAP 2.1/2.2). Extracted so the once-only invariant is
// unit-testable instead of buried inline in the launch handler.
//
// THE INVARIANT (load-bearing):
//   A burst launch pre-debits the renter (quoteHalala) BEFORE the external
//   pod is spawned. If spawn fails, the renter must be refunded EXACTLY ONCE —
//   never zero (they'd pay for a pod that never booted), never twice (a
//   concurrent timeout sweep or retry could also try to refund). The guard is
//   `refunded_at IS NULL AND status IN ('pulling','queued','assigned')` on the
//   UPDATE: the row only flips if it has NOT already been refunded and is still
//   in a non-terminal state. `updated.changes === 1` is the single signal that
//   THIS caller won the refund race; only then is the renter balance credited.
//
// This module owns the SQL and the once-only guard. The launch handler, the
// timeout sweep, and any future retry path all call the same function — there
// is no second copy of the refund SQL to drift out of sync.
//
// `db` is duck-typed (better-sqlite3 shape: `.prepare(sql).run(...)` +
// `.transaction(fn)`). The test passes an in-memory mock that records calls.

'use strict'

/**
 * Fail a burst job that never reached running and refund the pre-debit exactly
 * once. Safe to call multiple times (idempotent: second call is a no-op).
 *
 * @param {object} db - better-sqlite3 Database (or compatible mock).
 * @param {object} args
 * @param {string} args.jobId       - jobs.job_id (external id, e.g. "pod-...")
 * @param {number} args.quoteHalala - the pre-debited amount to refund (halala).
 * @param {number} args.renterId    - jobs.renter_id (the wallet to credit).
 * @param {string} [args.reason]    - error string written to jobs.error.
 * @returns {{refunded: boolean, changes: number}} refunded=true iff the balance
 *   was credited this call (i.e. THIS caller won the once-only race).
 */
function failBurstJobAndRefund(db, { jobId, quoteHalala, renterId, reason }) {
  const failNow = new Date().toISOString()
  const failReason = reason || 'Burst launch failed to start'

  const result = db.transaction(() => {
    // The once-only guard: only flip a row that has NOT been refunded AND is
    // still in a launch-state (pulling/queued/assigned). A row already at
    // 'failed'/'completed'/'refunded' is left untouched → changes=0 → no credit.
    const updated = db.prepare(
      `UPDATE jobs
          SET status='failed', error=?, completed_at=?, refunded_at=?
        WHERE id IN (SELECT id FROM jobs WHERE job_id=?)
          AND refunded_at IS NULL
          AND status IN ('pulling','queued','assigned')`
    ).run(failReason, failNow, failNow, jobId)

    if (updated.changes === 1 && quoteHalala > 0) {
      db.prepare(`UPDATE renters SET balance_halala = balance_halala + ? WHERE id = ?`)
        .run(quoteHalala, renterId)
    }
    return { refunded: updated.changes === 1, changes: updated.changes }
  })()

  return result
}

module.exports = { failBurstJobAndRefund }