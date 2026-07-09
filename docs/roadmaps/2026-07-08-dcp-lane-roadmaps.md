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
- PR #783 wired `/renter/fine-tuning` to `GET /api/lora/readiness`, adding a
  backend-driven readiness rail for LoRA mode, training, model-card, registry,
  deployment, route-traffic, and claim guards.
- PR #784 added read-only adapter deployment intent rows to `/renter/fine-tuning`
  from `GET /api/adapters/{adapter_id}/deployments`, with route traffic and
  load proof still shown as gated.
- PR #786 switched that deployment ledger to `GET /api/adapters/deployments`,
  preserving the read-only UI while removing per-adapter request fan-out.
- PR #787 replaced the static Fine-Tuning contract preview with copyable curl
  snippets for readiness, jobs, adapters, deployment intents, and gated
  deploy-intent creation.
- PR #797 added the validate-only LoRA dataset curl snippet to the Fine-Tuning
  console after PR #796 shipped `POST /api/lora/datasets/validate`.
- PR #788 added the public `/fine-tuning` product page and wired Fine-Tuning
  into shared site navigation while keeping serving and trainer claims gated.
- PR #789 added the public `/inference` product page and retargeted shared
  Inference links while keeping advanced routing and feature rails gated.
- PR #801 updated `/inference` to surface `GET /v1/prompt-cache/readiness` as
  the prompt-cache measurement source while keeping cached-input discounts,
  settlement discounts, and provider KV-cache control gated.
- PR #802 wired `/renter/playground` to `GET /v1/prompt-cache/readiness`,
  adding a compact Prompt cache readiness panel beside router/model controls
  while keeping discounts, settlement, provider KV-cache control, and Tinker
  claims gated.
- PR #806 made workspace pre-upload the first visible Fine-Tuning step and
  added a `/renter/playground?surface=workspace` deep link into the persistent
  workspace manager before LoRA validation or pod launch.
- PR #808 preserved gated-console auth redirect query strings, so direct
  workspace deep links keep `?surface=workspace` through sign-in.
- PR #790 added `/pods` as the public GPU Pods product route, retargeted shared
  GPU Pods links away from `/containers`, and kept `/containers` as a
  compatibility URL without changing pod backend behavior.
- PR #791 added `/batch` as the public Batch inference product page, wired it
  into shared product IA, and kept execution, downloads, settlement, discounts,
  and model batch capability behind readiness/proof gates.
- PR #792 added `/dedicated-deployments` as the public endpoint/adapters
  deployment product page, wired Deployments into shared product IA, and kept
  route traffic gated by matching serving load proof.
- PR #793 added the new public product routes to `sitemap.xml` and retargeted
  the pricing GPU Pods CTA to `/pods`.
- PR #794 updated `llms.txt` so agents and answer engines see the current
  product map plus LoRA, Batch, and Dedicated Deployment proof gates.
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
- PR #780 made `/renter/playground` render selected-model context, max output,
  SAR token rates, capability flags, feature readiness, and backend-driven
  max-token limits from `/v1/models`.
- PR #802 made the renter Playground consume `/v1/prompt-cache/readiness` so
  users see hash-only prompt-cache measurement, no raw-prompt storage, and
  gated cached-input economics from the same contract as public `/inference`.
- PR #781 added a live `/v1/models` serveable-model pricing table to `/pricing`
  with context, SAR input/output rates, provider count, and capability chips.
- PR #852 added `/benchmarks` and
  `GET /api/models/benchmarks/readiness`, making Benchmarks/Evals a visible
  product rail while Arabic-quality claims, case studies, rankings, and
  frontier comparisons remain gated by reproducible artifacts.
- PR #853 added `GET /api/evals/readiness` and
  `npm run proof:evaluator-readiness-contract`, making customer evaluator-job
  gates command-ready while eval jobs, datasets, reports, rankings, and billing
  remain blocked.
