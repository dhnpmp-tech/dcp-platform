# SAR Payment Rails Specification

> **DCP-836** | Blockchain Engineer | 2026-03-24
> **Status:** Spec complete — ready for implementation once escrow wallet is funded
> **Related:** DCP-825 (off-chain ledger), DCP-31 (Moyasar SAR gateway), contracts/contracts/Escrow.sol

---

## 1. Overview

DCP's core differentiator vs USD-only GPU marketplaces (Vast.ai, RunPod, Akash) is native SAR settlement. Saudi renters pay in SAR via familiar payment methods (mada, Apple Pay, VISA/MC). Saudi providers receive SAR-denominated payouts. This document specifies the complete payment rails from renter deposit through provider settlement.

**Key design constraint:** Escrow.sol settles in USDC on Base L2. The off-chain billing layer (DCP-825) operates in halala (SAR ÷ 100). These two systems must sync without introducing exchange rate risk for the renter or provider.

---

## 2. Currency and Unit Conventions

| Unit | Definition | Exchange Rate |
|------|-----------|---------------|
| Halala | Smallest DCP billing unit | 0.01 SAR |
| SAR | Saudi Riyal | 1 SAR = $0.2667 USD (fixed peg) |
| USD | US Dollar | 1 USD = 3.75 SAR |
| USDC | On-chain stablecoin (6 decimals) | 1 USDC ≈ 1 USD ≈ 3.75 SAR |
| Moyasar unit | Smallest Moyasar billing unit | 1 halala (matches DCP internal) |

The SAR/USD peg is fixed by the Saudi Central Bank (SAMA) at **1 USD = 3.75 SAR** with negligible variance (<0.01%). DCP uses this fixed rate for all SAR↔USDC conversions. No oracle price feed is required for the SAR/USD leg.

---

## 3. SAR Stablecoin vs USDC Conversion Approach

### 3.1 Decision: Fixed Rate Oracle (No External Price Feed)

DCP uses the **fixed SAMA peg** (1 USD = 3.75 SAR) for all SAR↔USDC conversions. This is the correct approach because:

1. The SAR/USD peg has been stable since 1986 — no meaningful exchange rate risk
2. An on-chain price oracle (Chainlink, Pyth) adds gas cost and external dependency with near-zero benefit
3. Moyasar charges renters in SAR halala; Escrow.sol holds USDC — the conversion at deposit time is deterministic

**Conversion formula:**
```
usdc_amount = (halala_amount / 100) / 3.75
           = halala_amount / 375
```

**Example (RTX 4090, 1 hour):**
```
Rate: 100 halala/hr = 1.00 SAR/hr
USDC to lock: 1.00 / 3.75 = 0.2667 USDC (266,667 micro-USDC, 6 decimals)
```

### 3.2 Binance P2P Rate — Not Used

Binance P2P SAR/USDT rates fluctuate ±2-5% around the official peg. Using a live P2P rate would:
- Introduce rate risk for renters between quote and payment
- Require a trusted price feed with update lag
- Complicate audits and dispute resolution

**Conclusion:** Fixed SAMA peg at 3.75 SAR/USD for all conversions.

### 3.3 Rounding Rules

All halala → USDC conversions round **up** (ceiling) to protect DCP from USDC shortfall:
```javascript
// micro-USDC = ceil(halala / 375 * 1_000_000) → but more precisely:
// usdc_micro = ceil(halala_amount * 1_000_000 / 375 / 100)
const usdcMicro = Math.ceil(halalaAmount * 10_000 / 375); // avoids float division
```

Example: 100 halala → ceil(100 × 10000 / 375) = ceil(2666.67) = 2667 micro-USDC.

---

## 4. On-Chain Settlement Flow

### 4.1 End-to-End Flow

