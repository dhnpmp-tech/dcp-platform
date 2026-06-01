# Provider Staking Design

> **Type:** Architectural Decision Record (ADR)
> **Status:** Spec — implementation-ready when escrow wallet is funded
> **Purpose:** Provider economic alignment, Sybil resistance, and SLA enforcement
> **DCP-853** | Blockchain Engineer | 2026-03-24

---

## Executive Summary

Provider staking requires each active GPU provider to lock a USDC stake on-chain before receiving jobs. The stake:

- **Deters Sybil registrations** — real capital cost per active slot
- **Creates slashing risk** — bad behaviour costs money, not just reputation
- **Enforces graceful exits** — unbonding period prevents mid-job abandonments
- **Enables stake-weighted routing** — higher stake → higher priority job allocation

This is a Phase 2 mechanism. Phase 1 runs without mandatory staking to accelerate provider onboarding.

---

## 1. Competitive Landscape

### Akash Network

Akash uses a delegated-proof-of-stake model where providers must bond AKT tokens with validators. Key characteristics:
- **Minimum bond:** ~1,000 AKT (≈ $400 at typical prices) — prohibitive for small providers
- **Unbonding period:** 21 days — very long, discourages small operators
- **Slashing:** Applied for validator downtime, not provider-level SLA failures
- **Weakness:** Slashing targets validator behaviour, not compute delivery quality. A provider can ghost a job without on-chain consequences.

**DCP improvement:** Stake directly tied to job-level SLA, not block-production. Slash evidence is a job ID + oracle signature, not validator consensus. Unbonding is 7 days (3× faster than Akash).

### io.net

io.net uses a reputation scoring system rather than token staking:
- **No on-chain stake** — providers can join and leave freely
- **Reputation score** (0–100) based on uptime, job success rate, latency
- **Deactivation threshold:** Score < 50 disqualifies provider from job routing
- **Weakness:** No economic cost for bad behaviour — providers can reset reputation by re-registering. No renter compensation for failed jobs.

**DCP improvement:** Economic stake means providers lose real money on SLA failures, not just score points. Slashed funds partially compensate affected renters (30% of slash amount).

### Design Decision

DCP uses a **hybrid model**: reputation scoring (Phase 1, already implemented) **plus** USDC staking (Phase 2). This mirrors io.net's low-friction onboarding while adding Akash-style economic guarantees once scale warrants it.

---

## 2. Stake Parameters by GPU Tier

Stake amounts are denominated in **USDC** (same token as escrow — no new token required). ETH equivalent shown for reference at $3,000/ETH.

| GPU Tier   | Example GPUs              | Minimum Stake | ETH Equivalent | Monthly Revenue @ 50% util | Stake as % of Revenue |
|------------|---------------------------|---------------|----------------|-----------------------------|-----------------------|
| Entry      | RTX 3080, RTX 3090        | 10 USDC       | ~0.0033 ETH    | ~$60/mo                     | ~17%                  |
| Standard   | RTX 4080, RTX 4090        | 25 USDC       | ~0.0083 ETH    | ~$96/mo                     | ~26%                  |
| High       | A100 40GB, L40S           | 100 USDC      | ~0.033 ETH     | ~$432/mo                    | ~23%                  |
| Enterprise | H100 80GB, H200 141GB     | 250 USDC      | ~0.083 ETH     | ~$1,080/mo                  | ~23%                  |

**Rationale:**
- Stake is calibrated to 15–25% of monthly revenue at 50% utilization
- For the primary onboarding target (Saudi internet cafe with RTX 4090): 25 USDC ≈ SAR 93.75 ≈ ~3 days earnings
- H100 providers risk 250 USDC but earn $1,080/mo — stake is recouped in under 7 days of uptime
- Entry tier uses 10 USDC to remain accessible to the university/gaming-cafe segment

### Stake Multipliers (Routing Priority)

Providers may voluntarily stake above minimum to earn routing priority:

| Stake Multiple | Routing Weight Bonus | Display Badge |
|---------------|---------------------|---------------|
| 1× (minimum)  | Baseline            | None          |
| 2×            | +10%                | Bronze        |
| 5×            | +25%                | Silver        |
| 10×           | +50% + featured listing | Gold      |

Job routing order: `stake_weight * gpu_score * uptime_score` descending.

---

## 3. Slashing Conditions

Slashing is triggered by documented on-chain evidence. All slash events require an oracle signature.

| Condition | Slash Amount | Evidence Required | Renter Compensation |
|-----------|-------------|-------------------|---------------------|
| Job ghosting — accepted, timed out before first token | 5% of stake | Escrow timeout + oracle timestamp | 30% of slash |
| Repeated job failure — >3 consecutive fails in 24h | 10% of stake | Oracle failure log with job IDs | 30% of slash |
| VRAM misrepresentation — claimed >20% above actual | 20% of stake | On-chain benchmark proof | 30% of slash |
| Fraudulent token reporting — metering discrepancy | 50% of stake | Metering audit trail | 30% of slash |
| Stake falls below minimum after partial slash | Full deactivation | Automatic on-chain check | N/A |

**Slashed funds distribution:**
- 50% → burned (deflationary)
- 30% → affected renter (compensation)
- 20% → DCP treasury (dispute resolution cost)

**Phase 1 note:** Slashing is admin-triggered (DC1 oracle signs). Fully autonomous slashing via ZK proofs is Phase 3 scope.

---

## 4. Unbonding Period

