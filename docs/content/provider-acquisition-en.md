# How to Earn SAR with Your GPU — DCP Provider Guide

*Published by DCP | Saudi Arabia GPU Compute Marketplace*

---

## What Is DCP?

DCP is a Saudi-hosted marketplace connecting NVIDIA GPU owners with teams that need AI compute. It is built around practical Saudi deployment economics and Arabic-model support, with jobs matched through availability and policy.

---

## How Much Can You Earn?

Earnings are usage-based and depend on:

- Provider visibility and utilization
- Job mix and duration
- Current marketplace pricing
- Your system availability over time

Use the earnings estimate shown in dashboard tools as a planning reference, then compare with live job activity after you go online.

Earnings values are tracked in **halala** (1/100 SAR) and made available in your provider wallet after job settlement.

---

## Requirements

Before you register, make sure your setup meets the minimum spec:

| Requirement | Minimum |
|-------------|---------|
| GPU | NVIDIA (any model with ≥8GB VRAM) |
| OS | Ubuntu 20.04 LTS or later |
| Internet | 100 Mbps symmetric or faster |
| Python | 3.8+ |
| Disk | 50GB free (for Docker images + job data) |
| Runtime | Docker + NVIDIA Container Toolkit |

**Recommended GPUs:** RTX 3080, RTX 3090, RTX 4080, RTX 4090, A100, H100. Anything with 8GB+ VRAM and CUDA support will work.

---

## Setup in 3 Steps

### Step 1 — Register

Go to [dcp.sa/setup](https://dcp.sa/setup) and fill in your details: name, email, GPU model, and VRAM. Keep the returned **provider API key** in a secure location; it authenticates your daemon and your dashboard access.

### Step 2 — Install the Daemon

The DCP daemon (`dcp_daemon.py`) runs on your machine, sends heartbeats every 30 seconds, and executes jobs in Docker containers.

**Linux / macOS:**
```bash
curl -sL "https://dcp.sa/api/dc1/providers/download/setup?key=YOUR_PROVIDER_KEY&os=linux" | bash
```

**Windows:**
Download from `https://dcp.sa/api/dc1/providers/download/setup?key=YOUR_PROVIDER_KEY&os=windows` using PowerShell as documented in onboarding flow.

### Step 3 — Connect and Go Live

Once the daemon starts, it sends a heartbeat every 30 seconds. Your machine is ready for matching after it appears as **online** in your provider dashboard at [dcp.sa/provider](https://dcp.sa/provider).

After your status is online, jobs can be matched automatically when renter demand aligns with your availability.

---

## Getting Paid

- Earnings are tracked in your **provider wallet** after completed jobs are finalized
- You can view your balance and job history at any time from your dashboard
- Payouts are requested from your provider dashboard through the withdrawal workflow.

No crypto, no PayPal. Withdrawals are handled through the configured payout workflow.

---

## FAQ

**Is my GPU safe?**
Yes. Jobs run inside isolated Docker containers. The daemon never gives renters shell access to your machine — only GPU compute inside a sandboxed environment. You can review which Docker images DCP uses in the [provider docs](https://dcp.sa/docs/provider-guide).

**What jobs will run on my machine?**
AI inference workloads: large language model (LLM) serving, image generation (Stable Diffusion), and model training jobs. Jobs pass through platform routing and policy checks before execution.

**How is pricing set?**
Pricing is controlled through platform configuration and the provider earning controls available in the dashboard. It may vary by workload and availability over time.

**What if my machine goes offline?**
The daemon detects network interruptions and reconnects automatically. If your machine goes offline during a job, DCP attempts reassignment according to marketplace availability.

**Can I run multiple GPUs?**
Yes. A single daemon instance manages all GPUs in your machine. If you have 4× RTX 4090s, all four will be listed and earn independently.

**What about electricity costs?**
We recommend estimating operating cost against your local electricity tariff and machine profile before going live. This helps you decide practical minimum uptime goals for your setup.

---

## Start Earning Today

Register at **[dcp.sa/setup](https://dcp.sa/setup)** to begin onboarding.

Questions? Reach us at **support@dcp.sa** or join the discussion on [Hsoub.com](https://hsoub.com).

---

*DCP is operated in Saudi Arabia. Provider payouts follow configured payout and compliance controls. GPU jobs are subject to DCP's acceptable use policy.*
