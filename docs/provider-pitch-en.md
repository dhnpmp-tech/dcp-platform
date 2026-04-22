# Earn SAR from Your Idle GPU — DCP Provider Pitch

*DCP — Saudi Arabia GPU Compute Marketplace*

---

## Your GPU Is Sitting Idle. It Shouldn't Be.

Idle GPU time can be converted into paid AI workload time. DCP connects your hardware to jobs that fit your availability.

Saudi energy conditions and local container infrastructure can make sustained AI compute economics more suitable for local teams. DCP is also positioned for Arabic AI workflows with models like ALLaM 7B, Falcon H1, JAIS 13B, and BGE-M3.

**No crypto. No technical complexity.**

---

## How It Works

### Step 1 — Register
Go to **[dcp.sa/setup](https://dcp.sa/setup)**. Enter your name, email, and GPU model. Keep your Provider API Key ready for daemon setup.

### Step 2 — Install the Daemon
Download and run the DCP daemon — a lightweight Python script that runs in the background. It sends a heartbeat every 30 seconds and executes jobs inside isolated Docker containers on your GPU.

```bash
# Linux / macOS
curl -sL "https://dcp.sa/api/dc1/providers/download/setup?key=YOUR_KEY&os=linux" | bash

# Windows — run in PowerShell
irm https://dcp.sa/api/dc1/providers/download/setup?key=YOUR_KEY^&os=windows | iex
```

### Step 3 — Go Live
Your machine appears online in your provider dashboard when matching sees it as available. Matching then routes compatible jobs when renter demand and compatibility allow.

---

## Earning Potential

Providers keep **75%** of settled job revenue after DCP's 25% platform fee.

Earnings vary by utilization and job mix. Use these dashboard inputs to estimate outcomes:

| Factor | Why it matters |
|--------|----------------|
| GPU availability | Online time and how often your machine is matched |
| Workload mix | LLM, image, or training demand affects effective rates |
| Completion quality | Completed jobs convert to finalized payment events |
| Regional competition | Available demand and provider density in your region |

The dashboard shows planning scenarios, not guaranteed income.

---

## DCP vs. Idle GPU vs. AWS

| Option | What it means for providers |
|--------|-----------------------------|
| Local GPU idle | No matching jobs, no payout events |
| Public cloud credits | Strong service guarantees, but no direct local utilization income |
| DCP | Earnings opportunity through Saudi-hosted demand matching |

DCP keeps the setup path simple and aligns with Saudi data locality while giving providers a practical way to monetize availability.

---

## What Actually Runs on Your Machine

DCP uses Docker containers with NVIDIA Container Toolkit to isolate every job:

- **LLM Inference** — Large language model serving (Llama, Mistral, Qwen)
- **Image Generation** — Stable Diffusion and ComfyUI workloads
- **Model Training** — Fine-tuning adapter jobs (LoRA, QLoRA)

**What renters cannot do:**
- Access your filesystem outside the container
- Open a shell on your machine
- See your other running processes
- Access your network beyond what Docker allows

Every job runs in an ephemeral container that's destroyed after completion. Your machine, your data — stays yours.

---

## Getting Paid

- Earnings are posted to your **provider wallet** after job completion
- View balance and job history from your dashboard at **[dcp.sa/provider](https://dcp.sa/provider)**
- Payout timing and thresholds are visible in dashboard payout settings.
- Currency: **SAR** — no crypto, no PayPal, no friction

---

## FAQ — Top 10 Provider Questions

**1. Is my computer safe?**
Yes. Jobs run inside isolated Docker containers. Renters get GPU compute only — no shell access, no file access, no network access beyond what the job needs.

**2. What if I need my GPU back?**
You can pause job acceptance from your dashboard at any time. In-progress jobs complete first, then your machine goes offline.

**3. Do I need to be a developer?**
No. If you can run a Python script, you can run the DCP daemon. The installer handles everything on Windows.

**4. How are earnings calculated?**
Per job completion, in halala (1 SAR = 100 halala). Your dashboard shows real-time earnings, job count, and payout history.

**5. What are the minimum specs?**
Any NVIDIA GPU with ≥8 GB VRAM. Ubuntu 20.04+ or Windows 10/11. 100 Mbps internet. 50 GB free disk space. Docker + NVIDIA Container Toolkit.

**6. Can I run multiple GPUs?**
Yes. One daemon manages all GPUs on your machine. Each GPU earns independently.

**7. What happens if my internet cuts out?**
The daemon reconnects automatically. Failed jobs are handled by platform retry and settlement rules.

**8. How often are payouts?**
Payout frequency, payout method, and minimums are configured in your dashboard settings.

**9. Are there taxes?**
Earnings from DCP are income from a service. Consult your tax advisor. DCP provides transaction records for your records.

**10. When can I set my own prices?**
Provider pricing controls are planned for a future phase. Current participation uses current platform pricing configuration.

---

## Ready to Start?

**Register now:** [dcp.sa/setup](https://dcp.sa/setup)

**Questions:** support@dcp.sa | [Hsoub.com](https://hsoub.com)

*DCP is a Saudi-hosted GPU compute marketplace. Operated in compliance with Saudi financial regulations.*