- PR #854 adds `.tinker_loop` to `GET /api/lora/readiness` and
  `npm run proof:tinker-loop-readiness`, making Tinker-style local-loop
  primitives visible as disabled gates while compatibility, GPU mutation, and
  training-step billing remain blocked.

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
  **Product-facing Fine-Tuning -> Workspace deep link landed in PR #806; GPU
  provider file-visibility proof remains the deployment evidence gate.**
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
  **Selected-model pricing, capabilities, and feature readiness now come from
  `/v1/models` in PR #780.**
  **Public pricing now shows serveable-model rows from `/v1/models` in PR #781.**

### Next

- Add Fine-Tuning dashboard shell:
  - datasets
  - training jobs
  - adapters
  - deployments
  - curl/API snippet
  **Curl/API snippets added in PR #787 for the shipped LoRA and adapter
  contracts while keeping trainer and serving proof gates explicit.**
- Add product pages once backend gates exist:
  - `/inference`
    **Added in PR #789 with shipped `/v1/models` and balanced-router gates.**
  - `/pods`
    **Added in PR #790 as the public GPU Pods route while `/containers` remains
    a compatibility URL.**
  - `/fine-tuning`
    **Added in PR #788 with proof-gated LoRA contract copy.**
  - `/dedicated-deployments`
    **Added in PR #792 with deployment-intent and load-proof gates while route
    traffic remains off until evidence matches.**
  - `/batch`
    **Added in PR #791 with shipped batch readiness/metadata gates and no
    execution or discount overclaim.**
- Add benchmark pages for Arabic/customer-support tasks only after reproducible
  benchmark artifacts exist.
  **The public `/benchmarks` readiness rail starts in PR #852; it exposes
  model benchmark metadata and claim guards without publishing Arabic-quality
  or frontier-comparison claims.**

### Later

- Team/workspace usage exports.
  **Renter-scoped v1 usage CSV/JSON export started in PR #848; team/member
  rollups start in PR #851 with scoped-key usage tables; true team-member
  identities remain the next layer.**
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
   **LoRA readiness gates added from the backend contract in PR #783.**
   **Adapter deployment intent rows added in PR #784.**
   **Deployment intent loading moved to the aggregate deployment endpoint in
   PR #786.**
   **Copyable API snippets added in PR #787.**
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
- PR #782 added renter-authenticated `GET /api/lora/readiness` so backend,
  frontend, docs, and agents can consume one LoRA readiness contract while
  public training, serving, routing, quality claims, Tinker compatibility, and
  discounts remain false.
- PR #785 added renter-wide `GET /api/adapters/deployments` so dashboards and
  agents can list deployment intent/proof rows across adapters without changing
  routing behavior.
- PR #786 made `/renter/fine-tuning` consume that aggregate list, so the
  frontend no longer needs one deployment request per visible adapter.
- PR #796 added renter-authenticated `POST /api/lora/datasets/validate` so
  agents can validate LoRA SFT JSONL before creating a training job.
- PR #798 aligned that validate-only route with the same 12 MB / 100,000-row
  dataset limits used by training-job creation and exposed those limits through
  readiness/OpenAPI.
- PR #804 added cross-surface Jest parity coverage for `/v1/models`,
  `/api/models`, and `/api/models/catalog` so token pricing, provider count,
  availability, modalities, max output, capability flags, `capabilities`, and
  feature-readiness gates cannot silently drift.

### Now

