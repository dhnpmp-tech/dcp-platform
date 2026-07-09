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
| Dedicated deployments | DCP Dedicated Endpoints | Deployment intent/load-proof contracts and public page exist; route traffic is gated | Add endpoint lifecycle, quotas, customer-facing status, and serving smoke before traffic |
| LoRA fine-tuning | DCP Fine-Tuning MVP | LoRA/QLoRA template scaffolds exist, no real adapter job product | Bake fat image, add dataset/upload/job flow, fixed SFT recipe |
| LoRA deployment | Adapter registry + live merge/multi-LoRA | vLLM configs reference LoRA logs, but no adapter registry/API | Add adapter schema, upload API, deployment API, vLLM multi-LoRA acceptance test |
| Batch inference | DCP Batch | Readiness/metadata contract and public page exist; execution and discounts are gated | Add async worker execution, result proof, and discounted settlement on existing job/billing primitives |
| Prompt caching | DCP cached input discount | Hash-only measurement, usage fields, and readiness contract exist; discounts are gated | Add settlement proof and provider cache-hit evidence before discounting |
| Evaluators | DCP Benchmarks/Evals | Benchmark routes/scripts exist; public readiness rail starts in PR #852; evaluator readiness proof starts in PR #853 | Add customer-facing eval jobs and published Arabic task benchmarks after reproducible artifacts |
| Routers | DCP model/router selection | Basic provider routing and demand telemetry exist | Add policy-driven router objects and model fallback rules |
| Quotas/usage export | Renter/admin controls | Account v1 cap status and scoped usage export exist; per-key budgets are gated | Add scoped-key attribution, per-key budget enforcement, and team usage pages |
| CLI/connectors | `dcp` / `dcpconnect` | `dcp` launcher exists for Claude Code path | Extend to Codex/Cursor/OpenCode configs after Anthropic/OpenAI paths are stable |

## Roadmap

### Phase A - Reconciliation and Hardening (1-3 days)

Goal: make sure the platform base is safe before product expansion.

- Reconcile local `dcp-agent`; it is the main remaining local/GitHub drift item.
  PR #844 adds a read-only `proof:dcp-agent-reconciliation` packet before the
  controlled maintenance window.
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
  - PR #820 added `npm run proof:lora-pod-image`, a provider-host proof command
    that runs the `dcp-compute:lora` stack import smoke and offline SFT scaffold
    and writes JSON/Markdown evidence for handoff.
- Surface workspace pre-upload more clearly before pod launch.
  - PR #806 made Fine-Tuning start with workspace pre-upload and added a
    `/renter/playground?surface=workspace` deep link into the persistent
    workspace manager before LoRA validation or pod launch.
  - PR #810 added a CI-safe workspace-to-pod contract guard so task-spec S3
    wiring, active-volume gating, and daemon restore/snapshot calls cannot drift
    before provider-host proof is run.
  - PR #812 added `npm run proof:workspace-pod`, the opt-in live acceptance
    runner for portable workspace upload -> pod launch -> Jupyter marker
    visibility under `/workspace`, with default pod cleanup and JSON/Markdown
    evidence reports.
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
  - PR #820 provides the proof command/report path; the gate closes only after
    the command passes on a real GPU provider host with `dcp-compute:lora`
    built locally.
- Workspace upload -> launch pod -> files visible in `/workspace` is verified.
  - PR #810 verifies the code contract for this path in CI; the real
    provider-host smoke is still required for acceptance.
  - PR #812 provides the live smoke command; acceptance closes only after it is
    run successfully against a funded renter key, active volume, and live GPU
    capacity.
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
  - PR #804 added cross-surface Jest parity coverage for `/v1/models`,
    `/api/models`, and `/api/models/catalog`, locking token pricing,
    provider-count, availability, capability, and readiness fields together.
