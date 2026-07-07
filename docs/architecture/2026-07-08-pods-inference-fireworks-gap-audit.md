# Pods and Inference Fireworks Gap Audit - 2026-07-08

Audit timestamp: 2026-07-07 21:03 UTC / 2026-07-08 01:03 +04.

Current platform commit audited:

- Local: `34acb406bec6`
- GitHub `origin/main`: `34acb406bec6`
- Branch at audit start: `main`

## Scope

This audit looks only at the main platform repo:

- `/Users/pp/DC1-Platform/dc1-platform`
- GitHub: `https://github.com/dhnpmp-tech/dcp-platform`

It focuses on the two product rails Peter asked to improve:

- Pods / POTS infrastructure, frontend and backend.
- Inference, frontend and backend.

It also maps those rails against the Fireworks.ai/Tinker-style target described
in the July 2026 handover docs.

## Current Pods Backend

Primary files:

- `backend/src/routes/pods.js`
- `backend/src/routes/workspace.js`
- `backend/src/routes/volumes.js`
- `backend/src/services/podAccessPolicy.js`

Current capabilities:

- Renter pod lifecycle:
  - `GET /api/pods`
  - `POST /api/pods`
  - `GET /api/pods/:id`
  - `DELETE /api/pods/:id`
  - `POST /api/pods/:id/extend`
- Waitlist:
  - `POST /api/pods/notify-me`
- Workspace and volumes:
  - `GET /api/workspace/files`
  - upload/download/delete files
  - multipart upload
  - `GET /api/volumes/me`
  - `POST /api/volumes/rent`
  - `DELETE /api/volumes`
- Native and burst/on-demand pod support.
- Jupyter token and root password generation.
- SSH/Jupyter relay handling.
- Strong weak-token rejection for notebook tokens.
- Active pod quotas.
- Duration caps and reserved-capacity message for longer runs.
- Prepaid quote/debit before launch.
- Stop settlement with unused-time refund.
- Extend settlement and escrow update.
- Supply-tier/on-demand paid-credit gate through `podAccessPolicy`.
- Workspace tiers:
  - `ephemeral`
  - same-provider free persistence
  - portable paid S3-backed volume

What this means:

DCP already has a serious pod primitive. The backend is not the main weakness.
The weakness is that the primitive is not yet packaged as a fine-tuning and
dedicated-deployment product.

## Current Pods Frontend

Primary files:

- `app/(site)/renter/pods/page.tsx`
- `app/(site)/renter/pods/PodShell.tsx`
- `app/(site)/renter/workspace/WorkspacePanel.tsx`
- `app/(site)/renter/workspace/workspaceApi.ts`
- `app/(site)/renter/workspace/UploadDropzone.tsx`
- `app/(site)/components/gpu-availability/GpuAvailability.tsx`

Current capabilities:

- Renter-facing pod console.
- Launch/stop/extend flows.
- Live GPU availability cards.
- Workspace browser/upload UI.
- Portable volume rent CTA.
- Credit/paywall language for blocked launches.

Gaps:

- Template choice is not a first-class launch step.
- The "upload data before pod launch" workflow exists technically but is not
  framed as the standard fine-tuning path.
- There is no datasets/training/adapters dashboard.
- There is no customer-facing provider benchmark/quality score yet.
- There is no Nsight benchmark result surfaced to users or admins.

## Current Inference Backend

Primary files:

- `backend/src/routes/v1.js`
- `backend/src/routes/anthropic.js`
- `backend/src/routes/vllm.js`
- `backend/src/routes/models.js`
- `backend/src/routes/pricing.js`
- `backend/src/services/billingService.js`
- `backend/src/services/inferenceTracker.js`
- `backend/src/services/pricingService.js`
- `backend/src/services/vllmCompatibilityMatrix.js`

Current capabilities:

- OpenAI-compatible:
  - `GET /v1/models`
  - `POST /v1/chat/completions`
  - streaming and non-streaming paths
  - idempotency cache for non-streaming requests
  - model availability and alternatives
  - reasoning suppression/normalization for thinking models
  - tool/message normalization
  - provider slot gating
  - provider routing by capability/model
  - billing settlement through the shared inference path
- Anthropic-compatible:
  - `POST /anthropic/v1/messages`
  - streaming SSE passthrough
  - `POST /anthropic/v1/messages/count_tokens`
  - provider engine routing to vLLM native Anthropic engines
  - billing settlement from usage frames/body
- vLLM/provider serving:
  - `GET /api/vllm/models`
  - `POST /api/vllm/complete`
  - `POST /api/vllm/chat/completions`
  - `POST /api/vllm/complete/stream`
- Model/product surfaces:
  - model catalog
  - model cards
  - benchmarks endpoints
  - deploy estimate/deploy route
  - pricing tiers and Arabic RAG pricing

What this means:

DCP has a real inference control plane. The missing Fireworks-style product work
is around packaging and advanced rails: prompt cache, batch, adapters,
evaluators, quotas, routers, and metrics export.

## Current Inference Frontend

Primary files:

- `app/(site)/renter/playground/page.tsx`
- `app/(site)/pricing/page.tsx`
- `app/components/pricing/ModelRateCard.tsx`
- `app/(site)/components/live-capacity/LiveCapacity.tsx`
- `app/(site)/components/demo-chat/DemoChat.tsx`
- `docs/models*`

