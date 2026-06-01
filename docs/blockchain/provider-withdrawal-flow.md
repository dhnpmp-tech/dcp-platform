# Provider Earnings Withdrawal Flow

**DCP-799 | Blockchain Engineer | 2026-03-24**

## Summary

Providers accumulate earnings in `providers.claimable_earnings_halala` as jobs
complete. They can request off-chain bank transfers via two coexisting endpoints
(a legacy SAR-based route and a new halala+IBAN state-machine route). Platform
take rate is **15%** (`dc1_fee_halala`). Payouts are manual (admin-processed).

---

## Earnings Accumulation

### Per-job credit — `backend/src/routes/providers.js` ~line 2381

When a job completes, the provider side of the settlement runs:

```js
// Inside job completion handler (atomic SQLite transaction):
UPDATE providers
  SET total_earnings        = total_earnings + (providerEarned / 100),  -- SAR float (legacy)
      claimable_earnings_halala = claimable_earnings_halala + providerEarned,
      total_jobs            = total_jobs + 1
WHERE id = ?
```

The split is calculated as:

```
actual_cost_halala  = cost charged to renter
dc1_fee_halala      = round(actual_cost * 0.15)        -- 15% platform take
provider_earned_halala = actual_cost - dc1_fee_halala  -- 85% to provider
```

Both `provider_earned_halala` and `dc1_fee_halala` are written to the `jobs` row
for per-job auditability.

### Escrow holds

For jobs still running, funds are tracked in `escrow_holds`:
- `status = 'held'`: funds locked, job in progress
- `status = 'locked'`: job completing, pending settlement
- Released to `claimable_earnings_halala` on completion

---

## Withdrawal Endpoints

### Route A (new — recommended): `POST /api/providers/me/withdraw`

**Request**:
```json
{
  "amount_halala": 5000,
  "iban": "SA0380000000608010167519"
}
```

**Validation**:
- `amount_halala` ≥ 1000 halala (10 SAR minimum)
- `iban` must match `/^SA\d{22}$/`
- Amount must not exceed `claimable_earnings_halala - pending_withdrawal_halala`
- Only one pending/processing request allowed at a time (409 if duplicate)

**State machine**:
```
pending → processing → paid
                     → failed
```

**Table**: `withdrawal_requests`
```sql
CREATE TABLE withdrawal_requests (
  id              TEXT PRIMARY KEY,
  provider_id     INTEGER NOT NULL,
  amount_halala   INTEGER NOT NULL,
  is_amount_reserved INTEGER DEFAULT 1,
  status          TEXT CHECK(status IN ('pending','processing','paid','failed')),
  iban            TEXT NOT NULL,
  admin_note      TEXT,
  created_at      TEXT,
  processed_at    TEXT,
  updated_at      TEXT
)
```

**Payout process**: Admin reviews pending requests via admin API, processes bank
transfer to the provider IBAN, then updates status to `paid`. No automated payout
logic exists yet — this is manual.

**Available balance formula**:
```
available_halala = claimable_earnings_halala
                 - SUM(pending/processing withdrawal_requests.amount_halala)
```

---

### Route B (legacy): `POST /api/providers/withdraw`

**Request**:
```json
{
  "amount_sar": 50.00,
  "payout_method": "bank_transfer",
  "payout_details": { "iban": "SA..." }
}
```

- Minimum: 10 SAR
- Prefers `claimable_earnings_halala` if set, falls back to `total_earnings` (SAR float)
- Uses legacy `withdrawals` table (SAR-denominated, no IBAN validation)
- Status: `pending` → `completed` (admin updates manually)

**Note**: Route A (halala + IBAN validation) supersedes Route B. Route B remains
for backwards compatibility with providers registered before the halala migration.

---

## Earnings Query: `GET /api/providers/earnings`

Returns the full earnings breakdown for a provider:

```json
{
  "provider_id": 12,
  "name": "Provider XYZ",
  "total_earned_sar": 142.50,
  "total_earned_halala": 14250,
  "claimable_earnings_halala": 14250,
  "pending_withdrawal_sar": 0,
  "withdrawn_sar": 0,
  "available_sar": 142.50,
  "available_halala": 14250,
  "total_jobs": 47,
  "escrow": {
    "held_jobs": 2,
    "held_halala": 680,
    "locked_jobs": 0,
    "locked_halala": 0
  }
}
```

---

## Platform Take Rate

| Component | Rate |
|---|---|
| DCP platform fee | **15%** of actual job cost |
| Provider payout | **85%** of actual job cost |

Example: RTX 4090 at DCP floor price $0.267/hr:
- 1 hr job ≈ $0.267 = ~100 halala at SAR rate
- Provider earns ~85 halala per hour
- DCP retains ~15 halala per hour

---

## Missing: Automatic Payout Trigger

**Current state**: Withdrawal processing is 100% manual. Admin must:
1. Query `GET /api/admin/withdrawals?status=pending`
2. Initiate bank transfer to provider IBAN
3. Call `PATCH /api/admin/withdrawals/:id` to mark as `paid`

**Recommendation:** Wire to Lean (Saudi open banking) or ARB when automated payout rails are ready.
(Arab National Bank) API for automated IBAN transfers when volume justifies it.

---

## Key Files

| File | Role |
|---|---|
| `backend/src/routes/providers.js` | Earnings query, both withdrawal endpoints, job completion settlement |
| `backend/src/db.js` | Schema: `providers`, `withdrawal_requests`, `withdrawals`, `escrow_holds` |

---

## Withdrawal Flow Diagram

```
Provider completes jobs
        │
        ▼
providers.claimable_earnings_halala accumulates (85% of each job)
        │
        ▼
POST /api/providers/me/withdraw  { amount_halala, iban }
        │
        ├─ Validation: amount ≤ available, no duplicate pending, IBAN format
        │
        ▼
withdrawal_requests (status=pending)
        │
        ▼
Admin reviews → bank transfer initiated
        │
        ▼
withdrawal_requests (status=paid)
  + admin records processed_at, admin_note
```

---

## Conclusion

The earnings accumulation path is solid and per-job auditable via `jobs.provider_earned_halala`.
The withdrawal state machine (Route A) covers the happy path end-to-end. The missing piece is
automated payout execution — currently a manual admin step. This is acceptable for the current
43-provider scale but will need automation before reaching 100+ active providers.