- Add prompt-cache accounting design:
  - static prefix/session hash
  - cached input token estimate
  - response usage field
  - no discount until measurement is trusted
  - PR #770 mirrors measured prompt-cache counters into `usage.pricing` so
    pricing/playground clients can display cache observations without changing
    billing.
  - PR #800 adds `GET /v1/prompt-cache/readiness` so clients can inspect
    measurement-only status, hash-only storage, response fields, and no-discount
    gates before relying on cache economics.
  - PR #801 surfaces that readiness contract on `/inference` while keeping
    cached-input discounts, settlement discounts, and provider KV-cache control
    explicitly gated in public copy.
  - PR #802 surfaces the same readiness contract in `/renter/playground` so
    renters see measurement-only prompt-cache state, hash-only storage, and
    gated cached-input economics while testing chat completions.
  - PR #826 added `npm run proof:prompt-cache-contract`, a CI-safe proof
    packet for measurement-only readiness, scoped/stable cache keys, hash-only
    persistence, no-discount usage fields, non-eligible prompt handling, and
    raw-prefix/image-URL privacy guards before live provider cache-hit or
    discounted settlement proof.
  - PR #836 added `npm run proof:prompt-cache-live-settlement`, an opt-in live
    runner for the next gate: readiness check, deterministic smoke principal,
    two measured prompt-cache requests, measured-hit evidence, and no-discount
    settlement guards. It remains blocked until funded/provider/policy inputs
    exist.
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
  - PR #824 added `npm run proof:batch-inference-contract`, a CI-safe proof
    packet for readiness, JSONL validation, idempotency, disabled worker
    behavior, result checksum proof, line-ledger totals, and minimum-balance
    settlement preflight before live provider execution or batch discounts.
  - PR #838 added `npm run proof:batch-live-execution`, an opt-in live
    readiness proof runner that refuses by default, checks
    renter-authenticated `GET /api/batches/readiness` only when explicitly
    allowed, records execution/download/settlement/discount blockers, and stops
    before creating a batch until the full live flow is ready.
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
  - PR #832 added `npm run proof:router-policy-contract`, a CI-safe proof
    packet for catalog shape, env-gated readiness, explicit balanced no-op
    resolution, future-policy rejection, and no-claim guards before any
    policy-specific routing behavior is enabled.
- Surface model metadata in the Playground from `/v1/models`.
  - PR #780 added selected-model context, max output, SAR token rates,
    capability chips, and advanced feature readiness gates to
    `/renter/playground`.
- Surface prompt-cache readiness in the Playground from
  `/v1/prompt-cache/readiness`.
  - PR #802 added a read-only Prompt cache panel with mode/version,
    hash-only measurement, raw-prompt storage state, cached-input discount
    gates, and provider KV-cache-control gates.
- Surface serveable-model pricing on public `/pricing` from `/v1/models`.
  - PR #781 added a live catalog table for models with live providers, context,
    SAR input/output rates, pricing source, and capability chips.
- Add repeatable agent-path streaming proof.
  - PR #814 added `npm run proof:anthropic-sse`, a gated live proof for
    `POST /anthropic/v1/messages` with `stream: true`, `text/event-stream`
    preservation, Anthropic message lifecycle frames, and redacted
    JSON/Markdown/log evidence output.
  - PR #816 corrected the runner default to `https://api.dcp.sa` and hardened
    `/api`/`/anthropic`/`/v1` base URL normalization.
