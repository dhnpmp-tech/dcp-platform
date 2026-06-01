# DC1 Container Build & Deployment Guide (DCP-642)

Date: 2026-03-23
Status: In Progress
Issue: DCP-642

## Overview

This guide covers building, publishing, and deploying DC1 worker container images for GPU inference, image generation, and general compute workloads.

---

## 1) Container Image Architecture

### Inheritance Chain

```
nvidia/cuda:12.2.0-runtime-ubuntu22.04 (NVIDIA base)
↓
dc1/base-worker:latest (CUDA 12.2 + Python 3.10 + PyTorch)
├→ dc1/llm-worker:latest (vLLM + model serving)
├→ dc1/sd-worker:latest (Stable Diffusion + inference)
└→ dc1/general-worker:latest (Training, rendering, custom compute)
```

### Image Specifications

| Image | Base | Purpose | Size (est.) | Key Tools |
|-------|------|---------|------------|-----------|
| `base-worker` | nvidia/cuda:12.2 | Foundation | ~5GB | Python 3.10, PyTorch, CUDA |
| `llm-worker` | base-worker | LLM inference | +2GB | vLLM, HuggingFace, Nemotron |
| `sd-worker` | base-worker | Image generation | +1.5GB | Diffusers, Stable Diffusion |
| `general-worker` | base-worker | Flexible compute | +1GB | Common ML tools |

---

## 2) Build Methods

### Method A: Local Build (Manual)

**Requirements:**
- Docker Engine 20.10+
- NVIDIA Docker runtime
- ~20GB free disk space (builds all 4 images)
- ~30-45 minutes build time

**Steps:**

```bash
cd backend/docker

# Build locally (no push)
./build-images.sh

# Verify build
docker images | grep dc1/

# Optional: push to custom registry
DC1_REGISTRY=ghcr.io/your-org ./build-images.sh
```

**Output:**
```
dc1/base-worker:latest
dc1/llm-worker:latest
dc1/sd-worker:latest
dc1/general-worker:latest
```

### Method B: GitHub Actions CI (Recommended)

**Workflow:** `.github/workflows/docker-instant-tier.yml`

**Triggers:**
1. **On push to main** (with Dockerfile changes)
   - Build arg: `SKIP_MODEL_PREBAKE=1` (faster, no model download)
   - Tag: `dc1/llm-worker:latest`

2. **Nightly scheduled** (2 AM UTC)
   - Build arg: `SKIP_MODEL_PREBAKE=0` (full model pre-bake)
   - Tag: `dc1/llm-worker:latest-fullbake`

3. **Manual trigger** (workflow_dispatch)
   - Run workflow on demand via GitHub UI

**Requirements for Method B:**
- GitHub Actions secrets configured:
  - `DOCKER_HUB_USERNAME` (Docker Hub account)
  - `DOCKER_HUB_TOKEN` (Docker Hub PAT or token)
- Repository: `docker.io/dc1` namespace
- Push permissions to Docker Hub

**Process:**

1. **Setup secrets** (GitHub repository settings)
   ```
   Settings → Secrets and variables → Actions
   - DOCKER_HUB_USERNAME=<your-dockerhub-user>
   - DOCKER_HUB_TOKEN=<your-dockerhub-token>
   ```

2. **Trigger workflow**
   - Push change to main branch (auto-triggers)
   - OR manually via GitHub UI → Actions → "Build & Push Instant-Tier Worker Images" → Run workflow

3. **Monitor build**
   - GitHub Actions → Workflow runs
   - Check job status for build-llm-worker and build-sd-worker

4. **Verify publish**
   - Docker Hub: `https://hub.docker.com/r/dc1/llm-worker`
   - Check tags: `latest`, `latest-fullbake`, build date

---

## 3) Instant-Tier Model Pre-Baking

### What is Pre-Baking?

Pre-baking embeds model weights directly into the Docker image layer. This enables zero-download cold starts on providers.

### Nemotron-Mini-4B-Instruct Pre-Bake

**Model:** `nvidia/Nemotron-Mini-4B-Instruct`
**Size:** ~8 GB (compressed to ~4 GB in image layer)
**Location in Image:** `/opt/dcp/model-cache/hf/`

**How It Works:**

1. During nightly build (`SKIP_MODEL_PREBAKE=0`):
   ```dockerfile
   RUN python3 -c "\
   from huggingface_hub import snapshot_download; \
   snapshot_download( \
       repo_id='nvidia/Nemotron-Mini-4B-Instruct', \
       cache_dir='/opt/dcp/model-cache/hf', \
       local_dir_use_symlinks=False \
   ); \
   print('Instant-tier model pre-baked.')"
   ```

2. Model is cached in image layer with proper HuggingFace directory structure

3. When provider runs container:
   - vLLM finds model at `/opt/dcp/model-cache/hf/` (immediate)
   - No HuggingFace download needed
   - Cold start: ~10-20s (vLLM init only)

### Two-Tag Strategy

| Tag | SKIP_MODEL_PREBAKE | Size | Use Case |
|-----|-------------------|------|----------|
| `latest` | 1 (skip) | ~3 GB | CI builds, fast iteration |
| `latest-fullbake` | 0 (prebake) | ~11 GB | Provider deployment, zero-download |

**CI Pipeline Policy:**
- Push builds: Use `latest` (skip prebake for speed)
- Nightly builds: Use `latest-fullbake` (prebake for providers)
- Providers: Pull `latest-fullbake` when available, fallback to `latest`

---

## 4) Model Caching in Containers

### Volume Mount for Cached Models

Providers mount a persistent volume to cache additional models:

