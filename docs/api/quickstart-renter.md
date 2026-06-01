# Renter Quickstart (5 Minutes)

Submit your first compute job in 5 minutes.

## Prerequisites

- A Renter account (create below)
- API key
- Account balance (register and top up)
- 5 minutes

## Step 1: Create Your Renter Account (30 seconds)

```bash
curl -X POST https://api.dcp.sa/api/renters/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "organization": "Acme AI"
  }'
```

**Response:**
```json
{
  "success": true,
  "renter_id": 7,
  "api_key": "dcp-renter-a1b2c3d4e5f6...",
  "message": "Welcome John Doe! Save your API key — it won't be shown again."
}
```

**What you get:**
- `renter_id` — Your unique account ID
- `api_key` — Use this to authenticate all requests (keep it secret!)
- Access to the renter dashboard at `https://console.dcp.sa/renters/`

## Step 2: Add Balance to Your Account (1 minute)

DCP jobs are paid in halala (1 SAR = 100 halala). Top up your account:

```bash
curl -X POST https://api.dcp.sa/api/renters/topup \
  -H "Content-Type: application/json" \
  -H "x-renter-key: dcp-renter-a1b2c3d4e5f6..." \
  -d '{
    "amount_sar": 50
  }'
```

**Response:**
```json
{
  "success": true,
  "topped_up_sar": 50.0,
  "topped_up_halala": 5000,
  "new_balance_sar": 50.0,
  "new_balance_halala": 5000
}
```

**Pricing examples:**
- Small LLM inference (Mistral 7B): 10–20 SAR per job
- Image generation (SDXL): 5–15 SAR per image
- Training job (1 hour): 100–300 SAR

## Step 3: See Available Providers (30 seconds)

```bash
curl https://api.dcp.sa/api/renters/available-providers
```

**Response:**
```json
{
  "providers": [
    {
      "id": 3,
      "name": "Riyadh GPU Node A",
      "gpu_model": "NVIDIA RTX 4090",
      "vram_gb": 24,
      "status": "online",
      "is_live": true,
      "reliability_score": 98,
      "cached_models": ["mistralai/Mistral-7B-Instruct-v0.2"]
    }
  ],
  "total": 4
}
```

**Tips:**
- `is_live: true` = daemon sent heartbeat in last 2 minutes (job will start immediately)
- `reliability_score` = historical success rate
- `cached_models` = pre-pulled models (faster startup)

## Step 4: Submit Your First Job (2 minutes)

### Example: LLM Inference

```bash
curl -X POST https://api.dcp.sa/api/jobs/submit \
  -H "Content-Type: application/json" \
  -H "x-renter-key: dcp-renter-a1b2c3d4e5f6..." \
  -d '{
    "provider_id": 3,
    "job_type": "llm_inference",
    "duration_minutes": 5,
    "params": {
      "model": "mistralai/Mistral-7B-Instruct-v0.2",
      "prompt": "Explain quantum computing in simple terms",
      "max_tokens": 256,
      "temperature": 0.7
    },
    "priority": 2,
    "gpu_requirements": {
      "min_vram_gb": 16
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "job_id": "job-1710843200000-x7k2p",
  "status": "queued",
  "estimated_cost_sar": 12.5,
  "estimated_cost_halala": 1250,
  "submitted_at": "2026-03-23T10:00:00Z"
}
```

**What happens:**
1. Job enters the queue
2. Provider daemon picks it up within seconds (if live)
3. Model is loaded (or pulled if not cached)
4. Inference runs on the GPU
5. Results are returned via webhook or polling

### Example: Image Generation

```bash
curl -X POST https://api.dcp.sa/api/jobs/submit \
  -H "Content-Type: application/json" \
  -H "x-renter-key: dcp-renter-a1b2c3d4e5f6..." \
  -d '{
    "provider_id": 5,
    "job_type": "image_generation",
    "duration_minutes": 3,
    "params": {
      "model": "stabilityai/stable-diffusion-xl-base-1.0",
      "prompt": "A serene Saudi landscape at sunset with camels",
      "steps": 20,
      "width": 1024,
      "height": 768
    },
    "priority": 2
  }'
```

## Step 5: Check Job Status

### Poll for Results

```bash
curl https://api.dcp.sa/api/jobs/job-1710843200000-x7k2p/status \
  -H "x-renter-key: dcp-renter-a1b2c3d4e5f6..."
```

**Response (in progress):**
```json
{
  "job_id": "job-1710843200000-x7k2p",
  "status": "running",
  "started_at": "2026-03-23T10:00:30Z",
  "provider_id": 3,
  "progress_percent": 45
}
```

