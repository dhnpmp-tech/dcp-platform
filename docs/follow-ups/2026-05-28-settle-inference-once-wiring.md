# Follow-up: Wire `settleInferenceOnce` into `/v1/chat/completions`

**Status:** queued for a dedicated PR  
**Owner:** TBD  
**Filed:** 2026-05-28  
**Related:** PR #426 (shipped `billingService.settleInferenceOnce`), PR #427 (pre-flight gate, partial fix)

## Why this is queued, not shipped

`billingService.settleInferenceOnce()` exists, tested (11 tests across
`backend/tests/billing-rewrite.test.js`), and is the canonical atomic
billing helper. But the live inference path in `backend/src/routes/v1.js`
still uses scattered inline writes:

- `debitRenterSafe` (line ~2182) — renter debit only, silent-error
  swallow, no rollback on failure.
- `debitAndPersistUsage` (line ~2217) — wraps debit + the legacy
  `recordOpenRouterUsage` ledger + the newer `usage_events` insert.
- Inline `INSERT INTO jobs` + provider `claimable_earnings_halala` UPDATE
  + renter `total_spent_halala` UPDATE at line ~2447-2476 (proxy
  success path) and ~2589-2615 (stream success path).

The atomicity defects this leaves open (as flagged in the earlier
review):

1. ~~No pre-flight balance gate~~ — **fixed in PR #427**.
2. Provider credit is OUTSIDE the renter-debit transaction. Process
   crash between the two = renter debited, provider not credited
   (or vice versa).
3. No rowcount check on `UPDATE renters … WHERE balance_halala >= ?` —
   silent no-op when the WHERE doesn't match, but the rest of the
   handler still credits the provider.
4. Not idempotent — sweep/webhook replay could double-bill (no
   `request_id` guard on the per-row balance UPDATEs).
5. Streaming path duplicates all of the above with the same bugs.

## Why it's not a 1-PR-1-hour fix

`debitAndPersistUsage` does three things, two of which `settleInferenceOnce`
does NOT do:

- ✅ Renter debit (sub credits → PAYG) — replaceable
- ❌ Legacy `recordOpenRouterUsage` write to the `openrouter_usage`
  table (separate from the new `usage_events` table) — still needed by
  the reconciliation engine + finance exports
- ✅ `usage_events` insert — already done by `settleInferenceOnce` step 5

The replacement strategy needs to:

1. Move `recordOpenRouterUsage` into the same transaction as
   `settleInferenceOnce` (or call it post-commit as a best-effort
   write — acceptable since it's a reporting mirror, not authoritative
   state).
2. Pre-compute `usageEventRow` + `jobRow` shapes from the existing
   `proxySnapshot` + result body before the call.
3. Map `meteringRequestId` to `requestId` so the idempotency table
   keys off the same identifier the webhook + sweep use.
4. Stop calling `debitAndPersistUsage` — `settleInferenceOnce`
   subsumes its responsibilities.
5. Do the same for `writeStreamingResponse` (line ~2466) which has
   its own copy of the post-write block at line ~2589.
6. Preserve the existing fire-and-forget `autoTopupService.maybeTrigger`
   hook (currently inside `debitRenterSafe`). It should fire after
   `settleInferenceOnce` returns successfully.

## Risk

This is the live billing path for every `/v1/chat/completions` request
on `api.dcp.sa`. The proxy + stream paths together are ~150 lines of
subtle code. A bad refactor could:

- Double-bill (e.g. if `debitAndPersistUsage` is left in but
  `settleInferenceOnce` is also called).
- Break the streaming response (the stream writer has its own state
  machine that interleaves token chunks with the final usage block).
- Stop crediting providers (if `splitCost` isn't propagated correctly).
- Stop the auto-top-up hook from firing.

## Acceptance criteria for the follow-up PR

- Single transaction per request — verified by an integration test
  that aborts mid-flight and asserts no partial state.
- Idempotency — webhook replay / sweep retry on the same
  `request_id` is a no-op, asserted with a deliberate-replay test.
- Proxy + stream paths share the same helper (de-dup ~80 lines).
- Auto-top-up hook still fires after successful settlement.
- 43+ existing tests still green; +5 new integration tests covering
  the four atomicity defects above (one per defect, plus the
  insufficient-balance refund test from `billingService` upgraded to
  hit the full v1.js handler).
- `[v1] debit failed — ledger/balance drift` log message is gone
  (replaced by the structured `billing_attempts` row with
  `status='error'`).

## Estimate

2-3 hours of careful refactor + 1 hour of integration tests. Best done
as a single focused PR with no other in-flight work, since it touches
the live billing path.