```yaml
# docker-compose.yml
services:
  llm-worker:
    image: dc1/llm-worker:latest-fullbake
    volumes:
      - dcp_model_cache:/opt/dcp/model-cache  # Persistent cache
    environment:
      - HF_HOME=/opt/dcp/model-cache/hf
```

**Flow:**

1. **Instant-tier model** (Nemotron) — pre-baked in image, zero download
2. **Cached-tier models** (ALLaM, Falcon, Qwen, Llama-3, Mistral) — download once, reuse
3. **On-demand models** — network fetch if cache miss

---

## 5) Deployment: Provider Daemon Pull

### Provider Daemon Configuration

**File:** `backend/installers/dcp_daemon.py` (or local daemon)

```bash
# Provider pulls and runs image
docker pull docker.io/dc1/llm-worker:latest-fullbake
docker run --gpus=all \
  -e HF_HOME=/opt/dcp/model-cache/hf \
  -v dcp_model_cache:/opt/dcp/model-cache \
  dc1/llm-worker:latest-fullbake
```

### Registry Configuration

**Registry:** Docker Hub
**Namespace:** `dc1`
**Images:**
- `docker.io/dc1/llm-worker:latest`
- `docker.io/dc1/llm-worker:latest-fullbake`
- `docker.io/dc1/sd-worker:latest`
- `docker.io/dc1/general-worker:latest`

**Public Access:** ✅ Yes (no authentication required for pulls)
**Push Access:** 🔐 Requires credentials (DOCKER_HUB_USERNAME + DOCKER_HUB_TOKEN)

---

## 6) Build Checklist

### Pre-Build

- [ ] Dockerfile.base: CUDA 12.2, PyTorch stable
- [ ] Dockerfile.llm-worker: vLLM, HuggingFace, Nemotron model ID correct
- [ ] Dockerfile.sd-worker: Diffusers, Stable Diffusion model
- [ ] build-images.sh: all 4 images referenced
- [ ] GitHub Actions workflow: docker-instant-tier.yml ready

### Build Execution

- [ ] Docker Hub secrets configured (DOCKER_HUB_USERNAME, DOCKER_HUB_TOKEN)
- [ ] Trigger workflow (push to main or manual)
- [ ] Monitor build progress (GitHub Actions)
- [ ] Verify no build errors (check logs)

### Post-Build Verification

- [ ] Images published to Docker Hub
- [ ] `dc1/llm-worker:latest` tag available
- [ ] `dc1/llm-worker:latest-fullbake` tag available (from nightly)
- [ ] Image sizes reasonable (base ~5GB, llm ~7GB, sd ~6.5GB)
- [ ] Layer structure correct (check `docker history dc1/llm-worker:latest`)

### Provider Testing

- [ ] Provider can pull `docker.io/dc1/llm-worker:latest`
- [ ] Container starts on GPU (test with `nvidia-smi` inside)
- [ ] vLLM loads Nemotron model successfully
- [ ] Model inference works (cold start <30s with `latest-fullbake`)
- [ ] Volume mount works (models cached across restarts)

---

## 7) Troubleshooting

### Build Fails: "Docker Hub authentication error"

**Cause:** DOCKER_HUB_TOKEN missing or expired
**Fix:**
1. Generate new Docker Hub token: https://hub.docker.com/settings/security
2. Update GitHub secret: Settings → Secrets → DOCKER_HUB_TOKEN
3. Re-trigger workflow

### Build Fails: "HuggingFace download timeout" (nightly fullbake build)

**Cause:** Nemotron model too large or network timeout
**Fix:**
- Extend timeout in workflow (increase step timeout)
- Or reduce model to a smaller variant
- Or skip pre-baking and download on first run

### Provider Pull Fails: "imagePullBackOff"

**Cause:** Docker Hub rate limiting or network issue
**Fix:**
- Configure Docker Hub authentication on provider (optional for public images)
- Retry pull after delay
- Use image digest instead of tag for reliability

### vLLM Model Not Found in Container

**Cause:** Pre-bake failed or wrong HF_HOME
**Fix:**
- Verify `/opt/dcp/model-cache/hf/` exists in image
- Check HF_HOME environment variable is set correctly
- Fallback to cached-tier (download from HF at runtime)

---

## 8) Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Base image build | <10 min | Cached layers |
| LLM worker build (skip prebake) | <5 min | SKIP_MODEL_PREBAKE=1 |
| LLM worker build (fullbake) | 30-45 min | Model download + bake |
| Image push to Docker Hub | <5 min | 7GB image |
| Provider pull (cached) | <2 min | Layer caching |
| Provider pull (first time) | ~10-15 min | Image pull + decompress |
| Container startup | <10s | Image already pulled |
| vLLM engine init | <15s | Model in cache |
| First inference | <30s | Total cold start |

---

## 9) Governance & Security

### Least Privilege

- Base image runs as non-root user `dcp:dcp` (UID 10001)
- No `sudo` or privileged binaries
- Working directory: `/dc1/job` (isolated)

### Model Provenance

- All models from official HuggingFace/NVIDIA repos
- Model IDs versioned in Dockerfile
- No local model copies (always pull from upstream)

### Image Scanning (Optional)

```bash
# Scan image for vulnerabilities
docker scan docker.io/dc1/llm-worker:latest

# Or use Trivy
trivy image docker.io/dc1/llm-worker:latest
```

---

## 10) References

- Dockerfile Base: `backend/docker/Dockerfile.base`
- Dockerfile LLM: `backend/docker/Dockerfile.llm-worker`
- Build Script: `backend/docker/build-images.sh`
- CI Workflow: `.github/workflows/docker-instant-tier.yml`
- DCP-611: Instant-Tier Architecture validation
- DCP-642: Container build task (this work)
