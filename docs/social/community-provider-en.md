# Discord & Telegram Provider Outreach Templates

*DCP — Saudi Arabia GPU Compute Marketplace*
*Target communities: GPU owners, gaming communities, tech expats in KSA, mining groups, AI/ML communities*

---

## Template 1 — Short Intro (Discord / Telegram, English)

**For:** General tech Discord servers, expat communities in KSA, GPU enthusiasts

---

Hey everyone 👋

Quick question — does anyone here have an NVIDIA GPU sitting idle when they're not gaming or working?

I've been using **DCP** (dcp.sa) to earn from active AI compute jobs on my NVIDIA GPU. You can offer capacity when your machine is available and get compensated for workloads after completion and settlement.

**How it works:**
- Register your GPU at dcp.sa/setup
- Run the lightweight background daemon
- Earn through platform payout workflow after completed jobs

Use planning numbers in your dashboard to estimate outcomes based on utilization and job mix. No crypto, no stablecoins.

Happy to answer questions if anyone's curious 🙂

---

## Template 2 — Detailed Technical Post (Discord #general or #hardware)

**For:** Tech-savvy audiences, hardware enthusiasts, developers

---

**[Resource] Monetize your idle NVIDIA GPU in Saudi Arabia**

If you have an NVIDIA card with 8GB+ VRAM, you can earn SAR from AI compute jobs while your machine is available — through **DCP** (dcp.sa), with jobs matched by marketplace demand.

**How payouts are measured:**
Use your dashboard and request history to estimate expected earnings for your exact utilization pattern.

**Tech stack:**
- Python daemon (`dcp_daemon.py`) runs in the background
- Jobs execute inside Docker + NVIDIA Container Toolkit (fully isolated)
- Heartbeat every 30s, auto-reconnect if you lose internet
- No root access required for renters — pure GPU compute isolation

**Setup (Linux):**
```bash
curl -sL "https://dcp.sa/api/dc1/providers/download/setup?key=YOUR_KEY&os=linux" | bash
```

Payout timing and visibility are shown in the provider wallet and payout settings after completed jobs settle.

Sign up: **dcp.sa/setup**

---

## Template 3 — Minimal / Low-Pressure (Telegram groups)

**For:** Quiet Telegram groups, professional networks, conservative outreach

---

Sharing something that might be useful for GPU owners in KSA:

**DCP** (dcp.sa) pays Saudi Riyals for AI compute jobs on idle NVIDIA hardware. Use your dashboard's planning view to estimate provider outcomes by utilization and job mix.

Setup is lightweight. Jobs execute in isolated Docker containers and the host is separated from job file systems.

More info: dcp.sa/setup

---

## Template 4 — Gaming Community Post (Discord #off-topic)

**For:** Gaming Discords where members have high-end GPUs

---

Gamers with RTX cards — your GPU could be earning while you're at school/work/sleeping 💰

**DCP** (Saudi GPU marketplace) pays you to run AI jobs on your NVIDIA card when you're not gaming. Your GPU stays yours, the jobs run in a sandboxed container.

Run jobs while your card is available and review payouts inside DCP.
No crypto. Setup is quick.

→ dcp.sa/setup

---

## Template 5 — Arabic (Mixed Communities)

**For:** Arabic-language Telegram groups, Saudi tech communities

---

أصحاب بطاقات NVIDIA الرسومية في السعودية 🇸🇦

منصة DCP (dcp.sa) تدفع لكم ريالات سعودية مقابل تشغيل مهام ذكاء اصطناعي على بطاقتكم وقت ما تكون خاملة.

RTX 3090 and RTX 4090 owners can estimate returns in the dashboard based on live workload mix.

Payout settings and settlement timing are managed through provider wallet controls.

التسجيل: dcp.sa/setup

---

## Posting Guidelines

### Channels to target
- Discord: #hardware, #tech-chat, #passive-income, #off-topic, #jobs-and-gigs
- Telegram: GPU mining groups (post-crypto downturn, many have idle rigs), Saudi tech groups, KAUST/KFUPM student groups, expat professionals
- Reddit (r/saudiarabia, r/GPUmining): template 2 works well for technical subs

### Engagement tips
- Always respond to questions within 2 hours if possible
- Don't over-post in the same server — once per channel is enough
- Use template 1 or 3 for cold outreach, template 2 for technical channels
- Mention specific GPU models to spark interest from hardware owners
- Never make income guarantees — always frame as estimates based on utilization

### DM follow-up template
> Hey [name], saw you have a [GPU model] — happy to help you get set up on DCP if you want. Takes about 10 minutes. The setup guide is at dcp.sa/docs/provider-guide

### Tracking
- Use UTM params on links for campaign tracking: `dcp.sa/setup?utm_source=discord&utm_campaign=provider-q1-2026`
- Track signups by asking new providers where they heard about DCP
