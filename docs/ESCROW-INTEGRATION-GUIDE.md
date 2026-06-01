# Escrow Integration Guide — DCP Smart Contracts

**Status:** Complete (deployment deferred pending wallet funding — see CLAUDE.md directive)
**Target Audience:** Providers integrating settlement, renters building escrow-backed jobs
**Last Updated:** 2026-03-23

---

## Overview

DCP uses EIP-712 escrow contracts to secure provider-renter transactions. This guide covers:
- Smart contract mechanics (deposit, lock, release, dispute)
- Provider settlement flow
- Renter deposit requirements
- Token flow diagrams
- API integration points

---

## Smart Contract Architecture

### Contracts (BASE Sepolia)
- **Escrow.sol** — Token deposit, job lock, provider payout, dispute resolution
- **DCP Token** — SepoliaETH or DCP native token

### Key Flows

#### Provider Settlement
```
Provider earns → Job completes → Tokens released from escrow → Provider wallet
```

#### Renter Deposit
```
Renter deposits → Escrow locked → Job executes → Tokens released to provider OR returned
```

---

## Provider Integration

### 1. Check Escrow Status

```bash
curl -X GET https://api.dcp.sa/api/providers/me/escrow \
  -H "Authorization: Bearer $PROVIDER_KEY"
```

**Response:**
```json
{
  "total_locked": "2.5",
  "available": "1.2",
  "pending_release": "1.3",
  "currency": "SepoliaETH"
}
```

### 2. Claim Settlement

Once a job completes and escrow releases:

```bash
curl -X POST https://api.dcp.sa/api/providers/me/claim-settlement \
  -H "Authorization: Bearer $PROVIDER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job-abc123",
    "amount": "0.5"
  }'
```

### 3. Settlement History

```bash
curl -X GET https://api.dcp.sa/api/providers/me/settlements \
  -H "Authorization: Bearer $PROVIDER_KEY"
```

---

## Renter Integration

### 1. Fund Escrow Account

Before submitting jobs, deposit SepoliaETH:

```bash
curl -X POST https://api.dcp.sa/api/renters/me/escrow/deposit \
  -H "Authorization: Bearer $RENTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "5.0",
    "currency": "SepoliaETH"
  }'
```

### 2. Check Escrow Balance

```bash
curl -X GET https://api.dcp.sa/api/renters/me/escrow/balance \
  -H "Authorization: Bearer $RENTER_KEY"
```

**Response:**
```json
{
  "total_deposited": "5.0",
  "locked_in_jobs": "1.5",
  "available": "3.5",
  "currency": "SepoliaETH"
}
```

### 3. Submit Job with Escrow Lock

Jobs requiring provider assurance include escrow reference:

```bash
curl -X POST https://api.dcp.sa/api/jobs/submit \
  -H "Authorization: Bearer $RENTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Nemotron-12B",
    "prompt": "...",
    "max_tokens": 256,
    "escrow_required": true,
    "provider_payout": "0.15"
  }'
```

---

## Token Flow Diagram

```
Renter Wallet (SepoliaETH)
    ↓ deposit()
Escrow Contract (locked)
    ↓ [Job executes]
    ├→ Provider Wallet (on completion)
    └→ Renter Wallet (on cancellation/timeout)
```

---

## Dispute Resolution

If a job fails or disputes arise:

```bash
curl -X POST https://api.dcp.sa/api/jobs/:id/dispute \
  -H "Authorization: Bearer $RENTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Job did not complete within SLA",
    "evidence": "..."
  }'
```

Disputes are reviewed by DCP governance (admin override for Phase 1).

---

## Security Considerations

1. **Private Keys**: Never expose renter or provider private keys
2. **Escrow Limits**: Start with small deposit amounts; scale after testing
3. **Job Timeouts**: Set realistic timeouts to avoid escrow lock-ups
4. **Audit Trail**: All escrow operations are logged and queryable

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Insufficient escrow balance" | Deposit more tokens via `/escrow/deposit` |
| "Job timed out, escrow not released" | Open dispute via `/jobs/:id/dispute` |
| "Provider payout address invalid" | Verify provider wallet address in dashboard |

---

## References

- [Escrow Architecture](docs/escrow-architecture.md)
- [Provider Earnings Guide](docs/PROVIDER-EARNINGS-GUIDE.md)
- [API Reference — Escrow Endpoints](docs/api-reference.md#escrow)
- [Provider Staking Design](docs/PROVIDER-STAKING-DESIGN.md)
