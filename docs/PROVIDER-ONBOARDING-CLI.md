# DCP Provider Onboarding CLI (DCP-766)

## Overview

The **DCP Provider Onboarding CLI** is a one-command script that guides new GPU providers from zero to active on the DCP platform in approximately 5 minutes.

**Goal:** A provider with a GPU and internet connection runs **one command** and is live on DCP within 5 minutes.

## Quick Start

```bash
# Basic usage (connects to production api.dcp.sa)
node scripts/provider-onboard.mjs

# Custom API URL
DCP_API_URL=https://api.custom.com node scripts/provider-onboard.mjs
```

## What the Script Does

### 1. **Prerequisite Checks** (30 seconds)
   - ✅ Detects NVIDIA GPU (via `nvidia-smi`)
   - ✅ Verifies Node.js is installed
   - ✅ Tests internet connectivity to DCP API
   - ✅ Detects operating system (Linux/macOS/Windows)

### 2. **GPU Benchmark** (2-3 minutes)
   - Runs `provider-gpu-benchmark.mjs` to measure:
     - GPU model and VRAM
     - TFLOPS (compute throughput)
     - Memory bandwidth
     - Token throughput estimate
   - Assigns tier (A/B/C) based on GPU capabilities
   - Validates GPU meets minimum requirements (8GB VRAM, 10+ TFLOPS)

### 3. **Earnings Estimate** (instant)
   - Calculates estimated monthly earnings based on:
     - GPU tier
     - 70% utilization assumption
     - DCP rate card ($0.15-$0.45/hour depending on tier)

### 4. **Provider Registration** (30 seconds)
   - Collects provider information:
     - Name
     - Email address
     - Location
   - Calls `/api/providers/register` endpoint
   - Receives:
     - Unique `provider_id`
     - `api_key` (required for serving jobs)
     - `installer_url` (for downloading daemon)

### 5. **Benchmark Submission** (10 seconds)
   - Submits benchmark results to `/api/providers/:id/benchmark`
   - Backend auto-assigns tier based on GPU specs
   - Results used for capacity planning

### 6. **Success Confirmation** (5 seconds)
   - Displays provider ID, API key, tier, earnings estimate
   - Shows next steps
   - Saves configuration to local file

## Features

### Offline-First Design
If the API is unreachable:
- ✅ Script completes GPU benchmark locally
- ✅ Saves all results to `dcp-onboarding-results.json`
- ✅ Enables manual submission later

```bash
# Send results to support when API recovers
cat dcp-onboarding-results.json | mail support@dcp.sa
```

### Graceful Error Handling
- Validates all inputs before API calls
- Provides helpful error messages
- Exits cleanly on failure
- Logs detailed errors for debugging

### Cross-Platform Support
- Linux (primary)
- macOS (Darwin)
- Windows (via WSL or Windows Subsystem for Linux)

## File Outputs

### `dcp-provider-config.json` (Local Backup)
Saved after successful registration. Example:

```json
{
  "status": "registered",
  "providerId": 12345,
  "apiKey": "dc1-provider-a1b2c3d4e5f6g7h8i9j0",
  "gpuModel": "NVIDIA RTX 4090",
  "tier": "B",
  "timestamp": "2026-03-24T02:30:00.000Z",
  "providerInfo": {
    "name": "Ahmed's Mining Cafe",
    "email": "ahmed@example.com",
    "location": "Riyadh, Saudi Arabia"
  }
}
```

### `dcp-onboarding-results.json` (Offline Mode)
Created only if API is unreachable:

```json
{
  "status": "offline_registration",
  "timestamp": "2026-03-24T02:30:00.000Z",
  "registration": {
    "name": "...",
    "email": "...",
    "gpu_model": "...",
    "os": "linux",
    "resource_spec": {...}
  },
  "benchmark": {
    "gpu_model": "...",
    "vram_gb": 24,
    "tflops": 330,
    ...
  },
  "savedAt": "2026-03-24T02:30:00.000Z"
}
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DCP_API_URL` | `https://api.dcp.sa` | DCP API endpoint |

Example:
```bash
DCP_API_URL=http://localhost:8083 node scripts/provider-onboard.mjs
```

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. PREREQUISITES                                            │
│    ├─ Check nvidia-smi (GPU)                              │
│    ├─ Check Node.js version                               │
│    ├─ Test API connectivity                               │
│    └─ Detect OS (Linux/macOS/Windows)                     │
└────────────┬────────────────────────────────────────────────┘
             │ (30 sec)
┌────────────v────────────────────────────────────────────────┐
│ 2. GPU BENCHMARK                                            │
│    ├─ Measure VRAM, TFLOPS, bandwidth                       │
│    ├─ Estimate token throughput                             │
│    ├─ Validate minimum requirements                         │
│    └─ Assign tier (A/B/C)                                   │
└────────────┬────────────────────────────────────────────────┘
             │ (2-3 min)
┌────────────v────────────────────────────────────────────────┐
│ 3. EARNINGS ESTIMATE                                        │
│    ├─ Calculate hourly rate by tier                         │
│    ├─ Estimate monthly at 70% utilization                   │
│    └─ Display to user                                       │
└────────────┬────────────────────────────────────────────────┘
             │ (instant)
┌────────────v────────────────────────────────────────────────┐
│ 4. USER CONFIRMATION                                        │
│    └─ Prompt: "Register as provider? (y/n)"               │
└────────────┬─────────────────┬────────────────────────────────┘
             │ (user input)    │ (exit if no)
             │                 │
