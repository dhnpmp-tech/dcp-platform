# DCP Deploy Templates (One-Command)

This folder provides product-level deploy templates consumable from `GET /api/templates`.

Templates included for DCP-359:
- `pytorch-single-gpu`
- `pytorch-multi-gpu`
- `vllm-serve`
- `stable-diffusion`
- `lora-finetune`
- `qlora-finetune`
- `python-scientific-compute`

## Model Cache Behavior

All templates assume the runtime mount:
- Host path: `/opt/dcp/model-cache`
- Container path: `/opt/dcp/model-cache`

Cache policy semantics:
- `hot`: keep pinned artifacts for top-demand models; lowest cold-start variance.
- `warm`: LRU-friendly reuse for active models; balanced disk usage.
- `cold`: eviction-friendly for transient or exploratory workloads.

Each template declares:
- `model_cache.mount_path`
- `model_cache.default_policy`
- `model_cache.behavior`

## One-Command Submit Pattern

```bash
API_BASE="https://api.dcp.sa/api"
RENTER_KEY="dcp-renter-..."

curl -s -X POST "$API_BASE/jobs/submit" \
  -H "x-renter-key: $RENTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "job_type": "custom_container",
    "duration_minutes": 20,
    "params": {
      "image_override": "dc1/general-worker:latest",
      "script": "import json; print(\"DC1_RESULT_JSON:{\\\"status\\\":\\\"ok\\\"}\")"
    }
  }'
```

After submit, poll output:

```bash
JOB_ID="job-..."
curl -s "$API_BASE/jobs/$JOB_ID/output" -H "x-renter-key: $RENTER_KEY"
```

## Runnable Example I/O by Template

### 1) PyTorch Single GPU (`pytorch-single-gpu`)
Input (job payload):
```json
{
  "job_type": "custom_container",
  "duration_minutes": 20,
  "params": {
    "image_override": "pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime",
    "script": "import json, torch; d='cuda' if torch.cuda.is_available() else 'cpu'; x=torch.randn(128,64,device=d); y=torch.nn.Linear(64,10).to(d)(x); print('DC1_RESULT_JSON:'+json.dumps({'template':'pytorch-single-gpu','device':d,'samples':int(x.shape[0]),'mean':round(float(y.mean().item()),6),'status':'completed'}))"
  }
}
```
Output (stdout marker):
```json
{
  "template": "pytorch-single-gpu",
  "device": "cuda",
  "samples": 1024,
  "mean": 0.012345,
  "status": "completed"
}
```

### 2) PyTorch Multi GPU (`pytorch-multi-gpu`)
Input:
```json
{
  "job_type": "custom_container",
  "duration_minutes": 30,
  "gpu_requirements": { "min_vram_gb": 24 },
  "container_spec": { "gpu_count": 2 },
  "params": {
    "image_override": "nvcr.io/nvidia/pytorch:24.01-py3",
    "script": "import json, torch; n=torch.cuda.device_count(); d='cuda' if n>0 else 'cpu'; m=torch.nn.Linear(256,256).to(d); m=torch.nn.DataParallel(m) if n>1 else m; y=m(torch.randn(32,256,device=d)); print('DC1_RESULT_JSON:'+json.dumps({'template':'pytorch-multi-gpu','device':d,'gpu_count':int(n),'throughput_units':int(y.numel()),'status':'completed'}))"
  }
}
```
Output:
```json
{
  "template": "pytorch-multi-gpu",
  "device": "cuda",
  "gpu_count": 2,
  "throughput_units": 1048576,
  "status": "completed"
}
```

### 3) vLLM Inference Serving (`vllm-serve`)
Input:
```json
{
  "job_type": "vllm_serve",
  "duration_minutes": 60,
  "params": {
    "model": "mistralai/Mistral-7B-Instruct-v0.2",
    "max_model_len": 8192,
    "dtype": "float16"
  }
}
```
Output:
```json
{
  "type": "endpoint",
  "model": "mistralai/Mistral-7B-Instruct-v0.2",
  "status": "running",
  "openai_base_url": "http://127.0.0.1:8000/v1"
}
```

