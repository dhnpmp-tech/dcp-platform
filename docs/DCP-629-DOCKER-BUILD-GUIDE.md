# DCP-629: Instant-Tier Container Build Guide

**Issue:** DCP-629 — Build and publish instant-tier worker container images
**Status:** Sprint 26 Critical Infrastructure
**Owner:** DevOps Automator
**Date:** 2026-03-23

---

## Overview

The DCP platform requires three worker container images to be built and published to Docker Hub:

1. **dc1/llm-worker:latest** — vLLM inference server with Nemotron-Mini-4B-Instruct pre-baked
2. **dc1/sd-worker:latest** — Stable Diffusion image generation worker
3. **dc1/base-worker:latest** — Base CUDA + PyTorch image (dependency)

**Current Status:** Dockerfiles committed, CI workflow defined, but images NOT YET BUILT.

**Blocker:** Without these images, providers cannot pull and run inference on VPS. This blocks provider activation and instant-tier launch (Phase 1 critical path).

---

## Architecture

### Image Hierarchy

```
ubuntu:24.04 (base OS)
    ↓
dc1/base-worker:latest (CUDA 12.x + PyTorch + Python 3.11)
    ├→ dc1/llm-worker:latest (vLLM + Nemotron-Mini)
    ├→ dc1/sd-worker:latest (Stable Diffusion)
    └→ dc1/general-worker:latest (Training/rendering/custom)
```

### Instant Tier Design

**dc1/llm-worker** includes pre-baked Nemotron-Mini-4B-Instruct (~8GB):
- Providers with 8GB+ VRAM get zero-download cold start
- Model weights baked into image → instant first inference
- Default behavior; skip with `SKIP_MODEL_PREBAKE=1` build arg

**Files:**
- `backend/docker/Dockerfile.base` — CUDA base image
- `backend/docker/Dockerfile.llm-worker` — vLLM + Nemotron
- `backend/docker/Dockerfile.sd-worker` — Stable Diffusion
- `backend/docker/build-images.sh` — Local build script
- `.github/workflows/docker-instant-tier.yml` — GitHub Actions CI

---

## Build Options

### Option 1: GitHub Actions (Automated, Push to Docker Hub) ✅ PREFERRED

**Trigger:** Merge commit to `main` touching Dockerfile paths
**Registry:** docker.io (Docker Hub)
**Images:** dc1/llm-worker:latest, dc1/sd-worker:latest

#### Prerequisites

1. **Docker Hub Account Credentials**
   - Create or use existing Docker Hub account
   - Generate API token at https://hub.docker.com/settings/security

2. **GitHub Secrets Configuration**
   - Repository: github.com/dhnpmp-tech/dc1-platform
   - Add secrets under Settings → Secrets and variables → Actions:
     - `DOCKER_HUB_USERNAME`: Your Docker Hub username
     - `DOCKER_HUB_TOKEN`: API token (NOT password)

3. **Workflow File**
   - Path: `.github/workflows/docker-instant-tier.yml`
   - Triggers on:
     - Push to `main` touching `backend/docker/Dockerfile.*`
     - Daily schedule: 2 AM UTC (full-bake with model)
     - Manual dispatch via GitHub Actions UI

#### Trigger Build

**Option A: Manual Dispatch (Fastest)**
1. Go to: https://github.com/dhnpmp-tech/dc1-platform/actions
2. Select workflow: "Build & Push Instant-Tier Worker Images"
3. Click "Run workflow" → "Run workflow"
4. Wait ~45-90 minutes for build to complete

**Option B: Push Trigger (Automated)**
1. Make a minor commit touching `backend/docker/Dockerfile.llm-worker`:
   ```bash
   touch backend/docker/Dockerfile.llm-worker
   git add backend/docker/Dockerfile.llm-worker
   git commit -m "ci(docker): trigger instant-tier build"
   git push origin main
   ```
2. Workflow auto-triggers → watch progress at Actions tab

**Option C: Nightly Schedule (Passive)**
- Workflow runs daily at 2 AM UTC with full model pre-bake
- No action needed; images available next morning

#### Monitor Build

