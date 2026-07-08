# DCP Lane Roadmaps - 2026-07-08

Timestamp: 2026-07-08 03:31 UTC / 07:31 +04.

This file breaks the Fireworks/Tinker audit into five execution lanes. It should
be read with `docs/roadmaps/2026-07-08-dcp-execution-system.md`.

## Lane 1 - Frontend Roadmap

### Outcome

Make DCP feel like a coherent Fireworks-style product while staying honest about
what is live.

### Now

- Add a product IA that is easy to scan:
  - Inference
  - Pods
  - Fine-tuning
  - Dedicated deployments
  - Benchmarks
  - Pricing
- Turn workspace pre-upload into the normal first step for pod/fine-tuning
  users.
- Add template selection to pod launch:
  - PyTorch
  - LoRA SFT
  - QLoRA SFT
  - vLLM serve
  - embeddings/rerank
  - Arabic transcription candidate
- Tighten playground/pricing so model rate and capability copy comes from
  backend metadata where possible.

### Next

- Add Fine-Tuning dashboard shell:
  - datasets
  - training jobs
  - adapters
  - deployments
  - curl/API snippet
- Add product pages once backend gates exist:
  - `/inference`
  - `/pods`
  - `/fine-tuning`
  - `/dedicated-deployments`
  - `/batch`
- Add benchmark pages for Arabic/customer-support tasks only after reproducible
  benchmark artifacts exist.

### Later

- Team/workspace usage exports.
- Enterprise quota and routing policy UI.
- Case-study pages and GCC startup credits flow.

### First PRs

1. Pod launch UX map: workspace -> template -> GPU -> duration -> credit check.
2. Product IA copy cleanup without new claims.
3. Fine-Tuning dashboard shell with "coming next" states tied to backend gates.

### Required Evidence

- Next.js build.
- Browser screenshots for touched routes.
- Mobile viewport check.
- Copy review against live capability.

## Lane 2 - Backend Roadmap

### Outcome

Create stable primitives for metadata, batch jobs, prompt-cache accounting,
adapter registry, and deployment lifecycle without breaking money/routing.

### Now

- Reconcile platform-adjacent drift:
  - `dcp-agent` local checkout remains stale/detached.
  - `ops/dcp-deploy-watch.sh` remains untracked locally but installed on VPS.
- Add model capability/rate metadata tests.
- Add backend design doc for prompt-cache accounting.
- Add backend design doc for batch inference on existing job/billing rails.

### Next

- Add adapter registry migration and service:
  - renter id
  - adapter id/name
  - base model
  - storage key
  - checksum
  - rank/metadata
  - status
  - created/deployed timestamps
- Add dataset validator for LoRA SFT JSONL.
- Add deployment record lifecycle:
  - pending
  - provisioning
  - running
  - degraded
  - stopped
  - failed

### Later

- Quotas and usage export.
- Team-level API key budgets.
- Evaluator job records.
- Router policy objects.

### First PRs

1. Ops cleanup PR for `dcp-agent` and deploy-watch decision.
2. Inference metadata/rate consistency tests.
3. Adapter registry schema with tests, no serving behavior yet.

### Required Evidence

- Targeted Jest suite.
- Migration idempotency proof when schema changes.
- OpenAPI/docs update when response shape changes.
- Production `/api/health` after deploy.

## Lane 3 - Inference Roadmap

### Outcome

Make DCP Inference a serious API product: priced, streamed, routed, cached,
batchable, observable, and compatible with OpenAI/Anthropic clients.

### Now

- Preserve existing strengths:
  - `/v1/models`
  - `/v1/chat/completions`
  - Anthropic messages for agents
  - streaming
  - billing settlement
  - provider engine routing
- Add model capability metadata:
  - input/output SAR per 1M tokens
  - context window
  - modalities
  - tools support
  - streaming support
  - reasoning support
  - dedicated deployment support
  - LoRA support
- Add route tests proving catalog/pricing consistency.

### Next

- Prompt-cache accounting:
  - session/static-prefix hash
  - cached input token measurement
  - response usage field
  - no discount until measurement is reliable
- Batch inference:
  - JSONL input
  - async job
  - status endpoint
  - result artifact
  - discounted billing policy
  - idempotency key
- Router policies:
  - cheapest
  - lowest latency
  - Saudi-only
  - coding
  - Arabic

### Later

- Evaluators and public benchmark runs.
- Metrics export.
- Customer-facing latency/throughput dashboards.
- Multimodal/audio model surfaces.

### First PRs

