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
- PR #900 adds `GET /api/renters/me/minimum-balances` to
  `/renter/fine-tuning`, showing minimum-balance sync state, LoRA training
  mode, adapter deployment mode, paid available SAR, blocked billing rails, and
  the read-only no-enforcement-change guard before managed training or adapter
  serving claims.
- PR #913 adds a `/renter/fine-tuning` dataset ledger derived from existing
  LoRA training-job metadata, making dataset storage keys, checksums, splits,
  token estimates, latest job state, and raw-row/no-worker guards visible
  without claiming raw dataset persistence or GPU training execution.
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
- PR #922 makes public `/pods` consume `GET /api/pods/images/readiness` and
  `GET /api/pods/trial-routing/readiness`, showing image-contract state,
  provider-host LoRA image blockers, workspace live-proof blockers,
  trial-credit routing, paid-credit high-demand gates, and false-claim guards
  before login.
- PR #791 added `/batch` as the public Batch inference product page, wired it
  into shared product IA, and kept execution, downloads, settlement, discounts,
  and model batch capability behind readiness/proof gates.
- PR #792 added `/dedicated-deployments` as the public endpoint/adapters
  deployment product page, wired Deployments into shared product IA, and kept
  route traffic gated by matching serving load proof.
- PR #901 makes `/dedicated-deployments` consume the adapter artifact,
  endpoint-smoke, usage-attribution, settlement, founder-approval, and billing
  readiness packets directly, showing contracts-live count, traffic blockers,
  billing blockers, contract mode/version, and strict vLLM load-proof next
  action without enabling adapter traffic.
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
- PR #898 adds `GET /api/renters/me/minimum-balances` to `/renter/batches`,
  showing minimum-balance sync state, batch settlement status, paid available
  SAR, v1 monthly cap remaining, and blocked billing rails before the batch
  live-proof gate.
- PR #779 wired `/renter/playground` to `GET /v1/router/policies`, showing the
  available balanced default plus future policy gates and sending
  `routing_policy=balanced` only when the backend marks it available.
- PR #780 made `/renter/playground` render selected-model context, max output,
  SAR token rates, capability flags, feature readiness, and backend-driven
  max-token limits from `/v1/models`.
- PR #802 made the renter Playground consume `/v1/prompt-cache/readiness` so
  users see hash-only prompt-cache measurement, no raw-prompt storage, and
  gated cached-input economics from the same contract as public `/inference`.
- PR #897 makes the renter Playground consume
  `GET /api/renters/me/minimum-balances`, showing v1 estimate preflight, paid
  available SAR, monthly cap remaining, prompt-cache discount status, and
  blocked future billing rails before a user sends inference traffic.
- PR #781 added a live `/v1/models` serveable-model pricing table to `/pricing`
  with context, SAR input/output rates, provider count, and capability chips.
- PR #904 makes `/pricing` aggregate `/v1/models.feature_readiness` for prompt
  cache, Batch API, LoRA, and Dedicated Deployments, keeping advanced
  economics, execution, serving, and route traffic gated while exposing the
  next proof action beside live SAR rates.
- PR #852 added `/benchmarks` and
  `GET /api/models/benchmarks/readiness`, making Benchmarks/Evals a visible
  product rail while Arabic-quality claims, case studies, rankings, and
  frontier comparisons remain gated by reproducible artifacts.
- PR #905 adds `/models/allam` and `/models/qwen-arabic` as catalog-aware
  model-family pages backed by `/v1/models` and benchmark readiness, separating
  serveable rows from catalog-only rows while keeping Arabic quality claims
  gated until reproducible evidence exists.
- PR #853 added `GET /api/evals/readiness` and
  `npm run proof:evaluator-readiness-contract`, making customer evaluator-job
  gates command-ready while eval jobs, datasets, reports, rankings, and billing
  remain blocked.
- PR #854 adds `.tinker_loop` to `GET /api/lora/readiness` and
  `npm run proof:tinker-loop-readiness`, making Tinker-style local-loop
  primitives visible as disabled gates while compatibility, GPU mutation, and
  training-step billing remain blocked.
- PR #866 adds `GET /api/adapters/artifacts/readiness` and
  `npm run proof:adapter-artifact-policy`, making adapter/model-card object-key
  scope and checksum requirements explicit while artifact upload, storage
  writes, serving, route traffic, billing, and Tinker claims remain blocked.
- PR #868 adds `GET /api/adapters/billing/readiness` and
  `npm run proof:adapter-billing-readiness`, making strict load proof,
  endpoint smoke, funded principal, minimum-balance policy, adapter usage
  attribution, settlement policy, and founder approval explicit before adapter
  billing, usage writes, invoices, payouts, route changes, or Tinker claims.
- PR #869 adds `GET /api/adapters/usage/attribution/readiness` and
  `npm run proof:adapter-usage-attribution`, making deployment, adapter,
  endpoint, checksum, provider, request, scoped-key, token, cost, and
  pending-settlement usage fields explicit before adapter usage writes,
  billing, invoices, payouts, route changes, or Tinker claims.
- PR #870 adds `GET /api/adapters/endpoints/smoke/readiness` and
  `npm run proof:adapter-endpoint-smoke`, making strict load proof, funded
  principal, deterministic request, response hash, latency, token totals, and
  adapter trace explicit before smoke recording, route traffic, usage writes,
  billing, invoices, payouts, raw prompt/response evidence, or Tinker claims.
