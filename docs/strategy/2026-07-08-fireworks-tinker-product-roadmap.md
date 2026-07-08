# DCP Fireworks/Tinker Product Roadmap - 2026-07-08

Audit timestamp: 2026-07-07 21:03 UTC / 2026-07-08 01:03 +04.

## Executive Thesis

DCP should copy the shape of Fireworks.ai's product packaging, not pretend to
copy its proprietary inference engine. Fireworks wins because the product is not
just a token endpoint: it is a graduated platform of serverless inference,
dedicated deployments, fine-tuning, LoRA deployment, batch inference, prompt
caching, evaluators, routers, quotas, metrics, billing export, and CLI tooling.

DCP's wedge is different and stronger for our market:

- Saudi/GCC compute, storage, billing, and operating story.
- GPU pods with root/Jupyter/SSH for builders who need real machines, not only
  API calls.
- OpenAI/Anthropic-compatible inference on DCP-verified provider engines.
- A marketplace supply base that can run 3090/4090/5090-class LoRA training and
  serving economics before enterprise H100/H200 pricing is justified.
- A future Tinker-style local-loop training experience where DCP is the
  sovereign deployment and compute layer.

The product should be presented as four connected rails:

1. **DCP Inference** - OpenAI/Anthropic-compatible model APIs, per-model SAR
   pricing, streaming, batch, prompt caching, routing, quotas, and usage export.
2. **DCP Pods / POTS Infrastructure** - dedicated GPU workspaces with Jupyter,
   SSH, persistent volumes, template images, benchmark tooling, and paid
   on-demand gates.
3. **DCP Fine-Tuning** - LoRA/QLoRA SFT first, adapter registry, dataset upload,
   job tracking, and "train here, deploy here" workflows.
4. **DCP Dedicated Deployments** - persistent customer endpoints for custom base
   models and fine-tuned adapters, including live-merge and multi-LoRA serving
   where vLLM supports it.

## Source Check

Current external references used for this roadmap:

- Fireworks Serverless Overview: https://docs.fireworks.ai/serverless/overview
- Fireworks LoRA Deployment: https://docs.fireworks.ai/fine-tuning/deploying-loras
- Fireworks Pricing: https://fireworks.ai/pricing
- Fireworks Batch API: https://docs.fireworks.ai/guides/batch-inference
- Fireworks Docs Index: https://docs.fireworks.ai/llms.txt
- Tinker Docs: https://tinker-docs.thinkingmachines.ai/
- Tinker Quickstart: https://tinker-docs.thinkingmachines.ai/tinker/quickstart/

Key source facts:

- Fireworks serverless is per-token and has prompt caching economics.
- Fireworks batch inference is async and priced at a discount.
- Fireworks fine-tuned LoRA models are not served serverlessly; they require
  dedicated/on-demand deployments.
- Fireworks supports live merge and multi-LoRA deployment modes.
- Fireworks prices fine-tuning per 1M training tokens, with LoRA SFT starting at
  low per-token training rates for small models.
- Tinker exposes low-level training primitives: create LoRA, forward/backward,
  optimizer step, save weights, sample/evaluate. It lets users write local loops
  while remote infrastructure handles GPU execution.

## Opinion on the Shared Documents

The two handover documents are directionally right and commercially useful. The
best part is the framing: LoRA is not a third disconnected product. It is the
bridge between GPU pods and inference revenue. Builders rent a GPU, train an
adapter, then host that adapter on DCP.

The parts to tighten:

- Do not publicly claim "Tinker-compatible" until DCP actually implements the
  same workflow contract or an honest shim.
- Do not claim a fine-tuned small model beats a frontier model generally. Claim
  task-level wins only after DCP publishes a reproducible benchmark.
- Do not sell LoRA as a separate brand before the pod and inference rails are
  hardened. Sell it as a workflow inside DCP Pods and DCP Inference.
- Do not start with RL/DPO/full-parameter training. Start with fixed-recipe SFT
  on LoRA/QLoRA, because it is shippable on consumer GPUs and testable quickly.

