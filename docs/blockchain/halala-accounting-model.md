# DCP Halala Accounting Model

> ⚠️ **STATUS — ON-CHAIN SETTLEMENT IS BUILT BUT DORMANT (not live as of 2026-06-28).**
> DCP's **live** settlement runs on **fiat SAR via Moyasar** (PCI-DSS processor); provider earnings settle in fiat.
> The smart-contract escrow / staking / on-chain-verification layer described in this document — Escrow, ProviderStake,
> JobAttestation; ERC-20 on Base L2 — is deployed only to **Base Sepolia testnet**, holds **no live funds**, and is
> pending third-party audit + mainnet. It is a planned **future agent-to-agent settlement rail**. Treat every
> "smart-contract escrow / non-custodial / blockchain-verified" statement below as **design intent, not current
> production behavior**. See `docs/blockchain/` for the full (dormant) design set.


> **Authoritative reference for billing arithmetic, platform fee split, and provider payout.**
> All internal financial values are integers in halala. 1 SAR = 100 halala. 1 USD = 3.75 SAR = 375 halala.

---

## 1. Currency Conventions

| Unit   | Definition                        | Example        |
|--------|-----------------------------------|----------------|
| Halala | Smallest indivisible unit         | ﹦ 0.01 SAR    |
| SAR    | Saudi Riyal = 100 halala          | ﹦ $0.267      |
| USD    | Reference currency for floor prices | SAR/USD = 3.75 |

All arithmetic in the billing pipeline (settlementService.js, jobs.js, vLLM metering) operates on **integer halala** to avoid floating-point rounding errors.

---

## 2. Billing Models

DCP uses two complementary billing modes depending on the job type.

### 2a. Time-Based Billing (Container Jobs)

Used for: `llm-inference`, `training`, `rendering`, `image_generation`, `vllm_serve`, `custom_container`.

```
gross_cost_halala = duration_seconds × rate_halala_per_second
rate_halala_per_second = rate_halala_per_minute / 60
```

**Rate table (settlementService.js / jobs.js `COST_RATES`):**

| Job Type          | Halala / min | Halala / sec | SAR / hr  | USD / hr (approx) |
|-------------------|--------------|--------------|-----------|-------------------|
| llm-inference     | 9            | 0.1500       | 0.54      | $0.144            |
| vllm_serve        | 9            | 0.1500       | 0.54      | $0.144            |
| rendering         | 10           | 0.1667       | 0.60      | $0.160            |
| image_generation  | 10           | 0.1667       | 0.60      | $0.160            |
| training          | 7            | 0.1167       | 0.42      | $0.112            |
| custom_container  | 7            | 0.1167       | 0.42      | $0.112            |
| default           | 6            | 0.1000       | 0.36      | $0.096            |

> **Note:** These rates represent the blended default tier. GPU-specific rates from `pricing.js` are used for template-based jobs when a `gpu_model` is known (see §5).

### 2b. Token-Based Billing (vLLM Serve Sessions)

Used for: live inference sessions tracked by the vLLM metering route.

```
gross_cost_halala = tokens_generated × token_rate_halala
```

**Rate table (cost_rates table, seeded in db.js):**

| Model                                      | token_rate_halala | Per 1K tokens (halala) |
|--------------------------------------------|-------------------|------------------------|
| `__default__`                              | 1                 | 1,000                  |
| `mistralai/Mistral-7B-Instruct-v0.2`       | 2                 | 2,000                  |
| `meta-llama/Meta-Llama-3-8B-Instruct`      | 3                 | 3,000                  |
| `microsoft/Phi-3-mini-4k-instruct`         | 1                 | 1,000                  |
| `google/gemma-2b-it`                       | 1                 | 1,000                  |
| `TinyLlama/TinyLlama-1.1B-Chat-v1.0`       | 1                 | 1,000                  |

---

## 3. Platform Fee Split

Applies to every completed job. Formula (settlementService.js `splitFee()`):

```
platform_fee_halala  = floor(gross_cost_halala × 0.15)
provider_payout_halala = gross_cost_halala − platform_fee_halala
```

