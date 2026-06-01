# DCP Provider Staking Design

**Status:** Design document
**Contract:** `contracts/contracts/ProviderStake.sol` (ETH-native, admin-slash)
**Related:** `docs/escrow-architecture.md`, `docs/pricing-guide.md`

---

## Overview

Provider staking creates economic accountability: providers lock collateral that can be slashed if they fail SLA commitments. This protects renters, reduces oracle fraud risk, and makes DCP a credible marketplace with real-money guarantees.

The contract (`ProviderStake.sol`) is already written and ready for testnet deployment. This document covers:
1. Recommended stake amounts and rationale
2. Slash conditions
3. Phase 1 optimistic job verification design (no ZK proofs needed)

---

## Part 1 — Provider Staking Economics

### Provider Revenue Context (from Pricing Guide)

| Provider Type | GPU | Monthly Revenue (70% util) | Monthly Profit (est.) |
|---|---|---|---|
| Internet cafe | RTX 4090 | $2,140–$2,980 | $1,200–$1,800 |
| Small server farm | RTX 4080 | $1,580–$2,100 | $900–$1,300 |
| University lab | H100 80GB | $8,000–$12,000 | $5,000–$8,000 |

*DCP takes 25% platform fee; provider receives 75% of job revenue.*

### Stake Amount Recommendation

**Phase 1 (Base Sepolia testnet): No real stake required.** Testnet ETH has no monetary value. Providers deposit a nominal amount (e.g., 0.01 testnet ETH) to register as "staked" on-chain.

**Phase 2 (Base mainnet — when launched):**

The staking amount should satisfy two goals:
1. High enough to deter deliberate misbehavior (job fraud, silent abandonment)
2. Low enough to not block small operators (internet cafe owners, university labs)

**Recommended mainnet stake: 0.1 ETH (~$300–$350 at current prices)**

Rationale:
- An internet cafe running one RTX 4090 earns ~$1,200–$1,800/mo profit
- A 0.1 ETH stake represents ~3 weeks of profit for the smallest operators
- Losing this stake due to misbehavior costs more than the gain from cheating on 1–2 jobs
- This is not a barrier: a provider earning their first $500 in revenue can afford to stake

**Minimum stake in current contract:** `MIN_STAKE = 100 ether` (100 tokens in 18-decimal units). For mainnet ETH staking this needs to be recalibrated to `0.1 ether` (see note below).

> **Contract note:** `ProviderStake.sol` currently uses `100 ether` as `MIN_STAKE`. This assumes a DCP token with 18 decimals where 100 tokens ≈ $300 at launch. For pure ETH staking, redeploy with `MIN_STAKE = 0.1 ether`. The contract logic is otherwise identical.

### Lock Period

Current contract: `LOCK_PERIOD = 7 days`.

This is appropriate. A 7-day lock:
- Gives renters time to dispute completed jobs before a provider can exit
- Is short enough that providers don't feel capital is permanently tied up
- Matches the dispute window in the optimistic verification design (see Part 3)

**Recommendation: keep 7-day lock period for mainnet.**

### Staking Token Options

| Option | Pros | Cons | Recommendation |
|---|---|---|---|
| Native ETH on Base L2 | No token needed, simplest UX, liquid | Subject to ETH price volatility | **Phase 2 default** |
| USDC on Base L2 | Stable value, predictable risk | Requires ERC-20 variant of contract | Consider for Phase 3 |
| DCP native token (future) | Aligns incentives, creates token demand | Token doesn't exist yet | Phase 3+ |

**Decision: Use native ETH for Phase 2 mainnet.** It requires no additional token infrastructure and is the simplest path to launch. DCP token can be added in Phase 3 once tokenomics are finalized.

### Slash Conditions

| Condition | Severity | Slash Amount | Notes |
|---|---|---|---|
| Job silent abandonment (provider disappears mid-job) | High | 10% of locked stake | Triggered after job timeout + renter dispute |
| Repeated SLA breach (>3 in 30 days) | Medium | 5% per incident | Tracked off-chain; on-chain slash by admin |
| Fraudulent completion claim (oracle rejects proof) | Critical | 50% of stake | Rare; requires oracle-signed evidence |
| Deliberate job cancellation without notice | Low | 2% of stake | Self-reported or renter-reported |

**Full slash (100%)** is reserved for provably malicious behavior (e.g., submitting forged output, colluding to drain escrow). This requires founder-level approval before calling `slash()`.

Slashed funds accumulate in the `ProviderStake` contract. The owner (DCP admin) can call `withdrawSlashed()` to move them to a renter compensation fund or treasury.

### Activation Requirement

A provider must have an active stake to receive job assignments. The backend should check:

```
GET /api/providers/{providerId}/stake-status
→ { "staked": true, "amount": "0.1", "token": "ETH", "lockedUntil": "2026-04-01T00:00:00Z" }
```

If `staked: false`, the provider dashboard shows: *"Stake 0.1 ETH to activate and receive jobs."*

---

## Part 2 — Job Verification Design (Phase 1: Optimistic)

### Why Not ZK Proofs?

ZK proof generation for arbitrary GPU workloads (LLM inference, image generation) is:
- Computationally expensive (10–100x job runtime overhead)
- Not yet standardized for vLLM/PyTorch workloads
- Not needed for Phase 1 with low fraud risk

