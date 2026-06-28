# DCP Token Whitepaper

> ⚠️ **STATUS — ON-CHAIN SETTLEMENT IS BUILT BUT DORMANT (not live as of 2026-06-28).**
> DCP's **live** settlement runs on **fiat SAR via Moyasar** (PCI-DSS processor); provider earnings settle in fiat.
> The smart-contract escrow / staking / on-chain-verification layer described in this document — Escrow, ProviderStake,
> JobAttestation; ERC-20 on Base L2 — is deployed only to **Base Sepolia testnet**, holds **no live funds**, and is
> pending third-party audit + mainnet. It is a planned **future agent-to-agent settlement rail**. Treat every
> "smart-contract escrow / non-custodial / blockchain-verified" statement below as **design intent, not current
> production behavior**. See `docs/blockchain/` for the full (dormant) design set.

## Decentralized Compute Protocol — Native Network Token

> **Version 1.0 — March 2026**
> **Classification: Seed Round Investor Asset**
> **Status: Pre-Token Launch (Off-Chain Phase)**

---

## 1. Executive Summary

The global GPU cloud market stands at **USD 5.1B (2024)** and is projected to exceed **USD 45B by 2030**, driven by accelerating AI adoption, LLM proliferation, and enterprise compute demand. Despite this growth, 50,000–200,000 consumer and prosumer GPUs sit largely idle in Saudi Arabia alone — internet cafes, gaming centres, university labs, and dedicated racks — while global AI workloads pay $1.50–$32/hr to AWS, Azure, and Google Cloud.

DCP (Decentralized Compute Protocol) bridges this gap through structural energy arbitrage. Saudi industrial electricity costs **$0.048–0.053/kWh** — 3.5–6x cheaper than EU rates ($0.18–0.30/kWh). Same GPU hardware; dramatically lower operating cost. Providers earn **$145–$315/mo net** per RTX 4090 at 70% utilisation. Renters pay **33–51% less** than hyperscaler rates, with full PDPL compliance and sub-30ms latency for MENA workloads.

**The DCP token is the coordination layer for this two-sided marketplace.** It aligns provider incentives (staking, quality rewards), gives renters fee discounts, enables protocol governance, and creates a deflationary mechanism tied directly to platform revenue.

**This whitepaper is prepared for the DCP seed round: $2M–$3M at $8M–$20M pre-money valuation (midpoint $13.3M), targeting 29x MOIC base case for investors.**

---

## 2. Protocol Overview

### 2.1 The Marketplace Architecture

DCP operates a permissionless GPU compute marketplace with three principal actors:

| Actor | Role | Incentive |
|---|---|---|
| **Providers** | Contribute GPU compute capacity | Earn SAR + DCP rewards for jobs served |
| **Renters** | Submit inference / training jobs | Access GPUs at 33–51% below hyperscaler rates |
| **Protocol** | Matches supply/demand, escrows payment | Collects 15% platform fee; 5% burned quarterly |

**Job Lifecycle:**
1. Renter submits job with SAR (or DCP) payment deposited to on-chain escrow (Base L2)
2. Scheduler matches job to lowest-latency, highest-reputation provider
3. Provider executes workload; metering tracks per-token / per-second consumption
4. On job completion, escrow releases payment; provider receives SAR, protocol retains 15% fee
5. 5% of collected fees are burned as DCP quarterly

### 2.2 Why Decentralized Compute Needs a Native Token

Fiat-only marketplaces have three structural weaknesses:

1. **No provider skin-in-the-game.** Without staking, any GPU can register and defect during high-demand periods. Quality degrades as the network scales.
2. **No renter loyalty mechanism.** Renters have zero switching cost — they leave the moment a competitor offers 5% lower pricing.
3. **No governance alignment.** Protocol upgrades, new GPU tier approvals, and pricing floor changes become founder decisions rather than community decisions — a liability for institutional investors seeking decentralisation evidence.

The DCP token resolves all three:
- Staking creates **provider commitment** (stake at risk for misbehaviour)
- DCP payment discounts create **renter retention**
- On-chain governance creates **protocol legitimacy**

---

## 3. Token Utility

### 3.1 Provider Staking

Providers must stake DCP to join the network and maintain active status. Stake amount determines:

- **Job priority:** Higher stake = higher queue priority during demand spikes
- **Tier classification:** Minimum stakes define Tier A/B/C provider status
- **Reputation multiplier:** Stake × uptime score = effective provider weight in scheduler

**Slashing conditions:**
- Job abandonment during execution (50% slash of staked amount)
- Persistent sub-SLA performance (10% slash, progressive)
- Fraudulent metering reports (100% slash + ban)

Slashed tokens flow to the protocol treasury (DAO-controlled multi-sig).

**Estimated minimum stakes by provider tier:**