- PR #871 adds disabled
  `POST /api/adapters/{adapter_id}/deployments/{deployment_id}/endpoint-smoke`
  and `npm run proof:adapter-endpoint-smoke-submission`, making future
  endpoint-smoke submissions renter-scoped and no-record while smoke recording,
  route traffic, usage writes, billing, raw prompt/response exposure, and
  Tinker claims remain disabled.
- PR #872 adds disabled renter-scoped
  `GET /api/adapters/{adapter_id}/deployments/{deployment_id}/endpoint-smoke`
  and `npm run proof:adapter-endpoint-smoke-status`, making endpoint-smoke
  no-record status pollable while smoke recording, route traffic, usage writes,
  billing, raw prompt/response exposure, and Tinker claims remain disabled.
- PR #873 adds `GET /api/adapters/settlement/readiness` and
  `npm run proof:adapter-settlement-readiness`, making provider/platform split,
  pending-settlement status, usage attribution, minimum-balance policy, and
  founder approval explicit while provider payouts, invoices, balance
  mutations, adapter billing, route changes, raw prompt/response exposure, and
  Tinker claims remain disabled.
- PR #874 adds `GET /api/adapters/billing/approval/readiness` and
  `npm run proof:adapter-billing-approval`, making evidence-packet hash,
  local-roadmap proof, production smoke, and founder signoff explicit while
  approval mutation, adapter billing, invoices, payouts, route changes, balance
  mutations, raw prompt/response exposure, and Tinker claims remain disabled.
- PR #875 makes Tareq's `/renter/pods` feedback actionable in the launch UX:
  Stage 1 workspace files are collapsed/grouped for large workspaces, Stage 2
  has an explicit selected-compute summary, Stage 3 names runtime/launch, and
  the trial-credit policy is visible without exposing vendor or provider
  internals.
- PR #876 adds `GET /api/pods/trial-routing/readiness` and
  `npm run proof:pod-trial-routing-readiness`, making the current trial-credit
  vs paid-credit routing policy explicit while launch mutation, billing,
  balance mutation, trial-accounting mutation, provider selection changes, and
  vendor/provider/supply-tier exposure remain blocked.
- PR #877 wires `/renter/pods` Stage 2 to
  `GET /api/pods/trial-routing/readiness`, showing a synced/fallback credit
  policy chip and backend-approved trial/high-demand copy without exposing
  trial-tag internals, provider ids, vendors, or supply tiers.
- PR #878 adds a prominent GPU-selection strip before the Stage 2 filters and
  card grid, keeping auto-pick vs selected GPU, VRAM, hourly price, active
  filters, and reset actions visible without changing launch semantics.
- PR #882 adds a three-step jump rail and Stage 2 links inside the embedded
  workspace panel, then replaces the ambiguous min-VRAM slider with explicit
  VRAM filter chips so large workspaces and compute filtering do not obscure
  the actual selected GPU.
- PR #889 surfaces pod infrastructure proof gates through
  `GET /api/pods/trial-routing/readiness` and `/renter/pods`, showing the
  CI-safe workspace contract plus blocked workspace-live and LoRA pod-image
  provider-host proof commands before any fine-tuning-ready pod claim.
- PR #890 tightens the `/renter/pods` launch UX around Tareq's latest
  feedback: Stage 2 is now a visible compute decision with auto-pick/fixed-GPU
  mode controls, final launch review repeats the GPU request, and trial
  handling is explicit-tag vs credit-provenance copy from the backend readiness
  packet.
- PR #891 polishes that flow further: compact Stage 1 now exposes top folder
  buttons for large workspaces, Stage 2 names the actual launch GPU request as
  the source of truth, VRAM controls are browse-only filters, and the trial
  policy is a dedicated block covering credit provenance, native/community
  trial routing, paid high-demand routing, and hidden provider identity.
- PR #893 adds a collapsible Stage 1 folder index so large workspaces can be
  browsed folder-first without opening the full manifest, makes the Stage 2
  selected-GPU strip a sticky final-launch-request rail, and answers the trial
  tag question directly with live-tag vs credit-provenance copy.
- PR #896 makes the existing minimum-balance contract visible in
  `/renter/pods`: provider/community pods show quote preflight, high-demand pods
  show paid-credit preflight, paid available SAR is visible before launch, and
  trial credit is explicitly blocked from unlocking high-demand GPUs while the
  UI stays read-only.
- PR #899 adds a unified launch checklist to `/renter/pods`, pulling Stage 1
  workspace counts, Stage 2 auto-pick/fixed-GPU state, grant-credit trial
  routing, and minimum-balance credit-gate state into one scan-friendly rail
  before the detailed workspace/template/GPU controls.
- PR #902 adds search to the collapsed Stage 1 folder index and expanded
  staged-file manifest, then makes Stage 2 launch mode explicit with an
  auto-pick/fixed-GPU card and browse-filter warning so renters can reach the
  actual GPU decision without scrolling through every workspace file.
- PR #903 auto-opens the compact Stage 1 folder tree for larger workspaces,
  adds a Stage 1/2/3 control map, and adds a Stage 2 source guide that separates
  launch-affecting controls from browse-only template, VRAM, search, and sort
  controls.