### 4) Stable Diffusion (`stable-diffusion`)
Input:
```json
{
  "job_type": "image_generation",
  "duration_minutes": 10,
  "params": {
    "prompt": "A futuristic Riyadh skyline at sunset",
    "model": "stabilityai/stable-diffusion-xl-base-1.0",
    "steps": 30,
    "width": 1024,
    "height": 1024
  }
}
```
Output:
```json
{
  "type": "image",
  "model": "stabilityai/stable-diffusion-xl-base-1.0",
  "output_file": "output.png",
  "status": "completed"
}
```

### 5) LoRA Fine-Tuning (`lora-finetune`)
Input:
```json
{
  "job_type": "custom_container",
  "duration_minutes": 45,
  "params": {
    "image_override": "dc1/llm-worker:latest",
    "script": "import json; print('DC1_RESULT_JSON:'+json.dumps({'template':'lora-finetune','base_model':'mistralai/Mistral-7B-Instruct-v0.2','adapter_rank':16,'estimated_adapter_params':65536,'status':'ready_for_dataset'}))"
  }
}
```
Output:
```json
{
  "template": "lora-finetune",
  "base_model": "mistralai/Mistral-7B-Instruct-v0.2",
  "adapter_rank": 16,
  "estimated_adapter_params": 65536,
  "status": "ready_for_dataset"
}
```

### 6) QLoRA Fine-Tuning (`qlora-finetune`)
Input:
```json
{
  "job_type": "custom_container",
  "duration_minutes": 45,
  "params": {
    "image_override": "dc1/llm-worker:latest",
    "script": "import json; print('DC1_RESULT_JSON:'+json.dumps({'template':'qlora-finetune','base_model':'meta-llama/Meta-Llama-3-8B-Instruct','quant_bits':4,'status':'ready_for_quantized_training'}))"
  }
}
```
Output:
```json
{
  "template": "qlora-finetune",
  "base_model": "meta-llama/Meta-Llama-3-8B-Instruct",
  "quant_bits": 4,
  "status": "ready_for_quantized_training"
}
```

### 7) Python Scientific Compute (`python-scientific-compute`)
Input:
```json
{
  "job_type": "custom_container",
  "duration_minutes": 15,
  "params": {
    "image_override": "dc1/general-worker:latest",
    "script": "import json, torch; d='cuda' if torch.cuda.is_available() else 'cpu'; c=torch.randn(512,512,device=d)@torch.randn(512,512,device=d); print('DC1_RESULT_JSON:'+json.dumps({'template':'python-scientific-compute','device':d,'matrix_size':512,'checksum':round(float(c.mean().item()),6),'status':'completed'}))"
  }
}
```
Output:
```json
{
  "template": "python-scientific-compute",
  "device": "cuda",
  "matrix_size": 512,
  "checksum": -0.000913,
  "status": "completed"
}
```

## Automation and Hardening

### One-command DevOps deploy

Run all deployment checks + automation in one command:

```bash
./infra/scripts/deploy-templates.sh
```

Pipeline stages:
- JSON validation + required deploy-template ID checks (`backend/src/scripts/validate-deploy-templates.js`)
- model-cache bootstrap (`infra/setup-model-cache.sh`)
- template-ID model prewarm (`infra/docker/prewarm-template-models.sh`)
- template image security scan (`infra/security/scan-template-images.sh`, auto-skips if `trivy` missing)
- API smoke checks (`GET /api/templates`, `GET /api/templates/whitelist`)

Useful flags:

```bash
./infra/scripts/deploy-templates.sh --skip-prewarm --skip-scan
./infra/scripts/deploy-templates.sh --api-base https://api.dcp.sa/api
```

Prewarm controls:
- `DCP_PREWARM_TEMPLATE_IDS` (CSV, default: `vllm-serve,stable-diffusion,lora-finetune,qlora-finetune`)
- `DCP_TEMPLATE_PREWARM_POLICY` (`hot-only|hot-warm|all`, default `hot-warm`)
- `DCP_TEMPLATE_PREWARM_STRICT=1` to fail immediately when any template model pull fails

### CI gate

`/.github/workflows/deploy-templates-validate.yml` now enforces:
- deploy-template JSON validation
- shell syntax checks for deploy automation scripts
- backend integration smoke (`container-templates.test.js`)

### Runtime hardening defaults

`infra/docker/run-job.sh` template mode already enforces:
- `--read-only`
- `--cap-drop ALL`
- `--security-opt no-new-privileges:true`
- isolated tmpfs mounts and restricted container filesystem writes