```
[Renter] → Moyasar SAR payment → DCP wallet_balance_halala ↑
[Renter] → requests GPU job → DCP pre-authorizes balance
[DCP backend] → calls depositAndLock() on Escrow.sol → USDC locked in contract
[Provider] → runs compute job
[DCP oracle] → signs JobCompletion proof
[DCP relayer] → calls claimLock() on Escrow.sol → USDC released
  → 75% USDC → provider EVM wallet
  → 25% USDC → DCP treasury wallet
[DCP backend] → off-chain: debit wallet_balance_halala, credit provider earnings
```

### 4.2 Phase 1 (Current — Off-Chain Only)

Until escrow wallet is funded and deployed, DCP runs **off-chain only**:
- Renter pays via Moyasar → `wallet_balance_halala` increases in SQLite
- Jobs debit from `wallet_balance_halala` at completion
- Provider earnings accumulate in `providers.claimable_earnings_halala`
- No on-chain USDC movement

The off-chain ledger (DCP-825) is the source of truth in Phase 1.

### 4.3 Phase 2 (Post-Escrow Deployment)

Once Escrow.sol is deployed:
- Renter tops up in SAR via Moyasar → backend converts to USDC → `depositAndLock()` per job
- Off-chain ledger remains in halala for auditability
- `job_settlements` table syncs with on-chain USDC movements
- Provider can claim USDC directly from contract or receive off-chain SAR payout

### 4.4 Hybrid Mode (Recommended Transition)

During the Phase 1→2 transition, DCP runs both systems in parallel:
- High-value jobs (>100 SAR): on-chain escrow
- Low-value jobs / micro-sessions: off-chain only
- Threshold is configurable via `ESCROW_MIN_JOB_VALUE_HALALA` env var

This limits gas overhead for small inference calls while providing on-chain guarantees for large compute jobs.

---

## 5. Off-Chain Ledger (DCP-825) Sync with On-Chain Settlement

### 5.1 Sync Architecture

```
SQLite (off-chain source of truth)
├── wallet_balances.wallet_balance_halala      ← renter balance
├── job_settlements.gross_amount_halala        ← per-job billing
├── job_settlements.provider_payout_halala     ← provider earnings
└── job_settlements.platform_fee_halala        ← DCP revenue (15%)

Base L2 (on-chain verification layer)
├── Escrow.depositAndLock(jobId, provider, usdcAmount, expiry)
├── Escrow.claimLock(jobId, oracleProof)       ← 75% → provider, 25% → DC1
└── Escrow.cancelExpiredLock(jobId)            ← 100% → renter refund
```

**Discrepancy:** The off-chain split is 85% provider / 15% DCP. The on-chain split is 75% provider / 25% DC1. This is intentional: the on-chain contract was designed for testnet launch with different economics. When escrow goes live, the fee model will be reconciled. Until then, on-chain escrow is testnet-only and the 15% take rate applies.

### 5.2 Sync Events

| Off-chain event | On-chain action | Sync record |
|----------------|-----------------|-------------|
| Job queued | `depositAndLock()` submitted | `escrow_deposits` table: tx hash, job_id, usdc_amount |
| Job completed | `claimLock()` submitted | `job_settlements.onchain_tx_hash` updated |
| Job failed/expired | `cancelExpiredLock()` submitted | `job_settlements.status = 'refunded'`, tx hash |

### 5.3 Idempotency

All sync operations are idempotent:
- `depositAndLock()` reverts if `_escrows[jobId].status != EMPTY` — safe to retry
- `claimLock()` reverts if already claimed — backend checks status before submission
- Off-chain ledger updates use SQLite transactions with `job_id` uniqueness constraint

---

## 6. Dispute Resolution

### 6.1 Dispute Scenarios