**Response (completed):**
```json
{
  "job_id": "job-1710843200000-x7k2p",
  "status": "completed",
  "started_at": "2026-03-23T10:00:30Z",
  "completed_at": "2026-03-23T10:02:15Z",
  "actual_cost_sar": 11.2,
  "actual_cost_halala": 1120,
  "result": {
    "output": "Quantum computing leverages quantum mechanics..."
  }
}
```

### Get Job Output

```bash
curl https://api.dcp.sa/api/jobs/job-1710843200000-x7k2p/output \
  -H "x-renter-key: dcp-renter-a1b2c3d4e5f6..."
```

Returns the full output (text, image binary, etc.)

## Step 6: Check Your Balance

```bash
curl https://api.dcp.sa/api/renters/balance \
  -H "x-renter-key: dcp-renter-a1b2c3d4e5f6..."
```

**Response:**
```json
{
  "balance_sar": 38.8,
  "balance_halala": 3880,
  "held_sar": 0,
  "held_halala": 0,
  "available_sar": 38.8,
  "total_spent_sar": 11.2,
  "total_jobs": 1
}
```

- `balance_halala` = Total funds in account
- `held_halala` = Funds locked for running jobs
- `available_halala` = Available to spend

## Supported Job Types

| Job Type | Description | Example Use |
|---|---|---|
| `llm_inference` | Text generation | Chatbots, summarization |
| `image_generation` | Image synthesis | Art generation, design tools |
| `vllm_serve` | OpenAI-compatible API | Drop-in ChatGPT replacement |
| `custom_container` | Run custom Docker | Your own workload |
| `training` | Train/fine-tune models | Custom model training |
| `rendering` | 3D/video rendering | VFX, animation |
| `benchmark` | Benchmark GPU | Hardware evaluation |

## Common Tasks

### Set Up Webhooks for Job Notifications

Get callbacks when your jobs complete instead of polling:

```bash
curl -X POST https://api.dcp.sa/api/renters/webhooks \
  -H "Content-Type: application/json" \
  -H "x-renter-key: dcp-renter-a1b2c3d4e5f6..." \
  -d '{
    "url": "https://my-app.example.com/dcp/webhook",
    "events": ["job.completed", "job.failed"]
  }'
```

DCP will POST to your URL when events occur:

```json
{
  "event": "job.completed",
  "job_id": "job-1710843200000-x7k2p",
  "status": "completed",
  "timestamp": "2026-03-23T10:02:15Z"
}
```

### List Your Recent Jobs

```bash
curl https://api.dcp.sa/api/renters/jobs \
  -H "x-renter-key: dcp-renter-a1b2c3d4e5f6..." \
  | jq '.jobs[] | {job_id, status, submitted_at, cost_sar}'
```

### Cancel a Job

```bash
curl -X POST https://api.dcp.sa/api/jobs/job-1710843200000-x7k2p/cancel \
  -H "x-renter-key: dcp-renter-a1b2c3d4e5f6..."
```

Returns a pro-rated refund if the job hasn't started.

## Troubleshooting

### Job Status Stuck in "Queued"

**Symptom:** Job has been queued for 5+ minutes

**Fix:**
1. Check if `is_live: false` for that provider — try a different one
2. Verify your balance is sufficient: `curl /api/renters/balance`
3. Try a less specific `gpu_requirements` filter
4. Report persistent issues to support@dcp.sa

### Job Failed

**Symptom:** `status: "failed"` with error message

**Fix:**
1. Check error details in the job status response
2. Common causes:
   - Model too large for GPU VRAM — increase `min_vram_gb`
   - Prompt too long — reduce `max_tokens`
   - Provider offline — choose a different provider
3. Contact support with your job ID if issue persists

### Balance Insufficient

**Symptom:** `"error": "Insufficient balance"` when submitting a job

**Fix:**
1. Top up your account: `curl -X POST /api/renters/topup -d '{"amount_sar": 50}'`
2. Try a job with shorter duration or different model
3. Check estimated cost before submitting

## Next Steps

- **Build an app:** [SDK Examples](./sdk-examples.md)
- **Full API reference:** [Renter endpoints](../openapi.yaml#/renters)
- **Advanced guides:** [Renter quick start](../guides/renter-quick-start.md), [Troubleshooting](../guides/troubleshooting.md)
- **Get help:** support@dcp.sa

---

**Congratulations!** You've submitted your first compute job and are ready to scale.
