# Provider Economics & Earnings Guide

**Status:** Maintained
**Audience:** GPU providers, node operators
**Last Updated:** 2026-03-23

---

## Executive Summary

DCP pricing is **23.7% below hyperscalers** (Vast.ai, RunPod) due to Saudi energy arbitrage. Providers earn 70-85% of job revenue; DCP takes 15-30% platform fee.

**Example Monthly Income (70% utilization):**
- RTX 4090: $190–$380
- RTX 4080: $115–$240
- H100: $1,800–$3,500

See the [Pricing Guide](/docs/pricing-guide) for current provider economics and competitive benchmarks.

---

## Why DCP Pays More: Energy Arbitrage

Saudi Arabia's industrial electricity costs **$0.048–$0.053/kWh**, which is **3.5–6x cheaper** than EU rates (€0.18–€0.30/kWh). This cost advantage flows directly to provider payouts:

- Hyperscalers need 60%+ margins on compute to cover global datacenter costs
- DCP providers only need 10-15% margins due to cheap electricity in Saudi Arabia
- Result: Providers earn **23.7% more** than equivalent jobs on Vast.ai

See the [Pricing Guide](/docs/pricing-guide) for complete energy cost analysis.

---

## DCP Pricing Tiers

Pricing varies by GPU model and job type (inference, fine-tuning, image generation).

### Tier 1: Consumer GPUs (RTX 40-series)

| GPU | DCP Monthly Revenue | Electricity Cost | Net Profit | ROI Period |
|-----|-------------------|------------------|-----------|------------|
| RTX 4090 | $180–$350 | $25–$35 | $145–$315 | 3–6 months |
| RTX 4080 | $120–$250 | $20–$30 | $100–$220 | 4–8 months |
| RTX 4060 | $60–$120 | $12–$18 | $48–$102 | 6–12 months |

### Tier 2: Data Center GPUs (A-series, H-series)

| GPU | DCP Monthly Revenue | Electricity Cost | Net Profit | ROI Period |
|-----|-------------------|------------------|-----------|------------|
| A100 | $800–$1,600 | $120–$180 | $680–$1,480 | 6–10 months |
| H100 | $1,800–$3,500 | $150–$250 | $1,650–$3,250 | 8–12 months |
| H200 | $2,500–$4,500 | $180–$300 | $2,320–$4,200 | 10–14 months |

### Tier 3: Specialized Workloads (Fine-tuning, Multi-GPU)

Fine-tuning and multi-GPU training jobs command **30-50% premiums** due to specialized demand.

**Example (RTX 4090 fine-tuning job):**
- Base rate: $200/month average
- Fine-tuning premium: +40% → $280/month
- Net profit: $245–$315/month

---

## Provider Payout Model

### Revenue Sharing

| Stage | Flow |
|-------|------|
| 1. Renter deposits | Funds into DCP escrow contract |
| 2. Job executes | Provider runs job, accrues earnings |
| 3. Job completes | Renter verifies completion |
| 4. Escrow releases | Smart contract releases funds to provider |
| 5. Provider withdraws | Settlement to external wallet (SAR, USD, EUR) |

**Platform Fee:** 15% blended (DCP takes 15%, provider receives 85%)

**Example:** Nemotron-12B inference job
```
Renter cost: $0.30
DCP fee (15%): $0.045
Provider earning: $0.255 (85% of renter cost)
```

---

## Income Projection Calculator

### How It Works

Monthly earnings depend on:
1. **GPU Model** → Base monthly revenue range
2. **Utilization %** → Fraction of time GPU is actively serving jobs
3. **Specialization** → Fine-tuning, multi-GPU (+30-50% premium)

### Formula

```
Monthly Income = Base Revenue Range × (Utilization% / Target%)
                × (1 + Specialization Premium)
```

Where Target% = the utilization rate at which the base range applies (typically 60-80% for consumer, 70-90% for datacenter).

### Examples

**RTX 4090 @ 70% utilization (general inference)**
```
Base range: $180–$350/month @ 65% utilization
Adjusted for 70%: $180 × (70%/65%) = $193
                  $350 × (70%/65%) = $377
Result: $193–$377/month at 70% utilization
```

**H100 @ 80% utilization (mixed inference + fine-tuning)**
```
Base range: $1,800–$3,500/month @ 80% utilization
With 15% fine-tuning premium: +$270–$525
Result: $2,070–$4,025/month
```

**RTX 4080 @ 60% utilization (startup-focused jobs)**
```
Base range: $120–$250/month @ 65% utilization
Adjusted for 60%: $120 × (60%/65%) = $111
                  $250 × (60%/65%) = $231
Result: $111–$231/month at 60% utilization
```