## Fireworks-Style Product Matrix

| Fireworks rail | DCP target | Current DCP state | Next action |
|---|---|---|---|
| Serverless text/vision inference | DCP Inference API | OpenAI `/v1`, Anthropic messages, model catalog, streaming, billing | Add per-model rate discipline, prompt-cache accounting, batch API, model capability metadata |
| Dedicated deployments | DCP Dedicated Endpoints | Pods and vLLM serving exist, but productized dedicated endpoint control is incomplete | Add deployment records, endpoint lifecycle, quotas, and customer-facing status |
| LoRA fine-tuning | DCP Fine-Tuning MVP | LoRA/QLoRA template scaffolds exist, no real adapter job product | Bake fat image, add dataset/upload/job flow, fixed SFT recipe |
| LoRA deployment | Adapter registry + live merge/multi-LoRA | vLLM configs reference LoRA logs, but no adapter registry/API | Add adapter schema, upload API, deployment API, vLLM multi-LoRA acceptance test |
| Batch inference | DCP Batch | Not a productized route | Add async batch job API using existing job/billing primitives |
| Prompt caching | DCP cached input discount | Not tracked as product accounting | Add request hash/session cache measurement and billing fields before discounting |
| Evaluators | DCP Benchmarks/Evals | Benchmark routes/scripts exist | Add customer-facing eval jobs and published Arabic task benchmarks |
| Routers | DCP model/router selection | Basic provider routing and demand telemetry exist | Add policy-driven router objects and model fallback rules |
| Quotas/usage export | Renter/admin controls | Partial billing/usage data exists | Add API-key budgets, export, and team usage pages |
| CLI/connectors | `dcp` / `dcpconnect` | `dcp` launcher exists for Claude Code path | Extend to Codex/Cursor/OpenCode configs after Anthropic/OpenAI paths are stable |

## Roadmap

### Phase A - Reconciliation and Hardening (1-3 days)

Goal: make sure the platform base is safe before product expansion.

- Reconcile local `dcp-agent`; it is the main remaining local/GitHub drift item.
- `ops/dcp-deploy-watch.sh` is already promoted to Git and byte-identical to the
  VPS2 cron copy as of the 2026-07-08 11:03 UTC refresh.
- Triage the Docker worker image CI failures.
- Run the H9 dependency/security maintenance window.
- Scrub public docs for credential-shaped examples.
- Close or rebase stale PR #676 so frontend work starts from a clean head.

Acceptance:

- Local/GitHub/VPS2/Vercel platform heads match.
- CI image failures are understood and assigned.
- No known current-tree credential-shaped examples remain in public docs.

### Phase B - Pods / POTS Infrastructure Upgrade (1 week)

Goal: turn pods into a fine-tuning-ready product surface, not a bare machine.

- Build a fat DCP compute image with:
  - PyTorch/CUDA
  - transformers
  - peft
  - accelerate
  - datasets
  - bitsandbytes
  - vLLM
  - tinker-cookbook where licensing/access permits
  - example scripts under `/workspace/examples`
- Verify fresh pod imports for the LoRA stack in under 5 seconds without pip
  installing.
- Surface workspace pre-upload more clearly before pod launch.
- Attach pod templates directly to launch flows:
  - LoRA SFT
  - QLoRA SFT
  - vLLM serve
  - Arabic RAG
  - embeddings/rerank
  - Whisper/Arabic transcription candidate
  - PR #761 began this in `/renter/pods` by binding template cards to
    `/api/templates/catalog` ids and using catalog VRAM metadata for GPU
    filtering.
- Add an Nsight Python provider benchmark runbook/MVP:
  - compute utilization
  - memory bandwidth
  - occupancy
  - cache hit rates
  - thermals
  - CSV/plot output
  - provider quality score input
  - PR #774 added a CI-safe mock contract guard for the provider benchmark
    evidence shape; real GPU-host proof remains required before score ingestion.
