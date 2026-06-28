# DCP Token Economics

> ⚠️ **STATUS — ON-CHAIN SETTLEMENT IS BUILT BUT DORMANT (not live as of 2026-06-28).**
> DCP's **live** settlement runs on **fiat SAR via Moyasar** (PCI-DSS processor); provider earnings settle in fiat.
> The smart-contract escrow / staking / on-chain-verification layer described in this document — Escrow, ProviderStake,
> JobAttestation; ERC-20 on Base L2 — is deployed only to **Base Sepolia testnet**, holds **no live funds**, and is
> pending third-party audit + mainnet. It is a planned **future agent-to-agent settlement rail**. Treat every
> "smart-contract escrow / non-custodial / blockchain-verified" statement below as **design intent, not current
> production behavior**. See `docs/blockchain/` for the full (dormant) design set.


**Version:** 0.1 — Seed Round Draft
**Date:** 2026-03-24
**Author:** Blockchain Engineer (DCP-862)
**Status:** Draft — for investor deck

---

## 1. Overview

The DCP token is the native utility and governance token of the DC1 Decentralized Compute Platform — Saudi Arabia's GPU compute marketplace. It aligns the incentives of providers (GPU owners), renters (AI workload operators), and investors around a common flywheel: more usage → more fees → more token utility → more providers and renters.

DCP is a utility token. It does **not** represent equity, profit share, or any financial instrument. It is used within the DC1 platform for provider staking, governance participation, fee discounts, and ecosystem rewards.

---

## 2. Token Parameters

| Parameter       | Value                          |
|-----------------|-------------------------------|
| Token name      | DCP Token                     |
| Symbol          | DCP                           |
| Network         | Base L2 (Ethereum Layer 2)    |
| Standard        | ERC-20                        |
| Total supply    | 1,000,000,000 DCP (1 billion) |
| Decimals        | 18                            |
| Initial price   | TBD at TGE                    |

Base L2 is chosen for low gas fees (<$0.01/tx), Ethereum security, and alignment with the existing escrow infrastructure already deployed on Base Sepolia.

---

## 3. Token Distribution

| Allocation           | %   | Amount (DCP)  | Notes                                         |
|----------------------|-----|---------------|-----------------------------------------------|
| Ecosystem & rewards  | 30% | 300,000,000   | Provider rewards, renter incentives, grants   |
| Team & advisors      | 18% | 180,000,000   | 4-year vest, 1-year cliff                     |
| Treasury             | 17% | 170,000,000   | Protocol reserves, buybacks, emergency fund   |
| Investors (seed+A)   | 15% | 150,000,000   | 2-year vest, 6-month cliff                    |
| Liquidity            | 10% | 100,000,000   | DEX liquidity at TGE (Uniswap/Aerodrome Base) |
| Public sale          | 5%  | 50,000,000    | Fair launch / IEO                             |
| Community & DAO      | 5%  | 50,000,000    | Governance participants, testnet contributors |

**Total: 100% / 1,000,000,000 DCP**

---

## 4. Vesting Schedule

### Team & Advisors (18%)
- Cliff: 12 months post-TGE
- Vest: Monthly linear over 48 months
- Purpose: Long-term alignment with platform success

### Seed Investors (15%)
- Cliff: 6 months post-TGE
- Vest: Monthly linear over 24 months
- Note: Aligned with the recommended seed terms ($2M–$3M raise at $13.3M pre-money midpoint)

### Treasury (17%)
- No cliff. Governed by DAO after 12 months; CEO multisig before then.
- Used for: provider acquisition incentives, liquidity backstop, emergency protocol repairs

### Ecosystem Rewards (30%)
- Unlocked progressively via emission schedule (see §6)
- No cliff — rewarded based on real platform activity

---

## 5. Token Utility

### 5.1 Provider Staking
Providers must stake DCP to participate in the marketplace. Staking signals skin-in-the-game and is slashable on provable uptime violations.

| Provider Tier | Minimum Stake | GPU Class                  |
|---------------|---------------|----------------------------|
| Tier C        | 1,000 DCP     | RTX 4080/4090 — 16–24 GB  |
| Tier B        | 5,000 DCP     | L40S/A100 — 48 GB         |
| Tier A        | 20,000 DCP    | H100/H200 — 80 GB+        |

Slashing: 5% of staked DCP is burned for uptime breaches >4 hours on active jobs. Graduated penalties for repeated violations (10%, 25%, full exclusion).

### 5.2 Governance Voting
DCP holders can vote on:
- Platform fee rate changes (currently 15% blended)
- Emission schedule adjustments
- Approved GPU model whitelist
- Treasury spending above $100K USD equivalent
- Token burn percentage adjustments

Voting weight: 1 DCP = 1 vote. Snapshot-style off-chain voting with on-chain execution via a timelock multisig (Base L2).

### 5.3 Renter Fee Discounts
Renters who pay compute fees in DCP receive discounts on platform fees:

| DCP Balance held | Platform fee discount |
|-------------------|-----------------------|
| 0 DCP             | 0% (default 15% fee)  |
| 500 DCP           | 2% off                |
| 2,500 DCP         | 5% off                |
| 10,000 DCP        | 8% off                |