| Scenario | Resolution |
|----------|-----------|
| Provider claims job completed, renter says it didn't | Oracle proof is deterministic — if job_settlements has `status=completed`, escrow was claimed. Renter can audit on-chain via jobId. |
| Job timed out before completion | `cancelExpiredLock()` is callable after expiry. Backend monitors expiry and auto-refunds. Renter gets 100% back. |
| Partial completion (job ran, output was wrong) | Phase 1: DCP admin can manually refund from `wallet_balance_halala`. Phase 2: No partial refund in current contract — all-or-nothing. |
| Provider offline, job never started | Backend auto-cancels after `JOB_TIMEOUT_SECONDS` (default: 300). Off-chain: full refund to wallet_balance_halala. On-chain: `cancelExpiredLock()` after expiry. |
| Oracle key compromised | Owner can call `setOracle(newAddress)` to update signing key. Outstanding locked escrows remain valid under old key until expiry. |

### 6.2 Refund Flow (Off-Chain, Phase 1)

```
Job fails → backend sets job_settlements.status = 'failed'
           → gross_amount_halala restored to wallet_balance_halala
           → provider_payout_halala = 0, platform_fee_halala = 0
           → reconciliation script verifies zero-sum
```

### 6.3 Refund Flow (On-Chain, Phase 2)

```
Job expires → backend submits cancelExpiredLock(jobId32)
           → Escrow.sol transfers full USDC amount back to renter address
           → backend records: job_settlements.status = 'refunded', onchain_tx_hash
           → wallet_balance_halala already restored (off-chain refund runs first)
           → reconciliation: USDC refund + off-chain credit must net to zero
```

### 6.4 Dispute Escalation Path

1. Renter opens dispute via `POST /api/disputes` (not yet built — Phase 3)
2. DCP admin reviews `job_sessions` + `vllm_metering` logs
3. If provider at fault: manual off-chain refund from DCP reserve
4. If renter at fault: no refund
5. On-chain evidence available via `getEscrow(jobId32)` and event logs

---

## 7. Gas Cost Estimates

### 7.1 Base Sepolia vs Mainnet

Base L2 uses Optimism's fee model: L2 execution gas + L1 data availability fee.

| Operation | L2 Gas | Est. Cost (Base Sepolia @ 0.001 gwei) | Est. Cost (Base Mainnet @ 0.05 gwei) |
|-----------|--------|---------------------------------------|--------------------------------------|
| `depositAndLock()` | ~80,000 | ~0.000000008 ETH ≈ $0.00003 | ~0.000004 ETH ≈ $0.01 |
| `claimLock()` | ~70,000 | ~0.000000007 ETH ≈ $0.00003 | ~0.0000035 ETH ≈ $0.009 |
| `cancelExpiredLock()` | ~50,000 | ~0.000000005 ETH ≈ $0.00002 | ~0.0000025 ETH ≈ $0.006 |
| `Escrow.sol` deploy | ~1,200,000 | ~0.00000012 ETH | ~0.00006 ETH ≈ $0.18 |

**L1 data fee (calldata):** Base L2 posts transaction data to Ethereum mainnet. Each transaction adds ~$0.001-$0.01 L1 fee at current Ethereum gas prices.

**Total cost per job (Base Mainnet):**
- `depositAndLock()` + `claimLock()` = ~$0.02 USD per job
- At RTX 4090 rate ($0.267/hr), breakeven job duration: ~4.5 minutes
- For jobs >5 minutes, on-chain escrow adds <10% cost overhead

**Recommendation:** Use on-chain escrow for jobs >5 minutes (300 seconds). Off-chain only for shorter sessions.

### 7.2 ETH Balance Requirements

| Use case | Required ETH (Base Sepolia) | Required ETH (Base Mainnet) |
|----------|----------------------------|----------------------------|
| Deployment (one-time) | 0.01 SepoliaETH | 0.001 ETH (~$3) |
| 100 jobs/day operating reserve | 0.001 SepoliaETH | 0.01 ETH/day |
| Monthly at 1000 jobs/month | negligible | ~0.1 ETH (~$300) |

The relayer wallet needs ETH for gas. Provider and renter wallets only need USDC for the escrow amounts.

---

## 8. SAR Top-Up → USDC Escrow Bridge