1. `/v1/models` capability metadata audit and tests.
2. Prompt-cache accounting design with test fixtures.
3. Batch inference API design and schema, then implementation.

### Required Evidence

- Targeted v1/Anthropic/backend tests.
- Streaming smoke for `/v1/chat/completions`.
- Anthropic SSE smoke for agent path when touched.
- One real low-cost inference smoke after production deploy.

## Lane 4 - POT/PODS Infrastructure Roadmap

### Outcome

Turn pods into a reliable fine-tuning and dedicated-compute product: fast
images, durable workspace, honest billing, benchmarked providers, and clear
template launch.

### Now

- Keep current pod primitives safe:
  - launch
  - stop
  - extend
  - prepaid quote/debit
  - unused-time refund
  - on-demand paid-credit gate
  - workspace tiers
- Decide and commit/ignore/retire `ops/dcp-deploy-watch.sh`.
- Write the fat image build spec:
  - PyTorch/CUDA
  - transformers
  - peft
  - accelerate
  - datasets
  - bitsandbytes
  - vLLM
  - example scripts
  - optional tinker-cookbook where access permits

### Next

- Build and verify fat image on a GPU provider host.
- Add template-backed launch flow.
- Add workspace pre-upload polish.
- Add Nsight Python benchmark MVP:
  - utilization
  - memory bandwidth
  - occupancy
  - cache hit rates
  - thermals
  - CSV output
  - provider quality score input

### Later

- Dedicated long-running endpoints.
- Reserved capacity workflow.
- Provider quality score visible to admins and eventually renters.
- Autoscale policy for DCP-owned serving nodes.

### First PRs

1. Fat pod image spec and verification script.
2. Workspace-to-pod launch UX/API polish.
3. Nsight provider benchmark script/runbook.

### Required Evidence

- Pod policy/billing targeted tests.
- Controlled pod launch/stop/refund smoke for lifecycle changes.
- GPU-host proof for image and Nsight work.
- No vendor/provider internals exposed to renter UI.

## Lane 5 - LoRA Roadmap

### Outcome

Ship the train-here/deploy-here loop: customer dataset -> LoRA adapter ->
DCP-hosted endpoint -> billed inference.

### Now

- Treat LoRA as the bridge between pods and inference, not a separate product
  brand.
- Keep public wording honest:
  - "LoRA SFT MVP" when that is what exists.
  - No "full Tinker replacement" claim.
  - No "beats frontier models" claim without a task benchmark.
- Strengthen templates:
  - `docker-templates/lora-finetune.json`
  - `docker-templates/qlora-finetune.json`
  - `docker-templates/vllm-serve.json`

### Next

- Dataset validation:
  - JSONL shape
  - token/size estimate
  - unsafe/empty row rejection
  - train/validation split metadata
- Adapter registry:
  - owner
  - base model
  - adapter metadata
  - storage key
  - checksum
  - status
- Managed LoRA SFT job:
  - fixed recipe
  - logs
  - artifact output
  - model card stub
- Adapter deploy:
  - one adapter/live merge first
  - multi-LoRA second
  - endpoint only routes after adapter load proof

### Later

- DPO/RL/distillation recipes.
- Tinker-style API shim if the underlying behavior is real.
- Adapter marketplace or revenue-share model.
- Enterprise white-glove fine-tune packages.

### First PRs

1. LoRA template validation and dry-run improvements.
2. Adapter registry schema and service tests.
3. Dataset validator and training-job contract.
4. Single-adapter deploy API.
5. Multi-LoRA serving proof.

### Required Evidence

- Template validation.
- Adapter registry tests.
- GPU-host training artifact proof.
- vLLM adapter load proof.
- Inference billing proof for adapter endpoint.

## Cross-Lane Priority Order

1. Ops cleanup and repo parity.
2. Inference metadata/rate consistency.
3. Fat pod image spec and GPU-host verification.
4. Workspace-to-pod launch polish.
5. Adapter registry schema.
6. Prompt-cache accounting design.
7. Batch inference design.
8. LoRA training job MVP.
9. Adapter deploy MVP.
10. Fireworks-style product pages.

## Weekly Cadence

Monday:

- Pick top 3 findings.
- Assign lane and PR owner.
- Confirm acceptance gates.

Daily:

- One small PR per lane max unless a blocker requires a fix.
- Keep changelogs current.
- Keep local/GitHub/VPS/Vercel parity visible.

Friday:

- Review smoke failures, live metrics, and Telegram founder requests.
- Promote repeated manual checks into scripts.
- Refresh the roadmaps with completed PR numbers and new findings.