- PR #909 adds a top-level Stage 2 fast path above the workspace section,
  makes the stage rail name Stage 2 as the actual launch GPU, labels VRAM chips
  as browse filters only, and changes the launch CTA to distinguish auto-picked
  versus fixed-GPU pod launches.
- PR #912 turns that feedback into stronger launch signage: the `/renter/pods`
  rail now says Stage 1/2/3 of 3, stays sticky on desktop, keeps Stage 1
  explicitly collapsible, and adds a GPU-picker status panel showing the exact
  auto-pick or fixed-GPU `gpu_type` request before the browse filters.
- PR #924 keeps the same launch/workspace/trial semantics and makes the compact
  Stage 1 checkpoint more navigable: folder map, open-one-folder, and Stage 2
  actions sit above the folder chips, the on-demand folder index is
  busiest-first, and the VRAM filter copy follows the actual launch state rather
  than always saying Auto-pick.
- PR #925 turns the Stage 1 workspace section into a true accordion once staged
  files are loaded, keeping a compact checkpoint and Stage 2 skip visible while
  hiding the detailed workspace manager by default. It also adds a GPU
  source-of-truth callout before filters, clarifying that only Auto-pick or a
  card marked "Selected launch GPU" changes the final request.
- PR #930 adds a top-folder checkpoint to the collapsed Stage 1 pod workspace
  and a dedicated "Final GPU request" strip in Stage 2, replacing the last
  visible slider wording with "VRAM chips are browse filters only" while keeping
  launch semantics unchanged.
- PR #933 adds a top launch command center before Stage 1 file expansion so
  Stage 2's actual Auto-pick/fixed-GPU request and exact `gpu_type` payload are
  visible immediately. Large Stage 1 workspaces auto-collapse after files load,
  and the rail repeats the trial grant-credit/native-community/high-demand
  paid-credit answer without changing launch, billing, or routing behavior.
- PR #936 adds a Stage 2 "Which GPU will DCP request?" chooser before VRAM
  filters and workload hints, changes the trial copy to the clearer
  no-separate-trial-tag/grant-credit/DCP-community/high-demand-paid-credit
  answer, and keeps launch payloads, routing, billing, credit enforcement,
  trial accounting, and provider/vendor/supply-tier exposure unchanged.
- PR #938 makes the trial-account answer machine-readable: minimum-balance
  packets now expose a derived `trial_classification`, pod trial-routing names
  the DCP/community GPU pool and paid-credit-only high-demand classes, and Pods
  plus Usage show the derived trial state without mutating trial accounting or
  account classification.
- PR #939 carries that same derived trial-routing answer onto public `/pods` and
  `/containers`, so visitors see credit-provenance mode, DCP/community trial
  route, paid-credit-only high-demand capacity, and no account-classification
  mutation before login.
- PR #941 adds a sticky mobile/tablet launch dock for `/renter/pods`, keeping
  Stage 2's actual GPU request, exact `gpu_type` payload, Stage 1 drawer state,
  trial route, and paid-credit high-demand gate reachable while large Stage 1
  workspaces remain collapsed.
- PR #944 adds folder/file search directly to the collapsed Stage 1 folder
  preview, so large workspaces can stay closed while renters find a specific
  folder and keep Stage 2's actual launch GPU decision one click away.
- PR #945 adds a collapsed Stage 1 path map and a launch-policy answer strip:
  summary -> one-folder -> Stage 2 is visible without opening the file manager,
  and the command center answers trial tagging, DCP/community trial capacity,
  high-demand paid-credit routing, and Auto-pick vs selected-card GPU source.
- PR #946 adds a collapsed Stage 1 folder outline and Stage 2 recommendation
  card: renters see the busiest-folder drilldown, the suggested GPU for the
  current template/workload/browse context, and the actual `gpu_type` request
  side by side so memory chips cannot read as a launch slider.
- PR #947 adds a compact workspace decision map before the detailed file/GPU
  panels: Stage 1 stays folder-first and collapsible, Stage 2 repeats the actual
  `gpu_type` payload plus suggested GPU, and Stage 3 repeats trial route and
  paid-credit high-demand status so Tareq's review questions are answered before
  a large workspace can become a scroll wall.
- PR #950 adds a final launch confirmation directly above the `/renter/pods`
  launch button, repeating the exact Auto-pick/fixed-GPU `gpu_type` payload,
  workspace open/collapsed state, trial route, high-demand paid-credit rule,
  runtime, and quote state so the final submit point is the source of truth.

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
  **Dataset ledger added in PR #913 from existing training-job metadata, with
  validate-only/raw-row/GPU-worker guards and no persistence or execution
  overclaim.**
- Add product pages once backend gates exist:
  - `/inference`
    **Added in PR #789 with shipped `/v1/models` and balanced-router gates.**
  - `/pods`
    **Added in PR #790 as the public GPU Pods route while `/containers` remains
    a compatibility URL.**
    **PR #922 makes the public page contract-backed with pod image and
    trial-routing readiness, while LoRA image acceptance and workspace live
    file visibility stay labeled as blocked proof gates.**
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
  identities remain the next layer. PR #906 adds the explicit
  `team_usage_readiness` contract plus Usage-console rail so scoped-key controls
  are visible as the current team/workspace proxy while member rollups stay
  gated.**
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
   **Dataset ledger added in PR #913 from existing training-job metadata.**
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
  operator rollups for the Usage console. PR #906 adds a read-only team
  readiness rail that keeps true member budgets gated behind org-member
  identity.**