- Keep big GPU access behind paid credit; free/trial stays on DCP/community
  supply only.
  - PR #767 connected this paid-credit gate to `/renter/pods` with structured
    blocked-launch guidance and exact funding-gap facts, while keeping
    vendor/on-demand internals out of renter copy.
  - PR #768 aligned the backend 402 and OpenAPI copy with the same credit-first
    language without changing the stable machine-readable contract.

Acceptance:

- One fresh 3090-class pod can run the LoRA training scaffold without a long pip
  install.
- Workspace upload -> launch pod -> files visible in `/workspace` is verified.
- Nsight benchmark can run on a provider node and emit a machine-readable report.

### Phase C - Inference Product Hardening (1 week)

Goal: make DCP Inference look like a serious API product, not just a proxy.

- Lock per-model pricing metadata:
  - input SAR/M tokens
  - output SAR/M tokens
  - context window
  - modalities
  - supports tools
  - supports streaming
  - supports reasoning
  - supports LoRA/dedicated deployment
  - PR #769 centralized SAR/USD/halala token-pricing serialization for
    `/api/models`, `/api/models/catalog`, and `/v1/models`.
  - PR #771 added `feature_readiness` to the same model surfaces so advanced
    rails are visible as gated/measurement-only states without overclaiming
    public availability.
- Add prompt-cache accounting design:
  - static prefix/session hash
  - cached input token estimate
  - response usage field
  - no discount until measurement is trusted
  - PR #770 mirrors measured prompt-cache counters into `usage.pricing` so
    pricing/playground clients can display cache observations without changing
    billing.
- Add batch inference design:
  - upload JSONL
  - async job
  - discounted billing policy
  - result download
  - retry/idempotency
  - PR #776 added a renter-authenticated batch readiness contract so product
    surfaces can show validation-only, result-download, worker, settlement,
    discount, and capability gates honestly.
  - PR #777 wired `/renter/batches` to that readiness contract so the batch
    console renders create/execution/download/settlement/discount gates from
    backend flags instead of static copy.
- Add customer-facing routing rules:
  - cheapest
  - lowest latency
  - Saudi-only
  - coding
  - Arabic
  - PR #772 added a read-only `/v1/router/policies` readiness catalog for these
    policies without making them request-selectable yet.
  - PR #773 accepts explicit `routing_policy: "balanced"` on
    `/v1/chat/completions` and rejects non-selectable future policies with a
    structured 400.
  - PR #779 shows those router-policy readiness states in `/renter/playground`
    and sends `routing_policy=balanced` only for the available default.
- Surface model metadata in the Playground from `/v1/models`.
  - PR #780 added selected-model context, max output, SAR token rates,
    capability chips, and advanced feature readiness gates to
    `/renter/playground`.
- Surface serveable-model pricing on public `/pricing` from `/v1/models`.
  - PR #781 added a live catalog table for models with live providers, context,
    SAR input/output rates, pricing source, and capability chips.
- Publish honest benchmark pages before making quality claims.

Acceptance:

- `/v1/models` or companion metadata can power pricing pages, playground, and
  CLI consistently.
- Streaming is verified for `/v1/chat/completions` and `/anthropic/v1/messages`.
- Batch/prompt-cache PRs have backend designs and acceptance tests before code.

### Phase D - LoRA/Tinker MVP (2-3 weeks)

Goal: ship the first real train-here/deploy-here loop.

- Add adapter registry:
  - owner/renter id
  - base model id
  - adapter id/name
  - storage key
  - rank/metadata
  - checksum
  - status
  - created/deployed timestamps
- Add dataset upload flow using the existing workspace/file infrastructure.
- Add managed LoRA SFT job API:
  - fixed recipe first
  - JSONL validation
  - training logs
  - output adapter artifact
  - model card template
  - PR #775 added a metadata-only model-card manifest on LoRA training jobs;
    public training, serving, quality claims, and Tinker compatibility remain
    disabled until GPU-host proof exists.
  - PR #778 added Fine-Tuning console proof cards for those manifests, keeping
    the UI metadata-only and rendering the false claim guards directly.
  - PR #782 added `GET /api/lora/readiness` so UI, docs, and agents can consume
    the LoRA product gate in one place. It keeps public training, serving,
    routing, quality claims, Tinker compatibility, and discounts false until
    real GPU-host and serving-load proof exist.