- Reconcile platform-adjacent drift:
  - `dcp-agent` local checkout remains stale/detached.
  - PR #844 adds `DCP_AGENT_RECONCILE_READ_REMOTE=1 npm run
    proof:dcp-agent-reconciliation`, a read-only status packet for the local
    checkout, active gateway process, and optional VPS artifact inventory.
  - `ops/dcp-deploy-watch.sh` is no longer drift: PR #731 promoted it into Git
    and the 2026-07-08 11:03 UTC refresh confirmed the tracked file is
    byte-identical to the VPS2 cron copy.
- Add model capability/rate metadata tests.
  **Cross-surface metadata parity coverage landed in PR #804 for `/v1/models`,
  `/api/models`, and `/api/models/catalog`.**
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
  **Shipped in PR #796 and limit-parity hardened in PR #798.**
- Add deployment record lifecycle:
  - pending
  - provisioning
  - running
  - degraded
  - stopped
  - failed
  **Adapter-scoped deployment records exist, and PR #785 adds the renter-wide
  list endpoint for dashboard/agent consumption.**

### Later

- Quotas and usage export.
  **Account v1 cap status and usage export started in PR #848; scoped-key
  attribution starts in PR #849 across `/v1`, `/api/vllm`, exports, and the API
  Keys table.**
- Team-level API key budgets.
  **Per-key budget enforcement starts in PR #850 with default-unlimited scoped
  key caps, management APIs, and pre-dispatch 402s; PR #851 adds scoped-key
  operator rollups for the Usage console.**
- Minimum-balance policy visibility.
  **PR #855 adds billing-scoped `/api/renters/me/minimum-balances`,
  `npm run proof:minimum-balance-readiness`, and a renter Usage page strip for
  v1 estimate preflight, on-demand paid credit, and blocked future billing
  rails without changing enforcement.**
- Evaluator job records.
- Router policy objects.

### First PRs

1. Ops cleanup PR for `dcp-agent` and deploy-watch decision.
   **Deploy-watch resolved in PR #731; PR #844 adds a read-only
   `proof:dcp-agent-reconciliation` packet, and the actual dcp-agent update
   remains a maintenance-window task.**
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
- PR #780 made the renter Playground consume `/v1/models` pricing, capability,
  context, max-output, and feature-readiness metadata for the selected model.
- PR #781 made public `/pricing` consume `/v1/models` for a serveable-model
  pricing catalog while hiding models with zero live providers.
- PR #800 added public `GET /v1/prompt-cache/readiness` so agents and product
  surfaces can see hash-only prompt-cache measurement, usage response fields,
  and no-discount billing gates without changing inference settlement.
- PR #801 surfaced that readiness contract on `/inference`, separating shipped
  measurement from still-gated cache economics in public product copy.
- PR #804 added a backend parity guard across `/v1/models`, `/api/models`, and
  `/api/models/catalog` for pricing/capability/readiness fields consumed by
  Playground, Pricing, and public Inference surfaces.
- PR #814 added an opt-in Anthropic Messages SSE live proof runner for the
  agent-compatible inference path. It validates `POST /anthropic/v1/messages`
  streaming headers and message lifecycle frames, writes redacted proof
  artifacts, and stays gated behind `DCP_ANTHROPIC_PROOF_ALLOW_LIVE=1`.
- PR #816 corrected that runner to default to `https://api.dcp.sa` and to
  normalize `/api`, `/anthropic`, and `/v1` paths correctly for backend API
  hosts.
- PR #824 added `npm run proof:batch-inference-contract`, a CI-safe proof
  packet for batch readiness, JSONL validation, idempotent create replay,
  disabled worker behavior, result checksum proof, line-ledger totals, and
  minimum-balance settlement preflight.
- PR #838 added `npm run proof:batch-live-execution`, an opt-in live proof
  runner that refuses by default, checks renter-authenticated batch readiness
  only when explicitly allowed, records execution/download/settlement/discount
  blockers, and stops before creating a batch while readiness remains gated.
- PR #826 added `npm run proof:prompt-cache-contract`, a CI-safe proof packet
  for measurement-only readiness, scoped/stable cache keys, hash-only
  measurement persistence, no-discount usage fields, and non-eligible prompt
  handling.
- PR #836 added `npm run proof:prompt-cache-live-settlement`, an opt-in live
  proof runner that refuses billed traffic by default, verifies readiness,
  sends two prompt-cache measurement requests only when explicitly allowed, and
  requires a measured hit with discount/settlement flags still false.
- PR #828 added `npm run proof:lora-training-contract`, a CI-safe proof packet
  for LoRA dataset validation, metadata-only/idempotent training jobs, disabled
  worker behavior, artifact checksum requirements, model-card claim guards, and
  non-serving adapter registration.