### 8.1 Current Flow (Phase 1, Moyasar only)

```
Renter → Moyasar checkout (SAR) → webhook → wallet_balance_halala +=  amount
Job → debit wallet_balance_halala
```

### 8.2 Future Flow (Phase 2, with USDC escrow)

```
Renter → Moyasar checkout (SAR amount = job_cost_sar)
       → Moyasar webhook → DCP backend
       → backend: convert SAR → USDC (fixed rate 3.75)
       → backend: call Escrow.depositAndLock(jobId, provider, usdcAmount, expiry)
       → backend: record escrow_deposits table
```

**Renter experience:** unchanged. The renter sees SAR amounts throughout. The USDC conversion is invisible.

### 8.3 USDC Liquidity Source

For DCP to call `depositAndLock()`, the **relayer wallet** must hold sufficient USDC to pre-fund each job. Two approaches:

**Option A — Float Pool (Recommended for Phase 2):**
- DCP maintains a USDC pool (e.g. 1000 USDC) on the relayer wallet
- Renter SAR payments replenish the pool (converted via Binance or exchange)
- Pool size based on average job value and concurrent job count

**Option B — Per-Job Conversion:**
- Each Moyasar payment triggers a SAR→USDC swap before `depositAndLock()`
- Requires exchange API integration (Binance, OKX, or local Saudi exchange)
- More complex, higher latency

**Decision:** Launch with Option A (manual float pool). Option B is future work once payout automation is ready.

---

## 9. Provider Payout Flow

### 9.1 Off-Chain Provider Payout (Phase 1)

```
Job completes → provider_payout_halala credited to providers.claimable_earnings_halala
Provider requests withdrawal → DCP admin reviews
Payout method: bank transfer (Saudi IBAN), mada, or USDC
```

### 9.2 On-Chain Provider Payout (Phase 2)

```
claimLock() executes → 75% USDC transferred directly to provider.evm_wallet_address
Provider withdraws from their EVM wallet directly — no DCP intermediary needed
```

Providers must register an EVM wallet address in their profile. If not registered, backend uses `ESCROW_SETTLEMENT_PROVIDER_ADDRESS` (DCP fallback wallet) and pays provider off-chain.

---

## 10. Security Considerations

| Risk | Mitigation |
|------|-----------|
| Oracle key compromise | `setOracle()` allows key rotation without contract redeploy. Outstanding locks remain valid under old key. |
| Relayer wallet drained | Relayer only needs ETH for gas, not USDC. USDC is locked in contract per-job. |
| SAR/USD peg break | DCP absorbs exchange risk (peg has been stable since 1986, SAMA intervention likely before break). |
| Front-running `depositAndLock` | EIP-712 signed proofs are job-specific — replay on different job is invalid. |
| Reentrancy | `nonReentrant` modifier on all state-changing contract functions. |
| Integer overflow | Solidity 0.8.x has built-in overflow protection. Halala arithmetic uses `Math.ceil()` in JS. |

---

## 11. Implementation Dependencies

| Dependency | Status | Owner |
|-----------|--------|-------|
| `Escrow.sol` | ✅ Complete | Blockchain Engineer |
| Moyasar SAR gateway (`payments.js`) | ✅ Complete | Backend Architect |
| Off-chain ledger (DCP-825) | ✅ Complete | Backend Architect |
| `escrow-chain.js` backend service | ✅ Complete | Blockchain Engineer |
| Funded deployer wallet | Pending | Platform operator |
| USDC float pool | ❌ Not started | Founding Engineer |
| Provider EVM wallet registration UI | ❌ Not started | Frontend Developer |
| Dispute resolution endpoint | ❌ Not started | Backend Architect |

---

*Source of truth: `contracts/contracts/Escrow.sol`, `backend/src/services/escrow-chain.js`, `backend/src/routes/payments.js`, `docs/blockchain/halala-accounting-model.md`*
*Last updated: 2026-03-24 — DCP-836*
