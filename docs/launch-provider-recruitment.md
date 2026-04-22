# DCP Provider Recruitment & Onboarding Communications

## Provider Recruitment Email (Send to GPU owner mailing list)

**Subject:** Turn Your GPU into SAR 50–300/day (No Upfront Cost)

**From:** providers@dcp.sa

**Body:**

Hi,

You have a GPU. DCP turns it into passive income.

**Here's the deal:**

1. Register your GPU (5 minutes)
2. Install daemon (5 minutes)
3. Start earning (immediately)

You get 75% of every job you run. No upfront cost. No minimum hardware spec (8 GB VRAM+). No lock-in.

**How much you'll earn:**

- RTX 3060 (12 GB): 50–80 SAR/day
- RTX 4090 (24 GB): 80–120 SAR/day
- A40 (48 GB): 100–150 SAR/day
- H100 (80 GB): 200–300 SAR/day

*Earnings depend on job volume and your GPU utilization. These are conservative estimates.*

**Why DCP beats other platforms:**

| Feature | DCP | Others |
|---------|-----|--------|
| Your payout | 75% | 50–60% |
| Upfront cost | None | Often $50–500 |
| Support | Direct | None |
| Escrow protection | Yes (smart contract) | No |
| Reputation system | Yes | No |

**Get started in 10 minutes:**

```bash
# 1. Download daemon
curl -O https://dcp.sa/releases/dcp-daemon-v3.0.tar.gz
tar -xzf dcp-daemon-v3.0.tar.gz

# 2. Register at https://dcp.sa/setup
# (You'll get a provider_id and auth token)

# 3. Start daemon
./dcp-daemon \
  --provider-id YOUR_PROVIDER_ID \
  --auth-token YOUR_TOKEN

# 4. That's it. You're earning.
```

**Model caching:**
We cache HuggingFace models locally at `/opt/dcp/model-cache`. First job loads in 2–15 minutes. Subsequent jobs load in <30 seconds from cache. You only pay for actual runtime.

**Uptime + reputation:**
Your provider rating is public. High uptime (>99%) + low latency (<500ms) = get more jobs. Featured on leaderboard = bonus 1000 SAR.

**Questions?**

- Docs: https://dcp.sa/docs/provider-setup
- Daemon FAQ: https://dcp.sa/docs/daemon-faq
- Live chat: providers@dcp.sa or Discord: https://discord.dcp.sa

**One more thing:**

Renters are joining today. First 24 hours, GPUs with >99% uptime get featured. This is your moment to stand out.

Register now: https://dcp.sa/setup

Cheers,
The DCP Team

P.S. — Withdraw earnings to your bank account daily (SAR). No fees. No waiting.

---

## GPU Owner LinkedIn Post

**Post:**

Earn SAR with your GPU.

DCP Providers launch today. Run compute jobs on your GPU, keep 75% of revenue. No setup cost. Automatic scaling.

RTX 4090: 80–120 SAR/day
A40: 100–150 SAR/day
H100: 200–300 SAR/day

5 min setup. Register: https://dcp.sa/setup

#GPU #PassiveIncome #Saudi

---

## GPU Community Forum / Discord Post

**Title:** Earn SAR with Your GPU (Zero Upfront, 75% Payout)

**Body:**

Hey GPU miners/enthusiasts,

If your GPU isn't running ETH mining anymore, here's an alternative: DCP.

**The pitch:**
- Register your GPU
- Install our daemon (open-source, transparent)
- Run inference jobs for AI developers
- Get 75% of revenue (~50–300 SAR/day depending on GPU)