Current capabilities:

- Playground pulls live `/v1/models`.
- Playground can stream responses.
- Pricing page/model rate card exists.
- Live capacity component reads health and model catalog.
- Public demo chat streams from backend path.
- Model docs/cards exist in English and Arabic.

Gaps:

- Pricing/capability metadata is not yet strong enough to power a Fireworks-like
  model catalog by itself.
- Prompt cache and batch discounts are not exposed because they are not built.
- Dedicated deployment and adapter deployment have no UI.
- Evaluator/benchmark jobs are not self-serve.
- The model docs do not yet form a unified "choose model -> fine-tune -> deploy"
  path.

## Current LoRA/Tinker Assets

Primary files:

- `docker-templates/lora-finetune.json`
- `docker-templates/qlora-finetune.json`
- `docker-templates/vllm-serve.json`
- `docker-templates/README.md`
- `infra/vllm-configs/*`
- `infra/vllm-configs/compatibility-matrix.json`
- `scripts/inference-benchmarks-runner.mjs`
- `scripts/provider-gpu-benchmark.mjs`

Current capabilities:

- LoRA and QLoRA template scaffolds exist.
- vLLM serving template exists.
- vLLM config scripts exist for several Arabic/open models.
- Compatibility matrix exists for vLLM model/VRAM matching.
- Benchmark scripts exist.

Gaps:

- LoRA templates are dry-run scaffolds, not a complete trainer product.
- The standard pod image does not yet guarantee the full ML stack that Tareq
  needs without long `pip install` time.
- There is no adapter artifact registry.
- There is no adapter upload API.
- There is no multi-LoRA deployment API.
- There is no Tinker-compatible API surface.
- There is no public claim-safe benchmark showing DCP fine-tuned model quality.

## Fireworks Gap Matrix

| Capability | DCP state | Gap severity | Recommended owner |
|---|---|---:|---|
| OpenAI-compatible inference | Live | Low | Backend hardening |
| Anthropic-compatible agent inference | Live | Low | Backend hardening |
| Streaming | Live in `/v1` and Anthropic routes | Low | Backend + frontend smoke |
| Per-model pricing | Partial | Medium | Backend |
| Prompt caching discount | Missing | High | Backend |
| Batch inference | Missing as product | High | Backend |
| Dedicated deployments | Partial through pods/vLLM | High | Backend |
| LoRA training | Template only | High | Backend + pod image |
| LoRA adapter registry | Missing | High | Backend |
| Live-merge LoRA deployment | Missing | High | Backend |
| Multi-LoRA deployment | Missing | High | Backend |
| Dataset management | Partial through workspace | Medium | Frontend + backend |
| Evaluators | Benchmark primitives only | Medium | Backend |
| Model routers | Routing primitives only | Medium | Backend |
| Quotas/usage export | Partial | Medium | Backend + frontend |
| CLI connect | Partial with `dcp` launcher | Medium | CLI/backend |
| Nsight provider transparency | Missing | Medium | Ops/backend |
| Public benchmark content | Partial/old | High | Product/docs |

## Immediate Backend Roadmap

1. Reconcile the remaining platform-adjacent repo drift:
   - `dcp-agent` local checkout is stale/detached.
   - `ops/dcp-deploy-watch.sh` is untracked locally but installed on VPS cron.
2. Add model capability/rate metadata tests for `/v1/models`.
3. Design prompt-cache accounting without applying discounts yet.
4. Design batch inference on top of existing job/billing primitives.
5. Add adapter registry migration and tests.
6. Add LoRA train job API with a fixed SFT recipe.
7. Add adapter deployment API for one base model on a controlled vLLM deployment.

## Immediate Frontend Roadmap

1. Make workspace pre-upload part of the normal pod launch story.
2. Add template selection to pod launch:
   - PyTorch
   - LoRA SFT
   - QLoRA SFT
   - vLLM serve
   - embeddings/rerank
   - Arabic transcription candidate
3. Add a Fine-Tuning section:
   - datasets
   - jobs
   - adapters
   - deployments
4. Add Fireworks-style product pages, but only with shipped claims:
   - Inference
   - Pods
   - Fine-tuning
   - Dedicated deployments
   - Batch, once backend design lands
5. Add pricing transparency from backend metadata rather than duplicated copy.

## Technical Order of Operations

Do not start with marketing pages alone. The safer order is:

1. Ops/repo hardening.
2. Fat pod image and template verification.
3. Inference metadata/pricing tests.
4. Batch and prompt-cache backend designs.
5. Adapter registry.
6. LoRA train job.
7. Adapter deployment.
8. Frontend dashboard.
9. Public pages and launch content.

Reason:

The product story is strong enough. The next risk is overpromising a capability
before the money path, storage path, and serving path can prove it.

## Audit Verdict

DCP does not need a restart. It needs product consolidation.

The current codebase already contains the hard parts that many early platforms
do not have: pod lifecycle, prepaid billing, refunds, workspace storage, live
model routing, OpenAI/Anthropic-compatible inference, and vLLM integration.

The Fireworks/Tinker roadmap should therefore be implemented as additive rails:

- first harden what exists,
- then make LoRA training real,
- then deploy adapters,
- then package the experience like Fireworks.
