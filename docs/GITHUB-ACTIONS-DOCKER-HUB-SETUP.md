# GitHub Actions Docker Hub Setup Guide

**Purpose:** Configure Docker Hub credentials in GitHub Actions for automated container image builds
**Status:** Setup instructions ready (awaiting credential configuration)
**Scope:** DCP-642 container build automation

---

## Overview

The CI/CD pipeline for DCP instant-tier container images (`.github/workflows/docker-instant-tier.yml`) requires two GitHub Actions secrets:

- `DOCKER_HUB_USERNAME` — Docker Hub account username
- `DOCKER_HUB_TOKEN` — Docker Hub Personal Access Token (not password)

Once configured, the workflow will automatically:
1. Build `dc1/llm-worker` image (vLLM + Nemotron pre-bake)
2. Build `dc1/sd-worker` image (Stable Diffusion)
3. Push both to `docker.io/dc1/` namespace
4. Tag with `latest` (skip prefetch) or `latest-fullbake` (pre-baked)

---

## Step 1: Create Docker Hub Personal Access Token

### Via Docker Hub Web UI (Recommended)

1. **Login to Docker Hub**
   - URL: https://hub.docker.com/
   - Account: (DCP organizational account or personal account)

2. **Navigate to Security Settings**
   - Click your avatar (top-right)
   - Select "Account Settings"
   - Click "Security" in left sidebar
   - Click "New Access Token"

3. **Create Token**
   - Token name: `github-actions-dcp-builder` (or similar)
   - Access permissions:
     - [x] Read
     - [x] Write
     - [x] Delete (optional, for cleanup)
   - Click "Generate"

4. **Copy Token**
   - ⚠️ **Critical:** Token is only shown once!
   - Copy the full token string
   - Save in secure location (password manager, vault, etc.)

### Via Docker Hub CLI (Alternative)

```bash
docker login --username <username>
# Prompted for password — enter Personal Access Token, NOT password
```

Token will be stored in `~/.docker/config.json` (use with caution).

---

## Step 2: Configure GitHub Actions Secrets

### Option A: GitHub Web UI (Recommended)

1. **Navigate to Secrets**
   - Repository: https://github.com/dhnpmp-tech/dcp-platform
   - Settings → Secrets and Variables → Actions
   - Click "New repository secret"

2. **Create `DOCKER_HUB_USERNAME`**
   - Name: `DOCKER_HUB_USERNAME`
   - Value: Docker Hub username (e.g., `oida_ai`)
   - Click "Add secret"

3. **Create `DOCKER_HUB_TOKEN`**
   - Name: `DOCKER_HUB_TOKEN`
   - Value: Personal Access Token (from Step 1)
   - Click "Add secret"

### Option B: GitHub CLI

```bash
gh secret set DOCKER_HUB_USERNAME --body "oida_ai"
gh secret set DOCKER_HUB_TOKEN --body "<paste-token-here>"
```

### Option C: Organization Secrets (If Multiple Repos)

If multiple repos need Docker Hub access:

1. Go to Organization Settings (not repository)
2. Secrets and Variables → Actions
3. Create organization-level secrets (all repos inherit them)

**Note:** Organization secrets require higher permissions (org admin only).

---

## Step 3: Verify Configuration

### Check Secrets in GitHub Web UI

1. Repository Settings → Secrets and Variables → Actions
2. Should see:
   - `DOCKER_HUB_USERNAME` ✓
   - `DOCKER_HUB_TOKEN` ✓

Both should show as (masked) in the UI.

### Test Secrets (Dry Run)

Create a test workflow to verify secrets are accessible:

```yaml
# .github/workflows/test-secrets.yml
name: Test Docker Hub Secrets

on: [workflow_dispatch]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Test Docker Hub Credentials
        run: |
          docker login -u ${{ secrets.DOCKER_HUB_USERNAME }} \
            -p ${{ secrets.DOCKER_HUB_TOKEN }} docker.io
          echo "Login successful!"
```

Trigger via GitHub UI:
- Go to Actions
- Select "Test Docker Hub Secrets"
- Click "Run workflow"

Expected output: `Login successful!`

---

## Step 4: Trigger Container Build

Once secrets are configured, trigger the build:

### Option A: Manual Trigger (Immediate)

```bash
gh workflow run docker-instant-tier.yml --ref main
```

Or via GitHub UI:
1. Actions → docker-instant-tier
2. "Run workflow" → Branch: main → "Run workflow"

### Option B: Push to Main (Automatic)

Any push to `main` branch triggers the workflow automatically.

### Option C: Scheduled Build (Nightly with Prefetch)

The workflow already includes a schedule (check `.github/workflows/docker-instant-tier.yml`):

```yaml
schedule:
  - cron: '0 2 * * *'  # 2 AM UTC daily
```

This runs automatically every night if enabled.

---

## Workflow Execution

### Build Steps

1. **Checkout code** — Clone repository
2. **Set up Docker Buildx** — Multi-platform build support
3. **Login to Docker Hub** — Using secrets
4. **Build llm-worker image**
   - Base: `nvidia/cuda:12.2.0-runtime-ubuntu22.04`
   - Installs: PyTorch, vLLM, transformers
   - Optional prefetch: Nemotron-Mini-4B (8GB)
   - Estimated build time: 5-15 min (skip prefetch) or 30-45 min (with prefetch)
5. **Build sd-worker image**
   - Base: Same CUDA base
   - Installs: Stable Diffusion, diffusers
   - Estimated build time: 5-10 min
