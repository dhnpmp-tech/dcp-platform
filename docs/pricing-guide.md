# DCP Pricing Guide — Provider & Renter SAR Rate Recommendations

**Date:** 2026-03-19
**Sources:** Public cloud pricing references and DCP platform pricing policy.
**Exchange rate:** 1 USD = 3.75 SAR (Saudi Central Bank fixed peg)

---

## 1. Executive Summary

DCP operates a **Value Premium** pricing strategy anchored in three structural Saudi-market advantages:
1. **Local latency** — 15–40 ms vs. 180–280 ms for US/EU competitors
2. **PDPL compliance** — Saudi data stays in-Kingdom; legally required for regulated industries
3. **SAR payments** — no FX fees (saves 40–50 SAR per 1,000 SAR spend vs. USD cloud)

**DCP prices are higher in USD terms than Vast.ai/Lambda — this is intentional and justified.**
Saudi renters pay SAR without conversion. International USD comparison is misleading for the target market.

---

## 2. Provider Listing Price Bands

### 2.1 Recommended Rates per GPU Tier

| GPU Tier | VRAM | Min (SAR/hr) | **Suggested (SAR/hr)** | Max (SAR/hr) | Rationale |
|----------|------|:------------:|:---------------------:|:------------:|-----------|
| RTX 3060 | 12 GB | **3.50** | **5.00** | **7.50** | Entry-level inference; Phi-3/small GGUF models; ideal for dev/test workloads. Attracts price-sensitive first-timers. |
| RTX 3090 | 24 GB | **8.00** | **12.00** | **16.00** | Workhorse for 7B–13B inference. Vast.ai equivalent is $0.35/hr → 1.31 SAR raw; DCP 8–9× premium justified by latency + PDPL. |
| RTX 4090 | 24 GB | **12.00** | **17.00** | **22.00** | Best consumer-tier perf/watt. ~18–20% premium over 3090 for 25–30% better throughput. RunPod $0.74/hr → 2.77 SAR raw. |
| A100 40 GB | 40 GB | **25.00** | **34.00** | **45.00** | Mid-range professional tier; 13B–34B models, some MoE. Lambda $1.29/hr → 4.84 SAR raw; compliance premium applies. |
| A100 80 GB | 80 GB | **40.00** | **55.00** | **70.00** | Primary enterprise tier; 70B class, Mixtral, multi-GPU setups. Vast.ai $1.89/hr → 7.09 SAR raw. |
| H100 80 GB (PCIe) | 80 GB | **70.00** | **90.00** | **110.00** | Premium low-latency serving; sovereign/regulated workloads. Lambda $2.19/hr → 8.21 SAR raw. |
| H100 80 GB (SXM) | 80 GB | **80.00** | **100.00** | **120.00** | Data center tier; highest throughput, ideal for training runs. RunPod $3.89/hr → 14.59 SAR raw. |

> **Floor rule:** Listing price MUST be ≥ Min. The platform will warn providers listing below Min that they may undercut market health.
> **Cap rule:** Listings above Max will not appear in "Recommended" sort until utilization exceeds 80% (see dynamic pricing, Section 4).

### 2.2 Rationale for Saudi Market Premium

| Premium Driver | RTX 3090 Example | Monetary Value (est.) |
|----------------|------------------|----------------------|
| Latency advantage (15–40 ms vs 220 ms) | Enables real-time voice/inference APIs impossible on US clouds | Qualitative unlock; ~3–5× renter willingness-to-pay vs async use case |
| PDPL compliance unlock | Saudi fintech/health legally cannot use US providers for PII workloads | Compliance risk avoidance: 50,000–1,000,000 SAR fine exposure avoided |
| Zero FX fees | 40–50 SAR saved per 1,000 SAR spent vs. USD card payment | 4–5% effective discount vs. raw USD pricing |
| Arabic language support | Reduces onboarding friction for Saudi SMEs | Estimated 2× conversion rate vs. English-only alternatives |

**Net effect:** DCP's effective price for a Saudi-local renter is **lower** than a USD cloud once latency benefit, FX savings, and compliance risk are priced in — even though the SAR/hr headline rate exceeds the USD/hr equivalent.

