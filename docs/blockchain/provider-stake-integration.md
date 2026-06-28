# Provider Stake Integration Spec

> ⚠️ **STATUS — ON-CHAIN SETTLEMENT IS BUILT BUT DORMANT (not live as of 2026-06-28).**
> DCP's **live** settlement runs on **fiat SAR via Moyasar** (PCI-DSS processor); provider earnings settle in fiat.
> The smart-contract escrow / staking / on-chain-verification layer described in this document — Escrow, ProviderStake,
> JobAttestation; ERC-20 on Base L2 — is deployed only to **Base Sepolia testnet**, holds **no live funds**, and is
> pending third-party audit + mainnet. It is a planned **future agent-to-agent settlement rail**. Treat every
> "smart-contract escrow / non-custodial / blockchain-verified" statement below as **design intent, not current
> production behavior**. See `docs/blockchain/` for the full (dormant) design set.


> **Type:** Integration Specification
> **Status:** Implementation-ready
> **Purpose:** Guide backend and frontend integration of `ProviderStake.sol` into DCP job-routing and provider-activation
> **DCP-913** | Blockchain Engineer | 2026-03-24

---

## 1. Overview

`ProviderStake.sol` is deployed and audited (DCP-899, DCP-901). This document specifies how the backend, frontend, and escrow bridge integrate with it for Phase 2 staking activation.

**Current contract behaviour:**
- Stake token: native ETH — `stake()` is `payable`
- `MIN_STAKE`: 100 ether (100 DCP tokens at 18 decimals)
- `LOCK_PERIOD`: 7 days before `unstake()` is callable
- `slash(provider, amount, reason)`: `onlyOwner`
- `getStake(provider)`: returns `{ amount, stakedAt, isActive }`

> **Note:** Deployed contract uses ETH. Phase 2 mainnet will use a USDC version (per `docs/blockchain/provider-staking-design.md`). USDC migration notes are inline.

---

## 2. Minimum Stake by GPU Tier

Tier-differentiated minimums are enforced off-chain by the backend job router.

| GPU Tier   | Example GPUs          | Backend Min | ETH @ $3,200 | SAR    |
|------------|-----------------------|------------|--------------|--------|
| Entry      | RTX 3080, RTX 3090    | 0.003 ETH  | ~$9.60       | ~SAR 36 |
| Standard   | RTX 4090, RTX 4080    | 0.008 ETH  | ~$25.60      | ~SAR 96 |
| High       | A100 40GB, L40S       | 0.031 ETH  | ~$99.20      | ~SAR 372 |
| Enterprise | H100 80GB, H200 141GB | 0.078 ETH  | ~$249.60     | ~SAR 936 |

These map to 10/25/100/250 USDC from the staking design doc at $3,200/ETH.

---

## 3. Staking Flow

### 3.1 Prerequisites

1. Registered DCP account
2. EVM wallet linked (`providers.evm_wallet_address`)
3. Wallet balance: tier minimum + ~0.001 ETH gas

### 3.2 Call Sequence

```
Provider Wallet
    └── ProviderStake.stake{ value: tierMin }()
            ├── validates: msg.value >= MIN_STAKE
            ├── validates: !stakes[msg.sender].isActive
            ├── writes: stakes[msg.sender] = {amount, stakedAt, isActive:true}
            └── emits: Staked(provider, amount)

Backend stakeEventListener.js
    └── on Staked event:
            └── UPDATE providers SET stake_status='active',
                    stake_amount_wei=amount, stake_tx_hash=txHash
                WHERE LOWER(evm_wallet_address) = LOWER(provider)
```

### 3.3 USDC Migration (Phase 2 mainnet)

```js
await usdcContract.approve(providerStakeAddress, stakeAmountUsdc);
await providerStakeContract.stake(providerId, stakeAmountUsdc);
```

---

## 4. Slash Conditions

`slash()` is `onlyOwner` (admin-triggered, Phase 1).

| Condition | Slash % | Evidence | Renter Comp |
|-----------|---------|----------|-------------|
| Job ghosting — timed out before first token | 5% | Escrow timeout + oracle ts | 30% |
| Repeated failure — >3 fails in 24h | 10% | Oracle failure log | 30% |
| VRAM misrepresentation — >20% claimed above actual | 20% | Benchmark proof | 30% |
| Fraudulent token reporting — >5% discrepancy | 50% | Metering audit trail | 30% |