- Minimum-balance policy visibility.
  **PR #855 adds billing-scoped `/api/renters/me/minimum-balances`,
  `npm run proof:minimum-balance-readiness`, and a renter Usage page strip for
  v1 estimate preflight, on-demand paid credit, and blocked future billing
  rails without changing enforcement.**
  **PR #928 adds a read-only `credit_policy` block to that packet so trial/grant
  provenance, paid-credit source, paid available credit, and high-demand
  paid-credit requirements are visible without changing trial accounting or
  enforcement, then wires the same answer into `/renter/pods` Stage 2.**
  **PR #929 extends the same `credit_policy` answer into `/renter/usage`
  Account controls, so account, trial, usage-export, and paid-credit gates
  share one visible contract.**
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
- PR #940 added the matching opt-in OpenAI Chat Completions SSE live proof
  runner. `npm run proof:openai-sse` validates funded
  `POST /v1/chat/completions` streaming headers, OpenAI delta frames, terminal
  `data: [DONE]`, redacted evidence artifacts, and stays gated behind
  `DCP_OPENAI_SSE_PROOF_ALLOW_LIVE=1`.
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
- PR #892 exposes `prompt_cache_provider_discount_smoke` in
  `GET /v1/prompt-cache/readiness`, public `/inference`, OpenAPI, and the
  prompt-cache proof packet so the live provider/discount gate is visible
  before discounts or provider KV-cache claims can ship.
- PR #949 adds `dcp.prompt_cache_live_acceptance_evidence.v1` to the Prompt
  cache readiness gate and live proof runner, separating live hash-only
  miss/hit measurement evidence from the future provider KV-cache,
  cached-input discount, discounted settlement, and model pricing evidence.
- PR #918 adds public `GET /v1/prompt-cache/settlement/readiness` and
  `npm run proof:prompt-cache-settlement-readiness`, locking the exact
  provider cache-hit evidence, funded smoke principal, usage attribution,
  approval, and discount-math gates required before cached-input discounts can
  ever touch settlement.
- PR #919 makes public `/inference` and renter `/renter/playground` consume
  that settlement-readiness contract, exposing the provider-hit, policy,
  read-only proof, mutation, and proof-command gates without changing billing
  or settlement behavior.
- PR #892 exposes `batch_live_execution_discount_smoke` in
  `GET /api/batches/readiness`, public `/batch`, renter `/renter/batches`,
  OpenAPI, and the batch proof packet while execution, downloads, settlement,
  discounts, and model batch flags remain gated.
- PR #948 adds `dcp.batch_live_acceptance_evidence.v1` to the Batch readiness
  gate and live proof runner, so live Batch and discount claims require
  authenticated readiness, create, poll, result manifest, checksum download,
  per-line execution, discounted settlement, and model capability evidence.
- PR #898 surfaces the account-scoped minimum-balance readiness packet in
  `/renter/batches`, so batch creation/readiness now sits beside batch
  settlement status, paid-available credit, v1 monthly-cap remaining, and
  blocked future billing rails before any execution or discount claim.
- PR #828 added `npm run proof:lora-training-contract`, a CI-safe proof packet
  for LoRA dataset validation, metadata-only/idempotent training jobs, disabled
  worker behavior, artifact checksum requirements, model-card claim guards, and
  non-serving adapter registration.
- PR #832 added `npm run proof:router-policy-contract`, a CI-safe proof packet
  for the router-policy catalog shape, env-gated readiness metadata, explicit
  balanced no-op resolution, future-policy rejection, and no-claim guards for
  cheapest, lowest-latency, Saudi-only, coding, and Arabic routing.
- PR #879 made public `/inference` consume `/v1/router/policies` directly,
  rendering the contract version, default policy, available/gated counts, and
  future-policy gated/not-selectable states without changing routing behavior.
- PR #926 adds machine-readable router proof gates to `/v1/router/policies`
  and surfaces the proof-before-selectable command and first gate per policy in
  `/inference` and `/renter/playground`, while keeping all future policies
  non-selectable.
- PR #927 mirrors those proof-contract, claim-guard, selection-guard, and
  proof-gate fields into OpenAPI plus `llms.txt` so agents and SDK authors see
  the same contract production serves.
- PR #897 surfaces the account-scoped minimum-balance readiness packet in
  `/renter/playground`, so live inference requests now sit beside a read-only
  v1 estimate-preflight rail, paid-available credit, monthly-cap remaining, and
  still-blocked prompt-cache/batch/LoRA/adapter/eval billing rails.
- PR #930 extends that `/renter/playground` preflight with the same
  minimum-balance `credit_policy` fields already visible in Pods and Usage:
  trial grant SAR, paid available SAR, high-demand paid-credit gate, and
  no trial/paid-credit policy mutation guard.
- PR #880 made public `/inference` consume `/v1/models` directly, rendering a
  live model-catalog summary with serving counts, provider-backed rows, context,
  SAR input/output pricing, and catalog-only state without changing model
  availability semantics.
