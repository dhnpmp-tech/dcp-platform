# DCP Launch Landing Page Copy

## Hero Section

### Headline
**The GPU Marketplace Built for Arabic AI**

### Subheading
Run inference, training, and rendering on decentralized GPUs. Save 35–50% vs RunPod and Vast.ai. Launch in Saudi Arabia.

### Body
DCP is the first decentralized GPU compute marketplace powered by energy arbitrage. Connect your AI workloads to thousands of providers earning SAR. No platform lock-in. Transparent billing. Real-time, per-token metering.

**Live now:** 6 production models. Instant launch. Renter and provider onboarding in under 2 hours.

### CTA (Primary)
**[Launch as Renter →](https://dcp.sa/renter/register)** Get API key and 50 SAR test credit

### CTA (Secondary)
**[Earn with Your GPU →](https://dcp.sa/setup)** Register provider, install daemon, start earning

---

## Why Choose DCP

### Feature 1: 35–50% Cost Savings
**Energy Arbitrage You Keep**

Saudi-hosted infrastructure with structural cost advantage. No platform markup. You pay the actual provider rate + 5% DCP fee. RunPod takes 30%. Vast.ai takes 25%. DCP takes 5%. The difference is yours.

*Example: Same Llama 3 job costs 0.03 USD on RunPod. On DCP: 0.01 USD.*

### Feature 2: Arabic-First AI
**Built for Your Market**

Qwen 2.5 7B (native Arabic). ALLaM (Saudi). Falcon (UAE). All pre-optimized for MENA. Train, fine-tune, and deploy AI for Arabic speakers at 35% lower cost than global markets.

### Feature 3: API-First, No UI Friction
**JSON in, Results Out**

Submit jobs via OpenAI-compatible API. No marketplace browsing. No SSH handshake. No instance management. Your code runs in ephemeral containers—you pay only for runtime.

*Same workflow as RunPod, but cheaper.*

### Feature 4: Transparent Billing
**Know Your Cost Upfront**

Per-token, per-second, or per-job metering. No surprise markups. No hidden fees. Pro-rata billing—cancel mid-job, pay only for compute used. Dashboard shows spend history by API key.

### Feature 5: Decentralized Supply
**Not Locked to One Cloud**

Hundreds of independent GPU providers competing on price and reliability. Provider rating system. Automatic failover. Geographic routing. No single point of failure.

### Feature 6: MENA-Native Compliance
**Data Sovereignty by Design**

Your data stays in Saudi Arabia. PDPL-compliant. Escrow contracts for trust. No data exfiltration. Build for the region, by the region.

---

## Renter Value Prop

### Headline
**Run AI Inference at 35% of AWS Cost**

### Body
Whether you're building chatbots, fine-tuning models, or running batch inference, DCP costs less and runs faster.

**Popular workloads:**
- **Real-time chat inference** — Mistral 7B at 8 SAR/hr (8 tokens/sec). Full context. Streaming API.
- **Batch inference** — Process 1M tokens in 2 hours. Cost: 16 SAR. Same job on RunPod: 48 SAR.
- **Image generation** — SDXL at 12 SAR/hr. 1024×1024 in 15 seconds. Batch support.
- **Fine-tuning** — Llama 3 8B fine-tune on RTX 4090: 45 SAR/hour vs 150+ on AWS.

### CTA
**Start your first job in 5 minutes**
1. Register renter account
2. Add 50 SAR test balance
3. Submit inference job
4. Get results in 30 seconds

[Create Renter Account](https://dcp.sa/renter/register)

---

## Provider Value Prop

### Headline
**Earn SAR 24/7 with Your Unused GPUs**

### Body
Turn spare GPU capacity into passive income. Install daemon. Get jobs. Earn. No infrastructure overhead.

**Why providers choose DCP:**
- **75% payout** — We take 25% platform fee, you keep 75%
- **Automatic scaling** — As renters submit jobs, you earn—no capacity planning needed
- **Zero ops** — Daemon handles Docker, GPU detection, job lifecycle, auto-recovery
- **Real-time earnings** — Dashboard shows live SAR earnings per job
- **Global reach** — Earn from renters worldwide; they pay in USDC or SAR

### Earning Potential
- **RTX 4090:** 80–120 SAR/day (conservative utilization)
- **RTX 3090:** 50–80 SAR/day
- **A40:** 100–150 SAR/day
- **H100:** 200–300 SAR/day

*Actual earnings depend on job volume and GPU utilization.*

### CTA
**Start Earning Now**
1. Check your GPU (8 GB VRAM minimum)
2. Register provider account
3. Install daemon (5 minutes)
4. Start earning

[Register as Provider](https://dcp.sa/setup)

---

## Launch Models (6 Production Templates)

### LLMs
| Model | VRAM | Load Time | Price | Use Case |
|-------|------|-----------|-------|----------|
| **Nemotron Nano 4B** | 8 GB | ~5s (instant) | 5 SAR/hr | Low-latency chat, edge |
| **Llama 3 8B** | 16 GB | ~10s (cached) | 9 SAR/hr | General reasoning |
| **Qwen 2.5 7B** | 16 GB | ~10s (cached) | 9 SAR/hr | Arabic-first 🇸🇦 |
| **Mistral 7B** | 16 GB | ~10s (cached) | 8 SAR/hr | Code generation |
| **Nemotron Super 70B** | 80 GB | ~30s (cached) | 45 SAR/hr | Enterprise reasoning |

### Image Generation
| Model | VRAM | Output | Price | Use Case |
|-------|------|--------|-------|----------|
| **SDXL 1.0** | 8 GB | 1024×1024 | 12 SAR/hr | High-quality images |

---

## Social Proof (Launch Stories)

### Coming Soon
Testimonials from beta providers and renters:
- **Provider story:** "I turned 3 unused A40s into 5,000 SAR/month"
- **Renter story:** "Cut our inference costs by 60% in 2 weeks"
- **Enterprise:** "DCP's Arabic model support saved us 6 months of R&D"

---

## Trust & Security

### Smart Contract Escrow
EIP-712 escrow manages job payments. Renter deposits SAR → job runs → provider claims 75% → renter refunded if needed. Trustless. On-chain proof.

### Compliance
PDPL-certified. Data residency in KSA. Provider verification (benchmarks, GPU leaderboard). Reputation system.

### Uptime & SLAs
- Phase 1: Best-effort (99% platform uptime)
- Phase 2: 99.5% SLA per provider
- Phase 4: 99.9% SLA per model

---

## FAQ

### For Renters

**Q: How is DCP cheaper than RunPod?**
A: Energy arbitrage + Saudi hosting + decentralized provider competition. You save the middleman markup.

**Q: Do I need to change my code?**
A: Minimal—mostly auth header change. API-compatible with RunPod/OpenAI endpoints.

**Q: What if a provider goes offline mid-job?**
A: Automatic failover to next best provider. You only pay for time compute actually runs.

**Q: Can I use my own models?**
A: Yes, after Phase 1. Phase 2 adds custom container support.

### For Providers

**Q: What GPU do I need?**
A: Minimum 8 GB VRAM (RTX 3060, RTX 4000). Recommended 16+ GB (RTX 4090, A40, L40).

**Q: How much will I earn?**
A: 50–300 SAR/day depending on GPU model and job volume. No guaranteed minimum.

**Q: What if my GPU runs out of VRAM mid-job?**
A: Job fails safely. You only earn for minutes actually used. No penalty.

**Q: Is the daemon open-source?**
A: Yes. Transparent implementation. Run it anywhere—VPS, local machine, cloud instance.

---

## Launch Timeline

- **Now (March 23):** Public launch, renter/provider registration open
- **Week 1:** First 10 providers online, first 10 renters running jobs
- **Week 2:** 50+ providers, marketplace live, provider earnings dashboard
- **Week 3:** 100+ providers, enterprise API customers, geographic routing
- **Q2:** Mainnet escrow, custom container templates, multi-region support

---

## Final CTA

### For Renters
**Ready to cut GPU costs by 35–50%?**
[Launch as Renter](https://dcp.sa/renter/register)
Get API key + 50 SAR test credit immediately.

### For Providers
**Turn your GPUs into income.**
[Register as Provider](https://dcp.sa/setup)
Earn 75% + smart contract escrow protection.

---

**Questions?** contact@dcp.sa | [Docs](https://dcp.sa/docs) | [Status](https://status.dcp.sa)

*DCP — The GPU Marketplace Built for Arabic AI.*