---

## 3. Renter Cost Reference

### 3.1 GPU-Hour Cost Planning

| GPU Tier | Typical Renter Price (SAR/hr) | Typical Workload | 1-hour batch cost | 8-hour overnight cost |
|----------|------------------------------|-----------------|-------------------|-----------------------|
| RTX 3060 | 5.00 | Dev inference, fine-tuning experiments | 5 SAR | 40 SAR |
| RTX 3090 | 12.00 | 7B–13B inference, small training | 12 SAR | 96 SAR |
| RTX 4090 | 17.00 | 7B–14B high-throughput, video gen | 17 SAR | 136 SAR |
| A100 80 GB | 55.00 | 70B inference, Mixtral, RAG pipelines | 55 SAR | 440 SAR |
| H100 80 GB | 100.00 | Production LLM serving, fine-tuning | 100 SAR | 800 SAR |

### 3.2 Token-Rate Cost Planning (vllm_serve jobs)

DCP charges per token via the `cost_rates` field in the job spec. All rates in halala (1 SAR = 100 halala).

| Model Size | Token Rate (halala/token) | Tokens per 1 SAR | Cost for 100K tokens | Typical GPU |
|------------|--------------------------|------------------|----------------------|-------------|
| Small (≤7B, e.g. Phi-3 mini) | 1 | 100 | 1,000 SAR | RTX 3060/3090 |
| Medium (7B–13B, e.g. Llama 3 8B) | 2–3 | 33–50 | 2,000–3,000 SAR | RTX 3090/4090 |
| Large (13B–34B) | 4–6 | 17–25 | 4,000–6,000 SAR | A100 40 GB |
| XL (70B+, e.g. Llama 3 70B) | 8–12 | 8–12 | 8,000–12,000 SAR | A100 80 GB |
| Premium (70B+ low-latency) | 15–20 | 5–7 | 15,000–20,000 SAR | H100 80 GB |

**Formulae:**
```
tokens_per_sar     = 100 / token_rate_halala
sar_for_n_tokens   = (n_tokens × token_rate_halala) / 100
monthly_budget_sar = expected_daily_tokens × token_rate_halala / 100 × 30
```

### 3.3 DCP vs. Cloud Benchmark

| Workload | DCP (SAR/hr) | AWS/GCP/Azure equiv (SAR/hr) | DCP Savings | Note |
|---------|-------------|------------------------------|-------------|------|
| 7B–13B inference (24 GB) | 10–17 | 19–45 | 40–62% | Excludes FX fee savings |
| 70B class serving (80 GB) | 45–70 | 90–220 | 50–70% | PDPL-compliant workloads only on DCP |
| Training run (H100 SXM) | 80–120 | 120–300+ | 33–60% | Sovereign use case; no equivalent KSA-local cloud |

> Cloud equivalent prices are list-price estimates from AWS (eu-west-1/me-south-1), GCP, and Azure as of Q1 2026. Spot/committed discounts can reduce cloud prices 30–70%; compare before procurement.

---

## 4. Dynamic Pricing Algorithm

Providers should adjust their listing prices based on utilization signal. DCP recommends the following heuristic:

### 4.1 Utilization-Based Adjustment Rules

| 7-Day Avg Utilization | Recommended Action | Price Adjustment | Rationale |
|-----------------------|-------------------|-----------------|-----------|
| < 30% (idle) | Lower price | Drop to Min band or −15–20% | Attract renters; idle GPUs earn nothing |
| 30–49% (low) | Nudge lower | Drop −5–10% toward Min | Improve fill rate |
| 50–79% (healthy) | Hold | No change; stay at Suggested | Optimal: good utilization at fair price |
| 80–89% (high demand) | Optional raise | +5–10% toward Max | Demand signal; capture premium |
| ≥ 90% (saturated) | Raise price | Move toward Max or above | Capacity is scarce; price accordingly |

### 4.2 Dynamic Pricing Decision Tree