- Publish honest benchmark pages before making quality claims.
  - PR #852 adds `/benchmarks` and
    `GET /api/models/benchmarks/readiness` as the claim-safe product rail for
    model benchmark metadata, provider benchmark contracts, evaluator-job gates,
    and public Arabic-quality claim guards.
  - PR #853 adds `GET /api/evals/readiness` and
    `npm run proof:evaluator-readiness-contract` so customer evaluator jobs,
    datasets, public reports, rankings, comparisons, and billing have a
    repeatable false-claim gate before implementation.
  - PR #856 adds `GET /api/evals/jobs/schema` and
    `npm run proof:evaluator-job-schema-contract` so renter-scoped eval job
    records, dataset checksums, metrics, result manifests, harness gates, and
    billing guards are explicit before worker/result APIs exist.
  - PR #857 adds renter-scoped metadata `POST/GET /api/evals/jobs`,
    `GET /api/evals/jobs/:id`, and
    `npm run proof:evaluator-job-metadata-contract`; it stores draft eval
    intent only and keeps dataset storage, workers, result artifacts, billing,
    reports, rankings, and quality claims blocked.
  - PR #858 adds `GET /api/evals/worker/readiness` and
    `npm run proof:evaluator-worker-gate-contract`; it makes the queue
    dispatcher, worker, result writer, and billing hook explicitly disabled
    before result-manifest proof.
  - PR #859 adds `GET /api/evals/results/schema` and
    `npm run proof:evaluator-result-manifest-contract`; it validates required
    result checksums and raw-data guards before any result endpoint or public
    report can become live.
  - PR #860 adds `GET /api/evals/results/writer/readiness` and
    `npm run proof:evaluator-result-writer-dry-run`; it writes a validated
    manifest to temporary proof storage only and keeps production artifacts,
    result downloads, billing, and reports disabled.
  - PR #861 adds `npm run proof:evaluator-worker-dry-run-fixture`; it simulates
    a draft eval queue item, invokes the dry-run writer, and keeps job status,
    real queue dispatch, worker execution, production artifacts, result
    downloads, billing, reports, rankings, and quality claims disabled.

Acceptance:

- `/v1/models` or companion metadata can power pricing pages, playground, and
  CLI consistently.
- Streaming is verified for `/v1/chat/completions` and `/anthropic/v1/messages`.
  - PR #814 provides the Anthropic SSE proof command; acceptance closes only
    after a funded smoke principal and compatible vLLM provider capacity produce
    a passing live report. PR #816 points that command at the correct API host.
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
  - PR #806 made the workspace-first path visible from `/renter/fine-tuning`,
    linking renters into the existing persistent Workspace panel before
    validate-only dataset checks or LoRA/QLoRA pod templates.
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
  - PR #828 added `npm run proof:lora-training-contract`, a CI-safe proof
    packet for dataset validation, metadata-only/idempotent training jobs,
    disabled worker behavior, artifact checksum requirements, model-card claim
    guards, and non-serving adapter registration before GPU-host artifact proof.
  - PR #840 added `npm run proof:lora-training-live-artifact`, an opt-in live
    readiness runner for the GPU-host artifact gate. It refuses by default,
    checks renter-authenticated `GET /api/lora/readiness` only when explicitly
    allowed, records worker/model-card artifact blockers, and stops before job
    creation until a GPU training window exists.
  - PR #854 adds a disabled `.tinker_loop` readiness block and
    `npm run proof:tinker-loop-readiness` so create-LoRA, forward/backward,
    optimizer-step, save-weights, sample, and evaluate are explicit future
    primitives without claiming Tinker API compatibility or running GPU work.
- Add adapter deploy API:
  - live-merge mode for one adapter on a dedicated deployment
  - multi-LoRA mode for many adapters on one base deployment where vLLM supports
    the target model
  - PR #785 added a renter-wide deployment lifecycle list endpoint so UI and
    agents can inspect adapter deployment intents without per-adapter polling.
  - PR #786 made the Fine-Tuning dashboard consume that aggregate endpoint,
    preserving read-only deploy intent visibility while removing per-adapter
    request fan-out.
  - PR #787 added copyable API snippets for readiness, training jobs, adapters,
    deployment intents, and gated deploy-intent creation.
  - PR #822 added `npm run proof:adapter-deployment-contract`, the CI-safe
    adapter deployment proof packet that verifies deployment intent stays
    non-routing, mismatched load proof stays degraded, and only matching
    adapter/base-model load proof allows route traffic.
  - PR #842 added
    `DCP_ADAPTER_VLLM_LIVE_PROOF_ALLOW=1 npm run proof:adapter-vllm-live-load`,
    an opt-in live readiness runner before adapter vLLM load, route traffic,
    endpoint smoke, and adapter billing claims. It records current readiness
    blockers and stops before adapter/deployment/load-proof mutation.