**Why this instead of cloud mining?**
- Stable demand (AI companies always need compute)
- Better margins (75% vs cloud mining's 50%)
- No downtime penalties (only pay when jobs run)
- Smart contract escrow (no platform taking your earnings)

**Setup:**
```
1. Download: https://dcp.sa/releases/dcp-daemon-v3.0.tar.gz
2. Register: https://dcp.sa/setup
3. Run: ./dcp-daemon --provider-id X --auth-token Y
4. Earnings appear in dashboard in real-time
```

**Specs:**
- Minimum 8 GB VRAM (RTX 3060+)
- Ubuntu 20.04+ or NVIDIA-compatible OS
- Docker 20.10+
- ~100 Mbps internet

We cache models locally, so first job is slow (2–15 min) but repeats load in <30 sec.

Full setup guide: https://dcp.sa/docs/provider-setup

Questions? Ask here or email providers@dcp.sa

---

## Referral Program Email (Existing Providers)

**Subject:** Get 500 SAR per Provider You Recruit (Unlimited)

**From:** providers@dcp.sa

**Body:**

Hi [Provider Name],

You're already earning with DCP. Here's how to earn more: referrals.

**The program:**
- Refer a GPU provider
- They register and complete onboarding (~2 days)
- You get 500 SAR (one-time bonus)
- They earn 75% as usual (no difference for them)
- No limit—refer as many as you want

**How it works:**
```
Share your unique link: https://dcp.sa/setup?ref=YOUR_PROVIDER_ID

Every signup from that link → 500 SAR to your wallet
```

**Why refer?**
- More providers = more jobs for everyone (higher utilization)
- You're supporting other GPU owners in MENA
- Easy income (passive after they join)

**Bonus:** Refer 5+ providers by March 31 → Featured on "Provider Champions" leaderboard + 2000 SAR bonus

Docs: https://dcp.sa/docs/referrals

Questions? Email providers@dcp.sa

---

## Provider Onboarding Checklist Email

**Trigger:** After registration, before daemon installation

**Subject:** Your DCP Provider Setup (Step-by-Step Checklist)

**From:** onboarding@dcp.sa

**Body:**

Hi [Provider Name],

You're registered. Here's your setup checklist:

**Pre-requisites (Check these first):**
- [ ] Ubuntu 20.04+ or CentOS 8+
- [ ] NVIDIA GPU with 8 GB+ VRAM
- [ ] Docker installed (version 20.10+)
- [ ] NVIDIA Container Toolkit installed
- [ ] 100+ Mbps internet connection
- [ ] ~/dcp directory writable

**Installation (5 minutes):**
```bash
# Download daemon v3.0
curl -O https://dcp.sa/releases/dcp-daemon-v3.0.tar.gz
tar -xzf dcp-daemon-v3.0.tar.gz
cd dcp-daemon

# Configure auth
export PROVIDER_ID=YOUR_PROVIDER_ID
export AUTH_TOKEN=YOUR_TOKEN

# Start daemon
./install.sh
pm2 start dcp-daemon --name="dcp-daemon"
```

**Verify installation:**
```bash
curl http://localhost:8000/health
# Should return: {"status": "ready", "provider_id": "YOUR_ID"}
```

**Model caching (5 minutes):**
DCP automatically downloads and caches models. By default:
- Cache location: `/opt/dcp/model-cache` (50 GB recommended)
- If you have less space, change in config: `CACHE_DIR=/path/to/bigger/drive`

**Next steps:**
1. ✅ Daemon running (check status at dashboard)
2. 🔄 Wait for first job (should come within 1–2 hours)
3. 📊 Monitor earnings in real-time dashboard
4. 💳 Withdraw to bank account daily

**Support:**
- Setup issues? https://dcp.sa/docs/provider-setup
- Daemon logs? `pm2 logs dcp-daemon`
- Questions? providers@dcp.sa
- Live chat? Discord: https://discord.dcp.sa

You're all set. Your earnings start when the first job lands.

Cheers,
The DCP Team

P.S. — Check your provider rating dashboard (https://dcp.sa/provider/dashboard). High uptime = more jobs.

---

## Provider Success Story Email (Day 3)

**Trigger:** Send to providers who completed 5+ jobs

**Subject:** You earned [AMOUNT] SAR in 2 days (here's how to earn more)

**From:** providers@dcp.sa

**Body:**

Hi [Provider Name],

Great news—your RTX 4090 earned **[AMOUNT] SAR** in 2 days.

That's **[DAILY_AVG] SAR/day**. At this rate, you'll hit **[MONTHLY_PROJ] SAR/month**.

**How to earn more:**

1. **Optimize uptime:** Every hour offline = missed jobs. Keep daemon running 24/7. (Currently you're at [UPTIME]% uptime.)

2. **Boost cache hits:** 80% of your jobs use cached models. First-job cold starts are slow (but you still get paid for every second). Subsequent jobs fly.

3. **Refer other providers:** 500 SAR per referral. Your network = passive income.

4. **Scale to multi-GPU:** Already have another GPU? Register it in 2 minutes. Earnings stack per GPU.

**Your stats:**
- Total jobs: [JOBS]
- Total earnings: [AMOUNT] SAR
- Uptime: [UPTIME]%
- Avg latency: [LATENCY]ms
- Reputation score: [SCORE]/100

**What renters want:**
- High uptime (>99%)
- Low latency (<500ms)
- Reliable Docker (no OOM kills)

You're at [X/Y]. Keep going.

**Next milestone:** Hit 99% uptime → Featured on leaderboard + 1000 SAR bonus

Keep earning. https://dcp.sa/provider/dashboard

Cheers,
The DCP Team

---

## Provider Churn Email (If offline >24 hours)

**Trigger:** Daemon offline for 24+ hours

**Subject:** Your Daemon is Offline (You're Losing Earnings)

**From:** support@dcp.sa

**Body:**

Hi [Provider Name],

Your GPU has been offline for [HOURS] hours. That means no jobs, no earnings.

**Common reasons:**

1. **Daemon crashed** → Check: `pm2 logs dcp-daemon`
2. **Internet down** → Check connectivity
3. **Out of disk space** → Check: `df -h /opt/dcp/model-cache`
4. **GPU overheating** → Check: `nvidia-smi`

**Get back online:**
```bash
pm2 restart dcp-daemon
# Takes 30 seconds. You're earning again.
```

**Help:**
- Daemon won't start? https://dcp.sa/docs/troubleshooting
- Ask for help: providers@dcp.sa

Every hour you're down, renters use other providers. Bring your daemon back and reclaim your jobs.

Support: providers@dcp.sa

---

## Provider Earnings Report Email (Weekly)

**Subject:** Your Weekly DCP Earnings: [AMOUNT] SAR

**From:** earnings@dcp.sa

**Body:**

Hi [Provider Name],

Here's your weekly summary:

**Earnings:**
- Total: [AMOUNT] SAR
- Jobs completed: [X]
- Avg job duration: [Y] minutes
- Avg earnings/job: [Z] SAR

**Uptime:**
- This week: [%]%
- All-time: [%]%
- Status: ✅ Excellent (top 20%)

**Reputation:**
- Rating: [X]/100
- Leaderboard rank: #[X] (top 10%)
- Feedback: Renters love your latency

**Next steps:**
- Keep it up! You're in the top 10% of providers.
- Maintain >99% uptime → Featured on leaderboard next week
- Refer 3+ providers → Unlock "Provider Champion" badge

**Withdraw earnings:**
https://dcp.sa/provider/dashboard/withdraw

You've earned [AMOUNT] SAR this week. Keep that daemon running.

Cheers,
The DCP Team

---

## Crisis Email (If Provider Needs Help)

**Subject:** We're Here to Help (Urgent Support)

**From:** support@dcp.sa

**Body:**

Hi [Provider Name],

You reached out with a technical issue. Let's fix it.

**Issue:** [SUMMARIZE_ISSUE]

**Our recommendation:**
[SOLUTION_STEPS]

**If that doesn't work:**
1. Share daemon logs: `pm2 logs dcp-daemon > logs.txt`
2. Send to: support@dcp.sa
3. We'll debug within 2 hours

**Meanwhile:**
- Your daemon is [STATUS]
- You're still earning if it's running
- We'll notify you when we fix it

Support: support@dcp.sa | Discord: https://discord.dcp.sa

---

## Provider Tier System Email (Unlock benefits)

**Subject:** You're now a Silver Provider (Unlock Exclusive Benefits)

**From:** providers@dcp.sa

**Body:**

Hi [Provider Name],

Congratulations! You've earned **2000+ SAR** and hit **99%+ uptime**. You're now a **Silver Provider**.

**Silver benefits:**
✅ Featured on provider leaderboard
✅ Priority support (24/7 dedicated)
✅ 10% bonus payout (75% → 82.5%)
✅ Access to high-priority jobs
✅ Monthly earnings bonus (min 500 SAR)

**Next tier: Gold**
Hit 5000+ SAR earnings + 99.5%+ uptime = Gold benefits (15% bonus, enterprise job priority).

**Your current stats:**
- Earnings: [AMOUNT] SAR
- Uptime: [%]%
- Jobs completed: [X]
- Reputation: [SCORE]/100

Keep earning. You're doing great.

Dashboard: https://dcp.sa/provider/dashboard

Cheers,
The DCP Team