- PR #932 adds `pricing.contract.version = dcp.model_token_pricing.v1` across
  `/v1/models`, `/api/models`, and `/api/models/catalog`, with SAR source of
  truth, source-contract, display-only USD, settlement-path, and no-mutation
  guard metadata visible on `/inference`, `/pricing`, and `/renter/playground`.
- PR #942 adds `capability_contract.version = dcp.model_capability_contract.v1`
  across the same model surfaces, separating live/derived model features from
  gated prompt-cache, Batch, LoRA, and Dedicated Deployment rails while keeping
  product-available booleans and routing/billing behavior unchanged.
- PR #881 added `npm run proof:model-catalog-parity`, a CI-safe proof command
  covering `/v1/models`, `/api/models`, and `/api/models/catalog` token pricing,
  provider count, availability, capability flags, capability contract, feature
  readiness, modalities, and max-output metadata parity.

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
  **PR #918 adds the settlement-readiness contract and CI-safe proof command
  for provider cache-hit evidence, usage attribution, policy/founder approval,
  and discount math while discounts and settlement mutations remain disabled.**
  **PR #919 surfaces the settlement-readiness contract in public Inference and
  the renter Playground Prompt cache panel.**
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
  **PR #920 adds public `GET /api/batches/public/readiness` and makes `/batch`
  consume that sanitized contract, so execution, downloads, settlement,
  discounts, blockers, and the live proof command are visible without exposing
  renter data or internal config names.**
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
  can go live. PR #864 adds renter-authenticated
  `GET /api/evals/jobs/:id/results` and
  `npm run proof:evaluator-result-endpoint-disabled` so the future result route
  is owner-scoped but returns only a disabled contract with no manifest,
  storage key, signed URL, billing, report, ranking, or quality claim. PR #865
  adds `GET /api/evals/results/downloads/readiness` and
  `npm run proof:evaluator-signed-download-policy` so owner access, artifact
  policy, checksum, content type, and 60-900 second expiry guards exist before
  any signed URL, object-store key, live result endpoint, billing, report,
  ranking, or quality claim can go live.**
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
  **Live proof runner landed in PR #940 as `npm run proof:openai-sse`; run it
  with `DCP_OPENAI_SSE_PROOF_ALLOW_LIVE=1` when a funded smoke principal and
  compatible vLLM provider capacity are available.**
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
- PR #894 added `GET /api/pods/images/readiness` plus
  `npm run proof:pod-image-readiness`, a CI-safe readiness packet that keeps the
  LoRA pod image contract, build/verify commands, provider-host blockers, and
  false-claim guards visible before the GPU-host proof can pass.
- PR #943 hardens that provider-host evidence contract: LoRA image acceptance
  requires `verdict=PASS`, `generated_at`,
  `acceptance_gate=lora_pod_image_provider_host`, and `require_gpu=1`, while
  CPU/local proof checks report `DRY_RUN` and stay debugging-only.
- PR #922 carries those image/trial/workspace readiness packets to public
  `/pods`, keeping contract-ready image aliases visible while marking LoRA
  image GPU-host acceptance and workspace live file visibility as coming-next
  proof gates.
- PR #889 makes those workspace and LoRA pod-image proof gates visible from the
  pod readiness contract and renter launch UI while keeping live acceptance
  blocked until provider/funded inputs exist.
- PR #896 surfaces `GET /api/renters/me/minimum-balances` in the pod launch UI,
  so the renter sees quote preflight for provider/community pods, paid-credit
  preflight for high-demand pods, paid available SAR, and the read-only
  no-enforcement-change guard before launching.
- PR #899 adds a single launch checklist above the detailed pod controls,
  showing staged-file/folder counts, actual GPU request mode, trial routing,
  and minimum-balance status without changing launch, billing, routing, or
  workspace API semantics.
- PR #902 keeps the workspace-first pod flow read-only but more usable by
  adding Stage 1 folder/file search and making Stage 2 launch mode visibly
  separate from VRAM browse filters, without changing pod launch, billing,
  routing, or workspace API semantics.
- PR #903 keeps the same semantics but makes the large-workspace path
  folder-tree-first by default and repeats the trial handling answer inside the
  Stage 2 launch-source guide: grant-credit provenance unless a live trial tag
  exists, native/community trial capacity, and paid credit for high-demand GPUs.
- PR #909 keeps pod launch semantics unchanged while making the path through a
  large workspace faster: users can jump to Stage 2 from the top fast path,
  Stage 1 remains visibly collapsible, and the UI repeats that VRAM filters do
  not select the actual launch GPU.
- PR #912 keeps that read-only contract and makes the selected launch state
  harder to miss: Stage labels are consistently "of 3", the stage rail remains
  visible on desktop, and the GPU browser starts with the auto-pick/fixed-GPU
  request payload before users touch templates, VRAM chips, search, or sort.
- PR #923 keeps the same launch/workspace semantics but makes Stage 1 lighter
  for large workspaces: the compact folder summary stays visible, the searchable
  folder index opens only on demand, and the direct Stage 2 path remains the
  primary route to the actual GPU decision.