**Slashed funds:** 50% burned, 30% renter compensation, 20% DCP treasury.

---

## 5. Unstake Cooldown

| State | Duration | Notes |
|-------|----------|-------|
| Normal | 7 days from `stakedAt` | Provider calls `unstake(amount)` on-chain |
| Active job lock | Blocked | Backend rejects API if jobs running |
| Partial | Allowed | If remaining < tier min → offline |

---

## 6. Backend Integration

### 6.1 Database Schema (migration: 005_provider_staking.sql)

```sql
ALTER TABLE providers ADD COLUMN stake_status TEXT DEFAULT 'none';
-- 'none' | 'active' | 'slashed' | 'insufficient' | 'withdrawn'
ALTER TABLE providers ADD COLUMN stake_amount_wei TEXT DEFAULT '0';
ALTER TABLE providers ADD COLUMN stake_tier INTEGER DEFAULT 0;
ALTER TABLE providers ADD COLUMN evm_wallet_address TEXT;
ALTER TABLE providers ADD COLUMN stake_tx_hash TEXT;
ALTER TABLE providers ADD COLUMN unstake_requested_at DATETIME;
```

### 6.2 Event Listener

```js
providerStakeContract.on('Staked', async (provider, amount, event) => {
  await db.run(
    `UPDATE providers SET stake_status='active', stake_amount_wei=?, stake_tx_hash=?
     WHERE LOWER(evm_wallet_address)=LOWER(?)`,
    [amount.toString(), event.transactionHash, provider]
  );
});

providerStakeContract.on('Slashed', async (provider, amount, reason, event) => {
  const stake = await providerStakeContract.getStake(provider);
  const tierMin = await getProviderTierMin(provider);
  const status = stake.isActive && stake.amount >= tierMin ? 'active' : 'insufficient';
  await db.run(
    `UPDATE providers SET stake_status=?, stake_amount_wei=? WHERE LOWER(evm_wallet_address)=LOWER(?)`,
    [status, stake.amount.toString(), provider]
  );
});

providerStakeContract.on('Unstaked', async (provider, amount, event) => {
  const stake = await providerStakeContract.getStake(provider);
  await db.run(
    `UPDATE providers SET stake_status=?, stake_amount_wei=? WHERE LOWER(evm_wallet_address)=LOWER(?)`,
    [stake.isActive ? 'active' : 'withdrawn', stake.amount.toString(), provider]
  );
});
```

### 6.3 Escrow Bridge Validation

```js
async function validateProviderStake(walletAddress, gpuTier) {
  if (!process.env.STAKING_REQUIRED) return true;
  const stake = await providerStakeContract.getStake(walletAddress);
  return stake.isActive && BigInt(stake.amount) >= TIER_MIN_STAKE[gpuTier];
}
```

---

## 7. Frontend Stake Widget

Full spec in `docs/ux/provider-onboarding-wizard-spec.md` (Step 3B). Steps:
1. Connect wallet (MetaMask / WalletConnect via wagmi)
2. Show tier minimum from `GET /api/providers/:id/stake-info`
3. Send `stake({ value: tierMin })` transaction
4. Poll `GET /api/providers/:id/stake-status` until `'active'`
5. Advance to Step 4 (Model Pre-fetch)

---

## 8. Contract Addresses

| Network | Contract | Address |
|---------|----------|---------|
| Base Sepolia | ProviderStake.sol | TBD — pending DCP-909 |
| Base Mainnet | ProviderStake.sol | TBD — Phase 2 |

---

## 9. Phase Activation

| Phase | Requirement | Flag |
|-------|-------------|------|
| Phase 1 | Optional (reputation routing) | `STAKING_REQUIRED=false` |
| Phase 2 | Optional, routing-incentivised | stake multipliers live |
| Phase 2.5 | Mandatory for new registrations | `STAKING_REQUIRED=true` |

---

*Related: `contracts/contracts/ProviderStake.sol`, `docs/blockchain/provider-staking-design.md`*
*DCP-913 | 2026-03-24*
