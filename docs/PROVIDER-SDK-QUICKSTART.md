# Provider SDK Quickstart — Job Submission with Real Pricing

**Status:** Maintained
**Audience:** Developers building on DCP, providers integrating SDKs
**Last Updated:** 2026-03-23

---

## Overview

This guide shows how to submit jobs to DCP using the official Node.js SDK with real pricing data from the [Pricing Guide](/docs/pricing-guide).

**Key Stats:**
- DCP pricing is **23.7% below hyperscalers** (Vast.ai, RunPod)
- Providers earn **85% of job revenue** (15% DCP platform fee)
- Jobs are secured by smart contract escrow on BASE Sepolia

---

## Setup

### 1. Install SDK

```bash
npm install dc1-renter-sdk
```

Or until published to npm, use the local SDK:

```bash
npm install /path/to/backend/src/sdks/node
```

### 2. Get API Key

Register as a renter to receive your API key:

```bash
curl -X POST https://api.dcp.sa/api/renters/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My AI App",
    "email": "dev@myapp.com",
    "organization": "Acme Corp"
  }'
```

**Response:**
```json
{
  "success": true,
  "renter_id": 42,
  "api_key": "dcp-renter-a1b2c3d4e5f6...",
  "message": "Save your API key!"
}
```

### 3. Fund Your Account

Deposit halala to run jobs:

```bash
curl -X POST https://api.dcp.sa/api/renters/topup \
  -H "x-renter-key: dcp-renter-a1b2c3d4e5f6" \
  -H "Content-Type: application/json" \
  -d '{
    "amount_halala": 500000,
    "currency": "SAR"
  }'
```

---

## Job Submission with Pricing

### Example 1: Nemotron-12B Inference (Fast, Affordable)

```javascript
import { RenterClient } from 'dc1-renter-sdk';

const client = new RenterClient({
  apiUrl: 'https://api.dcp.sa',
  renterKey: process.env.DCP_RENTER_KEY,
});

// Submit a Nemotron-12B inference job
const job = await client.jobs.submit({
  model: 'Nemotron-12B',
  prompt: 'Explain quantum computing in one sentence.',
  maxTokens: 50,
  temperature: 0.7,
});

console.log(`Job submitted: ${job.id}`);
console.log(`Estimated cost: ${job.estimatedCostHalala / 100} SAR`);
```

**Pricing Breakdown:**
- **Model:** Nemotron-12B (optimized for cost)
- **Estimated cost:** 30–50 halala ($0.008–$0.013 USD)
- **Speed:** ~5–10 seconds
- **Provider earning:** 25–42 halala (85% of cost)

**Use Case:** Chatbots, content generation, lightweight AI features.

---

### Example 2: Llama3-8B with Fine-Tuning (Higher Margin)

```javascript
const job = await client.jobs.submit({
  model: 'Llama3-8B',
  prompt: 'Translate to Arabic: The future of AI is local.',
  maxTokens: 100,
  fineTuningDataset: 'my-dataset-id', // Optional: use custom LoRA
  temperature: 0.3, // Lower temp = more deterministic
});

console.log(`Job: ${job.id}`);
console.log(`Cost: ${job.estimatedCostHalala / 100} SAR`);
console.log(`Provider earnings: ${(job.estimatedCostHalala * 0.85) / 100} SAR`);
```

**Pricing Breakdown:**
- **Model:** Llama3-8B (multilingual, good quality)
- **Estimated cost:** 60–100 halala ($0.016–$0.027 USD)
- **Fine-tuning premium:** +40% for custom models
- **Provider earning:** 51–85 halala (85% of cost)

**Use Case:** Arabic language processing, domain-specific models, higher quality required.

---

### Example 3: SDXL Image Generation (Premium, High Margin)

```javascript
const job = await client.jobs.submit({
  model: 'SDXL',
  prompt: 'A futuristic Saudi Arabian city with flying cars, photorealistic, 4K',
  imageSize: '1024x1024',
  numImages: 2,
  guidanceScale: 7.5,
});

console.log(`Job: ${job.id}`);
console.log(`Cost: ${job.estimatedCostHalala / 100} SAR`);
console.log(`Provider GPU: RTX 4090 (high-value)`);
```

**Pricing Breakdown:**
- **Model:** SDXL (image generation)
- **Estimated cost:** 150–300 halala ($0.04–$0.08 USD)
- **Provider earning:** 128–255 halala (85% of cost)
- **Provider GPU:** RTX 4090 or A100 (high-value jobs)

**Use Case:** Content creation, design, marketing materials.

---

## Polling for Completion

All jobs are asynchronous. Poll for results:

```javascript
let result;
let attempts = 0;

while (!result && attempts < 60) {
  const job = await client.jobs.get(jobId);

  if (job.status === 'completed') {
    result = job.output;
    console.log('Result:', result);
    break;
  } else if (job.status === 'failed') {
    console.error('Job failed:', job.error);
    break;
  }

  attempts++;
  await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
}
```

**Status Lifecycle:**
- `submitted` → `running` → `completed` or `failed`
- Average latency: 5–30 seconds
- Max wait: 10 minutes (varies by model)

---

## Pricing Table Reference

All prices include DCP platform fee. Provider earnings are 85% of listed price.

| Model | Task | Price | Provider Earnings | GPU Tier |
|-------|------|-------|------------------|----------|
| Nemotron-12B | Inference | 30–50 halala | 25–42 halala | RTX 4080 |
| Llama3-8B | Inference | 60–100 halala | 51–85 halala | RTX 4090 |
| Llama3-70B | Inference | 300–500 halala | 255–425 halala | A100 / H100 |
| SDXL | Image (1k) | 150–300 halala | 128–255 halala | RTX 4090 |
| Stable Diffusion | Image (512) | 50–100 halala | 42–85 halala | RTX 4080 |
| Custom LoRA | Fine-tuning | +40% premium | +40% premium | H100 / H200 |

---

## Cost Estimation Before Submission

Use the pricing API to estimate costs:

```javascript
const estimate = await client.pricing.estimate({
  model: 'Nemotron-12B',
  maxTokens: 100,
  fineTuning: false,
});

console.log(`Estimated: ${estimate.costHalala / 100} SAR`);
console.log(`Provider earnings: ${(estimate.costHalala * 0.85) / 100} SAR`);
console.log(`Your cost: ${(estimate.costHalala * 0.15) / 100} SAR`);
```

---

## Error Handling

```javascript
try {
  const job = await client.jobs.submit({
    model: 'Nemotron-12B',
    prompt: 'Hello',
    maxTokens: 10,
  });
} catch (error) {
  if (error.code === 'INSUFFICIENT_BALANCE') {
    console.log('Account balance too low. Top up here: /api/renters/topup');
  } else if (error.code === 'MODEL_NOT_FOUND') {
    console.log('Model not available. Check available models:', error.availableModels);
  } else if (error.code === 'RATE_LIMITED') {
    console.log(`Rate limited. Retry after ${error.retryAfterMs}ms`);
  } else {
    console.error('Unknown error:', error);
  }
}
```

---

## Earning Potential (Provider Perspective)

From the [Pricing Guide](/docs/pricing-guide):

**Monthly Revenue @ 70% Utilization:**
- RTX 4090: $180–$350 → Provider: $153–$297
- RTX 4080: $120–$250 → Provider: $102–$212
- H100: $1,800–$3,500 → Provider: $1,530–$2,975

**Key insight:** DCP is **23.7% cheaper than Vast.ai**, so providers earn more volume at better margins. A provider running Nemotron inference jobs consistently can earn $200–$400/month per RTX 4090.

---

## Full Example: Batch Processing with Cost Tracking

```javascript
import { RenterClient } from 'dc1-renter-sdk';

const client = new RenterClient({
  apiUrl: 'https://api.dcp.sa',
  renterKey: process.env.DCP_RENTER_KEY,
});

const prompts = [
  'What is machine learning?',
  'Explain neural networks',
  'How do transformers work?',
];

let totalCost = 0;
const jobIds = [];

// Submit all jobs
for (const prompt of prompts) {
  const job = await client.jobs.submit({
    model: 'Nemotron-12B',
    prompt,
    maxTokens: 100,
  });
  jobIds.push(job.id);
  totalCost += job.estimatedCostHalala;
  console.log(`Submitted ${job.id} — Est. cost: ${job.estimatedCostHalala / 100} SAR`);
}

console.log(`\nTotal estimated cost: ${totalCost / 100} SAR`);

// Poll for all results
const results = await Promise.all(
  jobIds.map(async (jobId) => {
    let result;
    for (let i = 0; i < 60; i++) {
      const job = await client.jobs.get(jobId);
      if (job.status === 'completed') {
        result = job.output;
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    return result;
  })
);

console.log(`\nResults:\n${results.join('\n')}`);
```

---

## References

- [SDK API Reference](./api-reference.md#sdk-methods)
- [Provider Earnings Guide](./PROVIDER-EARNINGS-GUIDE.md)
- [Pricing Guide — Pricing & Economics](/docs/pricing-guide)
- [Container Build Guide](./CONTAINER-BUILD-DEPLOYMENT.md) (for providers)