| Tier | GPU Examples | Min Stake | Rationale |
|---|---|---|---|
| Tier A | RTX 4090, H100, H200 | 10,000 DCP | High-value workloads, highest accountability |
| Tier B | RTX 4080, A100, L40S | 5,000 DCP | Mid-tier inference |
| Tier C | RTX 3080/3090 | 1,000 DCP | Entry-level, casual workloads |

### 3.2 Renter Fee Discounts

Renters who pay in DCP receive a **10% discount** on platform fees versus SAR payment:

| Payment Method | Platform Fee | Renter Net Cost |
|---|---|---|
| SAR (fiat) | 15% of job value | Baseline |
| DCP (token) | 13.5% effective (10% off fee) | 1.5% savings vs SAR |

This discount creates sustained buy-side pressure: renters who run recurring workloads are economically incentivised to hold DCP balances. At scale, this alone creates millions of dollars in annual DCP demand.

### 3.3 Governance

DCP token holders vote on:
- **Pricing floors** for each GPU tier (minimum hourly rate)
- **New GPU tier approvals** (adding RTX 5090, MI300, future hardware)
- **Protocol upgrade proposals** (smart contract migrations, fee structure changes)
- **Treasury allocations** (grants, research funding, partnership deals)

Voting weight is proportional to staked DCP (not raw holdings) — requiring voter skin-in-the-game. Minimum quorum: 10% of staked supply. Majority threshold: 51% for standard proposals, 67% for critical upgrades.

### 3.4 Burn Mechanism

**5% of all platform fees collected are burned quarterly** as DCP.

At base-case GMV projections:

| Year | Platform Revenue (15% take) | Quarterly Burn (5% of rev) | Annual Burn |
|---|---|---|---|
| 2026 | $29K–$360K | $363–$4,500 | $1,450–$18K |
| 2027 | $180K–$1.1M | $2,250–$13,750 | $9K–$55K |
| 2028 | $1.1M–$5.0M | $13,750–$62,500 | $55K–$250K |
| 2030 | $10.8M–$34.5M | $135K–$431K | $540K–$1.73M |

At $13.3M pre-money and projected 2030 revenue of $10.8M–$34.5M (base case), the burn mechanism creates meaningful deflationary pressure relative to a fixed 1B token supply.

---

## 4. Token Distribution

**Total Supply: 1,000,000,000 DCP (1 billion, fixed, no further minting)**

| Allocation | % | Tokens | Vesting |
|---|---|---|---|
| **Provider Incentives** | 30% | 300,000,000 | Earned over 5 years; emitted per job served |
| **Ecosystem & Grants** | 20% | 200,000,000 | DAO-controlled; Arabic AI research, developer grants |
| **Team & Advisors** | 20% | 200,000,000 | 4-year vest, 1-year cliff |
| **Treasury** | 15% | 150,000,000 | DAO multi-sig; operational reserve |
| **Investors** | 15% | 150,000,000 | 2-year vest, 6-month cliff |

**Rationale:**

- **Provider incentives at 30%** (largest allocation): DCP's primary challenge is bootstrapping supply. Without active providers, there is no marketplace. Front-loading provider rewards is the proven playbook (see RNDR, Akash, Helium).
- **Ecosystem at 20%**: Arabic AI is DCP's differentiated positioning (ALLaM, JAIS, Falcon H1, Qwen Arabic). Grant funding for Arabic model developers, PDPL-compliant RAG tooling, and Saudi university partnerships creates demand for DCP compute.
- **Team/advisors at 20%** with 1-year cliff: Standard for seed-stage infrastructure projects. Cliff aligns incentives with 12-month launch milestones.
- **Treasury at 15%**: Slashing proceeds + protocol surplus flow here. DAO-controlled via multi-sig prevents founder unilateral spend.
- **Investors at 15%** with 6-month cliff: Competitive with comparable DePIN token rounds (Render, Akash, Nosana).

---

## 5. Token Economics Model

### 5.1 Provider Reward Emission Schedule

Provider rewards (300M DCP over 5 years) follow a declining emission curve — front-weighted to incentivise early network adoption:

| Year | Annual Emission | Cumulative | Notes |
|---|---|---|---|
| 2026 | 90,000,000 (30%) | 90M | Bootstrap phase — highest rewards for early providers |
| 2027 | 75,000,000 (25%) | 165M | Network established, organic fee revenue growing |
| 2028 | 60,000,000 (20%) | 225M | Fee revenue begins offsetting token incentive decline |
| 2029 | 45,000,000 (15%) | 270M | Provider economics sustained by job volume |
| 2030 | 30,000,000 (10%) | 300M | Token incentive fully wound down; fee revenue dominant |

Providers earn tokens proportional to: `(jobs_served × quality_score × tier_multiplier) / total_network_jobs`

This design means early providers — those who take the risk of joining before scale — receive disproportionately high rewards. Internet cafe operators who join in 2026 earn 3x the token reward rate of those who join in 2029.