1. GitHub Actions tab: https://github.com/dhnpmp-tech/dc1-platform/actions
2. Click "Build & Push Instant-Tier Worker Images" workflow
3. Watch job progress:
   - build-llm-worker: ~30 min (with model), ~5 min (skip model)
   - build-sd-worker: ~15 min
   - notify: final status check

#### Verify Success

1. Docker Hub: https://hub.docker.com/r/dc1
   - Should see `llm-worker` and `sd-worker` repositories
   - Tags: `latest`, `latest-fullbake` (from nightly builds)

2. Pull and test locally:
   ```bash
   docker pull dc1/llm-worker:latest
   docker images | grep dc1
   ```

3. Check image sizes:
   ```bash
   docker inspect dc1/llm-worker:latest | grep -i size
   ```

---

### Option 2: Local Build + Manual Push

**If GitHub Actions unavailable or secrets not configured:**

#### Prerequisites
- Docker Engine 20.10+
- ~50GB free disk space (base + all images)
- 16GB+ RAM (for builds)
- Docker Hub credentials

#### Build

```bash
cd /home/node/dc1-platform/backend/docker

# Build base first (required dependency)
docker build -t dc1/base-worker:latest -f Dockerfile.base .

# Build LLM worker
docker build -t dc1/llm-worker:latest \
  --build-arg BASE_IMAGE=dc1/base-worker:latest \
  -f Dockerfile.llm-worker .
# Takes ~30 min (includes Nemotron model download + conversion)

# Build SD worker
docker build -t dc1/sd-worker:latest \
  --build-arg BASE_IMAGE=dc1/base-worker:latest \
  -f Dockerfile.sd-worker .
# Takes ~15 min
```

#### Verify Local Build

```bash
docker images | grep dc1/
# Output:
# dc1/llm-worker       latest   <hash>   <size>
# dc1/sd-worker        latest   <hash>   <size>
# dc1/base-worker      latest   <hash>   <size>
```

#### Push to Docker Hub

```bash
docker login docker.io  # Enter username + API token

docker tag dc1/llm-worker:latest dc1/llm-worker:latest
docker push dc1/llm-worker:latest

docker tag dc1/sd-worker:latest dc1/sd-worker:latest
docker push dc1/sd-worker:latest
```

---

## Build Args & Customization

### Skip Model Pre-baking (Slim Build)

For testing or CI builds that don't need the model pre-baked:

```bash
docker build -t dc1/llm-worker:slim \
  --build-arg BASE_IMAGE=dc1/base-worker:latest \
  --build-arg SKIP_MODEL_PREBAKE=1 \
  -f Dockerfile.llm-worker .
```

Result: ~12GB image (no model), model pulled at runtime from cache volume.

### Use Different Base Image

```bash
docker build -t dc1/llm-worker:custom \
  --build-arg BASE_IMAGE=nvidia/cuda:12.2.2-devel-ubuntu24.04 \
  -f Dockerfile.llm-worker .
```

---

## Image Specifications

### dc1/base-worker:latest

| Property | Value |
|----------|-------|
| Base OS | ubuntu:24.04 |
| CUDA | 12.x |
| PyTorch | Latest stable |
| Python | 3.11 |
| Size | ~5-6GB |
| Registry | docker.io |

### dc1/llm-worker:latest

| Property | Value |
|----------|-------|
| Base | dc1/base-worker:latest |
| Engine | vLLM (OpenAI-compatible) |
| Model | nvidia/Nemotron-Mini-4B-Instruct (~8GB) |
| Inference | FastAPI server on port 8000 |
| Cold Start | ~0s (model pre-baked) |
| Size | ~13-15GB |
| Build Time | ~30 min (incl. model) |

### dc1/sd-worker:latest

| Property | Value |
|----------|-------|
| Base | dc1/base-worker:latest |
| Engine | Stable Diffusion 3 |
| Inference | Text-to-image, image-to-image |
| API | FastAPI on port 8001 |
| Size | ~10-12GB |
| Build Time | ~15 min |

---

## Provider Integration

Once images are published to Docker Hub:

### Provider Daemon Pulls Images