```
Every 7 days, check: avg_utilization = (billed_hours / available_hours) × 100

if avg_utilization < 50%:
    if current_price > suggested_price:
        new_price = current_price × 0.90          # drop 10%
    elif current_price > min_price:
        new_price = max(min_price, current_price × 0.85)   # drop to floor
    # Signal: "GPU available — competitive rate"

elif avg_utilization > 80%:
    if current_price < suggested_price:
        new_price = current_price × 1.10          # raise 10%
    elif current_price < max_price:
        new_price = min(max_price, current_price × 1.08)   # raise toward cap
    # Signal: "High demand — premium rate"

else:  # 50–80% utilization
    # No change. Hold current price.
    pass
```

### 4.3 Worked Examples

| Scenario | GPU | Current Price | Utilization | Action | New Price | Monthly Impact |
|----------|-----|--------------|-------------|--------|-----------|----------------|
| Idle provider | RTX 3090 | 14 SAR/hr | 18% | Drop to min | 8 SAR/hr | Less per hr, more hours billed → net gain |
| Healthy provider | RTX 4090 | 17 SAR/hr | 65% | Hold | 17 SAR/hr | No change |
| Hot provider | A100 80 GB | 55 SAR/hr | 88% | Raise | 59 SAR/hr | +7% revenue/hr; demand absorbs increase |
| Overpriced and empty | H100 80 GB | 110 SAR/hr | 5% | Drop toward suggested | 90 SAR/hr | 82% more hours needed to break even; market test |

### 4.4 Provider Earnings at Different Utilization × Price Points (RTX 3090, 30-day month)

| Utilization | Hours/Day | Price SAR/hr | Gross/Month | Provider 75% | DCP 25% |
|-------------|-----------|-------------|-------------|-------------|---------|
| 20% (low) | 4.8 | 8.00 (min) | 1,152 SAR | **864 SAR** | 288 SAR |
| 50% (healthy) | 12 | 12.00 (suggested) | 4,320 SAR | **3,240 SAR** | 1,080 SAR |
| 80% (high) | 19.2 | 14.00 | 8,064 SAR | **6,048 SAR** | 2,016 SAR |
| 95% (peak) | 22.8 | 16.00 (max) | 10,944 SAR | **8,208 SAR** | 2,736 SAR |

> **Key insight:** A provider earning at 80% utilization/suggested price (3,240 SAR/mo) earns 3.75× more than one at 20%/min price (864 SAR/mo). Utilization matters more than headline rate.

---

## 5. Launch Pricing Strategy (Q2 2026 — First 90 Days)

### 5.1 Introductory Promo Rates

To bootstrap the marketplace, providers launching in Q2 2026 should offer **introductory rates** at the lower end of the suggested band:

| GPU | Promo Rate (SAR/hr) | vs. Suggested | Duration |
|-----|-------------------|--------------|----------|
| RTX 3060 | 3.50 | −30% | First 90 days |
| RTX 3090 | 10.00 | −17% | First 90 days |
| RTX 4090 | 14.00 | −18% | First 90 days |
| A100 40 GB | 28.00 | −18% | First 90 days |
| A100 80 GB | 45.00 | −18% | First 90 days |
| H100 80 GB | 80.00 | −20% | First 90 days |

**Revert trigger:** Full suggested rates activate at 90-day mark OR when the platform reaches 50 registered providers — whichever is first.

**Provider earnings at promo rates (75% split):**
| GPU | Promo SAR/hr | Provider 75% | DCP 25% |
|-----|------------|-------------|---------|
| RTX 3090 | 10.00 | 7.50 SAR | 2.50 SAR |
| RTX 4090 | 14.00 | 10.50 SAR | 3.50 SAR |
| A100 80 GB | 45.00 | 33.75 SAR | 11.25 SAR |
| H100 80 GB | 80.00 | 60.00 SAR | 20.00 SAR |

### 5.2 Go-to-Market Tiers

| Tier | Target Segment | GPU | Price | Message |
|------|---------------|-----|-------|---------|
| **Tier 1 — Consumer** | Saudi startups, developers, university AI labs | RTX 3060/3090/4090 | 3.50–14 SAR/hr | "No dollar conversion. No FX fees. Run from Riyadh." |
| **Tier 2 — SME/Regulated** | Saudi fintech, health-tech, e-gov AI | A100 40 GB / A100 80 GB | 28–55 SAR/hr | Lead with PDPL compliance; data stays in KSA |
| **Tier 3 — Enterprise/Sovereign** | NEOM, SDAIA, Aramco Digital, Vision 2030 | H100 80 GB | 80–120 SAR/hr | Private BD track only; requires formal SLA + entity |