- PR #832 added `npm run proof:router-policy-contract`, a CI-safe proof packet
  for the router-policy catalog shape, env-gated readiness metadata, explicit
  balanced no-op resolution, future-policy rejection, and no-claim guards for
  cheapest, lowest-latency, Saudi-only, coding, and Arabic routing.

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
  **Read-only readiness landed in PR #800 via
  `GET /v1/prompt-cache/readiness`, keeping discounts and provider KV-cache
  control disabled until proof exists.**
  **Public Inference copy now points to that readiness contract in PR #801.**
  **The renter Playground now renders that readiness contract in PR #802.**
  **PR #826 adds a repeatable local proof command for the prompt-cache
  measurement contract; live provider cache-hit proof and discounted settlement
  remain required before cached-input discount claims.**
  **PR #836 adds the opt-in live proof runner for that next gate. It remains
  blocked until a funded smoke principal, provider cache-hit evidence, and
  discount/settlement policy approval exist.**
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
  **PR #791 adds `/batch` as the public product page for the same readiness
  contract while keeping execution and discounts gated.**
  **PR #824 adds a repeatable local proof command for the batch lifecycle
  contract, including minimum-balance preflight. Live provider execution and
  discounted settlement smoke remain required before public batch claims.**
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
  **PR #832 adds a repeatable local proof command for the router-policy
  readiness contract; policy-specific route ordering, residency filters,
  classifier routing, billing effects, and live smoke remain required before
  future policies become selectable.**

### Later

- Evaluators and public benchmark runs.
  **Benchmarks/Evals public readiness rail starts in PR #852; customer eval
  jobs and public Arabic task reports still require reproducible artifacts.**
  **Evaluator readiness proof starts in PR #853 as
  `npm run proof:evaluator-readiness-contract`; metadata-only job schemas and
  worker/artifact proofs are still next. PR #856 adds the public
  `/api/evals/jobs/schema` contract and
  `npm run proof:evaluator-job-schema-contract`; PR #857 adds
  renter-scoped `POST/GET /api/evals/jobs`, `GET /api/evals/jobs/:id`, and
  `npm run proof:evaluator-job-metadata-contract` for draft metadata records
  only. Workers, results, billing, reports, rankings, and quality claims stay
  blocked. PR #858 adds `GET /api/evals/worker/readiness` and
  `npm run proof:evaluator-worker-gate-contract` so queue dispatch, worker
  execution, result writing, and billing hooks are explicitly disabled before
  result-manifest proof. PR #859 adds `GET /api/evals/results/schema` and
  `npm run proof:evaluator-result-manifest-contract` for required checksum and
  raw-data guards while result endpoints stay blocked. PR #860 adds
  `GET /api/evals/results/writer/readiness` and
  `npm run proof:evaluator-result-writer-dry-run` so a validated manifest is
  written to temporary proof storage only before production artifact writes.
  PR #861 adds `npm run proof:evaluator-worker-dry-run-fixture` so a simulated
  draft eval queue item invokes that dry-run writer while job status, queue
  dispatch, worker execution, production artifacts, billing, reports, rankings,
  and quality claims remain disabled. PR #862 adds
  `GET /api/evals/results/artifacts/readiness` and
  `npm run proof:evaluator-artifact-storage-policy` so future result manifest
  object keys are renter/job scoped and checksum guarded before object-store
  writes, signed downloads, result endpoints, billing, reports, rankings, or
  quality claims exist. PR #863 adds
  `GET /api/evals/results/access/readiness` and
  `npm run proof:evaluator-result-access-policy` so owner-match,
  result-available, artifact-policy, and checksum guards exist before result
  endpoints, signed downloads, billing, reports, rankings, or quality claims
  can go live.**
- Metrics export.
- Customer-facing latency/throughput dashboards.
- Multimodal/audio model surfaces.

### First PRs