┌────────────v────────────────────────────────────────────────┐
│ 5. COLLECT INFO                                             │
│    ├─ Name                                                  │
│    ├─ Email                                                 │
│    └─ Location                                              │
└────────────┬────────────────────────────────────────────────┘
             │ (30 sec)
┌────────────v────────────────────────────────────────────────┐
│ 6. REGISTER PROVIDER                                        │
│    ├─ POST /api/providers/register                          │
│    ├─ Receive: provider_id, api_key                         │
│    └─ Save config locally                                   │
└────────────┬────────────────────────────────────────────────┘
             │ (30 sec)
┌────────────v────────────────────────────────────────────────┐
│ 7. SUBMIT BENCHMARK                                         │
│    ├─ POST /api/providers/:id/benchmark                     │
│    └─ Backend auto-assigns tier & capacity                  │
└────────────┬────────────────────────────────────────────────┘
             │ (10 sec)
┌────────────v────────────────────────────────────────────────┐
│ 8. SUCCESS DISPLAY                                          │
│    ├─ Show provider_id, api_key, tier, earnings            │
│    ├─ Show next steps                                       │
│    └─ Save dcp-provider-config.json                         │
└────────────────────────────────────────────────────────────┘
             │ (5 sec)
        TOTAL: ~5 min
```

## Tier Assignment & Earnings

### GPU Tier Mapping

| Tier | GPU Examples | VRAM | TFLOPS | Hourly Rate | Monthly (70% util) |
|------|--------------|------|--------|-------------|-------------------|
| **A** | H100, H200, MI300X | 40-80GB | 900+ | $0.45 | ~23,850 SAR |
| **B** | RTX 4090, 4080, A6000 | 20-48GB | 200-330 | $0.30 | ~15,900 SAR |
| **C** | RTX 3090, 4070, A5000 | 8-20GB | 50-200 | $0.15 | ~7,950 SAR |

Rates based on **platform pricing model** (DCP pricing vs Vast.ai benchmarks).

### Auto-Tier Assignment

Script assigns tier based on:
1. GPU model (if known)
2. TFLOPS + VRAM combination
3. Backend validates and confirms

## Error Handling

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| `nvidia-smi not found` | GPU drivers not installed | Install NVIDIA drivers |
| `GPU VRAM below minimum` | GPU has <8GB | Use different GPU |
| `Email already exists` | Provider registered twice | Use different email |
| `Cannot reach DCP API` | Network/firewall issue | Offline mode: saves results locally |
| `Invalid JSON response` | API endpoint changed | Update `DCP_API_URL` |

### Offline Mode

If API is unreachable:

```
⚠  Could not reach DCP API - will save results for manual submission
ℹ  You can submit results later by sending: dcp-onboarding-results.json to support@dcp.sa
```

Results are saved and can be submitted manually later.

## Integration Points

### Depends On
- **`scripts/provider-gpu-benchmark.mjs`** — GPU measurement script
- **DCP Backend APIs:**
  - `POST /api/providers/register` — Provider registration
  - `POST /api/providers/:id/benchmark` — Benchmark submission
  - `GET /api/health` — Connectivity check

### Used By
- **Provider Activation Campaign** — DevRel uses this to onboard 43 registered providers
- **Provider Documentation** — Included in setup guide for new providers
- **Marketing Materials** — Demonstrated in video/walkthrough

## Testing

### Local Development
```bash
# Test with custom API URL
DCP_API_URL=http://localhost:8083 node scripts/provider-onboard.mjs
```

### Production
```bash
# Default to production API
node scripts/provider-onboard.mjs
```

### Offline Mode
```bash
# Simulate API failure (results saved to JSON)
DCP_API_URL=http://unreachable-api-999.local node scripts/provider-onboard.mjs
```

## Next Steps After Onboarding

1. **Download Provider Daemon**
   - Linux: `curl -fsSL https://dcp.sa/install | bash`
   - Windows: Download installer from `api.dcp.sa`

2. **Configure Daemon**
   ```bash
   export DC1_PROVIDER_ID=<provider_id>
   export DC1_API_KEY=<api_key>
   ./provider-daemon start
   ```

3. **Verify Status**
   ```bash
   curl -H "Authorization: Bearer $DC1_API_KEY" https://api.dcp.sa/api/providers/me
   ```

4. **Start Serving Jobs**
   - Daemon will pull jobs from queue
   - Earnings accrue in real-time
   - Weekly payouts via crypto/bank transfer

## Support

- **Documentation:** https://docs.dcp.sa/providers
- **Email:** support@dcp.sa
- **Telegram:** https://t.me/dcp-providers
- **Discord:** https://discord.gg/dcp

## Implementation Details

- **Language:** Node.js (ESM)
- **Dependencies:** Node.js built-ins only (no npm packages)
- **Lines of Code:** 450+
- **Execution Time:** ~5 minutes
- **Branch:** `ml-infra/provider-onboarding-cli`

## Related Issues

- **DCP-766** — Provider onboarding CLI (this issue)
- **DCP-757** — Per-token metering verification
- **DCP-723** — GPU benchmarking
- **DCP-642** — Container builds (blocked on GitHub Actions secrets)

## Changelog

### v1.0.0 (2026-03-24)
- ✅ Initial release
- ✅ GPU prerequisite checks
- ✅ GPU benchmark integration
- ✅ Provider registration flow
- ✅ Benchmark submission
- ✅ Offline-first support
- ✅ Cross-platform support
- ✅ Earnings estimation
