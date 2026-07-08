# DCP Lane Roadmaps - 2026-07-08

Timestamp: 2026-07-08 03:31 UTC / 07:31 +04.

This file breaks the Fireworks/Tinker audit into five execution lanes. It should
be read with `docs/roadmaps/2026-07-08-dcp-execution-system.md`.

## Lane 1 - Frontend Roadmap

### Outcome

Make DCP feel like a coherent Fireworks-style product while staying honest about
what is live.

### Progress

- PR #745 added the Fine-Tuning training-jobs ledger to the renter console.
- PR #778 added Fine-Tuning model-card manifest proof cards tied to the
  metadata-only `model_card_manifest` contract from LoRA training jobs.
- PR #759 added `/renter/batches`, the first renter-facing batch console for
  validation records, line-ledger proof, and result-manifest proof. Execution,
  discounts, settlement, downloads, and public model batch flags remain gated.
- PR #761 made `/renter/pods` template selection catalog-backed for PyTorch,
  LoRA SFT, QLoRA SFT, vLLM, embeddings/rerank, and Arabic transcription while
  keeping pod billing/launch semantics unchanged.
- PR #765 made renter funding copy credit-first across the renter shell, shared
  balance/spending cards, top-up modal, low-credit notifications, and
  insufficient-balance CTAs while keeping SAR in payment/accounting contexts.
- PR #767 made `/renter/pods` render structured paid-credit/insufficient-credit
  launch failures with Add credit guidance, exact credit facts, and no
  vendor/on-demand internals exposed to renters.
- PR #777 wired `/renter/batches` to `GET /api/batches/readiness`, adding a
  compact readiness rail for mode, contract version, create/execution/download,
  settlement, discount, window, and supported-URL gates.
- PR #779 wired `/renter/playground` to `GET /v1/router/policies`, showing the
  available balanced default plus future policy gates and sending
  `routing_policy=balanced` only when the backend marks it available.

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
  **Router-policy readiness now comes from `/v1/router/policies` in PR #779.**

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
   **Started in PR #761; structured credit-check guidance added in PR #767.**
2. Product IA copy cleanup without new claims. **Credit-first renter funding
   language started in PR #765.**
3. Fine-Tuning dashboard shell with "coming next" states tied to backend gates.
   **Started in PR #745.**
   **Model-card manifest cards added in PR #778.**
4. Batch console shell tied to backend batch gates. **Started in PR #759.**
   **Readiness gates from the backend contract added in PR #777.**

### Required Evidence

- Next.js build.
- Browser screenshots for touched routes.
- Mocked blocked-launch render for pod credit gates.
- Mobile viewport check.
- Copy review against live capability.

## Lane 2 - Backend Roadmap

### Outcome

Create stable primitives for metadata, batch jobs, prompt-cache accounting,
adapter registry, and deployment lifecycle without breaking money/routing.

### Progress

- PR #768 aligned shared HTTP 402 payment-required copy, pod launch failures, pod
  extend failures, and OpenAPI examples with the credit-first contract while
  preserving stable machine-readable money/error fields.

### Now

- Reconcile platform-adjacent drift:
  - `dcp-agent` local checkout remains stale/detached.
  - `ops/dcp-deploy-watch.sh` is no longer drift: PR #731 promoted it into Git
    and the 2026-07-08 11:03 UTC refresh confirmed the tracked file is
    byte-identical to the VPS2 cron copy.
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
   **Deploy-watch resolved in PR #731; `dcp-agent` remains a maintenance-window task.**
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

### Progress

- PRs #741, #743, #752, #756, #757, and #758 built the gated batch job,
  result-proof, download-signing, line-ledger, and worker line-proof foundation.
- PR #760 added the disabled-by-default bridge from succeeded batch line proof
  to the existing atomic inference settlement service.
- PR #776 added renter-authenticated batch readiness metadata so product
  surfaces can show validation-only, result-download, worker, settlement,
  discount, and capability gates without overclaiming execution.
- PR #777 made the renter batch console consume that readiness metadata directly
  so frontend copy no longer hardcodes the batch execution/download/discount
  gates.
- PR #766 tightened model capability metadata so explicit embedding/rerank/image
  entries are no longer advertised as chat/streaming capable across `/v1/models`,
  `/api/models`, and `/api/models/catalog`.
- PR #769 centralized token-pricing serialization so `/api/models`,
  `/api/models/catalog`, and `/v1/models` share SAR/USD/halala per-1M-token
  metadata from one contract helper.
- PR #770 mirrored measured prompt-cache counters into `usage.pricing` for
  `/v1/chat/completions` responses while keeping discounts and settlement
  math disabled.
- PR #771 added shared `feature_readiness` metadata to `/v1/models`,
  `/api/models`, and `/api/models/catalog` so batch, prompt cache, LoRA, and
  dedicated-deployment rails can be shown as gated/measurement-only without
  flipping product-available booleans.
