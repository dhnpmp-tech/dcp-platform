# Renter Balance Topup Flow — DCP-846

> ⚠️ **STATUS — ON-CHAIN SETTLEMENT IS BUILT BUT DORMANT (not live as of 2026-06-28).**
> DCP's **live** settlement runs on **fiat SAR via Moyasar** (PCI-DSS processor); provider earnings settle in fiat.
> The smart-contract escrow / staking / on-chain-verification layer described in this document — Escrow, ProviderStake,
> JobAttestation; ERC-20 on Base L2 — is deployed only to **Base Sepolia testnet**, holds **no live funds**, and is
> pending third-party audit + mainnet. It is a planned **future agent-to-agent settlement rail**. Treat every
> "smart-contract escrow / non-custodial / blockchain-verified" statement below as **design intent, not current
> production behavior**. See `docs/blockchain/` for the full (dormant) design set.


How a renter adds SAR credit to their DCP account so they can submit paid jobs.

---

## Overview

DCP uses an off-chain SAR ledger. Renters must pre-load balance before submitting jobs.
Three payment methods are supported across three phases:

| Phase | Method | Gateway | Status |
|-------|--------|---------|--------|
| Phase 1 | Bank transfer (Saudi IBAN) | Manual admin confirmation | **LIVE** |
| Phase 2 | Card / mada / Apple Pay | Moyasar | Configured, needs MOYASAR_SECRET_KEY |
| Phase 3 | USDC on-chain deposit → SAR credit | Base L2 escrow | Planned |

---

## Phase 1: Manual Bank Transfer (Launch-Ready)

The simplest path to real money with zero gateway dependency.

### Renter Flow

**Step 1 — Initiate topup**

```
POST /api/payments/topup
x-renter-key: <renter-api-key>

{
  "amount_sar": 500,
  "payment_method": "bank_transfer"
}
```

Response:

```json
{
  "topup_id": "pay_bt_3a9f...",
  "payment_method": "bank_transfer",
  "amount_sar": 500.00,
  "amount_halala": 50000,
  "status": "pending",
  "expires_at": "2026-03-26T10:00:00.000Z",
  "instructions": {
    "step1": "Transfer exactly SAR 500.00 to the following account",
    "step2": "Include reference code \"DCP-42-B4F3A2C1\" in the transfer notes/memo",
    "step3": "Your balance will be credited within 1 business day after confirmation",
    "bank_name": "Al Rajhi Bank",
    "account_name": "DC1 Compute Platform",
    "iban": "SA0000000000000000000000",
    "reference": "DCP-42-B4F3A2C1"
  }
}
```

**Step 2 — Renter transfers money via banking app**

The renter logs into their Saudi bank (Al Rajhi, SNB, NCB, etc.) and transfers the exact amount, including the reference code in the notes field.

**Step 3 — Admin confirms receipt**

Once the transfer appears in the DCP bank account, an admin calls:

```
POST /api/admin/payments/confirm-topup
Authorization: Bearer <admin-token>

{
  "topup_id": "pay_bt_3a9f...",
  "note": "Verified via Al Rajhi portal, ref DCP-42-B4F3A2C1, 2026-03-24"
}
```

Response:

```json
{
  "success": true,
  "topup_id": "pay_bt_3a9f...",
  "renter_name": "Acme Corp",
  "renter_email": "billing@acme.com",
  "amount_sar": 500.00,
  "amount_halala": 50000,
  "previous_balance_halala": 0,
  "new_balance_halala": 50000,
  "new_balance_sar": 500.00,
  "confirmed_at": "2026-03-24T12:00:00.000Z",
  "note": "Verified via Al Rajhi portal, ref DCP-42-B4F3A2C1, 2026-03-24"
}
```

**Step 4 — Renter checks balance**

```
GET /api/payments/balance
x-renter-key: <renter-api-key>
```

Response:

```json
{
  "balance_sar": 500.00,
  "balance_halala": 50000,
  "renter_id": 42,
  "name": "Acme Corp",
  "email": "billing@acme.com"
}
```

---

## Phase 2: Card / mada / Apple Pay (Moyasar)

Already implemented. Requires `MOYASAR_SECRET_KEY` and `MOYASAR_WEBHOOK_SECRET` env vars.

```
POST /api/payments/topup
x-renter-key: <renter-api-key>

{
  "amount_halala": 50000,
  "payment_method": "creditcard"
}
```