6. **Push images to Docker Hub**
   - `docker.io/dc1/llm-worker:latest`
   - `docker.io/dc1/sd-worker:latest`
   - Optional: `docker.io/dc1/llm-worker:latest-fullbake` (nightly)

### Monitoring Build Progress

1. **GitHub Actions UI**
   - Repository → Actions
   - Select "docker-instant-tier" workflow
   - Click latest run
   - View logs in real-time

2. **Build Times**
   - Skip prefetch (`SKIP_MODEL_PREBAKE=1`): ~15 min
   - With prefetch (`SKIP_MODEL_PREBAKE=0`): ~45 min
   - Total with both images: ~25-60 min

3. **Failure Debugging**
   - Click failed step to see full error
   - Common issues:
     - Docker Hub rate limit → retry in 1 hour
     - Out of disk space → GitHub Actions has 14GB, should be enough
     - Model download timeout → extend timeout in workflow
     - Auth failure → re-check secrets (no special chars, correct token)

---

## Post-Build Verification

### Option A: Docker Hub Web UI

1. Navigate to https://hub.docker.com/r/dc1/llm-worker
2. Check "Tags" section
3. Should see `latest` tag with recent timestamp

### Option B: Docker CLI

```bash
docker pull dc1/llm-worker:latest
docker inspect dc1/llm-worker:latest

# Expected output should show:
# - Layers: CUDA base + Python + PyTorch + vLLM
# - Config.Env: HF_HOME, TRANSFORMERS_CACHE vars
# - Size: ~7 GB
```

### Option C: GitHub Workflow Summary

In GitHub Actions UI:
- Workflow run completed successfully ✓
- All jobs passed ✓
- Artifacts: None (images pushed directly to registry)

---

## Troubleshooting

### Issue 1: `Error: Unable to locate credentials`

**Cause:** Secrets not configured correctly

**Fix:**
1. Verify secret names are exact: `DOCKER_HUB_USERNAME`, `DOCKER_HUB_TOKEN`
2. Check for extra spaces or special characters in values
3. Re-create secrets if in doubt

### Issue 2: `Error: Invalid username or password`

**Cause:** Wrong credential or expired token

**Fix:**
1. Verify Docker Hub credentials are correct (test locally)
2. Check token hasn't expired (Docker Hub > Account Settings > Security)
3. Create new token if needed
4. Update secret in GitHub

### Issue 3: `Error: Docker Hub rate limit exceeded`

**Cause:** Too many concurrent builds or pulls

**Fix:**
1. Wait 1 hour before retrying
2. Reduce concurrent builds (if using matrix)
3. Use Docker Hub official images (have higher rate limits)

### Issue 4: Build Timeout (>1 hour)

**Cause:** Model prefetch taking too long or network issue

**Fix:**
1. Disable prefetch: `SKIP_MODEL_PREBAKE=1`
2. Increase timeout in workflow (default: 60 min)
3. Check network bandwidth during build
4. Reduce batch size or model complexity

### Issue 5: `Error: out of disk space`

**Cause:** GitHub Actions runner only has 14GB free

**Fix:**
1. This shouldn't happen with ~7GB image size
2. If it does, try building without prefetch first
3. Contact GitHub support if persistent

---

## Security Best Practices

### ✅ DO:

- [ ] Use Personal Access Token (not Docker Hub password)
- [ ] Limit token scope (e.g., read/write, not admin)
- [ ] Rotate tokens periodically (yearly recommended)
- [ ] Use organization secrets for multi-repo access
- [ ] Mask secrets in logs (GitHub does this automatically)
- [ ] Review workflow access (who can trigger builds)

### ❌ DON'T:

- [ ] Commit credentials to repository
- [ ] Use Docker Hub password (create PAT instead)
- [ ] Share token in Slack/email
- [ ] Use overly permissive token scopes
- [ ] Leave old/unused tokens active

---

## Reverting Credentials

If credentials are compromised:

1. **Immediately Revoke Token**
   - Docker Hub → Account Settings → Security → Delete token

2. **Create New Token**
   - Follow Step 1 above

3. **Update GitHub Secret**
   - Settings → Secrets → Update `DOCKER_HUB_TOKEN`

4. **Force Re-build**
   - Trigger workflow manually to test new credentials

---

## Advanced: Multi-Registry Builds

If you need to push to multiple registries (e.g., ECR, GCR, DockerHub):

```yaml
# Example: Push to both Docker Hub and ECR
- name: Push to Docker Hub
  run: docker push dc1/llm-worker:latest

- name: Push to AWS ECR
  run: aws ecr put-image ...  # Requires AWS credentials
```

For AWS ECR:
- Add GitHub Actions AWS credentials
- Use `aws-actions/configure-aws-credentials@v2`
- Implement similar secret setup process

---

## References

- **Docker Hub Security:** https://docs.docker.com/security/
- **GitHub Actions Secrets:** https://docs.github.com/en/actions/security-guides/encrypted-secrets
- **Docker Login:** https://docs.docker.com/engine/reference/commandline/login/
- **GitHub PAT:** https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens

---

## Quick Summary

| Step | Action | Time |
|------|--------|------|
| 1 | Create Docker Hub PAT | 5 min |
| 2 | Configure GitHub secrets | 5 min |
| 3 | Verify configuration | 2 min |
| 4 | Trigger build | 1 min |
| 5 | Monitor build | 15-60 min |
| 6 | Verify images in registry | 2 min |

**Total setup time:** ~30 min (one-time)
**Build execution time:** 15-60 min per run

---

**Document Version:** 1.0
**Last Updated:** 2026-03-23 15:30 UTC
**Status:** Ready for DevOps implementation
