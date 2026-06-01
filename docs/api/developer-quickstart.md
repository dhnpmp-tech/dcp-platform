# DCP API Developer Quickstart

**Deploy your first Arabic LLM in 5 minutes**

This guide walks you through deploying ALLaM-7B (the best open-source Arabic language model) on DCP in under 300 seconds. You'll use the REST API directly — no CLI tools required.

---

## Prerequisites

- A DCP renter account (free signup at https://dcp.sa)
- Your API key from your account dashboard
- `curl` or a REST client (Postman, Insomnia, etc.)

**Estimated time:** 5 minutes
**Cost:** ~$0.0003 (pay-as-you-go, no minimums)

---

## Step 1: List Available Templates (30 seconds)

First, see what's available on the marketplace. This request is public — no API key required.

```bash
curl -X GET https://api.dcp.sa/api/templates \
  -H "Content-Type: application/json"
```

**Response (shortened):**
```json
{
  "templates": [
    {
      "id": "arabic-embeddings",
      "name": "Arabic BGE-M3 Embeddings",
      "description": "MENA retrieval embeddings",
      "category": "embedding",
      "tags": ["arabic", "embedding", "rag"],
      "default_gpus": ["RTX 4090", "A100"],
      "vram_gb": 24,
      "estimated_cost_per_hour": 0.12
    },
    {
      "id": "allam-7b",
      "name": "ALLaM 7B Chat",
      "description": "Meta's LLaMA fine-tuned for Arabic by Saudi ARAMCO",
      "category": "llm",
      "tags": ["arabic", "llm", "inference"],
      "default_gpus": ["RTX 4090", "H100"],
      "vram_gb": 16,
      "estimated_cost_per_hour": 0.18
    }
  ],
  "count": 20
}
```

**Hero template for this guide:** `allam-7b` — the fastest way to serve Arabic text.

---

## Step 2: Deploy ALLaM-7B (2 minutes)

Now deploy the model. You'll need:
- Your API key (available in your renter dashboard)
- A template ID: `allam-7b`
- Optional: resource preferences (GPU type, VRAM, etc.)

```bash
# Save your API key as an env var (for safety)
export API_KEY="your-api-key-here"

# Deploy the template
curl -X POST https://api.dcp.sa/api/templates/allam-7b/deploy \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "renter_id": "your-renter-id",
    "gpu_type": "RTX 4090",
    "vram_gb": 16,
    "duration_minutes": 60,
    "pricing_class": "standard"
  }'
```

**Response:**
```json
{
  "job": {
    "id": "job_1234567890",
    "job_id": "j-abcd1234",
    "template_id": "allam-7b",
    "status": "queued",
    "provider_id": null,
    "submitted_at": "2026-03-24T12:34:56Z",
    "started_at": null,
    "estimated_start_seconds": 45,
    "estimated_cost_per_hour": 0.18,
    "estimated_total_cost": 0.003
  }
}
```

**What happened:**
- Your job is now in the queue waiting for an available provider
- Estimated wait: ~45 seconds (cold-start)
- Cost: $0.0003 for the first hour (60 minutes × $0.18/hr)
- Job ID: `j-abcd1234` — save this for the next step

---

## Step 3: Check Job Status (1 minute)

Poll the status endpoint to see when your job is running:

```bash
JOB_ID="j-abcd1234"  # from the previous response

curl -X GET https://api.dcp.sa/api/jobs/$JOB_ID/status \
  -H "Authorization: Bearer $API_KEY"
```

**Response (while queued):**
```json
{
  "job_id": "j-abcd1234",
  "status": "assigned",
  "provider_id": "prov_xyz789",
  "provider_name": "Riyadh Internet Cafe #3",
  "provider_location": "Saudi Arabia",
  "allocated_gpu": "NVIDIA RTX 4090",
  "allocated_vram_gb": 24,
  "started_at": "2026-03-24T12:35:32Z",
  "estimated_ready_seconds": 120,
  "inference_endpoint": "https://j-abcd1234.dcp.sa:8080",
  "status_message": "Pulling container image (60% done)"
}
```

**Response (when ready):**
```json
{
  "job_id": "j-abcd1234",
  "status": "running",
  "provider_id": "prov_xyz789",
  "provider_name": "Riyadh Internet Cafe #3",
  "allocated_gpu": "NVIDIA RTX 4090",
  "allocated_vram_gb": 24,
  "started_at": "2026-03-24T12:35:32Z",
  "inference_endpoint": "https://j-abcd1234.dcp.sa:8080",
  "health_check_passed": true,
  "ready_for_inference": true,
  "status_message": "Ready to serve requests"
}
```

**What to look for:**
- `status: "running"` — job is live
- `inference_endpoint` — your private inference URL
- `allocated_gpu` — the actual hardware serving you
- `ready_for_inference: true` — you can start querying

---

## Step 4: Run Your First Inference (1 minute)

Once `status: "running"`, send a request to your inference endpoint:

```bash
ENDPOINT="https://j-abcd1234.dcp.sa:8080"

# Text generation request (ALLaM supports OpenAI-compatible /v1/chat/completions)
curl -X POST $ENDPOINT/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "allam-7b",
    "messages": [
      {
        "role": "user",
        "content": "مرحبا! ما هو أفضل مكان للسياحة في السعودية؟"
      }
    ],
    "max_tokens": 256,
    "temperature": 0.7
  }' | jq '.choices[0].message.content'
```

**Response (Arabic text from the model):**
```
أهلا وسهلا! السعودية تمتلك عدة وجهات سياحية رائعة:

1. **العلا (AlUla)** - تتميز بآثارها القديمة والصخور الحمراء الرائعة
2. **نيوم** - مشروع حديث يجمع بين التكنولوجيا والطبيعة
3. **الرياض** - العاصمة بها متاحف وحدائق جميلة
4. **جدة** - المدينة الساحلية على البحر الأحمر

كل منطقة لها سحرها الخاص!
```

**Latency expectations:**
- First token: 2-4 seconds (context processing)
- Subsequent tokens: ~80-120ms per token (streaming)
- Total time for 256 tokens: 20-30 seconds

---

## Step 5: Stop Your Job (optional)

When you're done, release your resources:

```bash
curl -X POST https://api.dcp.sa/api/jobs/$JOB_ID/stop \
  -H "Authorization: Bearer $API_KEY"
```

**You'll be billed only for the time used** (to the nearest minute).

---

## Pricing & Savings

### ALLaM-7B on DCP vs. Hyperscalers

| Provider | GPU | Cost/Hour | Your Monthly Bill (24/7 usage) | Savings vs AWS |
|----------|-----|-----------|--------------------------------|----------------|
| **DCP** | RTX 4090 | **$0.18** | **$129.60** | **68% cheaper** |
| AWS SageMaker | p3.2xlarge | $3.06 | $2,203.20 | — |
| Azure ML | Standard_NC6 | $2.45 | $1,756.80 | 20% vs Azure |
| RunPod | RTX 4090 | $0.44 | $316.80 | 59% cheaper |
| Vast.ai | RTX 4090 | $0.32 | $230.40 | 44% cheaper |

**Why the savings?**
- Energy arbitrage: Saudi electricity is 3.5-6x cheaper than EU/US
- Local provider network: No middleman markup
- Platform take rate: Just 15% (vs 20%+ for competitors)

---

## Common Patterns

### Pattern 1: Polling for Job Status

```bash
#!/bin/bash
JOB_ID="j-abcd1234"
API_KEY="your-key"

while true; do
  STATUS=$(curl -s -H "Authorization: Bearer $API_KEY" \
    https://api.dcp.sa/api/jobs/$JOB_ID/status | jq -r '.status')

  if [ "$STATUS" = "running" ]; then
    echo "✓ Job is ready at $(curl -s -H "Authorization: Bearer $API_KEY" \
      https://api.dcp.sa/api/jobs/$JOB_ID/status | jq -r '.inference_endpoint')"
    break
  else
    echo "Status: $STATUS... waiting..."
    sleep 5
  fi
done
```

### Pattern 2: Python Client

```python
import requests
import time
from typing import Optional

class DCPClient:
    def __init__(self, api_key: str, base_url: str = "https://api.dcp.sa"):
        self.api_key = api_key
        self.base_url = base_url
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

    def deploy_template(self, template_id: str, duration_minutes: int = 60) -> dict:
        """Deploy a template and return job details"""
        response = requests.post(
            f"{self.base_url}/api/templates/{template_id}/deploy",
            headers=self.headers,
            json={
                "duration_minutes": duration_minutes,
                "pricing_class": "standard"
            }
        )
        return response.json()

    def wait_for_job(self, job_id: str, timeout_seconds: int = 300) -> Optional[str]:
        """Poll until job is running, return inference endpoint"""
        start_time = time.time()

        while time.time() - start_time < timeout_seconds:
            response = requests.get(
                f"{self.base_url}/api/jobs/{job_id}/status",
                headers=self.headers
            )
            data = response.json()

            if data.get("status") == "running":
                return data.get("inference_endpoint")

            print(f"Status: {data.get('status')}... {data.get('status_message')}")
            time.sleep(3)

        raise TimeoutError(f"Job {job_id} did not start within {timeout_seconds}s")

    def query_inference(self, endpoint: str, prompt: str) -> str:
        """Send a chat completion request"""
        response = requests.post(
            f"{endpoint}/v1/chat/completions",
            json={
                "model": "allam-7b",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 256
            }
        )
        return response.json()["choices"][0]["message"]["content"]

# Usage
client = DCPClient(api_key="your-key")
job = client.deploy_template("allam-7b", duration_minutes=60)
print(f"Deployed job {job['job']['job_id']}")

endpoint = client.wait_for_job(job["job"]["job_id"])
print(f"Ready at {endpoint}")

result = client.query_inference(endpoint, "مرحبا، كيف حالك؟")
print(result)
```

### Pattern 3: JavaScript/Node.js

```javascript
const fetch = require('node-fetch');

class DCPClient {
  constructor(apiKey, baseUrl = 'https://api.dcp.sa') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async deployTemplate(templateId, durationMinutes = 60) {
    const response = await fetch(`${this.baseUrl}/api/templates/${templateId}/deploy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ duration_minutes: durationMinutes, pricing_class: 'standard' })
    });
    return response.json();
  }

  async waitForJob(jobId, timeoutSeconds = 300) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutSeconds * 1000) {
      const response = await fetch(`${this.baseUrl}/api/jobs/${jobId}/status`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      const data = await response.json();

      if (data.status === 'running') {
        return data.inference_endpoint;
      }

      console.log(`Status: ${data.status}... ${data.status_message}`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    throw new Error(`Job ${jobId} did not start within ${timeoutSeconds}s`);
  }

  async queryInference(endpoint, prompt) {
    const response = await fetch(`${endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'allam-7b',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 256
      })
    });
    const data = await response.json();
    return data.choices[0].message.content;
  }
}

// Usage
(async () => {
  const client = new DCPClient('your-key');
  const job = await client.deployTemplate('allam-7b', 60);
  console.log(`Deployed job ${job.job.job_id}`);

  const endpoint = await client.waitForJob(job.job.job_id);
  console.log(`Ready at ${endpoint}`);

  const result = await client.queryInference(endpoint, 'مرحبا، كيف حالك؟');
  console.log(result);
})();
```

---

## Next Steps

### Explore More Templates

```bash
# List all LLM templates
curl https://api.dcp.sa/api/templates?category=llm

# List all embedding/RAG templates
curl https://api.dcp.sa/api/templates?category=embedding

# List image generation (SDXL)
curl https://api.dcp.sa/api/templates?category=image
```

### Build a Production Setup

- **Webhooks:** Register a webhook URL in your dashboard to get job status updates in real-time
- **Batch Processing:** Submit multiple jobs in parallel for higher throughput
- **Reserved Capacity:** Contact sales for SLA-backed reserved GPU hours
- **Custom Models:** Use the `custom-container` template to run your own Docker images

### Join the Community

- **Discord:** https://discord.gg/dcp-compute
- **GitHub:** https://github.com/dc1-network/platform
- **Forum:** https://forum.dcp.sa

---

## Support

- **API Docs:** https://dcp.sa/docs/api-reference
- **Status Page:** https://status.dcp.sa
- **Email:** support@dcp.sa
- **Slack:** #help in our community workspace

---

**Made by DCP. Running on Saudi energy. Serving Arabic AI.**