- Add dashboard:
  - datasets
  - training jobs
  - adapters
  - deploy/undeploy
  - endpoint/curl snippet
  - PR #783 made `/renter/fine-tuning` consume the LoRA readiness contract, so
    the dashboard now shows backend-driven readiness and claim guards before
    public training or adapter traffic is enabled.
  - PR #784 added read-only adapter deployment intent rows, making the deploy
    lifecycle visible without adding a deploy button or routing claim.
  - PR #786 moved that deployment ledger onto the aggregate deployment list,
    removing initial-load request fan-out while preserving the same route/load
    proof gates.
  - PR #787 replaced the static contract preview with copyable curl snippets
    that keep trainer proof, serving, and routing gates explicit.
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
    **Added in PR #789 with live-catalog and balanced-router claim guards.**
  - `/pods`
    **Added in PR #790 as the public GPU Pods product route while keeping
    `/containers` renderable for existing links.**
  - `/fine-tuning`
    **Added in PR #788 with shipped LoRA contract gates and no public-serving
    overclaim.**
  - `/models/allam`
  - `/models/qwen-arabic`
  - `/batch`
    **Added in PR #791 with readiness/metadata gates and no execution or
    discount overclaim.**
  - `/dedicated-deployments`
    **Added in PR #792 with deployment-intent/load-proof gates and no
    route-traffic overclaim.**
  - `/benchmarks`
    **Started in PR #852 with a readiness rail tied to
    `GET /api/models/benchmarks/readiness`; public quality claims, case studies,
    rankings, and frontier comparisons remain gated until reproducible eval
    artifacts exist.**
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
   controlled maintenance window. PR #844 adds the read-only
   `DCP_AGENT_RECONCILE_READ_REMOTE=1 npm run proof:dcp-agent-reconciliation`
   status packet before that window.**
3. **Fat pod image plan** - Dockerfile/build path, package list, GPU-host
   verification script, no product UI yet. **CI-safe contract gate started in
   PR #762; provider-host proof command/report added in PR #820; GPU-host proof
   still required.**
4. **Nsight provider benchmark MVP** - script/runbook and provider scorecard
   schema proposal. **Script/runbook landed in PR #740; mock evidence contract
   guard landed in PR #774; GPU-host proof remains required.**
5. **Inference metadata/pricing audit** - model capability/rate metadata and
   consistency checks. **Capability honesty for explicit non-chat models started
   in PR #766; advanced feature readiness metadata added in PR #771; router
   policy visibility reached the Playground in PR #779; selected-model pricing
   and readiness visibility reached the Playground in PR #780; public pricing
   visibility reached `/pricing` in PR #781; cross-surface catalog parity guard
   added in PR #804.**
6. **Workspace-to-pod launch polish** - pre-upload, template selection, and
   stronger launch flow. **Started in PR #761.**
7. **Adapter registry schema/API design** - migrations/tests first, deployment
   code second. **Metadata and readiness foundations are in place through PR
   #782; CI-safe adapter deployment lifecycle proof added in PR #822; real
   GPU-host artifact proof and vLLM serving smoke remain the gates before public
   LoRA serving claims.**
8. **Batch lifecycle proof** - contract proof before live execution. **CI-safe
   lifecycle proof added in PR #824; real provider execution, object-store
   result writes, and discounted settlement smoke remain the gates before public
   batch execution or discount claims.**
9. **Prompt-cache lifecycle proof** - contract proof before discounts.
   **CI-safe measurement proof added in PR #826; provider KV-cache proof and
   discounted settlement smoke remain the gates before cached-input discount
   claims.**
10. **LoRA training lifecycle proof** - contract proof before GPU claims.
    **CI-safe dataset/training/artifact proof added in PR #828; GPU-host
    artifact proof remains the gate before public training claims.**
11. **Cross-lane local proof suite** - one CI-safe command before merge/deploy.
    **Added in PR #830 as `npm run proof:local-roadmap`; live GPU/provider
    proof commands remain separate blocked gates.**