| State | Duration | Condition |
|-------|----------|-----------|
| Normal unstake request | 7 days | No active jobs |
| Active job lock | Blocked until jobs complete | Cannot request unstake mid-job |
| Grace period notice | 48h to active renters | Provider going offline |
| Emergency exit (hardware failure, verified) | 24h (owner override) | DC1 admin signature required |

**Why 7 days:**
- Covers the 72h renter dispute window
- Covers backend settlement batch processing (weekly cycles)
- Sufficient buffer for manual review of edge cases
- 3× faster than Akash (21 days), same as most DeFi staking protocols

---

## 5. Smart Contract: `ProviderStaking.sol`

Separate from `Escrow.sol` to isolate concerns. Escrow handles job payments; staking handles deposits and slashing.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IProviderStaking {
    struct StakeInfo {
        address owner;         // wallet that staked
        uint256 amount;        // current stake in USDC (6 decimals)
        uint256 lockedUntil;   // unstake cooldown expiry (0 = not unstaking)
        bool isActive;         // eligible to receive jobs
        uint256 stakedAt;      // timestamp of most recent stake
        uint8 tier;            // 0=Entry, 1=Standard, 2=High, 3=Enterprise
    }

    /// @notice Deposit USDC stake to activate provider slot
    /// @param providerId keccak256(providerEmail) from DCP registry
    /// @param amount USDC amount (6 decimals)
    function stake(bytes32 providerId, uint256 amount) external;

    /// @notice Begin 7-day unbonding. Reverts if jobs are in_progress.
    function requestUnstake(bytes32 providerId) external;

    /// @notice Withdraw stake after cooldown expires.
    function finalizeUnstake(bytes32 providerId) external;

    /// @notice Slash a provider. Requires oracle signature over (providerId, amount, reason).
    function slash(
        bytes32 providerId,
        uint256 amount,
        address renterRecipient,
        bytes calldata oracleSignature
    ) external;

    /// @notice Read stake info for job routing.
    function getStakeInfo(bytes32 providerId) external view returns (StakeInfo memory);

    /// @notice Minimum stake for a given tier (0–3).
    function minimumStake(uint8 tier) external view returns (uint256);
}
```

**Design decisions:**
- Staking token: USDC on Base Sepolia (same as escrow — no new token)
- `providerId` = `keccak256(abi.encodePacked(providerEmail))` — no EVM address required at registration
- Provider must set an EVM wallet address once before staking (one-time onboarding step)
- Contract is upgradeable via BeaconProxy — allows parameter changes in Phase 2 without migration
- Oracle key is the same key used in `Escrow.sol` — already trusted for payment operations

---

## 6. Backend Integration

When staking is live, the following changes are required:

### Database

```sql
-- Add to providers table
ALTER TABLE providers ADD COLUMN stake_status TEXT DEFAULT 'none';
-- Values: 'none' | 'pending' | 'active' | 'slashed' | 'withdrawn'

ALTER TABLE providers ADD COLUMN stake_amount_usdc REAL DEFAULT 0;
ALTER TABLE providers ADD COLUMN stake_tier INTEGER DEFAULT 0;
ALTER TABLE providers ADD COLUMN evm_wallet_address TEXT;
ALTER TABLE providers ADD COLUMN unstake_requested_at DATETIME;
```

### Job Routing

`GET /api/jobs/queue` — filter: `stake_status = 'active'` (Phase 2+).
`POST /api/jobs/assign` — weight: `stake_amount * gpu_score * uptime_score`.

### Escrow Bridge

`escrow-chain` calls `getStakeInfo(providerId)` before accepting a `depositAndLock`. Providers with `isActive = false` are rejected before any renter funds are locked.

### Settlement Service

After each job failure, settlement service triggers a slash eligibility check. Slash is executed if criteria are met and oracle signature is available.

---

## 7. Provider UX

For the primary onboarding target (Saudi internet cafe, RTX 4090):

| Field | Value |
|-------|-------|
| Required stake | 25 USDC ≈ SAR 93.75 |
| Time to recoup from earnings | ~3 days at 50% utilization |
| Presented as | "Activate your GPU — deposit $25 to start earning" |
| Withdrawal framing | "Your stake is your earnings buffer — withdraw anytime after 7 days" |

The stake is positioned as a **refundable deposit**, not a fee.

---

## 8. Implementation Roadmap

| Phase | Milestone | When |
|-------|-----------|------|
| Phase 1 (current) | No mandatory staking — free registration, reputation-only routing | Live |
| Phase 2 | `ProviderStaking.sol` deployed; staking optional but routing-incentivised | Post-mainnet |
| Phase 2.5 | Staking mandatory for new registrations; existing providers grandfathered 30 days | Q3 2026 |
| Phase 3 | On-chain dispute resolution; slash challenges via ZK proofs | 2027 |

---

## 9. Total Value Locked (TVL) Projections

At Phase 2 target scale (1,000 active providers):

| Tier | Count | Stake/Provider | Subtotal |
|------|-------|---------------|---------|
| Entry (RTX 3090) | 400 | $10 | $4,000 |
| Standard (RTX 4090) | 400 | $25 | $10,000 |
| High (A100/L40S) | 150 | $100 | $15,000 |
| Enterprise (H100/H200) | 50 | $250 | $12,500 |
| **Total TVL** | **1,000** | | **$41,500** |

Modest TVL; primary value is economic deterrence, not DeFi yield.

---

*Related: `Escrow.sol`, `docs/escrow-architecture.md`, `docs/pricing-guide.md`*
*Last updated: 2026-03-24 — DCP-853*
