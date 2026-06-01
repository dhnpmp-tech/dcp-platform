# Provider Quickstart (5 Minutes)

Get your GPUs online and start earning SAR.

## Prerequisites

- NVIDIA GPU (RTX 4090, A100, H100, etc.)
- Linux server with Docker installed
- Public IP address or dynamic DNS
- Basic knowledge of command line

## Step 1: Register Your Provider (1 minute)

```bash
curl -X POST https://api.dcp.sa/api/providers/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My GPU Node",
    "location": "SA",
    "contact_email": "ops@example.com"
  }'
```

**Response:**
```json
{
  "success": true,
  "provider_id": 42,
  "api_key": "dcp-provider-a1b2c3d4e5f6...",
  "message": "Registration successful. Save your API key!"
}
```

**What you get:**
- `provider_id` — Unique identifier for your provider account
- `api_key` — Use this to authenticate all provider requests
- Earnings dashboard at `https://console.dcp.sa/providers/`

## Step 2: Install & Configure the Daemon (2 minutes)

The DCP daemon polls for jobs and manages your GPU.

```bash
# Download the daemon
curl -L https://dcp.sa/daemon/latest -o dcp-daemon && chmod +x dcp-daemon

# Create config file
cat > dcp-daemon.env << EOF
DCP_PROVIDER_ID=42
DCP_API_KEY=dcp-provider-a1b2c3d4e5f6...
DCP_API_URL=https://api.dcp.sa
DCP_LISTEN_PORT=8000
DCP_GPU_INDEX=0
EOF

# Run the daemon
./dcp-daemon --config dcp-daemon.env
```

**Or use Docker:**
```bash
docker run -d \
  --gpus all \
  -e DCP_PROVIDER_ID=42 \
  -e DCP_API_KEY=dcp-provider-a1b2c3d4e5f6... \
  -p 8000:8000 \
  dcp-registry.azurecr.io/provider-daemon:latest
```

**What the daemon does:**
- Sends heartbeats to DCP every 30 seconds
- Polls for new compute jobs
- Executes jobs in isolated containers
- Reports job completion and results
- Handles GPU resource management

## Step 3: Verify Your Provider is Online (1 minute)

```bash
curl https://api.dcp.sa/api/renters/available-providers
```

Look for your provider in the response. Key fields:

```json
{
  "id": 42,
  "name": "My GPU Node",
  "gpu_model": "NVIDIA RTX 4090",
  "vram_gb": 24,
  "status": "online",
  "is_live": true,
  "reliability_score": 100,
  "cached_models": []
}
```

- `is_live: true` means renters can see and use your GPU
- `reliability_score` increases as you complete jobs
- `cached_models` shows models pre-pulled on your hardware (faster jobs)

## Step 4: Monitor Your Earnings

### Via Web Console
Visit `https://console.dcp.sa/providers/` and log in with your `api_key`.

### Via API
```bash
curl https://api.dcp.sa/api/providers/earnings \
  -H "x-provider-key: dcp-provider-a1b2c3d4e5f6..."
```

**Response:**
```json
{
  "total_earnings_halala": 15000,
  "total_earnings_sar": 150.0,
  "today_earnings_halala": 2500,
  "today_earnings_sar": 25.0,
  "total_jobs_completed": 18,
  "total_runtime_hours": 42.5,
  "next_payout_date": "2026-03-26"
}
```

## Common Tasks

### Pre-download a Model (Speed Up Jobs)

Models are cached on your hardware. Pre-download popular models to serve jobs faster:

```bash
# SSH into your provider machine and run:
dcp-daemon --preload mistralai/Mistral-7B-Instruct-v0.2

# Check cached models:
curl https://api.dcp.sa/api/providers/42 \
  -H "x-provider-key: dcp-provider-a1b2c3d4e5f6..."
```

### Pause Your Provider

When you need maintenance, pause jobs without going offline:

```bash
curl -X POST https://api.dcp.sa/api/providers/pause \
  -H "x-provider-key: dcp-provider-a1b2c3d4e5f6..."
```

New jobs won't be assigned, but in-progress jobs continue. Resume with `/api/providers/resume`.

### Check Job Queue

See what jobs are queued for your provider:

```bash
curl https://api.dcp.sa/api/providers/42/queue \
  -H "x-provider-key: dcp-provider-a1b2c3d4e5f6..."
```

**Response:**
```json
{
  "queued": [
    {
      "job_id": "job-1710843200000-x7k2p",
      "type": "llm_inference",
      "status": "pending",
      "submitted_at": "2026-03-23T10:00:00Z"
    }
  ],
  "total": 1
}
```

## Troubleshooting

### Daemon Won't Connect

**Symptom:** `is_live: false` or provider doesn't appear in marketplace

**Fix:**
1. Check your internet connection and firewall (port 8000 must be open)
2. Verify your `api_key` is correct
3. Check daemon logs: `docker logs <container-id>`
4. Ensure NVIDIA drivers are installed: `nvidia-smi`

### Low Reliability Score

**Symptom:** Few job assignments despite being online

**Fix:**
1. Complete jobs successfully — timeout/crashes hurt reliability
2. Pre-cache popular models to speed up job startup
3. Keep daemon uptime high (avoid frequent restarts)
4. Monitor GPU health: `nvidia-smi` (no thermal throttling)

### Job Fails Unexpectedly

**Symptom:** Jobs submitted but marked as failed

**Fix:**
1. Check daemon logs for error details
2. Ensure VRAM is sufficient for the job model
3. Verify container runtime is healthy: `docker ps`
4. Report critical issues to support@dcp.sa

## Next Steps

- **Optimize setup:** [Provider setup guide](../guides/provider-setup-guide.md)
- **Advanced configuration:** [Provider guide](../provider-guide.md)
- **Full API reference:** [Provider endpoints](../openapi.yaml#/providers)
- **Get help:** support@dcp.sa

---

**You're now ready to earn!** Your GPUs are online and visible to renters.
