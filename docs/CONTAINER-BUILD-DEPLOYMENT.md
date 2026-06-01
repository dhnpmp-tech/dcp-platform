# LLM Container Build & Deployment Guide

**Status:** Maintained
**Audience:** Providers deploying models, infrastructure teams
**Last Updated:** 2026-03-23

---

## Overview

DCP provides pre-built Docker images for model serving (Nemotron, Llama, SDXL). This guide covers:
- Building custom images
- Deploying with vLLM
- Metering token usage
- Performance tuning
- Running instant-tier jobs

---

## Available Images

| Image | Base | Model | VRAM | Status |
|-------|------|-------|------|--------|
| `dc1/llm-worker:latest` | NVIDIA CUDA 12 | Nemotron-12B | 16GB+ | Ready |
| `dc1/general-worker:latest` | CUDA 12 | Multiple | Varies | Ready |
| `dc1/sd-worker:latest` | CUDA 12 | Stable Diffusion XL | 8GB+ | Ready |

---

## Quick Start — Run a Model

### 1. Install Docker & NVIDIA Toolkit

```bash
# Ubuntu 20.04+
curl https://get.docker.com | sh
sudo usermod -aG docker $USER
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update && sudo apt-get install -y nvidia-docker2
sudo systemctl restart docker
```

### 2. Pull & Run LLM Worker

```bash
docker pull dc1/llm-worker:latest

docker run --gpus all \
  -e MODEL_NAME=Nemotron-12B \
  -e VLLM_API_KEY=$VLLM_API_KEY \
  -p 8000:8000 \
  -v /models:/models \
  dc1/llm-worker:latest
```

### 3. Test with Inference Request

```bash
curl -X POST http://localhost:8000/v1/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Nemotron-12B",
    "prompt": "The future of AI is",
    "max_tokens": 50,
    "temperature": 0.7
  }'
```

---

## vLLM Metering Integration

The LLM Worker includes metering that tracks token usage per job.

### Token Counting

vLLM automatically counts input + output tokens:

```json
{
  "id": "job-abc123",
  "model": "Nemotron-12B",
  "input_tokens": 42,
  "output_tokens": 128,
  "total_tokens": 170,
  "cost_usd": 0.0085
}
```

### Verify Metering

Run the metering smoke test:

```bash
node scripts/vllm-metering-smoke.mjs \
  --api-url https://api.dcp.sa \
  --renter-key $DCP_RENTER_KEY \
  --admin-token $DC1_ADMIN_TOKEN
```

**Expected Output:**
```
✓ Submit inference job
✓ Poll for completion
✓ Verify token counts in admin endpoint
✓ Confirm billing reflects correct token count
```

---

## Building Custom Images

### Dockerfile Template

```dockerfile
FROM nvcr.io/nvidia/cuda:12.2.0-runtime-ubuntu22.04

WORKDIR /app

# Install vLLM
RUN pip install vllm==0.4.0

# Copy model weights (optional, or download at runtime)
COPY models/ /models/

# Start vLLM server
CMD ["python", "-m", "vllm.entrypoints.openai.api_server", \
     "--model", "/models/Nemotron-12B", \
     "--tensor-parallel-size", "1", \
     "--gpu-memory-utilization", "0.9"]
```

### Build & Push

```bash
docker build -t your-registry/llm-worker:v1.0 .
docker push your-registry/llm-worker:v1.0
```

---

## Performance Tuning

### GPU Memory Optimization

For different GPU tiers:

| GPU | Recommended | Command |
|-----|-------------|---------|
| RTX 4090 (24GB) | 0.90 utilization | `--gpu-memory-utilization 0.90` |
| RTX 4080 (16GB) | 0.85 utilization | `--gpu-memory-utilization 0.85` |
| A100 (40GB) | 0.95 utilization | `--gpu-memory-utilization 0.95` |

### Batch Size Tuning

```bash
docker run --gpus all \
  -e VLLM_BATCH_SIZE=16 \
  -e VLLM_MAX_PARALLEL_LOADING_WORKERS=2 \
  dc1/llm-worker:latest
```

**Recommendation:** Start with batch_size = GPU_VRAM_GB / 2, then increase until memory full.

### Quantization (Optional)

For faster inference on smaller GPUs:

```dockerfile
RUN pip install bitsandbytes

CMD ["python", "-m", "vllm.entrypoints.openai.api_server", \
     "--model", "/models/Nemotron-12B", \
     "--load-in-8bit"]  # 8-bit quantization
```

---

## Deployment Checklist

- [ ] Docker & NVIDIA Toolkit installed
- [ ] GPU detected: `docker run --gpus all nvidia-smi`
- [ ] Model weights available (local or download)
- [ ] Port 8000 accessible (for vLLM API)
- [ ] Metering configured (VLLM_API_KEY set)
- [ ] Test inference request successful
- [ ] Smoke test passes (DCP-619)
- [ ] Provider registered and ready to serve jobs

---

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `docker: command not found` | Docker not installed | Run installation script above |
| `could not select device driver` | NVIDIA drivers missing | Install NVIDIA driver: `ubuntu-drivers autoinstall` |
| `CUDA out of memory` | Model too large for GPU | Reduce batch_size, enable quantization, or use larger GPU |
| `Model not found` | Weights not in /models | Verify volume mount or download at container start |
| `Metering mismatch` | Token counts not recorded | Verify VLLM_API_KEY and check admin endpoint |

---

## Monitoring & Logging

### View Container Logs

```bash
docker logs -f <container-id>
```

Watch for:
- Successful model load
- Request throughput
- Memory usage
- Any CUDA errors

### Health Check

```bash
curl http://localhost:8000/health
```

---

## Production Deployment

For production providers:

1. **Use systemd** to auto-restart on failure
2. **Enable logging** to persistent storage
3. **Monitor GPU temperature** (target: < 80°C)
4. **Set resource limits** in docker-compose or Kubernetes
5. **Enable model caching** to reduce load times

### docker-compose.yml (Production)

```yaml
version: '3'
services:
  llm-worker:
    image: dc1/llm-worker:latest
    restart: always
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    environment:
      - MODEL_NAME=Nemotron-12B
      - VLLM_GPU_MEMORY_UTILIZATION=0.90
      - VLLM_LOG_LEVEL=INFO
    ports:
      - "8000:8000"
    volumes:
      - /models:/models
      - /var/log/dcp:/logs
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

Deploy:
```bash
docker-compose -f docker-compose.yml up -d
```

---

## References

- [vLLM Documentation](https://docs.vllm.ai)
- [NVIDIA Container Toolkit](https://github.com/NVIDIA/nvidia-docker)
- [Provider Onboarding Guide](docs/provider-guide.md)
- [Pricing Guide — Provider Economics](/docs/pricing-guide)