**Phase 1 uses an optimistic model with a dispute window.** This is the same approach used by Optimism and Arbitrum for rollup state. It works because honest behavior is the economically dominant strategy when providers have staked collateral.

### Phase 1 Optimistic Completion Flow

```
1. Renter submits job → backend creates job record → escrow locked on-chain

2. Provider runs job → sends result + metadata to backend oracle:
   {
     "jobId": "uuid",
     "tokenCount": 1234,        // actual tokens generated
     "durationMs": 5600,        // wall-clock time
     "outputHash": "sha256...", // SHA-256 of raw output
     "providerAddress": "0x..."
   }

3. Oracle backend validates:
   - Token count is plausible (within 20% of estimate)
   - Duration is plausible (≥ minTime for model size)
   - Provider address matches registered wallet

4. If valid → oracle signs EIP-712 Claim proof → provider submits claimLock()
   → Escrow releases: 75% to provider, 25% to DCP

5. DISPUTE WINDOW: 24 hours after claim
   → Renter can flag job as disputed (off-chain complaint)
   → DCP reviews output hash against renter's expected output
   → If fraud confirmed: slash provider stake, refund renter from slashed funds
```

### Completion Proof Format

The provider sends a signed attestation to the oracle endpoint:

```json
{
  "jobId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "providerAddress": "0xAbCd...",
  "tokenCount": 1234,
  "durationMs": 5600,
  "outputHash": "sha256:abc123...",
  "timestamp": 1711323600,
  "signature": "0x<provider-ecdsa-sig>"
}
```

The oracle verifies the signature against the provider's registered wallet, validates plausibility bounds, then signs the on-chain `Claim` struct:

```
Claim(bytes32 jobId, address provider, uint256 amount)
```

This is what gets submitted to `claimLock()` in `Escrow.sol`.

### What the Output Hash Protects Against

The `outputHash` is a SHA-256 of the raw model output (text bytes for LLM, PNG bytes for image gen). It enables:

- **Post-hoc verification:** DCP can re-run the job on reference hardware and compare hashes
- **Dispute resolution:** If hashes match → provider is honest; if they don't → slash
- **Audit trail:** Output hashes stored in job DB for 90 days

For image generation (SDXL), the hash is of the raw PNG bytes before any compression. For LLM inference, it's the hash of the full decoded text output.

### Dispute Resolution Timeline

```
T+0     Job completed, oracle proof signed, escrow claimed
T+24h   Dispute window closes (no action = job finalized)
T+1h    Renter submits dispute (within window)
T+25h   DCP reviews: re-run or compare output hash
T+48h   Decision: slash + refund OR dispute rejected
T+55h   Slashed funds transferred to renter (if applicable)
```

Disputes require manual DCP review in Phase 1. Phase 2 will automate this with re-execution on multiple providers and majority-vote agreement.

### Why This Works Without ZK in Phase 1

1. **Stake deters fraud.** A provider risks losing 0.1 ETH (~$300) to steal a job worth $5–$50. The expected value of fraud is negative.

2. **Output hash enables audits.** DCP can spot-check any job by re-running on known-good hardware. Even if 1% of jobs are fraudulent, random audits catch them.

3. **Oracle controls payment release.** A provider cannot claim escrow without an oracle-signed proof. The oracle only signs after plausibility validation.

4. **Reputation compounds honesty.** High-reputation providers get more job assignments. Fraud destroys reputation permanently (on-chain slash is public).

---

## Part 3 — Phase 2+ Roadmap (Beyond Scope of Phase 1)

| Upgrade | When | Description |
|---|---|---|
| USDC staking variant | Phase 2 | Stable-value collateral, requires ERC-20 contract update |
| Automated dispute re-execution | Phase 2 | Run job on 3 providers; 2-of-3 majority wins |
| Reputation oracle | Phase 2 | On-chain provider score based on historical slash rate |
| DCP token staking | Phase 3 | Native token with delegation and governance |
| ZK proof for inference | Phase 3+ | ZKML verification when tooling matures |
| Slashing DAO | Phase 3+ | Community governance for slash decisions |

---

## Contract Deployment Reference

`ProviderStake.sol` deployment (when ready):

```bash
cd /home/node/dc1-platform/contracts
# Deploy separately — no deploy script exists yet for ProviderStake
# Use hardhat console or add a deploy-stake.js script

npx hardhat run scripts/deploy-stake.js --network base-sepolia
```

> **Note:** A `deploy-stake.js` script does not yet exist. The Blockchain Engineer should create it before Phase 2. For Phase 1 (Sepolia testnet), `ProviderStake.sol` is deployed manually via hardhat console or a one-off script.

---

## Summary of Recommendations

| Decision | Recommendation |
|---|---|
| Phase 1 stake amount | None (testnet ETH, symbolic) |
| Phase 2 mainnet stake | 0.1 ETH (~$300) |
| Staking token | Native ETH on Base L2 |
| Lock period | 7 days (keep as-is) |
| Slash for job abandonment | 10% of stake |
| Slash for fraud | 50–100% of stake (case by case) |
| Job verification (Phase 1) | Optimistic with 24h dispute window + output hash |
| ZK proofs | Phase 3+ (not needed now) |
| Dispute resolution | Manual DCP review in Phase 1 |

---

*Document owner: Blockchain Engineer | Last updated: 2026-03-25 | Ref: DCP-953*