- PR #924 adds a compact Stage 1 folder navigator and selected-GPU card marker:
  renters can open the busiest folder, keep the rest collapsed, or continue to
  Stage 2, while VRAM filters now repeat whether launch is Auto-pick or a fixed
  GPU.
- PR #925 adds the outer Stage 1 accordion and Stage 2 GPU source-of-truth
  callout, so large workspaces no longer leave the detailed file manager visible
  before the compute decision and VRAM/search controls cannot be mistaken for
  the actual GPU selection.
- PR #930 keeps that path summary-first while making it easier to scan: the
  closed Stage 1 state shows top folders and sizes, and Stage 2 repeats the
  final `gpu_type` request in its own strip before the compute summary.
- PR #944 keeps that same launch contract but adds search to the closed Stage 1
  folder preview, so renters can find a matching folder/file without opening
  the full manifest before Stage 2.
- PR #946 adds a Stage 2 recommendation panel that can explicitly apply the
  suggested GPU while preserving the same source-of-truth rule: launch is
  Auto-pick or the selected-card `gpu_type`, never the template, workload, or
  memory browse controls by themselves.
- PR #950 repeats that same source-of-truth rule at the final launch button:
  the confirmation strip shows Auto-pick versus fixed GPU, exact `gpu_type`,
  workspace attachment, trial route, paid-credit high-demand gate, runtime, and
  quote state before submit.

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
  provider host after `dcp-compute:lora` is built. PR #894 adds
  `npm run proof:pod-image-readiness` and `/api/pods/images/readiness` so the
  contract-ready/provider-host-blocked state is visible before that live proof.
  PR #943 requires `verdict=PASS` plus `require_gpu=1` for accepted provider-host
  evidence and treats CPU/local script passes as `DRY_RUN`.**
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
  **PR #889 now surfaces this CI/live proof split directly in pod readiness and
  the renter launch UI without claiming the live proof has passed.**
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
  **PR #883 adds explicit `workflow_contract` metadata and
  `npm run proof:template-workflow-contract` so LoRA/QLoRA templates declare
  dataset validation plus adapter artifact checksum expectations, vLLM declares
  pod-local OpenAI compatibility, and all three stay blocked on GPU-host proof
  before managed training, public routing, billing, or provider/vendor claims.**

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
  **PR #884 adds `npm run proof:adapter-registry-contract`, a CI-safe proof
  packet for schema idempotency/indexes, tenant isolation, storage-key and
  checksum validation, public status restrictions, metadata-only registration,
  and no public deploy shortcut.**
  **PR #885 surfaces that registry proof in `/api/lora/readiness`, OpenAPI, and
  the public/renter Fine-Tuning surfaces so operators and agents can see the
  proof status without opening CI logs.**
  **PR #887 surfaces the adapter deployment lifecycle proof in
  `/api/lora/readiness`, OpenAPI, and the public/renter Fine-Tuning surfaces so
  deployment intents are tied to a CI-safe proof while vLLM load, route traffic,
  usage/billing, and GPU-host execution remain gated.**
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
  **PR #866 adds `npm run proof:adapter-artifact-policy` and
  `GET /api/adapters/artifacts/readiness`, defining renter/adapter-scoped
  `adapter.safetensors` and `model-card.json` key requirements plus checksum
  guards before any artifact upload or serving claim.**
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
  **PR #867 tightens that gate so route traffic requires matching deployment id,
  adapter id, base model, mode, endpoint id, and artifact checksum.**
  **PR #842 adds
  `DCP_ADAPTER_VLLM_LIVE_PROOF_ALLOW=1 npm run proof:adapter-vllm-live-load`,
  an opt-in live readiness runner for the adapter vLLM load/billing gate. It
  records serving, route-traffic, load-proof, endpoint-smoke, and billing
  blockers and stops before adapter/deployment/load-proof mutation.**
  **PR #870 adds `npm run proof:adapter-endpoint-smoke`, a CI-safe readiness
  gate for deterministic funded endpoint-smoke evidence: strict load proof,
  request attribution, response hash, latency, token totals, and adapter trace
  must all line up before smoke recording, usage, billing, or routing claims.**
  **PR #871 adds `npm run proof:adapter-endpoint-smoke-submission`, a CI-safe
  disabled submission gate for the renter-scoped POST route. Valid smoke
  evidence still returns a no-record 409 while recording is disabled, and raw
  prompt/response content is not exposed.**
  **PR #872 adds `npm run proof:adapter-endpoint-smoke-status`, a CI-safe
  disabled status gate for the renter-scoped GET route. It returns no recorded
  smoke, exposes strict load-proof readiness, and keeps usage, billing,
  routing, and raw prompt/response handling disabled.**
  **PR #873 adds `npm run proof:adapter-settlement-readiness`, a CI-safe
  settlement policy gate. Provider/platform shares must reconcile to adapter
  cost, usage attribution must match the proof, and payout/invoice/balance
  mutation remains disabled.**
  **PR #874 adds `npm run proof:adapter-billing-approval`, a CI-safe founder
  approval gate. Evidence hash, local-roadmap proof, production smoke, and
  signoff are explicit while approval mutation and billing remain disabled.**

### Later

- DPO/RL/distillation recipes.
- Tinker-style API shim if the underlying behavior is real.
- Adapter marketplace or revenue-share model.
- Enterprise white-glove fine-tune packages.