12. **Router policy lifecycle proof** - contract proof before policy-specific
    route selection. **CI-safe readiness proof added in PR #832; cheapest,
    lowest-latency, Saudi-only, coding, and Arabic policies remain non-selectable
    until route-ordering tests, billing/no-billing proofs, and live smoke
    evidence exist.**
13. **Live acceptance status packet** - one blocked-gate ledger before more
    product claims. **Added in PR #834 as
    `npm run proof:live-acceptance-status`; it lists command-ready live gates,
    missing acceptance runners, blocked inputs, artifact patterns, and claim
    guards without treating any live capability as accepted.**
14. **Prompt-cache live settlement runner** - opt-in live proof before cached
    input discounts. **Added in PR #836 as
    `DCP_PROMPT_CACHE_LIVE_PROOF_ALLOW=1 npm run proof:prompt-cache-live-settlement`;
    cached-input discounts, provider KV-cache control, and settlement discounts
    remain gated until that command passes with funded/provider/policy evidence.**
15. **Batch live execution runner** - opt-in live readiness proof before batch
    execution and discounted settlement claims. **Added in PR #838 as
    `DCP_BATCH_LIVE_PROOF_ALLOW=1 npm run proof:batch-live-execution`;
    batch creation/execution/download/settlement remain gated until readiness
    and the runner prove the full live flow.**
16. **LoRA live artifact runner** - opt-in live readiness proof before GPU
    training artifact claims. **Added in PR #840 as
    `DCP_LORA_TRAINING_LIVE_PROOF_ALLOW=1 npm run proof:lora-training-live-artifact`;
    training job creation, GPU execution, artifact/model-card writes, and
    Tinker claims remain gated until a provider-host proof run exists.**
17. **Adapter vLLM live load runner** - opt-in live readiness proof before
    adapter serving and billing claims. **Added in PR #842 as
    `DCP_ADAPTER_VLLM_LIVE_PROOF_ALLOW=1 npm run proof:adapter-vllm-live-load`;
    adapter creation, deployment creation, load-proof mutation, endpoint smoke,
    route traffic, and billing remain gated until a real adapter/vLLM/funded
    proof window exists.**
18. **Renter quotas and usage export** - Fireworks-style account controls before
    team budgets. **Started in PR #848 with billing-scoped
    `/api/renters/me/usage/export`, `/api/renters/me/budget-status`, and
    renter-console budget visibility. PR #849 adds scoped-key attribution to
    `/v1` and `/api/vllm` usage rows, usage exports, budget status, and the API
    Keys table. PR #850 adds default-unlimited scoped-key monthly caps,
    management APIs, API Keys cap visibility, and pre-dispatch 402 enforcement
    for capped scoped keys without changing account caps or master-key behavior.
    PR #851 adds scoped-key usage rollups for the Usage console while true
    team-member rollups remain gated. PR #855 adds
    `/api/renters/me/minimum-balances` and
    `npm run proof:minimum-balance-readiness` so renters and agents can inspect
    v1 estimate preflight, on-demand paid-credit gates, and future billing
    blockers without changing enforcement.**
19. **Benchmarks/Evals readiness rail** - Fireworks-style evidence surface before
    customer-facing quality claims. **Started in PR #852 with
    `GET /api/models/benchmarks/readiness`, public `/benchmarks`, sitemap/nav
    wiring, and explicit guards keeping Arabic-quality claims, case studies,
    rankings, and frontier comparisons blocked until reproducible artifacts
    exist.**
20. **Evaluator readiness contract proof** - customer eval-job gates before job
    creation. **Started in PR #853 with `GET /api/evals/readiness` and
    `npm run proof:evaluator-readiness-contract`; eval jobs, datasets, public
    reports, rankings, frontier comparisons, and billing remain blocked until
    schema, worker, artifact, baseline, and money policy proof exists.**
21. **Evaluator job schema contract proof** - metadata-only customer eval job
    record before create/list/read APIs. **Started in PR #856 with
    `GET /api/evals/jobs/schema` and
    `npm run proof:evaluator-job-schema-contract`; workers, dataset storage,
    model comparisons, billing, public reports, rankings, and Arabic-quality
    claims remain blocked.**

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
