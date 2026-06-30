// Tests for burstLaunchRefund — the double-charge-prevention invariant for the
// burst launch-fail-refund path (ROADMAP 2.1/2.2).
//
// THE INVARIANT: a burst launch pre-debits the renter, then spawns an external
// pod. If spawn fails, the renter must be refunded EXACTLY ONCE — never zero,
// never twice (a concurrent timeout sweep could also try to refund). The guard
// is the `refunded_at IS NULL AND status IN ('pulling','queued','assigned')`
// clause on the UPDATE; `updated.changes === 1` is the single signal that THIS
// caller won the refund race.
//
// Uses a mock db (no real sqlite / no node_modules) — the test asserts the SQL
// contains the once-only guard AND that the credit only fires when changes===1.
// Run with: npx jest burstLaunchRefund  (verified standalone via node -e harness).
'use strict'

const { failBurstJobAndRefund } = require('../services/burstLaunchRefund')

// Minimal better-sqlite3-shaped mock. `prepare(sql)` returns an object whose
// `.run(...args)` is dispatched by the test (nextRunResult) or default {changes:0}.
// `transaction(fn)` runs fn synchronously (no real tx needed for the invariant).
function makeMockDb({ jobUpdateChanges = 1 } = {}) {
  const calls = { sql: [], runArgs: [], txRan: 0 }
  let nextJobChanges = jobUpdateChanges
  const db = {
    prepare(sql) {
      calls.sql.push(sql)
      return {
        run(...args) {
          calls.runArgs.push({ sql, args })
          // The jobs UPDATE is the one with 'failed' in it; its changes count
          // drives the refund. The renters UPDATE has 'balance_halala = balance_halala +'.
          if (sql.includes("status='failed'")) return { changes: nextJobChanges }
          return { changes: 1 }
        },
      }
    },
    transaction(fn) {
      return (...a) => {
        calls.txRan += 1
        return fn(...a)
      }
    },
  }
  return { db, calls, setJobChanges: (n) => { nextJobChanges = n } }
}

describe('failBurstJobAndRefund — once-only refund invariant', () => {
  const baseArgs = { jobId: 'pod-1234-abc', quoteHalala: 500, renterId: 7 }

  test('refunds when the job is in a launch-state and not yet refunded', () => {
    const { db, calls } = makeMockDb({ jobUpdateChanges: 1 })
    const out = failBurstJobAndRefund(db, baseArgs)
    expect(out.refunded).toBe(true)
    expect(out.changes).toBe(1)
    // Exactly two statements ran inside the transaction: jobs UPDATE + renters credit.
    expect(calls.txRan).toBe(1)
    expect(calls.sql).toHaveLength(2)
    expect(calls.sql[0]).toContain("status='failed'")
    expect(calls.sql[0]).toContain('refunded_at IS NULL')
    expect(calls.sql[0]).toContain("status IN ('pulling','queued','assigned')")
    expect(calls.sql[1]).toContain('balance_halala = balance_halala +')
    // The renters credit got the quoteHalala + renterId.
    expect(calls.runArgs[1].args).toEqual([500, 7])
  })

  test('does NOT refund a second time (idempotent — refunded_at already set → changes=0)', () => {
    // Second call simulates a concurrent sweep that finds the row already refunded:
    // the UPDATE matches zero rows (changes=0), so no balance credit.
    const { db, calls, setJobChanges } = makeMockDb({ jobUpdateChanges: 1 })
    const first = failBurstJobAndRefund(db, baseArgs)
    expect(first.refunded).toBe(true)
    // Now the row is already refunded — a retry/sweep calls again.
    setJobChanges(0)
    const second = failBurstJobAndRefund(db, baseArgs)
    expect(second.refunded).toBe(false)
    expect(second.changes).toBe(0)
    // The jobs UPDATE ran twice (idempotent check), but the renters credit only ran once.
    const jobUpdates = calls.sql.filter((s) => s.includes("status='failed'"))
    const credits = calls.sql.filter((s) => s.includes('balance_halala = balance_halala +'))
    expect(jobUpdates).toHaveLength(2)
    expect(credits).toHaveLength(1) // ← the double-charge prevention guarantee
  })

  test('does NOT refund if the job already reached a terminal state (changes=0)', () => {
    // E.g. the timeout sweep already failed+refunded the job while spawn was throwing.
    const { db, calls } = makeMockDb({ jobUpdateChanges: 0 })
    const out = failBurstJobAndRefund(db, baseArgs)
    expect(out.refunded).toBe(false)
    expect(out.changes).toBe(0)
    // jobs UPDATE ran, renters credit did NOT.
    expect(calls.sql.some((s) => s.includes("status='failed'"))).toBe(true)
    expect(calls.sql.some((s) => s.includes('balance_halala = balance_halala +'))).toBe(false)
  })

  test('does NOT credit the wallet when quoteHalala is 0 (free launch)', () => {
    const { db, calls } = makeMockDb({ jobUpdateChanges: 1 })
    const out = failBurstJobAndRefund(db, { ...baseArgs, quoteHalala: 0 })
    expect(out.refunded).toBe(true) // job still marked failed
    // jobs UPDATE ran; renters credit did NOT (quoteHalala 0 short-circuits it).
    expect(calls.sql.some((s) => s.includes("status='failed'"))).toBe(true)
    expect(calls.sql.some((s) => s.includes('balance_halala = balance_halala +'))).toBe(false)
  })

  test('writes the supplied reason to jobs.error (default fallback)', () => {
    const { db, calls } = makeMockDb({ jobUpdateChanges: 1 })
    failBurstJobAndRefund(db, { ...baseArgs, reason: 'socat orphan: port 41000 in use' })
    // First run-args pair is the jobs UPDATE: [reason, completed_at, refunded_at, jobId]
    expect(calls.runArgs[0].args[0]).toBe('socat orphan: port 41000 in use')
    expect(calls.runArgs[0].args[3]).toBe('pod-1234-abc')
    // Default reason when omitted
    const m2 = makeMockDb({ jobUpdateChanges: 1 })
    failBurstJobAndRefund(m2.db, baseArgs)
    expect(m2.calls.runArgs[0].args[0]).toBe('Burst launch failed to start')
  })

  test('SQL guard is exactly the documented once-only clause (no drift)', () => {
    const { db, calls } = makeMockDb({ jobUpdateChanges: 1 })
    failBurstJobAndRefund(db, baseArgs)
    const jobsUpdate = calls.sql.find((s) => s.includes("status='failed'"))
    // The full guard must mention both the refunded_at NULL check AND the
    // non-terminal status whitelist. If either half is dropped the invariant breaks.
    expect(jobsUpdate).toContain('refunded_at IS NULL')
    expect(jobsUpdate).toContain("status IN ('pulling','queued','assigned')")
    // Must select the row by job_id (external id), not the surrogate id.
    expect(jobsUpdate).toContain('WHERE job_id=?')
  })
})