1. `/v1/models` capability/pricing metadata audit and tests.
   **Started in PR #766; token-pricing parity added in PR #769.**
   **Playground router-policy visibility added in PR #779.**
   **Selected-model metadata visibility added in PR #780.**
   **Public pricing visibility added in PR #781.**
   **Cross-surface catalog parity guard added in PR #804.**
2. Prompt-cache accounting design with test fixtures.
3. Batch inference API design and schema, then implementation.

### Required Evidence

- Targeted v1/Anthropic/backend tests.
- Streaming smoke for `/v1/chat/completions`.
- Anthropic SSE smoke for agent path when touched.
  **Live proof runner landed in PR #814 as `npm run proof:anthropic-sse`; run
  it with `DCP_ANTHROPIC_PROOF_ALLOW_LIVE=1` when a funded smoke principal and
  compatible vLLM provider capacity are available. PR #816 points the runner at
  the correct `api.dcp.sa` route host.**
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
- PR #795 made on-demand pod 402s expose explicit minimum paid-credit and
  shortfall fields, with `/renter/pods` showing the exact "Add X more" amount.
- PR #774 added a CI-safe Nsight provider benchmark evidence contract guard so
  mock JSON/CSV reports are verified without being confused with GPU-host proof.
- PR #806 added renter-facing workspace pre-upload polish from Fine-Tuning into
  the shared Workspace/POD flow, making file staging the normal first action
  before LoRA/QLoRA template launch.
- PR #810 added a CI-safe workspace-to-pod contract guard across the workspace
  API, volume lookup, pod launch task spec, and provider daemon restore/snapshot
  calls. Real GPU-host file-visibility proof remains the acceptance gate.
- PR #812 added an opt-in live proof runner for the real acceptance path:
  portable workspace upload -> pod launch -> running Jupyter -> marker visible
  under `/workspace`, with credential redaction, default pod cleanup, and
  JSON/Markdown evidence output.
- PR #820 added `npm run proof:lora-pod-image`, the provider-host proof command
  for `dcp-compute:lora` imports and offline SFT scaffold readiness, with
  JSON/Markdown evidence output.

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
  **Provider-host proof command added in PR #820 as
  `npm run proof:lora-pod-image`; acceptance still requires running it on a GPU
  provider host after `dcp-compute:lora` is built.**
- Add template-backed launch flow.
- Add workspace pre-upload polish.
  **Fine-Tuning now links directly into the persistent Workspace tab in PR
  #806; the remaining proof is workspace upload -> launch pod -> files visible
  in `/workspace` on a GPU provider host.**
  **CI-safe contract guard for that path landed in PR #810; still requires a
  provider-host smoke to prove actual file visibility.**
  **The live smoke runner landed in PR #812 as `npm run proof:workspace-pod`;
  run it with `DCP_WORKSPACE_POD_ALLOW_LAUNCH=1` once a funded renter key,
  active volume, and launchable GPU capacity are available.**
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
  **Public packaging added in PR #792; backend route traffic remains gated by
  serving load proof.**
- Reserved capacity workflow.
- Provider quality score visible to admins and eventually renters.
- Autoscale policy for DCP-owned serving nodes.

### First PRs

1. Fat pod image spec and verification script. **Started in PR #762; provider-host proof command/report added in PR #820.**
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
  **Validate-only API added in PR #796 via `POST /api/lora/datasets/validate`;
  it returns checksum/split/token/size facts without creating a training job or
  storing raw dataset rows.**
  **Fine-Tuning console snippet added in PR #797 so renters and agents can copy
  the validate-before-create call from the product UI.**
  **PR #798 makes validate-only use the same 12 MB / 100,000-row limits as
  training-job creation and returns those limits in readiness/OpenAPI.**
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
  **PR #782 publishes `/api/lora/readiness` so the full LoRA product gate is
  readable by UI and agents before GPU training workers or adapter traffic are
  made public.**
  **PR #783 renders that readiness contract in `/renter/fine-tuning`, replacing
  duplicated static gate copy with backend-driven mode and claim guards.**
  **PR #828 adds `npm run proof:lora-training-contract`, a repeatable local
  proof for dataset validation, training metadata, artifact checksum, model-card
  manifest, and non-serving adapter registry behavior. GPU-host artifact proof
  remains required before public training claims.**
  **PR #840 adds `npm run proof:lora-training-live-artifact`, an opt-in live
  readiness runner for the GPU-host artifact gate. It records the current
  worker/model-card artifact blockers and stops before job creation until a
  provider-host training window exists.**