### 5.2 SAR/DCP Exchange Mechanism

DCP is not a speculative asset — it is a utility token with two primary use cases: provider staking and renter discounts. The protocol maintains a **reference price oracle** (Chainlink + DEX TWAP) used for:

1. **Stake valuation:** Minimum stake is denominated in USD-equivalent, not raw DCP. If DCP price falls, providers must top up stake. If DCP price rises, excess stake is released.
2. **Discount calculation:** The 10% discount is applied to the SAR-equivalent value of the job, not to DCP nominal amount.
3. **Burn amount:** 5% of SAR fees are converted to DCP at oracle price and burned.

This prevents reflexive spirals (token price crash → stake inadequacy → provider exit → network death) by anchoring economics to USD/SAR fundamentals.

### 5.3 Price Floor Model

The **provider minimum stake** creates an implicit price floor dynamic:

- Minimum Tier A stake: 10,000 DCP
- Required USD-equivalent per Tier A provider: $500 (set by governance)
- Implied minimum DCP price for active Tier A participation: $0.05/DCP

As the network scales to 10,000+ Tier A providers (2029 base case), the required staked USD value reaches $5M+. This represents sustained buy pressure from the provider side alone, independent of renter demand or speculative trading.

---

## 6. Comparable Analysis

### 6.1 Decentralized Compute Token Benchmarks

| Protocol | Token | FDV at Launch | Utility | DCP Comparison |
|---|---|---|---|---|
| **Render Network** | RNDR | $50M–$200M (2020–2022) | GPU render jobs, staking | RNDR is rendering-focused; DCP covers full compute stack including inference, training |
| **Akash Network** | AKT | $30M–$150M (2021) | Container deployment, staking, gov | AKT most comparable architecture; DCP adds energy arbitrage + Arabic AI vertical |
| **io.net** | IO | $800M+ (2024 TGE) | GPU cluster coordination, staking | IO launched into bull market; DCP targets MENA-specific moat vs IO's global commodity play |
| **Nosana** | NOS | $15M–$80M (2023–2024) | GPU inference jobs, staking | Smaller market, Solana ecosystem; DCP on Base L2 with established DeFi liquidity |

### 6.2 Why DCP Has Stronger Regional Moat

**RNDR / IO / Nosana** compete purely on price in a global commodity GPU market. Any new provider in any geography enters competition. Margins erode to near-zero as supply scales.

**DCP's moat is structural and non-replicable in the short term:**

1. **Energy arbitrage:** Saudi electricity at $0.048–0.053/kWh creates a 3.5–6x cost advantage that cannot be matched by EU/US-based protocols. An internet cafe in Riyadh running RTX 4090s at 70% utilisation nets $145–$315/mo — the same hardware in Germany nets $60–$120/mo after electricity costs.

2. **PDPL compliance:** Saudi Personal Data Protection Law requires that data processed for Saudi entities stays in-kingdom. AWS, Azure, and global DePIN protocols (IO, Render) cannot satisfy this requirement with their current infrastructure. DCP is positioned as the **only PDPL-compliant decentralized compute option**.

3. **Arabic AI specialisation:** The DCP model catalog (ALLaM 7B, JAIS 13B, Falcon H1, BGE-M3 Arabic embeddings, Qwen 2.5) is purpose-built for Arabic-language workloads. No competitor offers an Arabic RAG stack (embeddings + reranker + LLM) in a PDPL-compliant environment.

4. **Aethir comparison (DePIN GPU, $800M+ FDV):** Aethir's token launch proved massive appetite for GPU DePIN narratives. DCP differentiates by being fiat-native (no token complexity for providers/renters), regionally focused, and launching with a working product rather than just a whitepaper.

### 6.3 Implied DCP FDV Range

Applying comparable discounts to Akash and Render's launch FDVs, adjusted for DCP's stage, geography, and traction:

| Method | Implied DCP FDV | Notes |
|---|---|---|
| Discount to AKT launch FDV (40%) | $12M–$60M | Fair comp; DCP is earlier-stage but MENA moat adds premium |
| Discount to IO launch FDV (5%) | $40M–$50M | IO launched into strong market; DCP pre-TGE floor |
| Indicative valuation range | $8M-$20M pre-money | Conservative; leaves upside for seed investors |

Seed investors at $13.3M pre-money (midpoint) with a 5-year hold targeting $100M–$400M FDV (comparable to RNDR/AKT at peak) represent **7x–30x return potential** at reasonable market conditions.

---

## 7. Roadmap

### Phase 1 — Off-Chain Foundation (Now → Q3 2026)

**Status: In Progress**