- PR #772 added read-only `/v1/router/policies` readiness metadata for balanced,
  lowest-latency, cheapest, Saudi-only, coding, and Arabic routing policies
  without changing request routing behavior.
- PR #773 made `routing_policy: "balanced"` an explicit accepted no-op for
  `/v1/chat/completions` and rejects non-selectable future policies with a
  structured 400 instead of silently ignoring them.
- PR #779 made the renter Playground consume the router-policy catalog, display
  balanced/future policy readiness, and send explicit `routing_policy=balanced`
  only for the currently available default.

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
  **Capability honesty for non-chat model entries started in PR #766; token
  pricing contract parity started in PR #769; prompt-cache pricing observation
  started in PR #770; advanced feature readiness started in PR #771.**

### Next

- Prompt-cache accounting:
  - session/static-prefix hash
  - cached input token measurement
  - response usage field
  - no discount until measurement is reliable
  **Ledger and response fields landed in PRs #754/#755; pricing observation
  metadata landed in PR #770 without settlement discounts.**
- Batch inference:
  - JSONL input
  - async job
  - status endpoint
  - result artifact
  - discounted billing policy
  - idempotency key
  **Readiness metadata now marks batch as API metadata only until execution,
  result artifacts, and discounted settlement are enabled. PR #776 adds
  `/api/batches/readiness` for the renter-facing batch gate contract.**
  **PR #777 renders that contract in `/renter/batches` and keeps create,
  execution, downloads, settlement, and discounts tied to backend flags.**
- Router policies:
  - cheapest
  - lowest latency
  - Saudi-only
  - coding
  - Arabic
  **Read-only policy discovery started in PR #772; request-selectable routing
  remains gated until policy-specific routing tests and smoke paths exist.
  Explicit balanced request validation started in PR #773.**
  **Playground visibility for the policy catalog landed in PR #779 while future
  policies remain display-only/gated.**

### Later

- Evaluators and public benchmark runs.
- Metrics export.
- Customer-facing latency/throughput dashboards.
- Multimodal/audio model surfaces.

### First PRs

1. `/v1/models` capability/pricing metadata audit and tests.
   **Started in PR #766; token-pricing parity added in PR #769.**
   **Playground router-policy visibility added in PR #779.**
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

### Progress

- PR #761 started the workspace -> template -> GPU -> duration -> credit launch
  map in the renter console.
- PR #762 added a CI-safe provider pod image contract verifier for pre-baked
  `dcp-compute:<alias>` images, including the fat `dcp-compute:lora` proof path.
- PR #764 made `providers.supply_tier` durable and hardened the on-demand
  paid-credit gate so explicit `on_demand` commitments reduce paid credit
  availability.
- PR #767 connected that backend gate to `/renter/pods` with structured
  credit-required guidance and funding-gap facts.
- PR #768 aligned the backend 402 copy behind pod launch/extend and the OpenAPI
  contract with the same credit-first language.
- PR #774 added a CI-safe Nsight provider benchmark evidence contract guard so
  mock JSON/CSV reports are verified without being confused with GPU-host proof.

### Now

- Keep current pod primitives safe:
  - launch
  - stop
  - extend
  - prepaid quote/debit
  - unused-time refund
  - on-demand paid-credit gate
  - workspace tiers
- Keep renter-facing copy neutral: do not expose vendor/on-demand internals as
  cloud-provider claims.
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
  **Provider-side script/runbook landed in PR #740; CI-safe mock contract guard
  landed in PR #774. GPU-host proof is still required before score ingestion.**

### Later

- Dedicated long-running endpoints.
- Reserved capacity workflow.
- Provider quality score visible to admins and eventually renters.
- Autoscale policy for DCP-owned serving nodes.

### First PRs

1. Fat pod image spec and verification script. **Started in PR #762.**
2. Workspace-to-pod launch UX/API polish. **Started in PR #761.**
3. Supply-tier and paid-credit pod policy. **Durable supply-tier schema
   started in PR #764; renter-facing credit gate guidance added in PR #767.**
4. Nsight provider benchmark script/runbook. **Script/runbook landed in PR #740;
   mock contract guard landed in PR #774; GPU-host proof remains open.**

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
  **Training job metadata/logs/artifact proof foundations have landed; PR #775
  adds the model-card manifest stub while keeping public training and serving
  disabled.**
  **PR #778 renders those manifests in `/renter/fine-tuning` as metadata-only
  proof cards with public training, serving, routing, quality, and Tinker guards
  still false.**
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

1. Ops cleanup and repo parity. **Deploy-watch resolved; `dcp-agent` remains the open maintenance-window item.**
2. Inference metadata/rate consistency.
3. Fat pod image spec and GPU-host verification. **Contract gate started in PR #762; GPU-host proof still required.**
4. Workspace-to-pod launch polish. **Started in PR #761.**
5. Adapter registry schema. **Schema/API foundation has landed; continue with
   GPU-host adapter proof and deployment smoke before public serving claims.**
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