This creates organic buy pressure from renters scaling their usage.

### 5.4 Priority Job Queue
Renters holding ≥500 DCP get priority scheduling during capacity-constrained periods. Jobs from DCP holders jump the standard FIFO queue.

### 5.5 Provider Rewards Boost
Providers staking above the minimum threshold for their tier receive a DCP rewards multiplier:

| Stake multiple  | Rewards multiplier |
|-----------------|--------------------|
| 1× minimum      | 1.0×               |
| 2× minimum      | 1.15×              |
| 5× minimum      | 1.30×              |

---

## 6. Emission Schedule

Ecosystem & rewards (300M DCP) are emitted over 8 years, front-weighted to bootstrap the provider network.

| Year | Annual emission (DCP) | Cumulative (DCP) | Notes                                  |
|------|----------------------|-----------------|----------------------------------------|
| 1    | 60,000,000           | 60M             | Provider acquisition push              |
| 2    | 50,000,000           | 110M            | Renter onboarding incentives           |
| 3    | 40,000,000           | 150M            | Growth phase                           |
| 4    | 35,000,000           | 185M            | Stabilisation                          |
| 5    | 25,000,000           | 210M            | Halving-style reduction                |
| 6    | 20,000,000           | 230M            | Mature network                         |
| 7    | 15,000,000           | 245M            | DAO-governed                           |
| 8    | 10,000,000           | 255M            | Tail emissions                         |
| 9+   | DAO vote             | Up to 300M      | Remaining 45M governed by DAO          |

Emissions are split: 70% to providers (based on GPU-hours delivered), 30% to renters (based on compute spend).

---

## 7. Burn Mechanism

**Quarterly burn: 10% of DC1 platform fee revenue** (the 15% platform take) is converted to DCP at market price and burned.

At the base-case projection of $250K MRR by end of 2026:
- Monthly platform fee revenue: $37,500 (15% of $250K)
- Quarterly burn budget: ~$11,250
- Annualised deflationary pressure: ~$45,000 in DCP burned/year

As platform revenue scales to $3M+ MRR (Year 3 base case), quarterly burns accelerate significantly, creating meaningful supply reduction.

Burn events are on-chain and publicly verifiable on Base L2.

---

## 8. Comparable Models

DCP token design draws from three proven GPU marketplace token models:

| Protocol       | Token | Key lesson for DCP                                     |
|----------------|-------|--------------------------------------------------------|
| **io.net**     | IO    | Staking for provider reputation; slashing builds trust |
| **Render**     | RNDR  | Fee-in-token model drives buy pressure from renters    |
| **Akash**      | AKT   | DAO governance of fee parameters; on-chain auditability |

DCP differentiates by: (1) SAR-denominated pricing (pegged fiat stability for providers), (2) PDPL compliance advantage as a regulatory moat vs. all three comparables, and (3) Arabic model infrastructure that no comparable offers.

---

## 9. Why DCP Token Creates Alignment

```
Renters pay in DCP → buy pressure
     ↓
Fee revenue → quarterly burns → supply reduction
     ↓
Token price appreciation → provider staking value increases
     ↓
More providers stake → better marketplace liquidity
     ↓
Better liquidity → more renters → more buy pressure
```

**Providers** benefit: staking earns booster rewards on top of SAR earnings. Token appreciation makes the staking requirement a value store, not a cost.

**Renters** benefit: holding DCP cuts platform fees 2–8%, paying back token cost at high compute volumes.

Token holders benefit when platform volume grows and protocol demand increases. The public pricing guide defines the rates used by the billing model.

---

## 10. Risk Factors

| Risk                        | Mitigation                                                        |
|-----------------------------|-------------------------------------------------------------------|
| Token classified as security | Legal opinion obtained pre-TGE; utility-only use cases; no dividends |
| Low liquidity at TGE         | 10% liquidity allocation + market maker agreements                |
| Provider sell pressure       | Vesting cliff + staking lockup + rewards multiplier disincentives |
| Regulatory (Saudi)           | CMA sandbox engagement; stablecoin-first (SAR) for actual payments |
| Smart contract exploit       | Audit by Certik or Trail of Bits pre-TGE; Base L2 battle-tested  |

---

## 11. Token Roadmap

| Milestone               | Target           | Description                                          |
|-------------------------|-----------------|------------------------------------------------------|
| Seed round closes       | Q2 2026         | Pre-TGE; investors receive SAFT (Simple Agreement for Future Tokens) |
| Testnet staking live    | Q3 2026         | Provider staking on Base Sepolia; governance testing |
| TGE (Token Generation Event) | Q4 2026   | DCP minted; DEX liquidity seeded; emissions begin   |
| DAO launch              | Q2 2027         | Governance transferred to token holders              |
| First quarterly burn    | Q1 2027         | Post-TGE once platform revenue threshold reached     |

---

## 12. References

- `backend/src/config/pricing.js` — pricing constants used by platform billing
- docs/blockchain/provider-staking-design.md — Staking contract specification
- contracts/ — Base Sepolia escrow implementation
- infra/config/arabic-portfolio.json — Model portfolio underpinning provider reward tiers