- ✅ Marketplace MVP: provider registration, job submission, SAR escrow on Base Sepolia
- ✅ Per-token metering: vLLM inference with per-token billing verified
- ✅ Arabic model catalog: 11 models serving (ALLaM, JAIS, Falcon H1, BGE-M3, Qwen, Nemotron)
- ✅ Provider onboarding CLI: zero-to-active in ~5 minutes
- 🔄 Provider activation: 43 registered, onboarding to first active cohort
- 🔄 PDPL compliance certification
- 📋 Token design finalised (this document)
- 📋 Legal: token counsel engaged, SAFTs drafted for seed investors

**DCP token is NOT yet live.** All payments are SAR (fiat). Token design is being presented to seed investors as part of the $2M–$3M raise.

### Phase 2 — Token Launch on Base L2 (Q3 2026)

- DCP ERC-20 contract deployed on Base Mainnet
- Provider staking contracts live (Tier A/B/C)
- Renter DCP payment flow enabled (10% discount active)
- Initial DEX liquidity pool (DCP/USDC on Aerodrome/Base)
- Provider incentive distribution begins (Year 1 emission: 90M DCP)
- Token Generation Event (TGE): investor/team/ecosystem tranches released per vesting schedule
- Governance: Snapshot voting initially, migrating to on-chain by Q4 2026

**Milestone gate:** Minimum 100 active providers and $500K GMV before TGE to demonstrate real demand.

### Phase 3 — Governance Activation & DAO Treasury (Q1 2027)

- On-chain governance fully active (OpenZeppelin Governor)
- DAO treasury operational (multi-sig, then progressive decentralisation)
- First governance votes: 2027 provider incentive emissions, Arabic AI research grants
- First quarterly burn executed (5% of 2026 accumulated fees)
- Series A preparation: token metrics, holder distribution, DEX liquidity as fundability evidence
- MENA expansion: UAE, Bahrain, Egypt provider onboarding using token incentive playbook

---

## Appendix A: Smart Contract Architecture (Planned)

All contracts target **Base L2** (Coinbase's Ethereum L2) for:
- Low gas fees (~$0.001–0.01 per transaction vs $5–50 on mainnet)
- EVM compatibility (full Solidity/Hardhat/Foundry toolchain)
- Institutional-grade security (built on Optimism stack, audited by Coinbase)
- Growing DeFi liquidity (Aerodrome, Uniswap v3 on Base)

**Planned contract suite:**

| Contract | Purpose |
|---|---|
| `DCPToken.sol` | ERC-20, fixed 1B supply, no minting after TGE |
| `ProviderStaking.sol` | Stake/unstake, tier assignment, slashing logic |
| `JobEscrow.sol` | Payment hold, release on job completion, DCP discount logic |
| `GovernorDCP.sol` | On-chain voting (OpenZeppelin Governor) |
| `Treasury.sol` | DAO multi-sig, grant disbursement |
| `BurnVault.sol` | Receives 5% quarterly fee allocation, executes burn |

**Audit plan:** Trail of Bits or OpenZeppelin audits planned for Phase 2 contracts prior to TGE. Budget: $80K–$150K.

---

## Appendix B: Risk Disclosure

| Risk | Severity | Mitigation |
|---|---|---|
| Token price volatility | High | Stake anchored to USD-equivalent; burn tied to real revenue |
| Regulatory uncertainty (KSA crypto) | High | Fiat-native Phase 1; legal counsel engaged for SAMA compliance |
| Provider activation lag | Medium | Token incentives front-weighted (30% of supply for providers) |
| Smart contract exploit | Medium | Audits planned; phased launch; bug bounty program |
| Competitor token launch (IO/Aethir MENA) | Medium | PDPL + Arabic AI moat not replicable in 12-month window |
| Emission sell pressure | Low | Vesting schedules; provider rewards earned per job (not upfront) |
| DAO governance capture | Low | Quorum + supermajority requirements; team veto on critical upgrades (Year 1 only) |

---

## Appendix C: Key Metrics for Investors

| Metric | Current | 2027 Target | 2030 Target |
|---|---|---|---|
| Active providers | 0 (43 registered) | 500–2,000 | 15,000–40,000 |
| Active GPU count | 0 | 2,000–8,000 | 60,000–160,000 |
| GMV | $0 | $1.2M–$7.2M | $72M–$230M |
| Platform revenue (15%) | $0 | $180K–$1.1M | $10.8M–$34.5M |
| DCP staked (provider) | 0 | 5M–20M DCP | 50M–150M DCP |
| Quarterly burn | $0 | $2,250–$13,750 | $135K–$431K |
| Token holders (estimated) | 0 | 1,000–5,000 | 20,000–100,000 |

---

*DCP Token Whitepaper v1.0 — March 2026. For seed round investor distribution only. Not a public offering. Subject to revision pending legal review and SAMA regulatory guidance.*

*Prepared by: DCP Blockchain Engineering Team*
*Review: DCP Founding Engineer, CEO*