---

## 6. Volume Pricing (Phase B — Post Payment Gateway)

Once the payment gateway (Stripe/Tap) is live, introduce committed-use discounts:

| Commitment Level | Discount | RTX 3090 effective rate | A100 80 GB effective rate |
|-----------------|---------|------------------------|--------------------------|
| Pay-as-you-go | 0% | 12 SAR/hr | 55 SAR/hr |
| 100 hrs/mo prepaid | −10% | 10.80 SAR/hr | 49.50 SAR/hr |
| 500 hrs/mo prepaid | −20% | 9.60 SAR/hr | 44.00 SAR/hr |
| 1,000+ hrs/mo (enterprise) | −30% | 8.40 SAR/hr | 38.50 SAR/hr |

> Volume discounts are funded by reduced acquisition cost and improved utilization predictability. Providers still receive 75% of the gross committed rate. DCP absorbs the discount from its 25% margin.

---

## 7. Revenue Impact at Suggested Pricing (Platform View)

| Active Providers | GPU Type | Avg Utilization | Monthly Gross (SAR) | DCP Revenue 25% (SAR) |
|-----------------|---------|----------------|--------------------|-----------------------|
| 5 | RTX 3090 | 50% (12 hrs/day) | 21,600 | **5,400** |
| 10 | Mix (avg 12 SAR) | 50% | 43,200 | **10,800** |
| 20 | Mix (avg 17 SAR) | 60% | 122,400 | **30,600** |
| 50 | Mix (avg 30 SAR) | 65% | 702,000 | **175,500** |

> Platform break-even analysis is maintained privately. Public pricing guidance should be validated against current market rates before procurement decisions.

---

## 8. Pricing Policy Rules (Platform Enforcement)

| Rule | Value | Notes |
|------|-------|-------|
| Minimum listing price | See Min column, Section 2.1 | Platform warns below-min listings |
| Maximum listing price | See Max column, Section 2.1 | Listings above Max excluded from Recommended sort |
| Price change cooldown | 24 hours | Providers cannot reprice more than once per 24h |
| Dynamic price audit | Weekly | Platform generates utilization report; shows suggested adjustment |
| Promo period floor | 3.50 SAR/hr (RTX 3060) | No listing below this floor regardless of GPU tier |
| Provider verification bonus | +1 tier trust badge | Verified providers (38-GPU fraud check passed) may list at Max |

---

## 9. Quick Reference Card

```
SAR Pricing Quick Reference (DCP, Q2 2026)
═══════════════════════════════════════════
GPU             | Min   | Suggested | Max   | Launch Promo
────────────────┼───────┼───────────┼───────┼─────────────
RTX 3060 12GB   | 3.50  |   5.00    |  7.50 |  3.50 SAR/hr
RTX 3090 24GB   | 8.00  |  12.00    | 16.00 | 10.00 SAR/hr
RTX 4090 24GB   | 12.00 |  17.00    | 22.00 | 14.00 SAR/hr
A100 40GB       | 25.00 |  34.00    | 45.00 | 28.00 SAR/hr
A100 80GB       | 40.00 |  55.00    | 70.00 | 45.00 SAR/hr
H100 PCIe 80GB  | 70.00 |  90.00    |110.00 | 80.00 SAR/hr
H100 SXM  80GB  | 80.00 | 100.00    |120.00 | 80.00 SAR/hr
═══════════════════════════════════════════
Exchange: 1 USD = 3.75 SAR (fixed peg)
Split: Provider 75% / DCP 25%
Dynamic: <50% util → lower; >80% util → raise
```

---

_Sources: Vast.ai, RunPod, Lambda Labs, and hyperscaler public pricing references (Q1 2026)._
_All figures in SAR unless noted. Competitor USD prices converted at 3.75 fixed peg. Verify competitor rates before procurement decisions._
