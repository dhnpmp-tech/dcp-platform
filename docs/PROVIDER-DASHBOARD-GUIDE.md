# Provider Dashboard — Earnings & Settlement Guide

**Status:** Maintained
**Audience:** GPU providers, node operators
**Last Updated:** 2026-03-23

---

## Dashboard Overview

The Provider Dashboard displays real-time earnings, job history, escrow status, and settlement options. Access at: **https://dashboard.dcp.sa/provider**

---

## Key Sections

### 1. Earnings Summary

**Top Card:**
- **Total Earned (All-Time)** — Sum of all completed job payouts
- **This Month** — YTD earnings for current calendar month
- **Available to Withdraw** — Unlocked escrow ready for settlement
- **Pending Release** — Escrow locked in in-flight jobs

**Example:**
```
Total Earned: 245.50 SepoliaETH
This Month: 45.30 SepoliaETH
Available: 12.15 SepoliaETH
Pending: 33.15 SepoliaETH
```

### 2. Earnings by GPU Model

Breakdown of revenue per GPU type (e.g., RTX 4090, H100):

| GPU Model | Jobs | Avg Payout/Job | Total |
|-----------|------|----------------|-------|
| RTX 4090 | 142 | 0.34 SepoliaETH | 145.20 |
| RTX 4080 | 87 | 0.18 SepoliaETH | 68.40 |
| A100 | 23 | 0.68 SepoliaETH | 31.90 |

Use this to understand which GPU models attract higher-value work.

### 3. Job History Table

Filter by:
- Date range
- Status (completed, in-progress, failed, cancelled)
- GPU used
- Model served (Nemotron, Llama, SDXL, etc.)

**Columns:**
- Job ID
- Model
- Duration
- Payout
- Status
- Settlement Status

### 4. Escrow & Settlement

**Current Escrow:**
- Balance: X.XX SepoliaETH
- Locked in Jobs: Y.YY
- Available to Withdraw: Z.ZZ

**Withdraw Button:**
Initiates settlement payout to provider wallet. Typically 5–15 minute confirmation.

### 5. Monthly Income Projection

Shows estimated monthly earnings based on:
- Current utilization (%)
- Average job payout
- GPU uptime

**Example:**
```
Current Utilization: 64%
Avg Job Payout: 0.28 SepoliaETH
Projected Monthly (70% target): 420 SepoliaETH
```

---

## Common Tasks

### Check Today's Earnings

1. Click **Earnings Summary** card
2. View **Today** tab
3. See real-time job count and payout

### Withdraw Earnings

1. Navigate to **Escrow & Settlement**
2. Click **Withdraw Available Balance**
3. Review withdrawal address (auto-filled from onboarding)
4. Confirm transaction
5. Wait 5–15 minutes for settlement

### Track Specific Job

1. Go to **Job History**
2. Search by Job ID or date
3. Click row to view details:
   - Model and parameters
   - Exact payout
   - Settlement status
   - Any disputes or notes

### Understand GPU Performance

1. View **Earnings by GPU Model**
2. Identify highest-value GPU type
3. Consider upgrading underperforming models
4. Reference the [Pricing Guide](/docs/pricing-guide) for margin analysis

---

## Metrics Explained

| Metric | Definition | Why It Matters |
|--------|-----------|---|
| **Utilization %** | % of time GPU is serving jobs | Higher = more earnings; target 70% |
| **Average Payout/Job** | Mean earnings per completed job | Higher tier GPUs serve higher-value jobs |
| **Escrow Lock-up Time** | Time from job start to payout release | Longer = delayed cash flow |
| **Settlement Lag** | Time from escrow release to wallet receipt | Impacts daily cash management |

---

## Income Projection Calculator

**How It Works:**

Given current utilization and job distribution, the calculator projects:

```
Monthly Revenue = (Uptime Hours × Utilization%) × (Avg Payout per Hour)
```

**Example:**
- Uptime: 720 hours/month
- Utilization: 65%
- Avg Payout: 0.45 SepoliaETH/hour
- **Projected:** 211.68 SepoliaETH/month

To reach 70% utilization:
```
Projected @ 70% = (720 × 0.70) × 0.45 = 226.8 SepoliaETH/month
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Balance not updating" | Refresh page; wait up to 2 minutes for blockchain settlement |
| "Withdrawal pending" | Check blockchain confirmation status; settlements take 5–15 min |
| "Job payout mismatch" | Review job parameters; verify model pricing in [API Reference](docs/api-reference.md) |
| "Escrow locked longer than expected" | Open dispute via dashboard or contact support |

---

## Next Steps

1. **Set Withdrawal Schedule** — Authorize weekly/monthly automatic payouts (coming soon)
2. **Enable Alerts** — Get notified when utilization drops below target
3. **Analyze Trends** — Export 30-day history to optimize GPU allocation

---

## Related Docs

- [Provider Onboarding Guide](docs/provider-guide.md)
- [Escrow Integration Guide](docs/ESCROW-INTEGRATION-GUIDE.md)
- [Pricing Guide — Provider Economics](/docs/pricing-guide)