### First PRs

1. LoRA template validation and dry-run improvements.
   **PR #883 adds workflow contracts to LoRA, QLoRA, and vLLM templates, exposes
   them through `/api/templates/catalog`, and adds the CI-safe
   `npm run proof:template-workflow-contract` gate to the local roadmap suite.**
2. Adapter registry schema and service tests.
   **PR #884 adds the repeatable `npm run proof:adapter-registry-contract`
   gate and includes it in the local roadmap suite before live adapter serving
   work continues.**
3. Dataset validator and training-job contract.
4. Single-adapter deploy API.
   **Deployment intent/load-proof APIs exist; PR #822 adds a repeatable
   CI-safe lifecycle proof command before live vLLM load and billing smoke.**
5. Multi-LoRA serving proof.

### Required Evidence

- Template validation.
- Adapter registry tests.
  **PR #884 adds `npm run proof:adapter-registry-contract`; this is now part
  of `npm run proof:local-roadmap`.**
- Adapter deployment contract proof.
- GPU-host training artifact proof.
- vLLM adapter load proof.
- Inference billing proof for adapter endpoint.
  **PR #868 adds the CI-safe adapter billing readiness gate before this live
  billing proof: no usage write, invoice, payout, or enforcement change is
  allowed until endpoint smoke and money-policy prerequisites are explicit.**
  **PR #869 adds the CI-safe adapter usage-attribution readiness gate before
  this live billing proof: no adapter usage row can be considered billable
  until it carries deployment, adapter, endpoint, checksum, provider, request,
  scoped-key, token, cost, and pending-settlement fields.**
  **PR #870 adds the CI-safe endpoint-smoke readiness gate before this live
  billing proof: deterministic funded smoke must prove response hash, latency,
  token totals, and adapter trace before usage or billing can rely on it.**
  **PR #871 adds the disabled endpoint-smoke submission gate before this live
  billing proof: the POST route evaluates evidence shape without recording
  smoke, writing usage, routing traffic, or exposing raw prompt/response
  content.**
  **PR #872 adds the disabled endpoint-smoke status gate before this live
  billing proof: the GET route lets dashboards/agents poll no-record smoke
  state without creating smoke evidence, writing usage, routing traffic, or
  exposing raw prompt/response content.**
  **PR #873 adds the adapter settlement readiness gate before this live billing
  proof: split policy, pending settlement status, minimum-balance policy, usage
  attribution, and founder approval must be explicit before payout, invoice,
  balance, or billed endpoint claims.**

## Cross-Lane Priority Order

1. Ops cleanup and repo parity. **Deploy-watch resolved; PR #844 adds a
   read-only `proof:dcp-agent-reconciliation` packet, and `dcp-agent` remains
   the open maintenance-window item.**
2. Proof harnesses before product claims. **`npm run proof:workspace-pod`,
   `npm run proof:lora-pod-image`, `npm run proof:openai-sse`, and
   `npm run proof:anthropic-sse` now exist for the current command-ready live
   acceptance paths; they remain blocked,
   not accepted, until funded credentials, provider GPU hosts, and live provider
   capacity are available.**
   **PR #834 adds `npm run proof:live-acceptance-status`, a CI-safe status
   packet that keeps blocked live gates, missing acceptance runners, required
   inputs, and claim guards visible in one JSON/Markdown artifact. PR #908
   adds latest-proof ingestion so the same packet can show current dcp-agent
   reconciliation blockers and other matching live-gate evidence without
   enabling any blocked capability. PR #910 exposes the same packet through
   guarded `GET /api/admin/live-acceptance-gates` and the v2 admin Live
   acceptance gates panel, without running paid compute or unlocking claims.
   PR #935 adds per-gate operator runbooks to the packet and admin panel so
   every blocked live gate carries env toggles, prerequisites, evidence
   collection, post-run smoke, failure triage, and next operator step while
   staying read-only and claim-blocked.**
3. Inference metadata/rate consistency.
   **Router-policy readiness proof added in PR #832 as
   `npm run proof:router-policy-contract`; future policy selection remains
   blocked until policy-specific routing tests and live smokes exist. PR #926
   makes those future proof gates visible in the API contract and UI.**
4. Fat pod image spec and GPU-host verification. **Contract gate started in PR #762; image-specific readiness proof added in PR #894; GPU-host proof still required.**
5. Workspace-to-pod launch polish. **Started in PR #761; workspace-first
   Fine-Tuning link landed in PR #806; CI-safe task-spec/daemon contract guard
   landed in PR #810; live proof runner landed in PR #812.**
6. Adapter registry schema. **Schema/API foundation has landed; PR #884 adds
   `npm run proof:adapter-registry-contract` to prove tenant isolation,
   checksum/key guards, metadata-only public registration, and no deploy
   shortcut before GPU-host adapter proof and deployment smoke continue.**
7. Prompt-cache accounting design.
   **Readiness contract added in PR #800; settlement discounts and provider
   cache-control proof remain gated.**
   **Opt-in live prompt-cache settlement runner added in PR #836; it is
   command-ready but blocked until funded/provider/policy inputs exist.**
   **PR #892 surfaces that live gate through readiness, OpenAPI, `/inference`,
   and the prompt-cache proof packet without enabling discounts.**