- Adapter deploy:
  - one adapter/live merge first
  - multi-LoRA second
  - endpoint only routes after adapter load proof
  **PR #784 renders deployment intents in `/renter/fine-tuning`; the UI still
  does not offer a deploy action or route traffic without backend proof.**
  **PR #786 moves those intents onto the aggregate deployment list from PR #785,
  keeping the same proof gates with lower request fan-out.**
  **PR #792 adds the public Dedicated Deployments page while keeping adapter
  endpoint traffic gated by matching load proof.**
  **PR #822 adds `npm run proof:adapter-deployment-contract`, a CI-safe proof
  packet for the adapter deployment lifecycle: public intent stays non-routing,
  mismatched load proof stays degraded, and only matching adapter/base-model load
  proof allows route traffic.**
  **PR #842 adds
  `DCP_ADAPTER_VLLM_LIVE_PROOF_ALLOW=1 npm run proof:adapter-vllm-live-load`,
  an opt-in live readiness runner for the adapter vLLM load/billing gate. It
  records serving, route-traffic, load-proof, endpoint-smoke, and billing
  blockers and stops before adapter/deployment/load-proof mutation.**

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
   **Deployment intent/load-proof APIs exist; PR #822 adds a repeatable
   CI-safe lifecycle proof command before live vLLM load and billing smoke.**
5. Multi-LoRA serving proof.

### Required Evidence

- Template validation.
- Adapter registry tests.
- Adapter deployment contract proof.
- GPU-host training artifact proof.
- vLLM adapter load proof.
- Inference billing proof for adapter endpoint.

## Cross-Lane Priority Order

1. Ops cleanup and repo parity. **Deploy-watch resolved; PR #844 adds a
   read-only `proof:dcp-agent-reconciliation` packet, and `dcp-agent` remains
   the open maintenance-window item.**
2. Proof harnesses before product claims. **`npm run proof:workspace-pod`,
   `npm run proof:lora-pod-image`, and `npm run proof:anthropic-sse` now exist
   for the current command-ready live acceptance paths; they remain blocked,
   not accepted, until funded credentials, provider GPU hosts, and live provider
   capacity are available.**
   **PR #834 adds `npm run proof:live-acceptance-status`, a CI-safe status
   packet that keeps blocked live gates, missing acceptance runners, required
   inputs, and claim guards visible in one JSON/Markdown artifact.**
3. Inference metadata/rate consistency.
   **Router-policy readiness proof added in PR #832 as
   `npm run proof:router-policy-contract`; future policy selection remains
   blocked until policy-specific routing tests and live smokes exist.**
4. Fat pod image spec and GPU-host verification. **Contract gate started in PR #762; GPU-host proof still required.**
5. Workspace-to-pod launch polish. **Started in PR #761; workspace-first
   Fine-Tuning link landed in PR #806; CI-safe task-spec/daemon contract guard
   landed in PR #810; live proof runner landed in PR #812.**
6. Adapter registry schema. **Schema/API foundation has landed; continue with
   GPU-host adapter proof and deployment smoke before public serving claims.**
7. Prompt-cache accounting design.
   **Readiness contract added in PR #800; settlement discounts and provider
   cache-control proof remain gated.**
   **Opt-in live prompt-cache settlement runner added in PR #836; it is
   command-ready but blocked until funded/provider/policy inputs exist.**
8. Batch inference design.
   **Contract proof added in PR #824 as `npm run proof:batch-inference-contract`;
   opt-in live readiness runner added in PR #838 as
   `DCP_BATCH_LIVE_PROOF_ALLOW=1 npm run proof:batch-live-execution`.
   Provider execution, result downloads, discounts, and model batch capability
   remain blocked until that live runner can prove the full flow.**