Returns `{ payment_url, payment_id }`. Renter completes checkout at `payment_url`.
Moyasar webhook at `POST /api/payments/webhook` handles confirmation automatically.

Supported methods: `creditcard`, `applepay` (mada included under creditcard).

---

## Phase 3: On-Chain USDC Deposit → SAR Credit (Planned)

Renter deposits USDC to DCP escrow contract on Base L2.
Backend oracle monitors on-chain events, converts at spot rate, credits SAR balance.
Requires: funded escrow deployment, oracle service, price feed integration.
Tracked in DCP-618 (deferred pending funded wallet).

---

## API Reference

### GET /api/payments/balance

Returns the renter's current SAR balance.

**Auth:** `x-renter-key` header

**Response:**
```json
{
  "balance_sar": 500.00,
  "balance_halala": 50000,
  "renter_id": 42,
  "name": "string",
  "email": "string"
}
```

---

### POST /api/payments/topup

Initiates a topup. Supports all three payment methods.

**Auth:** `x-renter-key` header

**Body:**
```json
{
  "amount_sar": 500,
  "payment_method": "bank_transfer | creditcard | applepay"
}
```

Or use `amount_halala` (integer, 100 halala = 1 SAR, min 100, max 1,000,000).

**Response (bank_transfer):** topup_id + IBAN instructions
**Response (creditcard/applepay):** `{ payment_url, payment_id }`

---

### POST /api/admin/payments/confirm-topup

Confirms a pending bank transfer. Credits renter balance immediately.

**Auth:** Admin token (`Authorization: Bearer <token>`)

**Body:**
```json
{
  "topup_id": "pay_bt_...",
  "note": "optional admin note for audit trail"
}
```

**Guards:**
- Returns 404 if topup_id not found or not a bank_transfer
- Returns 409 if already confirmed (idempotent, shows `confirmed_at`)
- Writes to `renter_credit_ledger` and `admin_audit_log` atomically

---

## Environment Variables

| Variable | Purpose | Phase 1 Required |
|----------|---------|-----------------|
| `DCP_BANK_IBAN` | Saudi IBAN to show renters for transfers | Yes |
| `DCP_BANK_ACCOUNT_NAME` | Account name on IBAN | Yes |
| `DCP_BANK_NAME` | Bank name to show | Yes |
| `MOYASAR_SECRET_KEY` | Moyasar API key | No (Phase 2) |
| `MOYASAR_WEBHOOK_SECRET` | Moyasar webhook HMAC secret | No (Phase 2) |

Set these in `.env` or PM2 ecosystem config.

---

## Manually Credit Phase 1 Test Users (50 SAR each)

To give testers a starting balance without a real bank transfer, use the admin balance adjustment endpoint:

```bash
# Replace <admin-token> and <renter-id> as appropriate
curl -X POST https://api.dcp.sa/api/admin/renters/<renter-id>/balance \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"amount_halala": 5000, "reason": "Phase 1 tester credit — 50 SAR starter balance"}'
```

To credit multiple testers at once:

```bash
ADMIN_TOKEN="<your-admin-token>"
for RENTER_ID in 1 2 3 4 5; do
  curl -s -X POST "https://api.dcp.sa/api/admin/renters/$RENTER_ID/balance" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"amount_halala": 5000, "reason": "Phase 1 tester credit — 50 SAR starter balance"}' \
    | grep -o '"new_balance":[0-9]*'
  echo " → renter $RENTER_ID credited"
done
```

This uses `POST /api/admin/renters/:id/balance` which credits the balance directly (no topup record created).

---

## Data Model

Topup records are stored in the `payments` table:

```
payment_id      — internal ID (pay_bt_... for bank transfer)
renter_id       — FK to renters
amount_sar      — decimal SAR amount
amount_halala   — integer halala (1 SAR = 100 halala)
status          — pending | paid | failed | refunded
source_type     — bank_transfer | creditcard | applepay | sandbox
confirmed_at    — set when admin confirms (bank_transfer) or webhook fires (Moyasar)
gateway_response — JSON: Moyasar payload OR admin confirmation details
```

Every credit is also written to `renter_credit_ledger` for immutable audit trail (see DCP-755).

---

## Audit Trail

All admin topup confirmations appear in:
- `admin_audit_log` table: action=`topup_confirmed`
- `renter_credit_ledger` table: direction=`credit`, source=`bank_transfer_topup`

Query recent confirmations:

```sql
SELECT * FROM admin_audit_log WHERE action = 'topup_confirmed' ORDER BY timestamp DESC LIMIT 20;
```