8. Batch inference design.
   **Contract proof added in PR #824 as `npm run proof:batch-inference-contract`;
   opt-in live readiness runner added in PR #838 as
   `DCP_BATCH_LIVE_PROOF_ALLOW=1 npm run proof:batch-live-execution`.
   Provider execution, result downloads, discounts, and model batch capability
   remain blocked until that live runner can prove the full flow.**
   **PR #892 surfaces the blocked live execution/discount gate through
   readiness, OpenAPI, `/batch`, `/renter/batches`, and the batch proof packet.**
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
   **PR #914 adds renter-scoped deployment intent management: ready adapters
   can create gated intent rows from `/renter/fine-tuning`, renters can stop
   their own intent rows through
   `POST /api/adapters/{adapter_id}/deployments/{deployment_id}/stop`, and the
   adapter deployment proof now verifies stop clears `route_traffic` without
   granting renter load-proof privileges.**
11. Fireworks-style product pages.
   **PR #915 updates the public `/fine-tuning` page so the shipped
   create/stop deployment intent loop is visible before login, including
   create-intent and stop-intent snippets and separate metadata, intent-control,
   GPU artifact proof, and adapter load-proof stages.**
   **PR #945 brings the same connected Fireworks/Tinker rail visibility into
   `/renter/dashboard`: renters now see Inference, Prompt cache, Batch,
   LoRA/adapters, and Pods readiness in one board backed by `/v1/models`,
   `/v1/prompt-cache/settlement/readiness`, `/api/batches/readiness`,
   `/api/lora/readiness`, and pod runway state. It also tightens `/renter/pods`
   launch IA with a collapsed Stage 1 path map and explicit trial/GPU-source
   answers, while all billing, routing, training, discount, and launch
   mutations remain behind their existing proof gates.**

## Lane Proof Commands

Use this table with the execution-system gate semantics. A missing live
credential or unavailable provider is **Blocked**, not **Passed**.

| Lane | Mandatory local gate | Live/prod gate |
|---|---|---|
| Cross-lane CI-safe suite | `npm run proof:local-roadmap`; `npm run proof:live-acceptance-status` | Does not replace live gates; report lists blocked external proof inputs and missing live acceptance runners |
| Frontend | `npm run build` | touched route on `https://dcp.sa` plus Vercel success |
| Backend | targeted Jest plus `git diff --check` | `curl -fsS https://api.dcp.sa/api/health` |
| Inference | targeted v1/Anthropic/model tests; `npm run proof:model-catalog-parity` when model catalog/pricing metadata is touched; `npm run proof:router-policy-contract` when router policy behavior is touched; `npm run proof:evaluator-readiness-contract`, `npm run proof:evaluator-job-schema-contract`, `npm run proof:evaluator-job-metadata-contract`, `npm run proof:evaluator-worker-gate-contract`, `npm run proof:evaluator-result-manifest-contract`, `npm run proof:evaluator-result-writer-dry-run`, `npm run proof:evaluator-worker-dry-run-fixture`, `npm run proof:evaluator-artifact-storage-policy`, `npm run proof:evaluator-result-access-policy`, or `npm run proof:evaluator-result-endpoint-disabled` when benchmark/eval behavior is touched; `npm run proof:prompt-cache-contract` and `npm run proof:prompt-cache-settlement-readiness` when prompt-cache behavior is touched; `npm run proof:batch-inference-contract` when batch behavior is touched | `curl -fsS https://api.dcp.sa/v1/models`; `DCP_ANTHROPIC_PROOF_ALLOW_LIVE=1 npm run proof:anthropic-sse` when streaming or Anthropic compatibility is touched; `DCP_PROMPT_CACHE_LIVE_PROOF_ALLOW=1 npm run proof:prompt-cache-live-settlement` before cached-input discount claims; `DCP_BATCH_LIVE_PROOF_ALLOW=1 npm run proof:batch-live-execution` before batch execution/discount claims |
| POT/PODS | pod policy tests, `npm run workspace-pods:verify-contracts`, `npm run pod-images:verify-contracts`, `npm run proof:pod-image-readiness` | `DCP_WORKSPACE_POD_ALLOW_LAUNCH=1 npm run proof:workspace-pod` for workspace/pod lifecycle proof; `npm run proof:lora-pod-image` for provider-host fat image imports |
| LoRA | `npm run templates:validate`, adapter/training route tests, `npm run proof:lora-training-contract`, `npm run proof:tinker-loop-readiness`, `npm run proof:adapter-artifact-policy`, `npm run proof:adapter-endpoint-smoke`, `npm run proof:adapter-endpoint-smoke-status`, `npm run proof:adapter-endpoint-smoke-submission`, `npm run proof:adapter-usage-attribution`, `npm run proof:adapter-settlement-readiness`, `npm run proof:adapter-billing-approval`, `npm run proof:adapter-billing-readiness`, `npm run proof:adapter-deployment-contract` | `DCP_LORA_TRAINING_LIVE_PROOF_ALLOW=1 npm run proof:lora-training-live-artifact` for GPU-host artifact proof; `DCP_ADAPTER_VLLM_LIVE_PROOF_ALLOW=1 npm run proof:adapter-vllm-live-load` before vLLM adapter load, route traffic, endpoint smoke, or adapter billing claims |

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