Rounding rule: platform fee rounds **down**, provider gets the remainder. This ensures the sum never exceeds what was charged to the renter.

**Take rate: 15% blended** (source: platform pricing model). DCP is below Vast.ai (~20%) and in line with RunPod.

---

## 4. Worked Example — RTX 4090, 1,000 Tokens

**Assumptions:**
- GPU: RTX 4090, model: `meta-llama/Meta-Llama-3-8B-Instruct`
- Tokens generated: 1,000
- Inference speed: ~100 tokens/sec (typical for 8B models on RTX 4090)
- Billing mode: token-based (`token_rate_halala = 3`)

```
gross_cost_halala  = 1,000 tokens × 3 halala/token = 3,000 halala  =  30.00 SAR
platform_fee_halala  = floor(3,000 × 0.15)         =   450 halala  =   4.50 SAR
provider_payout_halala = 3,000 − 450               = 2,550 halala  =  25.50 SAR
```

**Same job billed by time (for comparison):**
- Duration: 1,000 tokens ÷ 100 tokens/sec = 10 seconds
- Rate: 9 halala/min ÷ 60 = 0.15 halala/sec
- `gross = 10 × 0.15 = 1.5 → rounded to 2 halala` (min 1 halala enforced)

> The token-rate model charges significantly more per request than the time-rate default because token rates reflect model-specific compute cost, not raw wall-clock time. Both billing paths apply the same 85/15 split.

---

## 5. GPU-Tier Pricing Reference

For template-based jobs where `gpu_model` is known, `pricing.js` provides USD floor prices. These drive the `cost_per_gpu_second_halala` field seeded into `gpu_pricing` table:

| GPU Model   | USD / hr | SAR / hr | Halala / hr | Halala / min | Halala / sec |
|-------------|----------|----------|-------------|--------------|--------------|
| RTX 4090    | $0.267   | 1.001    | 100.1       | 1.669        | 0.0278       |
| RTX 4080    | $0.178   | 0.668    | 66.8        | 1.113        | 0.0185       |
| H100        | $1.890   | 7.088    | 708.8       | 11.81        | 0.1968       |
| H200        | $2.450   | 9.188    | 918.8       | 15.31        | 0.2551       |
| A100        | $1.200   | 4.500    | 450.0       | 7.500        | 0.1250       |
| RTX 3090    | $0.134   | 0.503    | 50.3        | 0.838        | 0.0140       |

> Conversion: `halala/hr = usd_per_hr × 3.75 × 100` (×3.75 USD→SAR, ×100 SAR→halala)

---

## 6. Settlement Ledger Schema

Every completed job writes one row to `job_settlements` (idempotent):

```sql
job_id                 TEXT  -- unique per job
duration_seconds       INT   -- wall-clock duration
gpu_rate_per_second    REAL  -- rate used at settlement time
gross_amount_halala    INT   -- total charged to renter
platform_fee_halala    INT   -- 15% retained by DCP
provider_payout_halala INT   -- 85% credited to provider
status                 TEXT  -- completed | failed | refunded
settled_at             TEXT  -- ISO 8601 timestamp
```

Failed and refunded jobs write `gross_amount_halala = 0` and `platform_fee_halala = 0`.

---

## 7. Wallet Balance Lifecycle

```
Renter top-up → wallet_balance_halala increases
Job queued    → balance checked (pre-auth)
Job running   → balance debited at completion
Job complete  → job_settlements row written; provider earnings credited
Provider withdraw → provider.claimable_earnings_halala → withdrawal request
```

---

## 8. Invariants (Checked by Reconciliation Script)

1. `platform_fee + provider_payout = gross_cost` (no leakage)
2. `platform_fee = floor(gross_cost × 0.15)` for every completed row
3. Sum of `gross_amount_halala` for all `completed` jobs = total renter spend
4. Sum of `provider_payout_halala` = total distributed to providers
5. Sum of `platform_fee_halala` = total DCP revenue

See `scripts/platform-fee-reconciliation.mjs` for automated verification.

---

*Source of truth: `backend/src/services/settlementService.js`, `backend/src/config/pricing.js`, `backend/src/db.js`*
*Last updated: 2026-03-24 — DCP-811*