```bash
# Provider daemon config
docker pull dc1/llm-worker:latest
docker run --gpus all -p 8000:8000 dc1/llm-worker:latest
```

### Provider Registration

1. Provider registers at dcp.sa/setup
2. Daemon downloads image: `docker pull dc1/llm-worker:latest`
3. Daemon starts inference server
4. Provider appears as "online" in marketplace

### Instant-Tier Jobs

1. Renter submits job: `{"model": "nemotron-mini-4b", ...}`
2. Daemon routes to vLLM server on port 8000
3. **Zero cold-start**: Model already in memory
4. Response in <100ms vs 5-10s (download+load)

---

## Troubleshooting

### Build Fails: "Failed to pull base image"

**Cause:** dc1/base-worker:latest not found
**Fix:** Build base image first:
```bash
docker build -t dc1/base-worker:latest -f Dockerfile.base backend/docker/
```

### Build Fails: Out of Disk Space

**Cause:** Model download + Docker layers exceeds free space
**Fix:** Increase disk space, or skip model pre-bake:
```bash
docker build --build-arg SKIP_MODEL_PREBAKE=1 -f Dockerfile.llm-worker .
```

### Docker Hub Push Fails: 401 Unauthorized

**Cause:** Invalid credentials or token expired
**Fix:**
```bash
docker logout docker.io
docker login docker.io  # Re-authenticate
```

### GitHub Actions Fails: "No secrets found"

**Cause:** DOCKER_HUB_USERNAME or DOCKER_HUB_TOKEN not configured
**Fix:**
1. Go to repo Settings → Secrets and variables → Actions
2. Add both secrets with correct values
3. Re-trigger workflow

### Workflow Doesn't Auto-Trigger After Commit

**Cause:** Commit didn't touch monitored paths
**Fix:** Manually dispatch from Actions tab, or ensure commit touches:
- `backend/docker/Dockerfile.llm-worker`
- `backend/docker/Dockerfile.sd-worker`
- `.github/workflows/docker-instant-tier.yml`

---

## Timeline

**Current State:** Dockerfiles ready, CI configured, secrets UNCONFIGURED, images NOT BUILT

**To Launch Provider Activation (DCP-621):**
1. Configure GitHub Actions secrets (5 min)
2. Trigger docker-instant-tier.yml build (1-2 hours)
3. Verify images on Docker Hub (5 min)
4. Providers pull images and go online

**Critical Path:** Secrets setup + build = 1-2 hours total

---

## Checklist for Completion

**Prerequisites (Do Once):**
- [ ] Create/use Docker Hub account
- [ ] Generate API token at hub.docker.com/settings/security
- [ ] Add `DOCKER_HUB_USERNAME` secret to GitHub repo
- [ ] Add `DOCKER_HUB_TOKEN` secret to GitHub repo
- [ ] Verify both secrets appear in Actions settings

**Build & Publish:**
- [ ] Manually trigger docker-instant-tier.yml workflow (or wait for nightly)
- [ ] Monitor build progress in GitHub Actions
- [ ] Verify build completes successfully
- [ ] Confirm images visible on Docker Hub (dc1/llm-worker, dc1/sd-worker)
- [ ] Pull and test images locally: `docker pull dc1/llm-worker:latest`
- [ ] Document build completion and image URLs

**Post-Build:**
- [ ] Update DCP-621 with image URLs
- [ ] Notify providers to pull new images
- [ ] Test provider daemon integration
- [ ] Confirm providers come online

---

## Related Issues

- **DCP-621:** Provider onboarding activation
- **DCP-628:** VPS health monitoring (now live)
- **Phase 1 Launch:** Blocked by container images + provider activation

---

## References

- Docker Hub: https://hub.docker.com/r/dc1
- GitHub Actions: https://github.com/dhnpmp-tech/dc1-platform/actions
- Workflow: `.github/workflows/docker-instant-tier.yml`
- Dockerfiles: `backend/docker/Dockerfile.*`
- Build Script: `backend/docker/build-images.sh`

---

**Status:** Ready for GitHub Actions secrets configuration and build trigger
**Owner:** DevOps Automator (DCP-629)
**Updated:** 2026-03-23 11:35 UTC