9. LoRA training job MVP.
   **Metadata/job/readiness contracts are in place through PRs #744/#751/#775/#782;
   PR #828 adds a local contract proof command. GPU-host artifact proof remains
   the gating evidence before public training.**
   **PR #840 adds
   `DCP_LORA_TRAINING_LIVE_PROOF_ALLOW=1 npm run proof:lora-training-live-artifact`
   as the blocked live artifact runner before public training claims.**
10. Adapter deploy MVP.
   **Deployment intent/load-proof contracts are in place through PR #749 and
   surfaced by PR #782; vLLM serving smoke remains required before routing.**
   **Renter-wide deployment listing added in PR #785.**
   **CI-safe deployment lifecycle proof command added in PR #822 as
   `npm run proof:adapter-deployment-contract`; real vLLM load and adapter
   billing smoke remain required before public serving.**
   **PR #842 adds the blocked live command
   `DCP_ADAPTER_VLLM_LIVE_PROOF_ALLOW=1 npm run proof:adapter-vllm-live-load`
   before adapter serving, route traffic, endpoint smoke, or billing claims.**
11. Fireworks-style product pages.

## Lane Proof Commands

Use this table with the execution-system gate semantics. A missing live
credential or unavailable provider is **Blocked**, not **Passed**.

| Lane | Mandatory local gate | Live/prod gate |
|---|---|---|
| Cross-lane CI-safe suite | `npm run proof:local-roadmap`; `npm run proof:live-acceptance-status` | Does not replace live gates; report lists blocked external proof inputs and missing live acceptance runners |
| Frontend | `npm run build` | touched route on `https://dcp.sa` plus Vercel success |
| Backend | targeted Jest plus `git diff --check` | `curl -fsS https://api.dcp.sa/api/health` |
| Inference | targeted v1/Anthropic/model tests; `npm run proof:router-policy-contract` when router policy behavior is touched; `npm run proof:evaluator-readiness-contract`, `npm run proof:evaluator-job-schema-contract`, `npm run proof:evaluator-job-metadata-contract`, `npm run proof:evaluator-worker-gate-contract`, `npm run proof:evaluator-result-manifest-contract`, `npm run proof:evaluator-result-writer-dry-run`, `npm run proof:evaluator-worker-dry-run-fixture`, `npm run proof:evaluator-artifact-storage-policy`, or `npm run proof:evaluator-result-access-policy` when benchmark/eval behavior is touched; `npm run proof:prompt-cache-contract` when prompt-cache behavior is touched; `npm run proof:batch-inference-contract` when batch behavior is touched | `curl -fsS https://api.dcp.sa/v1/models`; `DCP_ANTHROPIC_PROOF_ALLOW_LIVE=1 npm run proof:anthropic-sse` when streaming or Anthropic compatibility is touched; `DCP_PROMPT_CACHE_LIVE_PROOF_ALLOW=1 npm run proof:prompt-cache-live-settlement` before cached-input discount claims; `DCP_BATCH_LIVE_PROOF_ALLOW=1 npm run proof:batch-live-execution` before batch execution/discount claims |
| POT/PODS | pod policy tests, `npm run workspace-pods:verify-contracts`, `npm run pod-images:verify-contracts` | `DCP_WORKSPACE_POD_ALLOW_LAUNCH=1 npm run proof:workspace-pod` for workspace/pod lifecycle proof; `npm run proof:lora-pod-image` for provider-host fat image imports |
| LoRA | `npm run templates:validate`, adapter/training route tests, `npm run proof:lora-training-contract`, `npm run proof:adapter-deployment-contract` | `DCP_LORA_TRAINING_LIVE_PROOF_ALLOW=1 npm run proof:lora-training-live-artifact` for GPU-host artifact proof; `DCP_ADAPTER_VLLM_LIVE_PROOF_ALLOW=1 npm run proof:adapter-vllm-live-load` before vLLM adapter load, route traffic, endpoint smoke, or adapter billing claims |

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
