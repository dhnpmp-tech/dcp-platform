# SDK Examples

Code examples for submitting jobs to DCP in your language of choice.

**Supported languages:** JavaScript/Node.js, Python, cURL

---

## JavaScript / Node.js

### Installation

```bash
npm install dc1-renter-sdk
```

### Basic Setup

```javascript
const { DC1RenterClient } = require('dc1-renter-sdk');

const client = new DC1RenterClient({
  baseUrl: 'https://api.dcp.sa',
  apiKey: 'dc1-renter-a1b2c3d4e5f6...'
});
```

### Submit an LLM Inference Job

```javascript
async function runInference() {
  const providers = await client.listProviders();
  if (providers.length === 0) throw new Error('No providers available');

  const job = await client.submitJob({
    providerId: providers[0].id,
    jobType: 'llm_inference',
    durationMinutes: 5,
    params: {
      model: 'mistralai/Mistral-7B-Instruct-v0.2',
      prompt: 'Explain blockchain in one sentence',
      max_tokens: 100,
      temperature: 0.7
    },
    gpuRequirements: {
      minVramGb: 16
    }
  });

  console.log(`Job submitted: ${job.id}`);
  console.log(`Estimated cost: ${job.costSar} SAR`);
  return job;
}

runInference().catch(console.error);
```

### Wait for Job Results

```javascript
async function waitForJobCompletion(jobId, maxWaitMs = 300000) {
  const result = await client.waitForJob(jobId, {
    timeout: maxWaitMs,
    pollInterval: 5000,
    onProgress: (status) => console.log(`Job status: ${status}`)
  });

  console.log('Job completed:', result.result);
  return result;
}

waitForJobCompletion('job-1710843200000-x7k2p').catch(console.error);
```

### Get Provider List

```javascript
async function listProviders() {
  const providers = await client.listProviders();
  console.table(providers.map(p => ({
    id: p.id,
    name: p.name,
    gpu: p.gpuModel,
    vramGb: p.vramGb,
    status: p.status,
    reliability: p.reliabilityScore
  })));
}

listProviders().catch(console.error);
```

### Check Account Balance

```javascript
async function checkBalance() {
  const balance = await client.getBalance();
  console.log(`Available: ${balance.balanceSar} SAR`);
  console.log(`Held: ${balance.heldSar} SAR`);
  console.log(`Total spent: ${balance.totalSpentSar} SAR`);
  console.log(`Jobs completed: ${balance.totalJobs}`);
}

checkBalance().catch(console.error);
```

### Using Fetch API (No SDK)

```javascript
async function submitJobWithFetch() {
  const response = await fetch('https://api.dcp.sa/api/jobs/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-renter-key': 'dc1-renter-a1b2c3d4e5f6...'
    },
    body: JSON.stringify({
      provider_id: 3,
      job_type: 'llm_inference',
      duration_minutes: 5,
      params: {
        model: 'mistralai/Mistral-7B-Instruct-v0.2',
        prompt: 'What is DCP?',
        max_tokens: 100,
        temperature: 0.7
      }
    })
  });

  const data = await response.json();
  const jobId = data.job?.job_id ?? data.job_id;
  console.log(`Job ${jobId} submitted`);
  return jobId;
}
```

---

## Python

### Installation

```bash
pip install dc1
```

### Basic Setup

```python
import dc1

client = dc1.DC1Client(
    api_key='dc1-renter-a1b2c3d4e5f6...',
    base_url='https://api.dcp.sa',
    timeout=30
)
```

### Submit an LLM Inference Job

```python
def run_inference():
    providers = client.providers.list()
    if not providers:
        raise Exception('No providers available')

    job = client.jobs.submit(
        'llm_inference',
        {'model': 'mistralai/Mistral-7B-Instruct-v0.2', 'prompt': 'Write a haiku about AI', 'max_tokens': 100, 'temperature': 0.7},
        provider_id=providers[0].id,
        duration_minutes=5
    )

    print(f"Job submitted: {job.id}")
    print(f"Estimated cost: {job.cost_sar} SAR")
    return job

run_inference()
```

### Wait for Results