- Add adapter deploy API:
  - live-merge mode for one adapter on a dedicated deployment
  - multi-LoRA mode for many adapters on one base deployment where vLLM supports
    the target model
- Add dashboard:
  - datasets
  - training jobs
  - adapters
  - deploy/undeploy
  - endpoint/curl snippet
- Add `dcpconnect` only after adapters can actually deploy.

Acceptance:

- One customer dataset can produce a LoRA adapter on a 3090-class pod.
- The adapter can be served through a DCP endpoint.
- Usage is billed through the existing inference ledger.
- Public copy says "LoRA SFT MVP", not "full Tinker replacement".

### Phase E - Fireworks-Style Packaging (3-6 weeks)

Goal: make the product easy to understand and sell.

- New product IA:
  - Inference
  - Pods
  - Fine-tuning
  - Dedicated deployments
  - Benchmarks
  - Pricing
- Add English/Arabic pages:
  - `/inference`
  - `/pods`
  - `/fine-tuning`
  - `/models/allam`
  - `/models/qwen-arabic`
  - `/batch`
  - `/dedicated-deployments`
- Add GCC startup credits and case-study pipeline only after billing/product
  controls are clear.
- Publish comparison content:
  - DCP vs Fireworks for Saudi/GCC workloads
  - DCP vs RunPod for pods plus inference
  - DCP vs closed frontier APIs for sovereign fine-tuned tasks

Acceptance:

- Landing pages match the real shipped product.
- Pricing, playground, docs, and `/v1/models` agree.
- Every claim has either a source link, a production endpoint, or an honest
  "coming next" label.

## First Seven PRs

1. **Roadmap and gap audit** - this document plus the current-state audit.
2. **Ops cleanup** - decide `ops/dcp-deploy-watch.sh`, Docker image CI, and
   `dcp-agent` reconciliation sequence. **Deploy-watch resolved in PR #731;
   pod-image contract CI started in PR #762; `dcp-agent` still needs the
   controlled maintenance window.**
3. **Fat pod image plan** - Dockerfile/build path, package list, GPU-host
   verification script, no product UI yet. **CI-safe contract gate started in
   PR #762; GPU-host proof still required.**
4. **Nsight provider benchmark MVP** - script/runbook and provider scorecard
   schema proposal. **Script/runbook landed in PR #740; mock evidence contract
   guard landed in PR #774; GPU-host proof remains required.**
5. **Inference metadata/pricing audit** - model capability/rate metadata and
   consistency checks. **Capability honesty for explicit non-chat models started
   in PR #766; advanced feature readiness metadata added in PR #771; router
   policy visibility reached the Playground in PR #779; selected-model pricing
   and readiness visibility reached the Playground in PR #780; public pricing
   visibility reached `/pricing` in PR #781.**
6. **Workspace-to-pod launch polish** - pre-upload, template selection, and
   stronger launch flow. **Started in PR #761.**
7. **Adapter registry schema/API design** - migrations/tests first, deployment
   code second. **Metadata and readiness foundations are in place through PR
   #782; real GPU-host artifact proof and vLLM serving smoke remain the gates
   before public LoRA serving claims.**

## Division of Work

Backend lane:

- Pod/image contracts.
- Adapter registry and training/deploy APIs.
- Billing, prompt cache, batch jobs, quotas, and routers.
- Nsight benchmark ingestion and provider score updates.

Frontend lane:

- Product IA and pages.
- Renter pod launch/template UX.
- Dataset/training/adapters dashboard.
- Playground and pricing transparency.

Shared lane:

- API contracts.
- Changelog discipline.
- Production smoke checks.
- Honest product copy in English and Arabic.