```python
import time

def wait_for_completion(job_id, timeout=300):
    return client.jobs.wait(job_id, timeout=timeout, poll_interval=5)

result = wait_for_completion('job-1710843200000-x7k2p')
print("Result:", result.result)
```

### Get Available Providers

```python
def list_providers():
    providers = client.providers.list()
    for p in providers:
        print(f"{p.name} — {p.gpu_model} ({p.vram_gb}GB) — reliability: {p.reliability_score}")

list_providers()
```

### Check Balance

```python
def check_balance():
    wallet = client.wallet.balance()
    print(f"Balance: {wallet.balance_sar} SAR — {wallet.name} ({wallet.email})")

check_balance()
```

### Using urllib (No SDK)

```python
import urllib.request
import json

def submit_job():
    headers = {
        'Content-Type': 'application/json',
        'x-renter-key': 'dc1-renter-a1b2c3d4e5f6...'
    }
    payload = {
        'provider_id': 3,
        'job_type': 'llm_inference',
        'duration_minutes': 5,
        'params': {
            'model': 'mistralai/Mistral-7B-Instruct-v0.2',
            'prompt': 'Summarize quantum mechanics',
            'max_tokens': 150,
            'temperature': 0.7
        }
    }
    req = urllib.request.Request(
        'https://api.dcp.sa/api/jobs/submit',
        data=json.dumps(payload).encode(),
        headers=headers,
        method='POST'
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
        job_id = data.get('job', {}).get('job_id', data.get('job_id', ''))
        print(f"Job {job_id} submitted")
        return job_id

submit_job()
```

---

## cURL (Command Line)

### Register a Renter Account

```bash
curl -X POST https://api.dcp.sa/api/renters/register \
  -H "Content-Type: application/json" \
  -d '{"name": "Your Name", "email": "you@example.com", "organization": "Your Company"}'
```

### Top Up Balance

```bash
curl -X POST https://api.dcp.sa/api/renters/topup \
  -H "Content-Type: application/json" \
  -H "x-renter-key: dc1-renter-a1b2c3d4e5f6..." \
  -d '{"amount_sar": 100}'
```

### List Available Providers

```bash
curl https://api.dcp.sa/api/renters/available-providers | jq '.providers'
```

### Submit a Job

```bash
curl -X POST https://api.dcp.sa/api/jobs/submit \
  -H "Content-Type: application/json" \
  -H "x-renter-key: dc1-renter-a1b2c3d4e5f6..." \
  -d '{
    "provider_id": 3,
    "job_type": "llm_inference",
    "duration_minutes": 5,
    "params": {
      "model": "mistralai/Mistral-7B-Instruct-v0.2",
      "prompt": "What is the meaning of life?",
      "max_tokens": 100,
      "temperature": 0.7
    }
  }'
```

### Get Job Output

```bash
curl "https://api.dcp.sa/api/jobs/job-1710843200000-x7k2p/output" \
  -H "x-renter-key: dc1-renter-a1b2c3d4e5f6..."
```

### Check Balance

```bash
curl "https://api.dcp.sa/api/renters/me?key=dc1-renter-a1b2c3d4e5f6..." | jq '.renter'
```

### Provider Endpoints

#### Register a Provider

```bash
curl -X POST https://api.dcp.sa/api/providers/register \
  -H "Content-Type: application/json" \
  -d '{"name": "My GPU Node", "email": "gpu@example.com", "gpu_model": "RTX 4090", "os": "linux"}'
```

#### Provider Heartbeat

```bash
curl -X POST https://api.dcp.sa/api/providers/heartbeat \
  -H "Content-Type: application/json" \
  -H "x-provider-key: dc1-provider-a1b2c3d4e5f6..."
```

#### Check Provider Earnings

```bash
curl https://api.dcp.sa/api/providers/me \
  -H "x-provider-key: dc1-provider-a1b2c3d4e5f6..."
```

---

## SDK Resources

- **JavaScript SDK**: `npm install dc1-renter-sdk` — [npm](https://www.npmjs.com/package/dc1-renter-sdk)
- **Python SDK**: `pip install dc1` — [PyPI](https://pypi.org/project/dc1/)

---

**Next:** [API Reference](../openapi.yaml) | [Quickstarts](./quickstart-renter.md)
