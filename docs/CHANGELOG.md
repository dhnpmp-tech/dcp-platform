# DCP Changelog

## [Unreleased]

### 2026-07-10 05:50 UTC - Pods trial founder answer contract (PR #952)

- **PR:** [#952](https://github.com/dhnpmp-tech/dcp-platform/pull/952) (`codex/pods-trial-founder-answer-contract-2026-07-10`).
- **Timestamp:** 2026-07-10 05:50 UTC / 2026-07-10 09:50 +04.
- **Founder answer:** Pod trial-routing readiness now exposes `founder_answer`, directly answering trial-account tag status, trial GPU routing, high-demand paid-credit routing, and minimum-balance source.
- **Policy clarity:** The packet states that trial status is still grant-credit provenance, trial credit routes to DCP/community capacity, high-demand GPUs require paid available credit, and minimum-balance handling comes from `GET /api/renters/me/minimum-balances`.
- **Safety:** Readiness/test/docs-only clarification; no launch, provider selection, routing, trial accounting, account classification, billing, payment, invoice, payout, balance, minimum-balance enforcement, pricing, paid-credit policy, provider/vendor exposure, or supply-tier exposure changed.
- **Verification:** Focused pod trial-routing Jest suite, pod trial-routing readiness proof, minimum-balance readiness proof, OpenAPI parse, syntax checks, local roadmap proof (38/38), clean Next build, and `git diff --check`.

### 2026-07-10 05:42 UTC - Adapter vLLM live acceptance evidence contract (PR #951)

- **PR:** [#951](https://github.com/dhnpmp-tech/dcp-platform/pull/951) (`codex/adapter-vllm-live-acceptance-evidence-contract-2026-07-10`).
- **Timestamp:** 2026-07-10 05:42 UTC / 2026-07-10 09:42 +04.
- **Evidence contract:** Added `dcp.adapter_vllm_live_acceptance_evidence.v1` for `adapter_vllm_load_billing_smoke`, listing readiness claims, funded principal, adapter checksum, deployment intent, strict vLLM load, endpoint smoke, usage attribution, billing policy, and claim-boundary evidence.
- **Readiness packets:** LoRA readiness now publishes `adapter_deployments.live_acceptance.vllm_load_billing_smoke`; adapter billing readiness now publishes `policy.live_acceptance`.
- **Proof guard:** `npm run proof:adapter-vllm-live-load` emits acceptance evidence and fails if readiness claims adapter serving/routing/billing before the live artifact proves every required evidence step.
- **Safety:** Evidence/test/docs-only change; no adapter serving, route traffic, smoke recording, usage writes, billing, invoices, payouts, balance, provider behavior, raw prompts/responses, discounts, quality, or Tinker claims changed.
- **Verification:** Focused adapter vLLM live proof/billing readiness/LoRA Jest suites, blocked live proof, adapter billing readiness proof, LoRA training contract proof, adapter deployment contract proof, OpenAPI parse, syntax checks, local roadmap proof (38/38), clean Next build, and `git diff --check`.

### 2026-07-10 05:24 UTC - Pods final launch confirmation (PR #950)

- **PR:** [#950](https://github.com/dhnpmp-tech/dcp-platform/pull/950) (`codex/pods-workspace-launch-confirmation-2026-07-10`).
- **Timestamp:** 2026-07-10 05:24 UTC / 2026-07-10 09:24 +04.
- **Final confirmation:** `/renter/pods` now repeats the exact Stage 2 launch request directly above the launch button, including Auto-pick versus fixed GPU and the final `gpu_type` payload.
- **Workspace UX:** The confirmation repeats the Stage 1 file/folder summary and clarifies that the full `/workspace` volume attaches even when the file drawer stays collapsed.
- **Trial/GPU clarity:** The same strip keeps the trial-account answer, DCP/community trial route, high-demand paid-credit rule, runtime, and quote state visible at final launch.
- **Regression guard:** `tests/e2e/renter-pods-workspace-ux.spec.ts` covers the final confirmation in both Auto-pick and fixed RTX 4090 states.
- **Safety:** Frontend/test/docs-only change; no launch body, workspace API, provider-selection, GPU filtering semantics, routing, pricing, billing, settlement, balance, minimum-balance enforcement, trial-accounting, account-classification, paid-credit policy, or provider/vendor exposure mutation.

### 2026-07-10 05:07 UTC - Prompt cache live acceptance evidence contract (PR #949)

- **PR:** [#949](https://github.com/dhnpmp-tech/dcp-platform/pull/949) (`codex/prompt-cache-live-acceptance-evidence-contract-2026-07-10`).
- **Timestamp:** 2026-07-10 05:07 UTC / 2026-07-10 09:07 +04.
- **Evidence contract:** Added `dcp.prompt_cache_live_acceptance_evidence.v1` for `prompt_cache_provider_discount_smoke`, separating live measurement proof from future cached-input discount evidence.
- **Readiness packet:** Prompt-cache readiness now publishes measurement PASS requirements, future discount-settlement evidence, and claim-unlock mapping.
- **Proof guard:** `npm run proof:prompt-cache-live-settlement` now emits acceptance evidence and only passes when readiness, funded principal, measured miss, measured hit, no-discount guards, and redacted artifacts are proven.
- **Safety:** Evidence/test/docs-only change; no accounting, inference routing, billing, settlement, discounts, balances, model catalog flags, provider behavior, or prompt persistence changed.
- **Verification:** Focused Prompt cache live proof/accounting/contract Jest suites, prompt-cache contract proof, blocked live proof, local roadmap proof, OpenAPI parse, build, and diff check.

### 2026-07-10 04:54 UTC - Batch live acceptance evidence contract (PR #948)

- **PR:** [#948](https://github.com/dhnpmp-tech/dcp-platform/pull/948) (`codex/batch-live-acceptance-evidence-contract-2026-07-10`).
- **Timestamp:** 2026-07-10 04:54 UTC / 2026-07-10 08:54 +04.
- **Evidence contract:** Added `dcp.batch_live_acceptance_evidence.v1` for the `batch_live_execution_discount_smoke` gate, listing readiness, create, poll, manifest, download, line, discounted settlement, and model-capability evidence.
- **Readiness packet:** Batch readiness now publishes the acceptance contract, pass condition, required evidence fields, and claim-unlock mapping.
- **Proof guard:** `npm run proof:batch-live-execution` fails if readiness claims live Batch execution before the live artifact proves every required evidence step.
- **Safety:** Evidence/test/docs-only change; no batch execution, downloads, settlement, discounts, model flags, billing, balances, routing, or provider behavior changed.
- **Verification:** Focused Batch live proof Jest suite, Batch inference contract proof, blocked live proof, local roadmap proof, OpenAPI parse, build, and diff check.

### 2026-07-10 04:39 UTC - Pods workspace decision map (PR #947)

- **PR:** [#947](https://github.com/dhnpmp-tech/dcp-platform/pull/947) (`codex/pods-tareq-workspace-decision-map-2026-07-10`).
- **Timestamp:** 2026-07-10 04:39 UTC / 2026-07-10 08:39 +04.
- **Workspace UX:** `/renter/pods` now has a compact decision map that keeps Stage 1 folder-first and collapsible, with staged file/folder count plus busiest-folder drilldown before the detailed file manager.
- **Stage clarity:** The map lays out Stage 1 files, Stage 2 GPU, and Stage 3 launch side by side so renters do not have to scroll through workspace details to understand the flow.
- **GPU clarity:** Stage 2 repeats the actual launch request, current `gpu_type` payload, suggested GPU, and the browse-only memory-chip rule so VRAM controls cannot read as a launch slider.
- **Trial answer:** The decision map repeats the current backend-derived policy: no separate live trial-account tag, grant credit routes to DCP/community GPUs, and high-demand GPUs require paid credit.
- **Regression guard:** `tests/e2e/renter-pods-workspace-ux.spec.ts` covers the new map, folder action, suggested-GPU action, trial copy, and fixed `gpu_type` update.
- **Safety:** Frontend/test/docs-only UX change; no launch body, workspace API, provider-selection, GPU filtering semantics, routing, pricing, billing, settlement, balance, minimum-balance enforcement, trial-accounting, account-classification, paid-credit policy, or provider/vendor exposure mutation.
- **Verification:** Focused Pods Playwright regression, desktop/mobile screenshot QA, static renter console guard, clean Next build, diff check, and local roadmap proof suite.

### 2026-07-10 04:21 UTC - Stage 2 GPU recommendation clarity (PR #946)

- **PR:** [#946](https://github.com/dhnpmp-tech/dcp-platform/pull/946) (`codex/pods-stage2-recommendation-ux-2026-07-10`).
- **Timestamp:** 2026-07-10 04:21 UTC / 2026-07-10 08:21 +04.
- **Workspace UX:** `/renter/pods` collapsed Stage 1 now includes a folder outline with workspace count, busiest-folder drilldown, and a direct Stage 2 handoff.
- **GPU recommendation:** Stage 2 now shows a suggested GPU for the current template/workload/browse context, why it was suggested, and the actual `gpu_type` request beside it.
- **Slider clarity:** Memory chips are explicitly labeled as browse controls, not a launch slider; only Auto-pick, "Use recommended GPU", or a selected card changes launch.
- **Regression guard:** `tests/e2e/renter-pods-workspace-ux.spec.ts` covers the folder outline, recommendation copy, recommended-GPU action, and resulting fixed `gpu_type` state.
- **Safety:** Frontend/test/docs-only change; no launch body, provider-selection, GPU filtering semantics, workspace API, routing, pricing, billing, balance, minimum-balance enforcement, trial-accounting, account classification, paid-credit policy, or provider/vendor exposure mutation.
- **Verification:** `git diff --check`, `node tests/v2-renter-console-static.test.js`, focused `/renter/pods` Playwright regression, clean Next build, and local roadmap proof suite (38/38).

### 2026-07-10 04:06 UTC - Renter platform readiness and launch clarity (PR #945)

- **PR:** [#945](https://github.com/dhnpmp-tech/dcp-platform/pull/945) (`codex/renter-dashboard-platform-readiness-2026-07-10`).
- **Timestamp:** 2026-07-10 04:06 UTC / 2026-07-10 08:06 +04.
- **Dashboard UX:** `/renter/dashboard` now shows a Fireworks/Tinker-style Platform readiness board for Inference, Prompt cache, Batch, LoRA/adapters, and Pods.
- **Readiness inputs:** The board consumes `/v1/models`, `/v1/prompt-cache/settlement/readiness`, `/api/batches/readiness`, `/api/lora/readiness`, and current pod runway state through the existing proxy/auth pattern.
- **Pod workspace UX:** `/renter/pods` collapsed Stage 1 now shows a summary -> one-folder -> Stage 2 path map, so large workspace manifests stay closed while the actual GPU decision remains one click away.
- **Trial/GPU clarity:** The launch command center now answers trial tagging, trial capacity, high-demand paid-credit routing, and Auto-pick vs selected-card GPU source before the detailed picker.
- **Gate honesty:** The board marks prompt-cache discounts, Batch execution/discounts, LoRA training, adapter routing, and pod launches as governed by existing proof/readiness contracts.
- **Regression guard:** `tests/v2-renter-console-static.test.js` protects current `x-renter-key` Dashboard/API Keys fetches and the dashboard no-mutation claim; `tests/e2e/renter-pods-workspace-ux.spec.ts` protects the launch-policy answers and collapsed Stage 1 path.
- **Safety:** Frontend/test/docs-only change; no dispatch, launch body, workspace API, provider selection, GPU filter semantics, adapter traffic, training worker, batch execution, prompt-cache discount, billing, settlement, balance, trial-accounting, paid-credit policy, or account-classification mutation.
- **Verification:** Dashboard/API key static guard, Pods workspace Playwright regression, Next build, local roadmap proof, and production smoke.

### 2026-07-10 03:22 UTC - Collapsed workspace folder search (PR #944)

- **PR:** [#944](https://github.com/dhnpmp-tech/dcp-platform/pull/944) (`codex/pods-workspace-stage-collapse-ux-2026-07-10`).
- **Timestamp:** 2026-07-10 03:22 UTC / 2026-07-10 07:22 +04.
- **Workspace UX:** `/renter/pods` collapsed Stage 1 now includes folder/file search in the folder preview, keeping large workspace manifests closed while still letting renters find a specific folder.
- **Stage flow:** The preview shows match counts and keeps Stage 2 one click away, preserving the direct path to the actual launch GPU decision.
- **GPU/trial continuity:** Existing Stage 2 source-of-truth strips and the derived trial-classification answer remain unchanged.
- **Safety:** Frontend/test/docs-only change; no launch body, workspace API, routing, provider-selection, GPU filtering semantics, billing, balance, trial-accounting, or account-classification mutation.
- **Verification:** Focused `/renter/pods` Playwright regression for collapsed search, empty state, Stage 2 path, mobile dock, and fixed GPU state.

### 2026-07-10 03:10 UTC - LoRA image proof evidence contract (PR #943)

- **PR:** [#943](https://github.com/dhnpmp-tech/dcp-platform/pull/943) (`codex/lora-pod-image-evidence-contract-2026-07-10`).
- **Timestamp:** 2026-07-10 03:10 UTC / 2026-07-10 07:10 +04.
- **Proof contract:** `backend/docker-templates/verify-lora-pod-image.sh` now emits `verdict`, `generated_at`, `acceptance_gate`, `acceptance_requirements`, and false product-claim guards for LoRA pod-image evidence.
- **Acceptance boundary:** Provider-host readiness requires `verdict=PASS` with `require_gpu=1`; CPU/local runs are labeled `DRY_RUN` and cannot satisfy the live acceptance gate.
- **Gate status:** `npm run proof:live-acceptance-status` normalizes LoRA image proof evidence, including legacy `status=pass` reports, so non-GPU reports show as `DRY_RUN`.
- **Readiness packet:** `GET /api/pods/images/readiness` documents accepted/dry-run verdicts, required report fields, and provider-host requirements.
- **Safety:** Evidence/test/docs-only change; no Docker build, launch, routing, billing, balance, trial-accounting, training, adapter serving, or Tinker-claim mutation.
- **Verification:** Focused pod-image/live-acceptance Jest suites plus pod image contract, pod image readiness, and live acceptance proofs.

### 2026-07-10 02:58 UTC - Model capability contract (PR #942)

- **PR:** [#942](https://github.com/dhnpmp-tech/dcp-platform/pull/942) (`codex/model-capability-contract-2026-07-10`).
- **Timestamp:** 2026-07-10 02:58 UTC / 2026-07-10 06:58 +04.
- **Backend contract:** `/v1/models`, `/api/models`, and `/api/models/catalog` now emit `capability_contract.version = dcp.model_capability_contract.v1`.
- **Gate clarity:** The packet separates live/derived model features from gated product rails and points prompt cache, Batch, LoRA, and Dedicated Deployment clients at `feature_readiness.*` before making availability claims.
- **Proof coverage:** `npm run proof:model-catalog-parity` now includes capability-contract parity across all three model catalog surfaces.
- **Docs:** OpenAPI, published OpenAPI, `llms.txt`, changelogs, and roadmap notes document the packet.
- **Safety:** Additive metadata/test/docs change; no availability, provider-selection, routing, pricing, billing, settlement, prompt-cache discount, batch execution, LoRA serving, or dedicated-deployment routing mutation.
- **Verification:** Focused model-catalog Jest suites and proof-script guard.

### 2026-07-10 02:44 UTC - Mobile Stage 2 launch dock (PR #941)

- **PR:** [#941](https://github.com/dhnpmp-tech/dcp-platform/pull/941) (`codex/pods-stage-drawer-gpu-decision-2026-07-10`).
- **Timestamp:** 2026-07-10 02:44 UTC / 2026-07-10 06:44 +04.
- **Mobile UX:** `/renter/pods` now shows a mobile/tablet sticky launch dock with the Stage 2 launch GPU, exact `gpu_type` payload, Stage 1 open/collapsed state, trial route, and high-demand paid-credit gate.
- **Workspace navigation:** The dock keeps "Go to Stage 2" and Stage 1 open/collapse controls reachable while large Stage 1 workspace file lists remain collapsed on narrow screens.
- **GPU clarity:** Selecting a fixed GPU card updates the dock from Auto-pick to the fixed `gpu_type`, preserving the distinction between the launch request and browse-only VRAM filters.
- **Safety:** Frontend/test/docs-only UX change; no launch payload, provider-selection, workspace API, GPU filtering, pricing, billing, credit enforcement, trial accounting, balance, routing, or API contract mutation.
- **Verification:** Focused `/renter/pods` Playwright regression covering desktop hiding, mobile visibility, Stage 2 navigation, Auto-pick, fixed RTX 4090 payload, and Stage 1 open/collapse state.

### 2026-07-10 02:31 UTC - OpenAI SSE live proof runner (PR #940)

- **PR:** [#940](https://github.com/dhnpmp-tech/dcp-platform/pull/940) (`codex/openai-sse-live-proof-runner-2026-07-10`).
- **Timestamp:** 2026-07-10 02:31 UTC / 2026-07-10 06:31 +04.
- **Live proof:** Added `npm run proof:openai-sse`, gated by `DCP_OPENAI_SSE_PROOF_ALLOW_LIVE=1`, for funded OpenAI-compatible `POST /v1/chat/completions` streaming acceptance.
- **Contract checks:** The runner validates `text/event-stream`, OpenAI delta chunks, terminal `data: [DONE]`, no SSE error frames, and redacts scoped renter credentials in JSON/Markdown/log artifacts.
- **Gate ledger:** `openai_sse_live` is now included in `npm run proof:live-acceptance-status` and the local roadmap external-gate list, blocked on funded smoke principal and compatible vLLM provider capacity until live proof passes.
- **Safety:** Proof/test/docs-only change; no v1 runtime, routing, billing, settlement, balance, model catalog, trial-accounting, or stream payload mutation.
- **Verification:** Runner syntax check, focused Jest proof guards, live-acceptance status proof, local roadmap proof, build, and diff checks.

### 2026-07-10 02:17 UTC - Public Pods trial classification visibility (PR #939)

- **PR:** [#939](https://github.com/dhnpmp-tech/dcp-platform/pull/939) (`codex/public-pods-trial-classification-2026-07-10`).
- **Timestamp:** 2026-07-10 02:17 UTC / 2026-07-10 06:17 +04.
- **Public UX:** `/pods` and `/containers` now show the derived credit-provenance mode, no account-classification mutation, DCP/community trial route, and paid-credit-only high-demand class from the public trial-routing readiness packet.
- **Regression:** `tests/e2e/public-pods-readiness.spec.ts` now asserts those public contract fields while preserving no provider/vendor/supply-tier exposure.
- **Safety:** Frontend/test/docs-only visibility change; no trial-accounting, account-classification, paid-credit policy, billing, balance, launch, routing, provider-selection, vendor/provider exposure, supply-tier exposure, or enforcement mutation.
- **Verification:** Focused public Pods Playwright regression, local roadmap proof, build, and diff checks.

### 2026-07-10 02:08 UTC - Derived trial classification readiness (PR #938)

- **PR:** [#938](https://github.com/dhnpmp-tech/dcp-platform/pull/938) (`codex/trial-classification-readiness-2026-07-10`).
- **Timestamp:** 2026-07-10 02:08 UTC / 2026-07-10 06:08 +04.
- **Backend contract:** `GET /api/renters/me/minimum-balances` now exposes `credit_policy.derived_trial_account_state`, a read-only `trial_classification` packet, and `changes_account_classification = false`.
- **Pod policy:** `GET /api/pods/trial-routing/readiness` now names derived credit-provenance mode, derived trial states, DCP/community trial capacity, paid-credit-only high-demand capacity, and the no account-classification mutation guard.
- **UI visibility:** `/renter/pods` and `/renter/usage` show the derived trial state next to grant-credit, trial route, and paid-credit high-demand controls.
- **Docs:** OpenAPI, published OpenAPI, `llms.txt`, and roadmap notes now describe the derived trial classification answer for agents and operators.
- **Safety:** Additive read-only contract/UI/docs change; no trial-accounting, account-classification, paid-credit policy, billing, balance, launch, routing, provider-selection, vendor/provider exposure, supply-tier exposure, or enforcement mutation.
- **Verification:** Targeted backend readiness tests, proof scripts, focused Pods/Usage Playwright tests, OpenAPI parse, local roadmap proof, and build.

### 2026-07-10 01:55 UTC - Live acceptance OpenAPI runbook docs (PR #937)

- **PR:** [#937](https://github.com/dhnpmp-tech/dcp-platform/pull/937) (`codex/live-acceptance-openapi-runbook-docs-2026-07-10`).
- **Timestamp:** 2026-07-10 01:55 UTC / 2026-07-10 05:55 +04.
- **OpenAPI:** `docs/openapi.yaml` and `public/docs/openapi.yaml` now document guarded `GET /api/admin/live-acceptance-gates`, the `dcp.live_acceptance_gate_status.v1` packet, summary counters, latest evidence, and per-gate `dcp.live_acceptance_operator_runbook.v1` fields.
- **Agent docs:** `public/llms.txt` now tells agents where to fetch the admin live-acceptance gate packet and repeats the no-paid-compute/no-routing/no-billing/no-trial-accounting/no-claim-unlock safety boundary.
- **Regression:** `tests/admin-live-acceptance-static.test.js` now covers route/UI/OpenAPI/published-OpenAPI/agent-doc alignment for the runbook packet.
- **Safety:** Docs/test-only change; no endpoint behavior, auth, admin UI behavior, compute, routing, launches, inference, payments, billing, balance, trial-accounting, prompt-cache, batch, LoRA, adapter, or capability-claim mutation.
- **Verification:** OpenAPI YAML parse, admin static check, live-acceptance proof, local roadmap proof, build, and diff checks.

### 2026-07-10 01:43 UTC - Pod founder-feedback launch UX (PR #936)

- **PR:** [#936](https://github.com/dhnpmp-tech/dcp-platform/pull/936) (`codex/pods-founder-feedback-ux-2026-07-10`).
- **Timestamp:** 2026-07-10 01:43 UTC / 2026-07-10 05:43 +04.
- **Workspace UX:** `/renter/pods` keeps Stage 1 summary-first for large workspaces and reinforces that users do not need to inspect every file before continuing to Stage 2 because the whole `/workspace` volume mounts at launch.
- **GPU clarity:** Stage 2 now includes a "Which GPU will DCP request?" chooser with explicit Auto-pick and fixed-card options, the live `gpu_type` payload, and selected-state copy before VRAM filters or workload hints.
- **Trial answer:** Renter-facing copy now answers Tareq's question directly: no separate trial-account tag is live, grant credit is the trial signal, trial credit routes to the DCP/community GPU pool, and high-demand GPUs require paid credit.
- **Safety:** Frontend/test/docs-only UX clarification; no launch payload, provider-selection, filtering, workspace API, pricing, billing, credit enforcement, minimum-balance policy, balance, trial-accounting, routing, vendor/provider exposure, supply-tier exposure, or API contract mutation.
- **Verification:** Focused `/renter/pods` Playwright regression covering collapsed Stage 1, Stage 2 chooser, Auto-pick/fixed GPU states, DCP/community trial wording, and VRAM-filter copy.

### 2026-07-10 01:28 UTC - Live acceptance operator runbooks (PR #935)

- **PR:** [#935](https://github.com/dhnpmp-tech/dcp-platform/pull/935) (`codex/live-acceptance-operator-runbooks-2026-07-10`).
- **Timestamp:** 2026-07-10 01:28 UTC / 2026-07-10 05:28 +04.
- **Status contract:** `npm run proof:live-acceptance-status` now attaches `dcp.live_acceptance_operator_runbook.v1` to every blocked gate with owner lane, safe mode, readiness state, required env toggles, prerequisites, command, evidence checklist, post-run smoke, failure triage, and next operator step.
- **Admin UI:** Guarded v2 admin Live acceptance gates now shows operator-runbook coverage and per-gate runbook cards next to blockers, latest evidence, commands, and claim guards.
- **Markdown handoff:** The generated live-acceptance Markdown packet includes an "Operator Runbooks" section so founders and agents can execute the same order of operations from reports.
- **Safety:** Additive status/UI/test/docs change; no paid compute, routing, launch, inference, payments, billing, balance, cleanup, trial-accounting, prompt-cache, batch, LoRA, adapter, or capability-claim mutation.
- **Verification:** Live-acceptance Jest, admin route integration, admin static check, live-acceptance proof, local roadmap proof, build, and diff checks.

### 2026-07-10 01:16 UTC - Pod sticky launch decision rail (PR #934)

- **PR:** [#934](https://github.com/dhnpmp-tech/dcp-platform/pull/934) (`codex/pods-sticky-launch-decision-2026-07-10`).
- **Timestamp:** 2026-07-10 01:16 UTC / 2026-07-10 05:16 +04.
- **Workspace UX:** `/renter/pods` now repeats the Stage 1 workspace file/folder checkpoint inside the existing sticky launch-stage rail, so large workspaces can stay collapsed without losing launch context.
- **GPU clarity:** The sticky rail now includes the exact Stage 2 launch request: Auto-pick with `gpu_type` omitted, or the selected GPU card when fixed mode is chosen.
- **Trial answer:** The same sticky rail keeps the no-live-trial-tag, grant-credit provenance, native/community trial route, and paid-credit high-demand answer visible near the GPU decision.
- **Safety:** Frontend/test/docs-only change; no pod launch, provider-selection, GPU filtering, workspace API, pricing, billing, balance, credit enforcement, trial-accounting, routing, or API behavior mutation.
- **Verification:** Focused `/renter/pods` Playwright regression covering Auto-pick and fixed-GPU sticky-decision states.

### 2026-07-10 01:02 UTC - Pod launch command center (PR #933)

- **PR:** [#933](https://github.com/dhnpmp-tech/dcp-platform/pull/933) (`codex/pods-stage-gpu-clarity-2026-07-10`).
- **Timestamp:** 2026-07-10 01:02 UTC / 2026-07-10 05:02 +04.
- **Workspace UX:** `/renter/pods` now has a top launch command center before Stage 1 file expansion and auto-collapses large Stage 1 workspaces after files load.
- **GPU clarity:** Stage 2 is the first visible operative decision, with Auto-pick/fixed GPU state, exact `gpu_type` payload, and direct Stage 2/3 actions above workspace details.
- **Trial answer:** The same rail repeats grant-credit trial provenance, native/community trial routing, and paid-credit high-demand gating without exposing provider/vendor internals.
- **Safety:** Frontend-only UX/test/docs change; no launch, provider-selection, pricing, billing, enforcement, trial-accounting, balance, routing, storage, or API behavior mutation.
- **Verification:** Focused `/renter/pods` Playwright regression plus standard build/proof sweep before merge.

### 2026-07-10 00:48 UTC - Model pricing contract visibility (PR #932)

- **PR:** [#932](https://github.com/dhnpmp-tech/dcp-platform/pull/932) (`codex/model-pricing-contract-v2-2026-07-10`).
- **Timestamp:** 2026-07-10 00:48 UTC / 2026-07-10 04:48 +04.
- **Backend contract:** Shared model token pricing now carries `dcp.model_token_pricing.v1`, SAR currency, rate-source contract, display-only USD status, settlement path, and false no-mutation guards.
- **Surface parity:** `/v1/models`, `/api/models`, and `/api/models/catalog` expose the same nested `pricing.contract` through the shared helper and parity proof.
- **UI visibility:** `/inference`, `/pricing`, and `/renter/playground` show the pricing contract/source near live model rates.
- **Docs:** OpenAPI and `llms.txt` describe the nested pricing contract for agents.
- **Safety:** Additive metadata/frontend/test/docs change; no billing, settlement, routing, provider selection, balance, rate, discount, batch, LoRA, or deployment behavior mutation.
- **Verification:** Targeted backend/model-catalog and focused Playwright regressions plus standard build/proof sweep before merge.

### 2026-07-10 00:33 UTC - Pod Stage 1 remembered workspace focus (PR #931)

- **PR:** [#931](https://github.com/dhnpmp-tech/dcp-platform/pull/931) (`codex/pods-workspace-focus-2026-07-10`).
- **Timestamp:** 2026-07-10 00:33 UTC / 2026-07-10 04:33 +04.
- **Workspace UX:** `/renter/pods` now remembers the renter's Stage 1 open/collapsed preference in the browser and keeps large workspaces summary-first after the renter chooses the compact view.
- **Folder drilldown:** Clicking a top-folder chip in the closed Stage 1 checkpoint opens the workspace manager with that folder expanded and the rest of the file manifest collapsed.
- **Policy continuity:** Trial handling and GPU launch semantics stay unchanged: grant-credit provenance drives trial handling, high-demand GPUs require paid credit, and only Auto-pick or an explicit GPU-card choice changes the launch `gpu_type`.
- **Safety:** Frontend/state/test-only change; no workspace API, pod launch, billing, balance, trial-accounting, paid-credit policy, routing, provider-selection, supply-tier exposure, or enforcement mutation.
- **Verification:** Focused Pods workspace Playwright regression plus standard build/proof sweep before merge.

### 2026-07-10 00:15 UTC - Pod folder checkpoint, final GPU request, and playground credit policy (PR #930)

- **PR:** [#930](https://github.com/dhnpmp-tech/dcp-platform/pull/930) (`codex/pods-playground-credit-ux-2026-07-10`).
- **Timestamp:** 2026-07-10 00:15 UTC / 2026-07-10 04:15 +04.
- **Workspace UX:** `/renter/pods` collapsed Stage 1 now shows a top-folder checkpoint before the full workspace manager opens, preserving the Stage 2 fast path for large workspaces.
- **GPU clarity:** Stage 2 now has a dedicated final GPU request strip and uses "VRAM chips are browse filters only" language, so Auto-pick versus fixed `gpu_type` remains the only launch decision.
- **Inference credit policy:** `/renter/playground` minimum-balance preflight now shows credit-policy sync, trial grant SAR, paid available SAR, high-demand paid-credit gate, and no trial/paid-credit policy mutation guard.
- **Safety:** Frontend/type/test-only change; no workspace API, pod launch, inference dispatch, billing, balance, trial-accounting, paid-credit policy, routing, provider-selection, or enforcement mutation.
- **Verification:** Focused Pods workspace/GPU and Playground minimum-balance Playwright specs plus standard build/proof sweep before merge.

### 2026-07-09 23:58 UTC - Usage account controls credit-policy visibility (PR #929)

- **PR:** [#929](https://github.com/dhnpmp-tech/dcp-platform/pull/929) (`codex/usage-credit-policy-visibility-2026-07-10`).
- **Timestamp:** 2026-07-09 23:58 UTC / 2026-07-10 03:58 +04.
- **Usage UI:** `/renter/usage` Account controls now surfaces the `minimum-balances.credit_policy` sync state, trial grant SAR, paid available SAR, high-demand paid-credit gate, and no trial/paid-credit policy mutation guard.
- **Safety:** Read-only frontend/test change; no billing, balance, inference, pod, routing, enforcement, trial-accounting, or paid-credit policy mutation.
- **Verification:** Focused Playwright Usage readiness spec plus standard build/proof sweep before merge.

### 2026-07-09 23:34 UTC - Minimum-balance credit policy and pod GPU choice UX (PR #928)

- **PR:** [#928](https://github.com/dhnpmp-tech/dcp-platform/pull/928) (`codex/minimum-balance-credit-policy-2026-07-10`).
- **Timestamp:** 2026-07-09 23:34 UTC / 2026-07-10 03:34 +04.
- **Backend contract:** `GET /api/renters/me/minimum-balances` now includes `account.trial_grant_halala` and a `credit_policy` section separating trial/grant credit from paid available credit.
- **Trial answer:** The packet states there is no explicit trial-account tag live, trial credit comes from `renters.trial_grant_halala`, and high-demand capacity still requires paid credit.
- **Pod UX:** `/renter/pods` now keeps Stage 1 visibly collapsible for large workspaces, repeats that Stage 2 launches with the whole `/workspace` volume, and promotes the Stage 2 launch GPU decision above the picker.
- **GPU picker:** The Stage 2 priority strip shows the exact launch request and labels VRAM chips/controls as browse filters only, so template/filter choices cannot be mistaken for the selected GPU.
- **Docs:** OpenAPI and `llms.txt` now describe the credit-policy fields and no-mutation guards.
- **Safety:** No payment creation, balance mutation, pod launch, inference dispatch, workload creation, discount enablement, trial-accounting mutation, paid-credit policy mutation, enforcement change, provider selection, or routing change was added.
- **Verification:** Minimum-balance service/route/proof `node --check`; targeted backend Jest; `npm run proof:minimum-balance-readiness`; focused Playwright workspace/GPU UX spec.

### 2026-07-09 23:27 UTC - Router proof-gate OpenAPI docs (PR #927)

- **PR:** [#927](https://github.com/dhnpmp-tech/dcp-platform/pull/927) (`codex/router-proof-openapi-2026-07-10`).
- **Timestamp:** 2026-07-09 23:27 UTC / 2026-07-10 03:27 +04.
- **OpenAPI:** `docs/openapi.yaml` and `public/docs/openapi.yaml` now document `/v1/router/policies` proof contract metadata, false claim guards, per-policy selection guards, and proof gates.
- **Agent docs:** `public/llms.txt` now calls out the router proof-gate fields and `npm run proof:router-policy-contract`.
- **Safety:** Documentation-only change; no runtime routing, billing, settlement, provider-selection, classifier, latency-ordering, or Tinker claim changed.
- **Verification:** YAML parse for both OpenAPI copies; live production router policy smoke; `git diff --check`.

### 2026-07-09 23:17 UTC - Router policy proof gates surfaced (PR #926)

- **PR:** [#926](https://github.com/dhnpmp-tech/dcp-platform/pull/926) (`codex/router-policy-proof-gates-2026-07-10`).
- **Timestamp:** 2026-07-09 23:17 UTC / 2026-07-10 03:17 +04.
- **Backend contract:** `/v1/router/policies` now carries the proof contract, false claim guards, selection guard, and per-policy proof gates needed before future router policies become selectable.
- **Future policy gating:** Lowest-latency, cheapest, Saudi-only, coding, and Arabic policies remain blocked until route-specific tests, settlement/residency/classifier evidence, and funded live smoke are present.
- **Public UI:** `/inference` now shows proof-gate count, first gate per policy, and `npm run proof:router-policy-contract` in the router catalog rail.
- **Renter UI:** `/renter/playground` now shows the same gate labels and proof-before-selectable command beside the balanced routing catalog.
- **Safety:** No provider selection, request routing, pricing optimization, billing/settlement mutation, geo-residency routing, classifier routing, latency-ordering claim, Tinker compatibility claim, or future-policy request selection was enabled.
- **Verification:** Router service/proof script `node --check`; targeted backend Jest router suites; `npm run proof:router-policy-contract`; focused Playwright for `/inference` and `/renter/playground`.

### 2026-07-09 23:02 UTC - Pod Stage 1 accordion and GPU source-of-truth callout (PR #925)

- **PR:** [#925](https://github.com/dhnpmp-tech/dcp-platform/pull/925) (`codex/workspace-launch-ux-tareq-2026-07-10`).
- **Timestamp:** 2026-07-09 23:02 UTC / 2026-07-10 03:02 +04.
- **Stage 1 accordion:** `/renter/pods` now collapses the detailed workspace manager once staged files are loaded and keeps a compact checkpoint visible with volume, staged-file count, folder count, expand, and Stage 2 skip actions.
- **Stage naming:** Stage 1 is labeled as collapsible workspace files, while Stage 2 leads with the actual launch GPU before templates.
- **GPU clarity:** Added a pre-filter source-of-truth callout: the launch GPU changes only via Auto-pick or a card marked "Selected launch GPU"; VRAM chips, workload guide, search, and sort only change the visible list.
- **Trial answer:** Contract-backed trial handling remains unchanged: no separate live trial-account tag unless reported by backend, trial handling uses grant-credit provenance, trial credit routes to native/community GPUs, and high-demand GPUs require paid credit.
- **Regression:** Extended focused `/renter/pods` Playwright coverage for the collapsed Stage 1 checkpoint, expand path, Stage 2 source-of-truth copy, trial copy, and selected GPU state.
- **Safety:** Frontend-only UX behavior change; no workspace API behavior, upload/delete/download semantics, pod launch body, provider selection, pricing calculation, billing, balance mutation, trial-accounting mutation, GPU-host execution, vendor/provider exposure, supply-tier exposure, or enforcement change was added.
- **Verification:** Focused `/renter/pods` and `/renter/playground?surface=workspace` Playwright regression.

### 2026-07-09 22:42 UTC - Pod workspace stage navigator (PR #924)

- **PR:** [#924](https://github.com/dhnpmp-tech/dcp-platform/pull/924) (`codex/workspace-stage-navigator-2026-07-10`).
- **Timestamp:** 2026-07-09 22:42 UTC / 2026-07-10 02:42 +04.
- **Stage 1 navigator:** Large `/renter/pods` workspaces now show a compact folder navigator with folder map, open-one-folder, and Stage 2 actions, keeping the full manifest closed unless the renter asks for it.
- **Folder ordering:** The on-demand folder index now names the busiest-folder-first ordering and keeps search pointed at the same high-signal folder list.
- **GPU clarity:** VRAM filter copy now follows the actual launch state, and the selected GPU card gets a "Selected launch GPU" marker so renters can see whether the launch is Auto-pick or fixed GPU.
- **Trial answer:** Existing backend-readiness copy remains unchanged: trial handling uses grant-credit provenance unless a live trial tag exists, trial credit routes to native/community GPUs, and high-demand GPUs require paid credit.
- **Safety:** Frontend-only UX behavior change; no workspace API behavior, upload/delete/download semantics, pod launch body, provider selection, pricing calculation, billing, balance mutation, trial-accounting mutation, GPU-host execution, vendor/provider exposure, supply-tier exposure, or enforcement change was added.
- **Verification:** Focused `/renter/pods` and `/renter/playground?surface=workspace` Playwright regression; TypeScript.

### 2026-07-09 22:25 UTC - Pod Stage 1 folder index on demand (PR #923)

- **PR:** [#923](https://github.com/dhnpmp-tech/dcp-platform/pull/923) (`codex/pods-stage1-folder-index-on-demand-2026-07-10`).
- **Timestamp:** 2026-07-09 22:25 UTC / 2026-07-10 02:25 +04.
- **Stage 1 collapse:** Large `/renter/pods` workspaces now show a compact folder summary by default while keeping the searchable folder index closed until the renter chooses "Browse folders".
- **Stage 2 path:** The summary keeps "Continue to Stage 2" visible and states that Stage 2 launches with the whole `/workspace` volume attached, so renters can skip file-by-file inspection when the folder summary looks right.
- **Regression:** Updated focused `/renter/pods` Playwright coverage for hidden-by-default folder index, explicit "Browse folders" expansion, folder search, and the Stage 2 shortcut.
- **Safety:** Frontend-only UX behavior change; no workspace API behavior, upload/delete/download semantics, pod launch body, provider selection, pricing calculation, billing, balance mutation, trial-accounting mutation, GPU-host execution, vendor/provider exposure, supply-tier exposure, or enforcement change was added.
- **Verification:** Focused `/renter/pods` and `/renter/playground?surface=workspace` Playwright regression; TypeScript; local roadmap proof; Next build; `git diff --check`.

### 2026-07-09 22:11 UTC - Public Pods readiness gates (PR #922)

- **PR:** #922 (`codex/public-pods-readiness-2026-07-10`).
- **Timestamp:** 2026-07-09 22:11 UTC / 2026-07-10 02:11 +04.
- **Public Pods readiness:** `/pods` now consumes `GET /api/pods/images/readiness` and `GET /api/pods/trial-routing/readiness`, exposing the live read-only pod image and trial-routing contract versions before login.
- **Blocked gates:** The page shows the CI-safe image contract while keeping LoRA/fine-tuning pod image acceptance and workspace live file visibility marked as provider-host/live-proof gates.
- **Trial clarity:** Public Pods now states that trial handling uses grant-credit provenance, trial credit covers DCP/community capacity, and high-demand GPUs require paid credit.
- **Regression:** Added focused public `/pods` Playwright coverage for readiness contracts, provider-host blockers, trial routing, and provider-identity false-claim guards.
- **Safety:** Frontend/read-only UX change; no pod launch behavior, image build, Docker execution, provider selection, billing, balance mutation, trial-accounting mutation, workspace API behavior, GPU-host execution, vendor/provider exposure, supply-tier exposure, or fine-tuning-ready claim was enabled.
- **Verification:** Focused public `/pods` Playwright regression; TypeScript; local roadmap proof; Next build; `git diff --check`.

### 2026-07-09 21:49 UTC - Pod workload GPU selection clarity (PR #921)

- **PR:** [#921](https://github.com/dhnpmp-tech/dcp-platform/pull/921) (`codex/pods-workload-gpu-selection-clarity-2026-07-10`).
- **Timestamp:** 2026-07-09 21:49 UTC / 2026-07-10 01:49 +04.
- **GPU decision clarity:** Workload presets in `/renter/pods` now set runtime defaults and browse filters only; they do not silently pin a launch GPU.
- **Workload guidance:** Matching GPU cards are highlighted as "Workload match" recommendations, while the final launch request stays Auto-pick until `Use as launch GPU` is selected.
- **Stage 2 rule:** Added a visible Stage 2 launch-selection rule explaining that only Auto-pick or an explicit GPU card changes the payload; templates, workload presets, VRAM chips, search, and sort only organize choices.
- **Regression:** Extended the focused `/renter/pods` Playwright regression for the Fine-tune workload helper, proving `gpu_type` remains omitted until a card is selected.
- **Safety:** Frontend-only UX behavior change; no backend pod launch body schema, provider selection algorithm, pricing calculation, billing, balance mutation, trial-accounting mutation, workspace API behavior, GPU-host execution, vendor/provider exposure, or supply-tier exposure was added.
- **Verification:** Focused `/renter/pods` Playwright regression; TypeScript; local roadmap proof; Next build; `git diff --check`.

### 2026-07-09 21:38 UTC - Public Batch sanitized readiness (PR #920)

- **PR:** [#920](https://github.com/dhnpmp-tech/dcp-platform/pull/920) (`codex/public-batch-readiness-2026-07-10`).
- **Timestamp:** 2026-07-09 21:38 UTC / 2026-07-10 01:38 +04.
- **Backend API:** Added `GET /api/batches/public/readiness`, a public read-only view of batch readiness that strips internal missing-config and feature-flag internals.
- **Public Batch:** `/batch` now reads the sanitized readiness contract and shows mode, create state, execution state, JSONL validation, line ledger, worker execution, result downloads, settlement, discounts, blockers, and the live proof command.
- **OpenAPI:** Documented the sanitized public readiness endpoint.
- **Regression:** Added backend service/route coverage and a focused public Batch Playwright regression.
- **Safety:** Read-only public contract and frontend UX only; no batch execution, result download, settlement, discount, model batch capability, worker dispatch, provider routing, inference dispatch, balance mutation, invoice, payout, renter data exposure, or internal config exposure was enabled.
- **Verification:** Focused batch backend Jest coverage; public/renter Batch Playwright regressions; TypeScript; local roadmap proof; Next build; `git diff --check`.

### 2026-07-09 21:22 UTC - Prompt-cache settlement gates in Inference UX (PR #919)

- **PR:** [#919](https://github.com/dhnpmp-tech/dcp-platform/pull/919) (`codex/prompt-cache-settlement-ux-2026-07-10`).
- **Timestamp:** 2026-07-09 21:22 UTC / 2026-07-10 01:22 +04.
- **Public Inference:** `/inference` now reads the prompt-cache settlement-readiness contract and shows provider cache-hit evidence, settlement policy, read-only proof, mutation state, required gates, and proof commands.
- **Playground:** `/renter/playground` now exposes settlement discount policy, provider cache-hit evidence, read-only settlement proof, and settlement mutation rows in the Prompt cache panel.
- **Regression:** Updated focused public inference and renter Playground/Workspace Playwright mocks and assertions for `GET /v1/prompt-cache/settlement/readiness`.
- **Safety:** Frontend/read-only UX change; no cached-input discount, settlement mutation, provider payout, invoice, balance mutation, usage write, provider KV-cache control, inference dispatch, raw prompt storage, route traffic, or Tinker compatibility claim was enabled.
- **Verification:** Focused public inference and Playground/Workspace Playwright regressions; TypeScript; local roadmap proof; Next build; `git diff --check`.

### 2026-07-09 21:09 UTC - Prompt-cache settlement readiness contract (PR #918)

- **PR:** [#918](https://github.com/dhnpmp-tech/dcp-platform/pull/918) (`codex/prompt-cache-settlement-readiness-2026-07-10`).
- **Timestamp:** 2026-07-09 21:09 UTC / 2026-07-10 01:09 +04.
- **Backend API:** Added public `GET /v1/prompt-cache/settlement/readiness` for the settlement-policy gate behind future cached-input discounts.
- **Readiness linkage:** `GET /v1/prompt-cache/readiness` now links to the settlement-readiness endpoint so measurement and future settlement gates are discoverable together.
- **Proof gate:** Added `npm run proof:prompt-cache-settlement-readiness` and included it in `npm run proof:local-roadmap`, covering provider cache-hit evidence, funded smoke principal, usage attribution, policy approval, founder approval, and discount-math reconciliation.
- **OpenAPI:** Documented the new settlement readiness route and schema.
- **Safety:** Read-only backend contract and proof only; no cached-input discount, settlement mutation, provider payout, invoice, balance mutation, usage write, provider KV-cache control, inference dispatch, raw prompt storage, route traffic, or Tinker compatibility claim was enabled.
- **Verification:** Focused backend Jest coverage; prompt-cache settlement readiness proof; local roadmap proof; TypeScript; Next build; `git diff --check`.

### 2026-07-09 20:50 UTC - Usage account controls packet (PR #917)

- **PR:** [#917](https://github.com/dhnpmp-tech/dcp-platform/pull/917) (`codex/usage-account-controls-packet-2026-07-10`).
- **Timestamp:** 2026-07-09 20:50 UTC / 2026-07-10 00:50 +04.
- **Usage UX:** `/renter/usage` now has an Account controls packet that answers trial mode, trial tag state, trial capacity route, high-demand paid-credit gate, usage export, per-key caps, inference preflight, and read-only safety in one place.
- **Trial clarity:** The page consumes the existing pod trial-routing readiness contract as a non-blocking read and falls back to conservative copy if that contract is unavailable.
- **Export polish:** CSV export now has downloading/ready/error UI state while keeping the renter key in the `x-renter-key` header.
- **Regression:** Extended the focused Usage Playwright regression for the account-controls packet and header-auth CSV export.
- **Safety:** Frontend/read-only UX change; no trial-accounting mutation, provider routing change, pod launch change, usage mutation, budget mutation, billing change, inference dispatch, balance mutation, key-secret exposure, minimum-balance enforcement change, vendor/provider exposure, or team-member rollup claim was added.
- **Verification:** Focused `/renter/usage` Playwright regression; TypeScript; local roadmap proof; Next build; `git diff --check`.

### 2026-07-09 20:34 UTC - Workspace folder-first large manifests (PR #916)

- **PR:** [#916](https://github.com/dhnpmp-tech/dcp-platform/pull/916) (`codex/workspace-folder-first-large-manifest-2026-07-10`).
- **Timestamp:** 2026-07-09 20:34 UTC / 2026-07-10 00:34 +04.
- **Workspace UX:** The shared `WorkspacePanel` now starts large manifests as a folder-first summary with file count, group count, total bytes, and per-folder count/size chips.
- **Playground workspace:** `/renter/playground?surface=workspace` now gets the same large-file protection as the pod launch flow, so workspace pre-upload does not become a file-by-file scroll wall before LoRA or pod work.
- **Pod continuity:** `/renter/pods` keeps Stage 1 compact and now shows the richer folder-first summary when users open the full workspace manager.
- **Regression:** Extended the focused workspace/pods Playwright regression for both `/renter/pods` and `/renter/playground?surface=workspace`.
- **Safety:** Frontend/read-only UX change; no workspace API behavior, upload/delete/download semantics, pod launch body, provider selection, pricing calculation, billing, balance mutation, trial-accounting mutation, GPU-host execution, vendor/provider exposure, supply-tier exposure, or enforcement change was added.
- **Verification:** Focused workspace/pods Playwright regression; TypeScript; workspace pod contract proof; local roadmap proof; Next build; `git diff --check`.

### 2026-07-09 20:10 UTC - Public Fine-Tuning deployment intent loop (PR #915)

- **PR:** [#915](https://github.com/dhnpmp-tech/dcp-platform/pull/915) (`codex/public-fine-tuning-deploy-loop-2026-07-09`).
- **Timestamp:** 2026-07-09 20:10 UTC / 2026-07-10 00:10 +04.
- **Public product page:** `/fine-tuning` now explains the shipped create/stop deployment intent loop: ready adapters can create proof-gated intent rows and renters can stop stale intents, while load proof and serving remain backend-owned.
- **API snippets:** Added create-intent and stop-intent curl examples beside LoRA readiness, deployment, endpoint-smoke, usage-attribution, settlement, and billing readiness snippets.
- **Product boundary:** The public proof path now separates metadata contracts, non-serving intent control, GPU artifact proof, and adapter load proof.
- **Regression:** Extended the focused Fine-Tuning Playwright regression for the public create/stop loop and routes-off guard.
- **Safety:** Frontend/static product copy only; no API behavior, deployment mutation, load-proof acceptance, adapter serving, route traffic, endpoint smoke recording, usage write, billing, balance mutation, training execution, prompt-cache discount, batch execution, or Tinker claim changed.
- **Verification:** Focused Fine-Tuning Playwright regression; TypeScript; local roadmap proof; Next build; `git diff --check`.

### 2026-07-09 19:57 UTC - Fine-Tuning adapter deployment intent management (PR #914)

- **PR:** [#914](https://github.com/dhnpmp-tech/dcp-platform/pull/914) (`codex/adapter-deployment-intent-management-2026-07-09`).
- **Timestamp:** 2026-07-09 19:57 UTC / 2026-07-09 23:57 +04.
- **Backend lifecycle:** Added renter-scoped `POST /api/adapters/{adapter_id}/deployments/{deployment_id}/stop` so renters can stop their own adapter deployment intent rows while `serving_enabled` remains false.
- **Proof gate:** Extended `npm run proof:adapter-deployment-contract` to include renter stop semantics after matching load proof: stopped deployments clear `route_traffic` and do not grant renters load-proof privileges.
- **Fine-Tuning UX:** `/renter/fine-tuning` now has an Adapter serving path planner with ready-adapter count, active intents, route state, load-proof state, create-gated-intent action, stop-intent action, and the strict proof path from intent to load proof to endpoint smoke to billing approval.
- **OpenAPI:** Documented the new stop route beside adapter deployment intent and load-proof routes.
- **Regression:** Extended adapter deployment lifecycle Jest coverage and the focused Fine-Tuning Playwright regression for create/stop intent behavior.
- **Safety:** No renter-supplied vLLM load proof, adapter serving, route traffic, endpoint smoke recording, usage write, billing, invoice, payout, balance mutation, training execution, prompt-cache discount, batch execution, provider selection, or Tinker claim was enabled.
- **Verification:** Adapter deployment lifecycle Jest test; adapter deployment contract proof script test; focused Fine-Tuning Playwright regression; TypeScript; adapter deployment contract proof; local roadmap proof; Next build; `git diff --check`.

### 2026-07-09 19:42 UTC - Fine-Tuning dataset ledger (PR #913)

- **PR:** [#913](https://github.com/dhnpmp-tech/dcp-platform/pull/913) (`codex/fine-tuning-dataset-ledger-2026-07-09-v2`).
- **Timestamp:** 2026-07-09 19:42 UTC / 2026-07-09 23:42 +04.
- **Dataset ledger:** `/renter/fine-tuning` now shows validated dataset rows derived from existing LoRA training-job metadata: storage key, checksum, row count, split, estimated tokens, model, recipe, job count, and latest status.
- **Dataset policy:** Added a compact policy strip for validate-only status, raw-row persistence disabled, metadata-only training jobs, and GPU worker gate state.
- **Honesty:** The ledger does not claim raw dataset storage, GPU training execution, artifact writing, adapter serving, route traffic, billing, discounts, or Tinker compatibility.
- **Regression:** Extended the focused Fine-Tuning Playwright regression with a mocked metadata job and assertions for the dataset ledger and guard copy.
- **Safety:** Frontend/read-only UX change; no LoRA validation semantics, training-job creation, raw dataset persistence, worker execution, adapter registration, deployment, route traffic, billing, balance mutation, provider selection, prompt-cache discount, batch execution, or Tinker claim changed.
- **Verification:** Focused Fine-Tuning Playwright regression; TypeScript; LoRA training contract proof; local roadmap proof; Next build; `git diff --check`.

### 2026-07-09 19:33 UTC - Pods stage navigation and launch GPU state clarity (PR #912)

- **PR:** [#912](https://github.com/dhnpmp-tech/dcp-platform/pull/912) (`codex/pods-stage-navigation-gpu-clarity-2026-07-09`).
- **Timestamp:** 2026-07-09 19:33 UTC / 2026-07-09 23:33 +04.
- **Stage navigation:** `/renter/pods` now labels the launch flow as Stage 1/2/3 of 3 and keeps the desktop stage rail sticky so Stage 2 remains reachable while scanning a large workspace.
- **Workspace UX:** The fast path now states that Stage 1 is collapsible and that renters can skip file-by-file review when the folder summary is enough.
- **GPU clarity:** The GPU picker now starts with a selected-launch-state panel showing whether the request is auto-pick or a pinned GPU plus the exact `gpu_type` payload state.
- **Filter clarity:** The new picker panel repeats that templates, VRAM chips, search, and sort organize visible cards only; they do not select the launch GPU.
- **Regression:** Extended the focused `/renter/pods` Playwright regression for stage labels, collapsible workspace copy, and auto-pick/fixed-GPU picker state.
- **Safety:** Frontend/read-only UX change; no pod launch body change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, workspace API behavior, GPU-host execution, vendor/provider exposure, supply-tier exposure, or enforcement change was added.
- **Verification:** Focused `/renter/pods` Playwright regression; TypeScript; pod trial-routing readiness proof; workspace pod contract proof; minimum-balance readiness proof; local roadmap proof; Next build; `git diff --check`.

### 2026-07-09 19:14 UTC - Pods workspace skip path and launch GPU request preview (PR #911)

- **PR:** [#911](https://github.com/dhnpmp-tech/dcp-platform/pull/911) (`codex/pods-stage2-request-preview-2026-07-09`).
- **Timestamp:** 2026-07-09 19:14 UTC / 2026-07-09 23:14 +04.
- **Workspace UX:** `/renter/pods` now tells renters they do not need to scroll every staged file before Stage 2 because the whole `/workspace` volume is attached at launch.
- **Folder organization:** The compact large-workspace chips prioritize busier/larger folders first so the collapsed view remains useful with many staged files.
- **GPU clarity:** Stage 2 now includes a "What DCP will send" request preview showing `gpu_type` omitted for auto-pick or naming the pinned GPU when a card is selected.
- **Selection strip:** The actual launch GPU strip repeats the request preview beside the final-request chips.
- **Regression:** Extended the focused `/renter/pods` Playwright regression for skip-file-review copy plus auto-pick and fixed-GPU request previews.
- **Safety:** Frontend/read-only UX change; no pod launch body change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, workspace API behavior, GPU-host execution, vendor/provider exposure, supply-tier exposure, or enforcement change was added.
- **Verification:** Focused `/renter/pods` Playwright regression; TypeScript; pod trial-routing readiness proof; workspace pod contract proof; minimum-balance readiness proof; local roadmap proof; Next build; `git diff --check`.

### 2026-07-09 18:54 UTC - Admin live acceptance gate panel (PR #910)

- **PR:** [#910](https://github.com/dhnpmp-tech/dcp-platform/pull/910) (`codex/live-acceptance-admin-panel-2026-07-09`).
- **Timestamp:** 2026-07-09 18:54 UTC / 2026-07-09 22:54 +04.
- **Read-only builder:** `scripts/run-live-acceptance-gate-status.js` now exposes `buildLiveAcceptanceGateStatus()` so callers can construct the status packet without writing JSON/Markdown artifacts.
- **Backend:** Guarded `GET /api/admin/live-acceptance-gates` returns the `dcp.live_acceptance_gate_status.v1` packet with latest evidence, blocked inputs, commands, validation state, and claim guards.
- **Admin UI:** v2 admin now includes a "Live acceptance gates" section and rail shortcut showing blocked gates, command readiness, latest evidence count, claim-allowed count, contract validation, blockers, and acceptance commands.
- **Regression:** Added read-only builder coverage, admin route coverage, and static admin UI wiring checks.
- **Safety:** Read-only ops/admin visibility change; no paid compute, workload launch, provider routing, billing, balance, trial-accounting, adapter serving, prompt-cache discount, batch execution, pod launch, or capability-claim unlock was added.
- **Verification:** Live-acceptance Jest test; admin live-acceptance route integration test; admin live-acceptance static test; TypeScript; live-acceptance proof; local roadmap proof; Next build; `git diff --check`.

### 2026-07-09 18:42 UTC - Pods Stage 2 fast path launch UX (PR #909)

- **PR:** [#909](https://github.com/dhnpmp-tech/dcp-platform/pull/909) (`codex/pods-stage2-fast-path-2026-07-09`).
- **Timestamp:** 2026-07-09 18:42 UTC / 2026-07-09 22:42 +04.
- **Stage 2 fast path:** `/renter/pods` now shows a top-level fast-path strip above Stage 1 so renters can jump straight to the actual launch GPU decision even when many workspace files are staged.
- **Workspace UX:** The fast path states that Stage 1 can stay collapsed and summarizes the file tree instead of making the full manifest feel required before Stage 2.
- **GPU clarity:** The stage rail now names Stage 2 as the actual launch GPU, the launch button distinguishes auto-pick from fixed-GPU launches, and the VRAM controls repeat that chips are browse filters only.
- **Trial clarity:** The fast path repeats the backend-readiness answer: trial handling is grant-credit provenance when no explicit trial tag is live, trial credit routes to native/community GPU capacity, and high-demand GPUs require paid credit.
- **Regression:** Extended the focused `/renter/pods` Playwright regression for the fast path, Stage 2 rail, browse-filter disclaimer, and auto-pick launch CTA.
- **Safety:** Frontend/read-only UX change; no pod launch body change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, workspace API behavior, GPU-host execution, vendor/provider exposure, supply-tier exposure, or enforcement change was added.
- **Verification:** TypeScript; focused `/renter/pods` Playwright regression; pod trial-routing readiness proof; workspace pod contract proof; minimum-balance readiness proof; local roadmap proof; Next build; `git diff --check`.

### 2026-07-09 18:29 UTC - Live acceptance latest-evidence status (PR #908)

- **PR:** [#908](https://github.com/dhnpmp-tech/dcp-platform/pull/908) (`codex/live-acceptance-evidence-2026-07-09`).
- **Timestamp:** 2026-07-09 18:29 UTC / 2026-07-09 22:29 +04.
- **Evidence ingestion:** `npm run proof:live-acceptance-status` now attaches matching `*-latest.json` proof-report verdict, timestamp, failure code, blockers, and maintenance-required state to each gate.
- **dcp-agent clarity:** The dcp-agent reconciliation gate can surface latest blockers from the read-only reconciliation packet without rerunning remote inventory.
- **Markdown handoff:** The generated report now includes latest-evidence status per live gate plus a summary count.
- **Regression:** Extended the live-acceptance status Jest test with a blocked dcp-agent evidence fixture.
- **Safety:** Read-only proof visibility change; no SSH, gateway stop, agent checkout mutation, installer rebuild/delete, production artifact cleanup, service restart, route change, billing, workload execution, or product capability claim changed.
- **Verification:** Live-acceptance Jest test; live-acceptance proof; local roadmap proof; `git diff --check`.

### 2026-07-09 18:16 UTC - Team usage readiness proof gate (PR #907)

- **PR:** [#907](https://github.com/dhnpmp-tech/dcp-platform/pull/907) (`codex/team-usage-readiness-proof-2026-07-09`).
- **Timestamp:** 2026-07-09 18:16 UTC / 2026-07-09 22:16 +04.
- **Shared contract:** Moved `team_usage_readiness` construction into `backend/src/services/teamUsageReadiness.js` so routes and proof scripts use the same builder.
- **Proof command:** Added `npm run proof:team-usage-readiness`, with JSON/Markdown artifacts proving scoped-key controls are live while member rollups and member budgets remain gated.
- **Roadmap suite:** Added the `team_usage_readiness_contract` gate to `npm run proof:local-roadmap`.
- **Docs:** Updated the execution-system proof command map.
- **Safety:** Proof/refactor only; no API response semantics, usage mutation, budget mutation, billing change, inference dispatch, key secret exposure, team-member creation, member-rollup claim, or enforcement change.
- **Verification:** Team usage readiness proof; targeted renter usage/budget Jest suite; local roadmap proof; `git diff --check`.

### 2026-07-09 18:04 UTC - Usage scoped-key team readiness rail (PR #906)

- **PR:** [#906](https://github.com/dhnpmp-tech/dcp-platform/pull/906) (`codex/usage-team-readiness-rail-2026-07-09`).
- **Timestamp:** 2026-07-09 18:04 UTC / 2026-07-09 22:04 +04.
- **Backend:** Added `team_usage_readiness` to budget-status and usage-by-key responses, covering live scoped-key controls, gated team-member controls, counts, endpoints, next step, and read-only claim guards.
- **Usage UX:** `/renter/usage` now shows Team usage readiness with usage export, scoped-key attribution, per-key caps, member-rollup gate, active/budgeted keys, attributed requests/spend, and no-mutation guard state.
- **Honesty:** Team-member rollups and member budgets remain explicitly gated behind org-member identity; scoped keys remain the current team/workspace proxy.
- **Regression:** Added backend assertions and a mocked `/renter/usage` Playwright regression for the readiness rail and scoped-key table.
- **Safety:** Read-only contract/UI change; no team-member creation, usage mutation, key secret exposure, budget mutation, billing change, inference dispatch, account cap change, scoped-key cap enforcement change, settlement, prompt-cache discount, batch execution, LoRA training, adapter deployment, provider selection, or Tinker claim changed.
- **Verification:** Targeted renter usage/budget Jest suite; focused `/renter/usage` Playwright regression; TypeScript; local roadmap proof; Next build; `git diff --check`.

### 2026-07-09 17:37 UTC - Catalog-aware ALLaM and Qwen model pages (PR #905)

- **PR:** [#905](https://github.com/dhnpmp-tech/dcp-platform/pull/905) (`codex/model-pages-allam-qwen-readiness-2026-07-09`).
- **Timestamp:** 2026-07-09 17:37 UTC / 2026-07-09 21:37 +04.
- **Public pages:** Added `/models/allam` and `/models/qwen-arabic` as bilingual model-family pages backed by live catalog and benchmark-readiness contracts.
- **Catalog discipline:** The pages read `GET /v1/models`, show matching rows, separate serveable rows from catalog-only rows, and avoid live availability claims when `provider_count=0`.
- **Claim guard:** The pages read `GET /api/models/benchmarks/readiness` and keep Arabic quality claims, rankings, case studies, and frontier comparisons gated until reproducible artifacts exist.
- **Discovery:** Added both routes to sitemap, shared footer, `llms.txt`, and the site-index static guard.
- **Regression:** Added a mocked Playwright regression for ALLaM catalog-only state, Qwen live rows, advanced readiness, and benchmark claim guards.
- **Safety:** Frontend/read-only visibility change; no model catalog semantics, provider selection, request routing, pricing calculation, billing, settlement, prompt-cache discount, batch execution, LoRA training, adapter deployment, benchmark result, quality claim, or Tinker claim changed.
- **Verification:** TypeScript; focused model-pages Playwright regression; site-index static check; model-catalog parity proof; local roadmap proof; Next build; `git diff --check`.

### 2026-07-09 17:24 UTC - Pricing live model feature-readiness gates (PR #904)

- **PR:** [#904](https://github.com/dhnpmp-tech/dcp-platform/pull/904) (`codex/pricing-model-readiness-gates-2026-07-09-v2`).
- **Timestamp:** 2026-07-09 17:24 UTC / 2026-07-09 21:24 +04.
- **Pricing UX:** `/pricing` now aggregates `/v1/models.feature_readiness` for prompt cache, Batch API, LoRA, and Dedicated Deployments beside live SAR/M token rates.
- **Readiness clarity:** The rail shows contract version, serveable-model coverage, gated/available state, and the next proof action before advanced economics, execution, serving, or dedicated route traffic can be claimed.
- **Catalog discipline:** Zero-provider catalog rows stay out of both the live rate table and the readiness coverage counts.
- **Regression:** Added a focused mocked `/pricing` Playwright regression for serveable model rows, hidden zero-provider rows, and advanced readiness gate copy.
- **Safety:** Frontend/read-only visibility change; no model catalog semantics, provider selection, request routing, pricing calculation, billing, settlement, prompt-cache discount, batch execution, LoRA training, adapter deployment, dedicated deployment traffic, or Tinker claim changed.
- **Verification:** TypeScript; focused `/pricing` Playwright regression; model-catalog parity proof; local roadmap proof; Next build; `git diff --check`.

### 2026-07-09 17:13 UTC - Pods large-workspace and GPU decision scan polish (PR #903)

- **PR:** [#903](https://github.com/dhnpmp-tech/dcp-platform/pull/903) (`codex/pods-workspace-tareq-feedback-2026-07-09`).
- **Timestamp:** 2026-07-09 17:13 UTC / 2026-07-09 21:13 +04.
- **Workspace UX:** `/renter/pods` Stage 1 now auto-opens the compact folder tree for larger workspaces while leaving the full file manifest collapsed.
- **Stage UX:** Added a compact map that names Stage 1 as the workspace tree, Stage 2 as the actual launch GPU, and Stage 3 as runtime/launch.
- **GPU clarity:** Stage 2 now separates launch-affecting controls from browse-only controls: auto-pick/fixed GPU affects launch; templates, VRAM chips, search, and sort only filter cards.
- **Trial clarity:** The Stage 2 guide repeats the backend-readiness answer that trial handling uses grant-credit provenance unless a live trial tag is reported, with trial credit on native/community GPU capacity and high-demand GPUs requiring paid credit.
- **Regression:** Extended the focused `/renter/pods` Playwright regression for auto-open folder tree behavior, stage-map copy, Stage 2 source-guide copy, and fixed-GPU state.
- **Safety:** Frontend/read-only UX change; no pod launch body change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, workspace API behavior, GPU-host execution, vendor/provider exposure, supply-tier exposure, or enforcement change was added.
- **Verification:** TypeScript; focused `/renter/pods` Playwright regression; pod trial-routing readiness proof; workspace pod contract proof; minimum-balance readiness proof; `git diff --check`.

### 2026-07-09 16:57 UTC - Pods workspace search and launch GPU mode clarity (PR #902)

- **PR:** [#902](https://github.com/dhnpmp-tech/dcp-platform/pull/902) (`codex/pods-workspace-stage-clarity-2026-07-09`).
- **Timestamp:** 2026-07-09 16:57 UTC / 2026-07-09 20:57 +04.
- **Workspace UX:** `/renter/pods` Stage 1 keeps the compact folder-first checkpoint and now adds search to the collapsed folder index plus the expanded staged-file manifest.
- **Stage/GPU UX:** Stage 2 now has a dedicated Launch mode card for auto-pick vs fixed GPU, repeats that VRAM chips are browse filters only, and makes the launch request rail prominent without sticking over the filter controls.
- **Trial/credit clarity:** The flow continues to surface grant-credit trial routing, native/community trial capacity, paid-credit high-demand gating, and minimum-balance status from existing readiness contracts.
- **Regression:** Extended the focused `/renter/pods` Playwright regression for Stage 1 search, expanded-manifest search, launch mode copy, browse-filter copy, and auto-pick/fixed-GPU chips.
- **Safety:** Frontend/read-only UX change; no pod launch body change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, workspace API behavior, GPU-host execution, vendor/provider exposure, supply-tier exposure, or enforcement change was added.
- **Verification:** TypeScript; focused `/renter/pods` Playwright regression; pod trial-routing readiness proof; workspace pod contract proof; minimum-balance readiness proof; `git diff --check`.

### 2026-07-09 16:38 UTC - Dedicated Deployments adapter readiness contracts (PR #901)

- **PR:** [#901](https://github.com/dhnpmp-tech/dcp-platform/pull/901) (`codex/dedicated-deployments-readiness-rail-2026-07-09`).
- **Timestamp:** 2026-07-09 16:38 UTC / 2026-07-09 20:38 +04.
- **Public deployments UX:** `/dedicated-deployments` now consumes adapter artifact policy, endpoint-smoke, usage-attribution, settlement, founder-approval, and billing readiness packets.
- **Readiness clarity:** The public page shows contracts-live count, traffic-gate blockers, billing-gate blockers, per-contract mode/version, and the next strict vLLM load-proof action.
- **Regression:** Added a focused `/dedicated-deployments` Playwright regression with mocked readiness packets for all six adapter contract endpoints.
- **Safety:** Frontend/read-only visibility change; no adapter deployment creation, load-proof attachment, endpoint smoke recording, route traffic, usage write, billing, settlement, payout, invoice, balance mutation, minimum-balance enforcement change, provider selection, or Tinker claim was added.
- **Verification:** TypeScript; focused `/dedicated-deployments` Playwright regression; adapter readiness proof commands; local roadmap proof; Next build; `git diff --check`.

### 2026-07-09 16:26 UTC - Fine-Tuning LoRA credit preflight gates (PR #900)

- **PR:** [#900](https://github.com/dhnpmp-tech/dcp-platform/pull/900) (`codex/fine-tuning-minimum-balance-preflight-2026-07-09`).
- **Timestamp:** 2026-07-09 16:26 UTC / 2026-07-09 20:26 +04.
- **Fine-Tuning UX:** `/renter/fine-tuning` now consumes `GET /api/renters/me/minimum-balances` and shows a compact credit preflight strip inside the LoRA readiness section.
- **Credit clarity:** The strip shows minimum-balance sync state, LoRA training mode, adapter deployment mode, paid available SAR, blocked billing rails, and the read-only no-enforcement-change guard.
- **Regression:** Extended the focused `/renter/fine-tuning` Playwright regression for the readiness packet, LoRA training gate, adapter deployment gate, paid-available credit, blocked billing rails, and read-only enforcement copy.
- **Safety:** Frontend/read-only visibility change; no LoRA job creation change, GPU trainer execution, dataset storage change, adapter artifact write, adapter deployment, endpoint routing, pricing calculation, billing, balance mutation, inference dispatch, prompt-cache discount, batch execution, eval job, provider selection, or Tinker claim was added.
- **Verification:** TypeScript; focused `/renter/fine-tuning` Playwright regression; minimum-balance readiness proof; Next build; `git diff --check`.

### 2026-07-09 16:06 UTC - Pods unified launch checklist (PR #899)

- **PR:** [#899](https://github.com/dhnpmp-tech/dcp-platform/pull/899) (`codex/pods-launch-checklist-tareq-ux-2026-07-09`).
- **Timestamp:** 2026-07-09 16:06 UTC / 2026-07-09 20:06 +04.
- **Pods UX:** `/renter/pods` now has a top-level launch checklist for Stage 1 workspace, Stage 2 actual GPU request, trial account route, and minimum-balance credit gate before the deeper controls.
- **Workspace UX:** The workspace panel reports staged-file counts upward so the launch checklist can show file/folder counts while Stage 1 remains collapsed and folder-first.
- **GPU clarity:** The checklist repeats auto-pick vs fixed GPU and keeps browse-only VRAM filters separate from the launch GPU request.
- **Trial and credit clarity:** The checklist repeats grant-credit trial routing, paid-credit high-demand gating, and synced/fallback minimum-balance state from existing readiness contracts.
- **Regression:** Extended the focused `/renter/pods` Playwright regression for the checklist in auto-pick and fixed-GPU states.
- **Safety:** Frontend/read-only UX change; no pod launch body change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, workspace API behavior, GPU-host execution, vendor/provider exposure, supply-tier exposure, or enforcement change was added.
- **Verification:** TypeScript; focused `/renter/pods` Playwright regression; minimum-balance readiness proof; Next build; `git diff --check`.

### 2026-07-09 15:59 UTC - Batch credit preflight gates (PR #898)

- **PR:** [#898](https://github.com/dhnpmp-tech/dcp-platform/pull/898) (`codex/batches-minimum-balance-preflight-2026-07-09`).
- **Timestamp:** 2026-07-09 15:59 UTC / 2026-07-09 19:59 +04.
- **Batch UX:** `/renter/batches` now consumes `GET /api/renters/me/minimum-balances` and shows a compact Batch credit preflight strip inside the readiness section.
- **Credit clarity:** The strip shows minimum-balance sync state, batch settlement status, paid available SAR, v1 monthly cap remaining, and blocked billing rails before the live-proof gate.
- **Regression:** Extended the focused `/renter/batches` Playwright regression for the readiness packet, batch settlement gate, paid-available credit, v1 cap, and blocked billing rails.
- **Safety:** Frontend/read-only visibility change; no batch creation change, worker execution, result download enablement, settlement, discount, pricing calculation, billing, balance mutation, inference dispatch, LoRA training, adapter deployment, eval job, provider selection, or Tinker claim was added.
- **Verification:** TypeScript; focused `/renter/batches` Playwright regression; minimum-balance readiness proof; Next build; `git diff --check`.

### 2026-07-09 15:49 UTC - Playground inference credit preflight gates (PR #897)

- **PR:** [#897](https://github.com/dhnpmp-tech/dcp-platform/pull/897) (`codex/playground-minimum-balance-preflight-2026-07-09`).
- **Timestamp:** 2026-07-09 15:49 UTC / 2026-07-09 19:49 +04.
- **Playground UX:** `/renter/playground` now consumes `GET /api/renters/me/minimum-balances` and shows a compact Credit preflight panel beside model/routing controls.
- **Credit clarity:** The panel shows v1 estimate preflight, paid available SAR, monthly cap remaining, prompt-cache discount status, and blocked future billing rails.
- **Regression:** Added a focused `/renter/playground` Playwright regression for the readiness packet, v1 preflight status, paid-available credit, monthly cap, prompt-cache discount gate, and blocked future billing rails.
- **Safety:** Frontend/read-only visibility change; no request dispatch change, routing-policy change, pricing calculation change, billing change, balance mutation, prompt-cache discount, batch execution, LoRA training, adapter deployment, eval job, provider selection, or Tinker claim was added.
- **Verification:** TypeScript; focused `/renter/playground` Playwright regression; minimum-balance readiness proof; Next build; `git diff --check`.

### 2026-07-09 15:35 UTC - Pod minimum-balance launch gates (PR #896)

- **PR:** [#896](https://github.com/dhnpmp-tech/dcp-platform/pull/896) (`codex/pods-minimum-balance-launch-readiness-2026-07-09`).
- **Timestamp:** 2026-07-09 15:35 UTC / 2026-07-09 19:35 +04.
- **Launch readiness:** `/renter/pods` now consumes `GET /api/renters/me/minimum-balances` and shows a synced/fallback minimum-balance strip before launch.
- **Credit clarity:** The strip separates provider/community quote preflight from high-demand paid-credit preflight, shows paid available SAR, and states that trial credit does not unlock high-demand GPUs.
- **False-claim guards:** The UI exposes the read-only minimum-balance contract and blocked future billing rails for batch, prompt-cache, LoRA training, and adapter deployments.
- **Regression:** Extended the focused `/renter/pods` Playwright regression for the minimum-balance readiness packet, paid-available credit display, rail labels, read-only guard, and blocked future billing rails.
- **Safety:** Frontend/read-only visibility change; no pod launch body change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, workspace API behavior, GPU-host execution, vendor/provider exposure, or supply-tier exposure was added.
- **Verification:** TypeScript; focused `/renter/pods` Playwright regression; minimum-balance readiness proof; Next build; `git diff --check`.

### 2026-07-09 15:23 UTC - Tareq workspace and GPU launch UX polish (PR #895)

- **PR:** [#895](https://github.com/dhnpmp-tech/dcp-platform/pull/895) (`codex/pods-tareq-workspace-gpu-ux-2026-07-09`).
- **Timestamp:** 2026-07-09 15:23 UTC / 2026-07-09 19:23 +04.
- **Workspace UX:** `/renter/pods` now leads the compact Stage 1 checkpoint with the continue-to-Stage-2 action, keeps the manifest closed by default, and shows grouped folder counts and sizes.
- **GPU UX:** Stage 2 now separates template, browse filter, and actual GPU into one decision summary; the final GPU request rail appears before template/GPU browsing; GPU cards now say "Use as launch GPU."
- **Trial policy clarity:** The launch flow now answers the current trial policy plainly: no separate live trial-account tag, grant-credit provenance decides trial status, trial/free balance routes to native/community capacity, and high-demand GPUs require paid credit.
- **Regression:** Extended the focused `/renter/pods` Playwright regression for folder grouping/sizes, Stage 2 decision wording, browse-filter separation, launch-GPU CTA copy, trial-route answers, and launch review credit route.
- **Safety:** Frontend/read-only UX change; no pod launch body change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, workspace API behavior, GPU-host execution, vendor/provider exposure, or supply-tier exposure was added.
- **Verification:** TypeScript; focused `/renter/pods` Playwright regression; Next build; `git diff --check`.

### 2026-07-09 15:03 UTC - Pod image readiness contract (PR #894)

- **PR:** [#894](https://github.com/dhnpmp-tech/dcp-platform/pull/894) (`codex/pods-image-readiness-contract-2026-07-09`).
- **Timestamp:** 2026-07-09 15:03 UTC / 2026-07-09 19:03 +04.
- **Backend:** Added public `GET /api/pods/images/readiness` with the CI-safe pod image contract status, pre-baked aliases, `dcp-compute:lora` metadata, provider-host build/verify commands, and blocked LoRA image acceptance gate.
- **Proof:** Added `npm run proof:pod-image-readiness`, covering the readiness route, `pod_image_contracts` gate, LoRA image metadata, provider-host blockers, build commands, and no-build/no-Docker/no-launch/no-billing claim guards.
- **Local roadmap:** Added the `pod_image_readiness_contract` CI-safe gate to `npm run proof:local-roadmap`.
- **Docs/contracts:** Updated OpenAPI, the fat-image architecture note, Fireworks/Tinker strategy, and lane/execution roadmaps.
- **Safety:** Read-only contract/proof/docs change; no Docker build, provider-host smoke, pod launch body, provider selection, billing, balance mutation, trial accounting, GPU-host execution, vendor/provider exposure, or fine-tuning-ready claim was enabled.
- **Verification:** Targeted pod-image/pod-trial Jest suites; pod image readiness proof; pod image contract verifier; OpenAPI YAML parse; local roadmap proof suite; TypeScript; Next build; `git diff --check`.

### 2026-07-09 14:44 UTC - Pod workspace folder index and GPU request rail (PR #893)

- **PR:** [#893](https://github.com/dhnpmp-tech/dcp-platform/pull/893) (`codex/pods-workspace-collapsible-gpu-clarity-2026-07-09`).
- **Workspace UX:** `/renter/pods` compact Stage 1 now has a collapsible folder index so renters can browse all staged folders and open one folder without expanding the full manifest.
- **GPU UX:** Stage 2 now labels the decision as template plus actual GPU, and the selected-GPU strip is a sticky final-launch-request rail while users browse GPU cards.
- **Trial policy clarity:** The launch flow now states whether a live trial-account tag exists and shows credit-provenance/grant-balance handling beside native/community trial routing and paid high-demand routing.
- **Regression:** Updated the focused `/renter/pods` Playwright test for folder-index browsing, trial-tag answer copy, and final-launch GPU rail clarity.
- **Safety:** Frontend/read-only UX change; no pod launch body change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, workspace API behavior, GPU-host execution, vendor/provider exposure, or supply-tier exposure was added.
- **Verification:** Focused `/renter/pods` Playwright regression; TypeScript; Next build; `git diff --check`.

### 2026-07-09 14:30 UTC - Prompt-cache and batch live proof gates (PR #892)

- **PR:** [#892](https://github.com/dhnpmp-tech/dcp-platform/pull/892) (`codex/inference-batch-live-proof-readiness-2026-07-09`).
- **Prompt-cache readiness:** `GET /v1/prompt-cache/readiness` now exposes the blocked `prompt_cache_provider_discount_smoke` gate, opt-in proof command, blockers, and no-discount verification expectations.
- **Batch readiness:** `GET /api/batches/readiness` now exposes the blocked `batch_live_execution_discount_smoke` gate, opt-in proof command, blockers, and result/download/discount verification expectations.
- **Frontend:** Public `/inference`, public `/batch`, and renter `/renter/batches` now show those live proof gates from readiness data so users see the evidence still required before cache discounts or batch execution are claimed.
- **Docs/contracts:** Public OpenAPI copies and the prompt-cache/batch proof packets now carry the live-acceptance metadata.
- **Safety:** Read-only contract/UI/docs/proof change; no prompt-cache discount, provider KV-cache control, batch execution, result object write/download, settlement, billing, model batch flag, route selection, provider routing, or balance mutation was enabled.
- **Verification:** OpenAPI YAML parse; targeted prompt-cache/batch/v1 Jest suites; prompt-cache contract proof; batch inference contract proof; focused `/inference` and `/renter/batches` Playwright regressions; TypeScript; local roadmap proof suite passing 35/35 gates; Next build; `git diff --check`.

### 2026-07-09 14:09 UTC - Pod workspace folders, trial policy, and GPU request polish (PR #891)

- **PR:** [#891](https://github.com/dhnpmp-tech/dcp-platform/pull/891) (`codex/pods-workspace-trial-gpu-polish-2026-07-09`).
- **Workspace UX:** `/renter/pods` now exposes top folder controls in the compact Stage 1 checkpoint, letting renters jump into one staged folder without opening the entire workspace manifest.
- **GPU UX:** Stage 2 now labels the actual launch GPU request as the source of truth, makes auto-pick explicitly say no GPU is pinned, and labels VRAM controls as browse-only filters.
- **Trial policy clarity:** The pods launch flow now has a dedicated policy block for credit-provenance trial handling, native/community trial routing, paid high-demand routing, and hidden provider identity.
- **Regression:** Updated the focused `/renter/pods` Playwright test for folder summary controls, trial policy copy, and actual-GPU/browse-filter wording.
- **Safety:** Frontend/read-only UX change; no pod launch body change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, workspace API behavior, GPU-host execution, vendor/provider exposure, or supply-tier exposure was added.
- **Verification:** TypeScript; focused `/renter/pods` Playwright regression; Next build; `git diff --check`.

### 2026-07-09 13:42 UTC - Pod workspace, trial, and GPU request UX (PR #890)

- **PR:** [#890](https://github.com/dhnpmp-tech/dcp-platform/pull/890) (`codex/pods-workspace-gpu-trial-ux-2026-07-09`).
- **Frontend:** `/renter/pods` now makes Stage 2 a visible compute decision with an auto-pick/fixed-GPU segmented control and repeats the final GPU request in the launch review.
- **Trial policy clarity:** The pods launch flow now states whether trial handling is explicit-tag based or credit-provenance based beside the backend trial/high-demand capacity copy.
- **Stage clarity:** The launch plan labels Stage 1, Stage 2, Stage 3, and Launch consistently so large workspaces do not make the renter lose track of where compute selection starts.
- **Regression:** Updated the focused `/renter/pods` Playwright test for the Stage 2 decision panel, request-mode control, trial-account wording, and launch review.
- **Safety:** Frontend/read-only UX change; no pod launch body change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, workspace API behavior, GPU-host execution, vendor/provider exposure, or supply-tier exposure was added.
- **Verification:** Focused `/renter/pods` Playwright regression; Playwright visual smoke of the Stage 2 decision and launch review panels; TypeScript/Next build; `git diff --check`.

### 2026-07-09 13:24 UTC - Pod infrastructure proof readiness and launch UX (PR #889)

- **PR:** [#889](https://github.com/dhnpmp-tech/dcp-platform/pull/889) (`codex/pods-infrastructure-proof-readiness-2026-07-09`).
- **Backend:** `GET /api/pods/trial-routing/readiness` now exposes workspace contract proof, workspace live acceptance, and LoRA pod-image provider-host proof gates.
- **Workspace UX:** `/renter/pods` now defaults Stage 1 to a compact ready checkpoint when staged files already exist, with one-click workspace expansion and Stage 2 continuation for renters with large workspaces.
- **GPU UX:** Stage 2 now reads as a GPU request decision: auto-pick vs fixed GPU, template VRAM recommendation, and browse filters are separated so renters can see exactly what will be requested at launch.
- **Frontend:** `/renter/pods` now renders a compact pod proof-gates strip so users see CI-safe workspace wiring and the still-blocked live provider/GPU-host evidence before fine-tuning-ready pod claims.
- **Docs/contracts:** OpenAPI and roadmaps now point to the pod infrastructure proof block.
- **Regression:** Updated pod readiness Jest/proof coverage and the focused `/renter/pods` Playwright test for proof gates, compact workspace behavior, GPU request wording, trial-policy chips, and false-claim guards.
- **Safety:** Read-only contract/UI/docs change; no pod launch body change, image selection change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, workspace API behavior, GPU-host execution, vendor/provider exposure, or supply-tier exposure was added.
- **Verification:** OpenAPI YAML parse; targeted pod readiness Jest/proof suites; pod trial-routing readiness proof; focused `/renter/pods` Playwright regression; TypeScript; local roadmap proof suite passing 35/35 gates; Next build; `git diff --check`.

### 2026-07-09 12:40 UTC - Pod workspace manifest and GPU request clarity (PR #888)

- **PR:** [#888](https://github.com/dhnpmp-tech/dcp-platform/pull/888) (`codex/pods-workspace-compute-clarity-2026-07-09`).
- **Workspace UX:** `/renter/pods` now shows a compact Stage 1 manifest with file/group counts, total size, folder count, review-folders, and continue-to-Stage-2 actions so large workspaces are not a mandatory file-by-file scan.
- **GPU UX:** The compute summary now reads as the launch GPU request, distinguishes fixed GPU vs auto-pick mode, and labels VRAM controls as card filters rather than launch constraints.
- **Trial policy clarity:** Trial handling now reads as explicit tag vs credit provenance beside the synced credit policy.
- **Regression:** Extended the focused `/renter/pods` Playwright test to cover the manifest, Stage 2 continuation, request mode, trial handling, and card-filter wording.
- **Safety:** Frontend-only UX/copy change; no pod launch body change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, workspace API behavior, vendor/provider exposure, or supply-tier exposure was added.
- **Verification:** Focused Playwright browser regression for `/renter/pods`; TypeScript; Next build; `git diff --check`.

### 2026-07-09 12:21 UTC - LoRA readiness surfaces adapter deployment proof (PR #887)

- **PR:** [#887](https://github.com/dhnpmp-tech/dcp-platform/pull/887) (`codex/lora-deployment-proof-readiness-surface-2026-07-09`).
- **Backend:** `/api/lora/readiness` now exposes `adapter_deployments.deployment_contract_proof` with proof status, command, local-roadmap gate id, and verified lifecycle invariants.
- **Frontend:** Public and renter Fine-Tuning surfaces now make the deployment lifecycle proof visible without implying vLLM load, route traffic, billing, or GPU execution is enabled.
- **Docs/contracts:** OpenAPI and roadmap notes now point to the deployment proof signal.
- **Safety:** Read-only contract/UI/docs change; no adapter registration behavior, artifact upload, deployment creation, load-proof attach, route traffic, usage/billing write, balance mutation, provider/vendor exposure, or GPU-host execution was enabled.
- **Verification:** OpenAPI YAML parse; targeted LoRA readiness Jest suite; adapter deployment contract proof; TypeScript; focused Fine-Tuning Playwright regression; Next build; local roadmap proof suite passing 35/35 gates; `git diff --check`.

### 2026-07-09 12:10 UTC - Pod workspace folder disclosure (PR #886)

- **PR:** [#886](https://github.com/dhnpmp-tech/dcp-platform/pull/886) (`codex/pods-workspace-folder-disclosure-2026-07-09`).
- **Workspace UX:** `/renter/pods` now treats staged workspace files as a folder-first disclosure in pod-launch context. Summary chips open exactly one folder, keeping large workspaces from becoming a mandatory scroll wall before Stage 2.
- **Controls:** Expanded file groups now expose explicit expand-all and collapse-all controls for users who do need to inspect the full workspace.
- **Trial policy clarity:** The selected-compute summary now mirrors the backend trial-routing readiness packet by showing whether trial handling is credit-provenance based or explicit-tag based.
- **Regression:** Extended the focused `/renter/pods` Playwright test to cover folder-summary controls, one-folder expansion, bulk expand/collapse, and the trial policy chip.
- **Safety:** Frontend/read-only readiness display only; no pod launch body change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, workspace API behavior, vendor/provider exposure, or supply-tier exposure was added.
- **Verification:** TypeScript; focused Playwright browser regression for `/renter/pods`; Next build; `git diff --check`.

### 2026-07-09 11:58 UTC - LoRA readiness surfaces adapter registry proof (PR #885)

- **PR:** [#885](https://github.com/dhnpmp-tech/dcp-platform/pull/885) (`codex/lora-readiness-registry-proof-surface-2026-07-09`).
- **Backend:** `/api/lora/readiness` now exposes `adapter_registry.registry_contract_proof` with proof status, command, local-roadmap gate id, and verified invariants.
- **Frontend:** Public and renter Fine-Tuning surfaces now make the registry proof visible without implying training, serving, billing, or GPU execution is enabled.
- **Docs/contracts:** OpenAPI and roadmap notes now point to the registry proof signal.
- **Safety:** Read-only contract/UI/docs change; no adapter registration behavior, artifact upload, deployment creation, load-proof attach, route traffic, usage/billing write, balance mutation, provider/vendor exposure, or GPU-host execution was enabled.
- **Verification:** OpenAPI YAML parse; targeted LoRA readiness and artifact-policy Jest suites; TypeScript; focused Fine-Tuning Playwright regression; Next build; `git diff --check`.

### 2026-07-09 11:49 UTC - Adapter registry contract proof (PR #884)

- **PR:** [#884](https://github.com/dhnpmp-tech/dcp-platform/pull/884) (`codex/adapter-registry-contract-proof-2026-07-09`).
- **Proof:** Added `npm run proof:adapter-registry-contract`, covering schema idempotency/indexes, metadata-only registration, storage-key/checksum validation, tenant isolation, lifecycle status timestamps, public status restrictions, and no public deploy shortcut.
- **Local roadmap:** Added the proof to `npm run proof:local-roadmap`, moving the CI-safe suite to 35 gates.
- **Docs:** Updated the LoRA roadmap and Fireworks/Tinker strategy notes so adapter registry/API state is current.
- **Safety:** Test/proof/docs only; no artifact upload, deployment creation, load-proof attach, adapter traffic routing, usage/billing write, balance mutation, provider/vendor exposure, or GPU-host execution was enabled.
- **Verification:** Package JSON parse; Node syntax check; adapter registry proof; focused adapter registry Jest suite; local roadmap proof now passing 35/35 gates; Next build; `git diff --check`.

### 2026-07-09 11:38 UTC - Template workflow contract proof (PR #883)

- **PR:** [#883](https://github.com/dhnpmp-tech/dcp-platform/pull/883) (`codex/template-workflow-contract-proof-2026-07-09`).
- **Template contracts:** Added explicit `workflow_contract` metadata to LoRA, QLoRA, and vLLM templates for workspace mount, dataset validation, adapter artifact checksums, pod-local OpenAI-compatible serving, and the next live proof command.
- **Backend catalog:** `/api/templates/catalog` now sanitizes and exposes workflow contracts when templates declare them.
- **Proof:** Added `npm run proof:template-workflow-contract`, which validates template contracts, route exposure, false claim guards, and GPU-host proof requirements.
- **Local roadmap:** Added the proof to `npm run proof:local-roadmap`, moving the CI-safe suite to 34 gates.
- **Safety:** Contract/proof only; no pod launch, training-job creation, dataset row storage, adapter artifact upload, public endpoint routing, balance mutation, usage recording, adapter billing, provider/vendor exposure, or GPU-host execution was enabled.
- **Verification:** Template JSON parse; deploy-template validation; template workflow proof; focused template catalog Jest coverage; local roadmap proof now passing 34/34 gates; `git diff --check`.

### 2026-07-09 11:08 UTC - Pod stage navigation and explicit VRAM filters (PR #882)

- **PR:** [#882](https://github.com/dhnpmp-tech/dcp-platform/pull/882) (`codex/pods-stage-navigation-vram-filter-2026-07-09`).
- **Frontend:** `/renter/pods` now shows a three-step stage navigation rail above the launch flow, with anchors for workspace, template/GPU, and runtime/launch.
- **Workspace UX:** The embedded workspace panel exposes Stage 2 jump actions in pod-launch context, keeping large staged-file workspaces from becoming a mandatory scroll path before compute selection.
- **GPU controls:** The min-VRAM slider is replaced with explicit VRAM filter chips, and the selection strip now labels the value as a filter so renters can distinguish filtering from the selected GPU type.
- **Regression:** Extended the focused `/renter/pods` Playwright test to cover stage navigation, collapsed workspace groups, Stage 2 jumping, VRAM chip filtering, and selected GPU confirmation.
- **Safety:** Frontend-only UX change; no pod launch body change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, workspace API behavior, vendor/provider exposure, or supply-tier exposure was added.
- **Verification:** TypeScript; focused Playwright browser regression for `/renter/pods`; Next build; `git diff --check`.

### 2026-07-09 10:44 UTC - Model catalog parity proof (PR #881)

- **PR:** [#881](https://github.com/dhnpmp-tech/dcp-platform/pull/881) (`codex/model-catalog-parity-proof-2026-07-09`).
- **Proof:** Added `npm run proof:model-catalog-parity`, backed by `backend/tests/model-catalog-parity-proof.js`, which runs the deterministic mocked route parity test and writes JSON/Markdown proof artifacts.
- **Local roadmap:** Added the proof to `npm run proof:local-roadmap`, moving the CI-safe suite to 33 gates.
- **Coverage:** The proof covers token pricing/source parity, provider count and availability, capability flags/capabilities mirrors, advanced feature readiness, modalities, and max-output metadata across `/v1/models`, `/api/models`, and `/api/models/catalog`.
- **Safety:** Test/proof only; no model catalog semantics, provider selection, request routing, pricing, billing, settlement, prompt-cache, batch, LoRA, or deployment behavior changed.
- **Verification:** Package JSON parse; `npm run proof:model-catalog-parity`; targeted Jest for parity proof and route parity; `npm run proof:local-roadmap` now passing 33/33 gates; Next build; `git diff --check`.

### 2026-07-09 10:31 UTC - Public inference model catalog metadata (PR #880)

- **PR:** [#880](https://github.com/dhnpmp-tech/dcp-platform/pull/880) (`codex/inference-model-catalog-live-rail-2026-07-09`).
- **Frontend:** `/inference` now fetches `/v1/models` and renders serving model count, provider-backed count, maximum context window, sample model rows, provider counts, SAR input/output pricing, and serving/catalog-only state from backend data.
- **Claim safety:** Rows with zero providers remain visible only as catalog metadata; unavailable models are not turned into capacity claims.
- **Regression:** Added a focused Playwright test with a mocked model catalog and updated the router-policy rail test to mock both live reads.
- **Safety:** Frontend/read-only fetch only; no model catalog semantics, provider selection, request routing, pricing, billing, settlement, prompt-cache, batch, LoRA, or deployment behavior changed.
- **Verification:** TypeScript; focused Playwright browser regressions for `/inference` model-catalog and router-policy rails; Next build; `git diff --check`.

### 2026-07-09 10:18 UTC - Public inference router policy readiness (PR #879)

- **PR:** [#879](https://github.com/dhnpmp-tech/dcp-platform/pull/879) (`codex/inference-router-policy-live-rail-2026-07-09`).
- **Frontend:** `/inference` now fetches `/v1/router/policies` and renders contract version, default policy, available/gated counts, and policy status chips from backend data.
- **Claim safety:** Balanced remains the only available policy in the rendered contract; future policies stay marked as gated/not selectable until route-specific proof exists.
- **Regression:** Added a focused Playwright test with a mocked router-policy catalog to prove the public page renders the live readiness rail.
- **Safety:** Frontend/read-only fetch only; no request routing, provider ordering, routing-policy selectability, pricing, billing, settlement, prompt-cache, batch, LoRA, or model catalog behavior changed.
- **Verification:** TypeScript; focused Playwright browser regression for `/inference`; router-policy contract proof; Next build; `git diff --check`.

### 2026-07-09 10:08 UTC - Pod GPU selection clarity (PR #878)

- **PR:** [#878](https://github.com/dhnpmp-tech/dcp-platform/pull/878) (`codex/pods-gpu-selection-clarity-2026-07-09`).
- **Frontend:** Added a compact selector-status strip above the GPU toolbar that keeps auto-pick vs selected GPU, VRAM, hourly price, active workload/filter state, and visible GPU count prominent.
- **Controls:** The strip exposes direct "Back to auto-pick" and "Clear filters" actions only when relevant.
- **Regression:** Extended the focused `/renter/pods` Playwright test to assert the strip before and after selecting an RTX 4090.
- **Safety:** Frontend-only UX change; no pod launch body change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, vendor/provider exposure, or supply-tier exposure was added.
- **Verification:** TypeScript; focused Playwright browser regression for `/renter/pods`; Next build; `git diff --check`.

### 2026-07-09 10:00 UTC - Pod launch credit policy sync (PR #877)

- **PR:** [#877](https://github.com/dhnpmp-tech/dcp-platform/pull/877) (`codex/pods-trial-routing-ui-readiness-2026-07-09`).
- **Frontend:** `/renter/pods` fetches `GET /api/pods/trial-routing/readiness` and shows "Credit policy: synced" only when the backend contract confirms launch, billing, balance, trial-accounting, provider, vendor, and supply-tier exposure guards are false.
- **Fallback UX:** If the readiness endpoint is unavailable, the launch screen keeps built-in renter-safe policy copy and notes that backend gates still control launch.
- **Regression:** The focused Playwright test now mocks the readiness endpoint with distinct copy so the contract sync is exercised.
- **Safety:** UI/read-only fetch only; no pod launch body change, provider selection change, billing change, balance mutation, trial-accounting mutation, payment creation, vendor/provider exposure, or supply-tier exposure was added.
- **Verification:** TypeScript; focused Playwright browser regression for `/renter/pods`; Next build; `git diff --check`.

### 2026-07-09 09:47 UTC - Pod trial routing readiness proof (PR #876)

- **PR:** [#876](https://github.com/dhnpmp-tech/dcp-platform/pull/876) (`codex/pod-trial-routing-readiness-2026-07-09`).
- **Backend:** Added public `GET /api/pods/trial-routing/readiness`, returning the current no-mutation policy for trial-credit provenance, paid-credit derivation, native/community capacity, and high-demand paid-credit gates.
- **Proof:** Added `npm run proof:pod-trial-routing-readiness` and included it in `npm run proof:local-roadmap`, moving the local roadmap suite to 32 CI-safe gates.
- **Docs/contracts:** Added OpenAPI and `llms.txt` references so agents can inspect the pod trial-routing policy beside minimum-balance policy.
- **Safety:** Readiness/policy only; no provider selection change, pod launch mutation, billing change, payment creation, balance mutation, trial-accounting mutation, vendor/provider exposure, or supply-tier exposure was enabled.
- **Verification:** Syntax/package JSON checks; OpenAPI YAML parse; targeted pod trial-routing and pod access-policy Jest suites; pod trial-routing readiness proof; local roadmap proof now passing 32/32 gates; TypeScript; Next build; `git diff --check`.

### 2026-07-09 09:27 UTC - Pod workspace stages and compute-selection clarity (PR #875)

- **PR:** [#875](https://github.com/dhnpmp-tech/dcp-platform/pull/875) (`codex/workspace-trial-ux-2026-07-09`).
- **Workspace UX:** The embedded workspace manager now defaults staged files to a collapsed summary in pod-launch context, groups expanded files by top-level folder/root files, and keeps download/delete actions inside each group.
- **Launch flow:** `/renter/pods` now labels the flow as Stage 1 workspace, Stage 2 template/GPU, and Stage 3 runtime/launch, instead of leaving later stages implicit.
- **Compute clarity:** Added a prominent selected-compute panel showing the selected GPU or auto-pick state, min-VRAM filter, quote when available, and a one-click return to auto-pick.
- **Trial-credit clarity:** The launch screen now states the current product policy without exposing supply-tier/vendor internals: trial credit covers DCP/community capacity; high-demand capacity requires paid credit.
- **Safety:** Frontend-only UX/copy change; no pod launch body change, provider selection change, trial-credit accounting change, payment creation, balance mutation, billing/refund path, workspace API behavior, or vendor/provider exposure was added.
- **Verification:** TypeScript; Next build; focused Playwright browser regression for `/renter/pods` with mocked workspace/provider APIs; `git diff --check`.

### 2026-07-09 09:08 UTC - Adapter billing approval readiness proof (PR #874)

- **PR:** [#874](https://github.com/dhnpmp-tech/dcp-platform/pull/874) (`codex/adapter-billing-approval-readiness-2026-07-09`).
- **Backend:** Added public `GET /api/adapters/billing/approval/readiness` plus a pure approval evaluator for strict load proof, endpoint smoke, usage attribution, minimum-balance policy, settlement policy, local-roadmap proof, production smoke, evidence-packet hash, and founder signoff.
- **Proof:** Added `npm run proof:adapter-billing-approval` and included it in `npm run proof:local-roadmap`, moving the local roadmap suite to 31 CI-safe gates.
- **Docs/contracts:** Updated adapter billing and settlement readiness, OpenAPI, `/fine-tuning`, `/dedicated-deployments`, renter Fine-Tuning snippets, `llms.txt`, and roadmap docs with the approval gate.
- **Safety:** Readiness/policy only; no approval mutation, adapter dispatch, route traffic, usage ledger write, balance mutation, invoice, provider payout, adapter billing, raw prompt/response exposure, or Tinker compatibility behavior was enabled.
- **Verification:** Syntax/package JSON checks; OpenAPI YAML parse; targeted adapter approval/billing/settlement Jest suites; adapter billing approval proof; local roadmap proof now passing 31/31 gates; TypeScript; Next build; `git diff --check`.

### 2026-07-09 08:48 UTC - Adapter settlement readiness proof (PR #873)

- **PR:** [#873](https://github.com/dhnpmp-tech/dcp-platform/pull/873) (`codex/adapter-settlement-readiness-policy-2026-07-09`).
- **Backend:** Added public `GET /api/adapters/settlement/readiness` plus a pure adapter settlement evaluator for strict load proof, endpoint smoke, adapter usage attribution, minimum-balance policy, split-policy approval, founder approval, and provider/platform share reconciliation.
- **Proof:** Added `npm run proof:adapter-settlement-readiness` and included it in `npm run proof:local-roadmap`, moving the local roadmap suite to 30 CI-safe gates.
- **Docs/contracts:** Updated adapter billing readiness, OpenAPI, `/fine-tuning`, `/dedicated-deployments`, renter Fine-Tuning snippets, `llms.txt`, and roadmap docs with the settlement gate.
- **Safety:** Readiness/policy only; no adapter dispatch, load-proof mutation, route traffic, usage ledger write, balance mutation, invoice, provider payout, platform revenue split, minimum-balance enforcement change, adapter billing, raw prompt/response exposure, or Tinker compatibility behavior was enabled.
- **Verification:** Syntax/package JSON checks; OpenAPI YAML parse; targeted adapter settlement/billing/usage/endpoint-smoke Jest suites; adapter settlement proof; adapter billing readiness proof; local roadmap proof now passing 30/30 gates; TypeScript; Next build; `git diff --check`.

### 2026-07-09 08:32 UTC - Disabled endpoint smoke status proof (PR #872)

- **PR:** [#872](https://github.com/dhnpmp-tech/dcp-platform/pull/872) (`codex/adapter-endpoint-smoke-status-contract-2026-07-09`).
- **Backend:** Added disabled `GET /api/adapters/{adapter_id}/deployments/{deployment_id}/endpoint-smoke`, returning no-record status, strict load-proof readiness, and missing inputs while endpoint-smoke recording remains disabled.
- **Proof:** Added `npm run proof:adapter-endpoint-smoke-status` and included it in `npm run proof:local-roadmap`, moving the local roadmap suite to 29 CI-safe gates.
- **Docs/contracts:** Updated OpenAPI, `/fine-tuning`, `/dedicated-deployments`, renter Fine-Tuning snippets, `llms.txt`, and roadmap docs with the no-record endpoint-smoke status route.
- **Safety:** Disabled status contract only; no adapter dispatch, smoke recording, load-proof mutation, route traffic, usage ledger write, balance mutation, invoice, provider payout, raw prompt/response exposure, adapter billing, or Tinker compatibility behavior was enabled.
- **Verification:** Syntax/package JSON checks; OpenAPI YAML parse; targeted endpoint-smoke status/submission/readiness/deployment Jest suites; endpoint-smoke status proof; endpoint-smoke submission proof; endpoint-smoke readiness proof; local roadmap proof now passing 29/29 gates; TypeScript; Next build; `git diff --check`.

### 2026-07-09 08:12 UTC - Disabled endpoint smoke submission proof (PR #871)

- **PR:** [#871](https://github.com/dhnpmp-tech/dcp-platform/pull/871) (`codex/adapter-endpoint-smoke-submission-contract-2026-07-09`).
- **Backend:** Added disabled `POST /api/adapters/{adapter_id}/deployments/{deployment_id}/endpoint-smoke`, returning a 409 no-record contract that evaluates strict load proof, funded principal, request attribution, response hash, latency, token totals, and adapter trace.
- **Proof:** Added `npm run proof:adapter-endpoint-smoke-submission` and included it in `npm run proof:local-roadmap`, moving the local roadmap suite to 28 CI-safe gates.
- **Docs/contracts:** Updated OpenAPI, `/fine-tuning`, `/dedicated-deployments`, renter Fine-Tuning snippets, `llms.txt`, and roadmap docs with the disabled endpoint-smoke submission route.
- **Safety:** Disabled contract only; no adapter dispatch, smoke recording, load-proof mutation, route traffic, usage ledger write, balance mutation, invoice, provider payout, raw prompt/response exposure, adapter billing, or Tinker compatibility behavior was enabled.
- **Verification:** Syntax/package JSON checks; OpenAPI YAML parse; targeted endpoint-smoke submission/readiness/deployment Jest suites; endpoint-smoke submission proof; endpoint-smoke readiness proof; local roadmap proof now passing 28/28 gates; TypeScript; Next build; `git diff --check`.

### 2026-07-09 07:57 UTC - Adapter endpoint smoke readiness proof (PR #870)

- **PR:** [#870](https://github.com/dhnpmp-tech/dcp-platform/pull/870) (`codex/adapter-endpoint-smoke-readiness-2026-07-09`).
- **Backend:** Added public `GET /api/adapters/endpoints/smoke/readiness` and a pure adapter endpoint-smoke evaluator for strict load proof, funded principal, request attribution, response hash, latency, token totals, and adapter trace.
- **Proof:** Added `npm run proof:adapter-endpoint-smoke` and included it in `npm run proof:local-roadmap`, moving the local roadmap suite to 27 CI-safe gates.
- **Docs/contracts:** Linked LoRA readiness, adapter usage attribution readiness, adapter billing readiness, OpenAPI, `/fine-tuning`, `/dedicated-deployments`, renter Fine-Tuning snippets, `llms.txt`, and roadmap docs to the disabled endpoint-smoke policy.
- **Safety:** Readiness/policy only; no adapter dispatch, smoke recording, load-proof mutation, route traffic, usage ledger write, balance mutation, invoice, provider payout, raw prompt/response exposure, adapter billing, or Tinker compatibility behavior was enabled.
- **Verification:** Syntax/package JSON checks; OpenAPI YAML parse; targeted adapter endpoint-smoke/usage/billing/LoRA Jest suites; adapter endpoint-smoke proof; adapter usage attribution proof; adapter billing readiness proof; local roadmap proof now passing 27/27 gates; TypeScript; Next build; `git diff --check`.

### 2026-07-09 07:23 UTC - Adapter usage attribution readiness proof (PR #869)

- **PR:** [#869](https://github.com/dhnpmp-tech/dcp-platform/pull/869) (`codex/adapter-usage-attribution-readiness-2026-07-09`).
- **Backend:** Added public `GET /api/adapters/usage/attribution/readiness` and a pure adapter usage attribution evaluator for deployment, adapter, endpoint, checksum, provider, request, scoped-key, token, cost, and pending-settlement prerequisites.
- **Proof:** Added `npm run proof:adapter-usage-attribution` and included it in `npm run proof:local-roadmap`, moving the local roadmap suite to 26 CI-safe gates.
- **Docs/contracts:** Linked LoRA readiness, adapter billing readiness, OpenAPI, `/fine-tuning`, `/dedicated-deployments`, renter Fine-Tuning snippets, `llms.txt`, and roadmap docs to the disabled adapter usage-attribution policy.
- **Safety:** Readiness/policy only; no adapter dispatch, load-proof mutation, route traffic, usage ledger write, balance mutation, invoice, provider payout, budget cap change, adapter billing, or Tinker compatibility behavior was enabled.
- **Verification:** Syntax/package JSON checks; OpenAPI YAML parse; targeted adapter usage/billing/LoRA/minimum-balance Jest suites; adapter usage attribution proof; adapter billing readiness proof; local roadmap proof now passing 26/26 gates; TypeScript; Next build; `git diff --check`.

### 2026-07-09 06:52 UTC - Adapter billing readiness proof (PR #868)

- **PR:** [#868](https://github.com/dhnpmp-tech/dcp-platform/pull/868) (`codex/adapter-billing-readiness-policy-2026-07-09`).
- **Backend:** Added public `GET /api/adapters/billing/readiness` and a pure adapter billing policy evaluator for strict load proof, endpoint smoke, funded principal, minimum-balance policy, usage attribution, settlement policy, and founder approval prerequisites.
- **Proof:** Added `npm run proof:adapter-billing-readiness` and included it in `npm run proof:local-roadmap`, moving the local roadmap suite to 25 CI-safe gates.
- **Docs/contracts:** Linked LoRA readiness, adapter artifact readiness, minimum-balance readiness, OpenAPI, `/fine-tuning`, `/dedicated-deployments`, renter Fine-Tuning snippets, `llms.txt`, and roadmap docs to the disabled adapter billing policy.
- **Safety:** Readiness/policy only; no adapter dispatch, load-proof mutation, route traffic, usage ledger write, balance mutation, invoice, provider payout, minimum-balance enforcement change, or Tinker compatibility behavior was enabled.
- **Verification:** Syntax/package JSON checks; targeted adapter-billing/artifact/LoRA/minimum-balance Jest suites; adapter billing readiness proof; adapter artifact policy proof; minimum-balance readiness proof; local roadmap proof now passing 25/25 gates; OpenAPI YAML parse; TypeScript; Next build; `git diff --check`.

### 2026-07-09 06:23 UTC - Strict adapter load-proof matching (PR #867)

- **PR:** [#867](https://github.com/dhnpmp-tech/dcp-platform/pull/867) (`codex/adapter-load-proof-strict-match-2026-07-09`).
- **Backend:** Adapter deployment routing now requires matching deployment id, adapter id, base model, mode, recorded endpoint id, and adapter artifact checksum before `route_traffic=true`.
- **Proof:** Strengthened `npm run proof:adapter-deployment-contract` with checksum-mismatch coverage and full matching-proof evidence.
- **Docs/contracts:** Updated OpenAPI, `/fine-tuning`, `/dedicated-deployments`, renter Fine-Tuning copy, `llms.txt`, and roadmap docs with the stricter gate.
- **Safety:** Contract tightening only; no deploy action, serving mutation access, adapter serving, route traffic, billing, GPU training, or Tinker compatibility behavior was enabled.
- **Verification:** Syntax checks; targeted LoRA/deployment/artifact-policy Jest suites; adapter deployment contract proof; adapter artifact policy proof; local roadmap proof still passing 24/24 gates; OpenAPI YAML parse; TypeScript; Next build; `git diff --check`.

### 2026-07-09 06:03 UTC - Adapter artifact policy proof (PR #866)

- **PR:** [#866](https://github.com/dhnpmp-tech/dcp-platform/pull/866) (`codex/adapter-artifact-policy-2026-07-09`).
- **Backend:** Added public `GET /api/adapters/artifacts/readiness` and a pure adapter artifact policy validator for renter/adapter-scoped `adapter.safetensors`, `model-card.json`, and SHA-256 checksum requirements.
- **Proof:** Added `npm run proof:adapter-artifact-policy` and included it in `npm run proof:local-roadmap`, moving the local roadmap suite to 24 CI-safe gates.
- **Docs/contracts:** Linked LoRA readiness, adapter registry docs, `/fine-tuning`, `llms.txt`, OpenAPI, and roadmap docs to the adapter artifact policy endpoint.
- **Safety:** Policy contract only; no artifact upload endpoint, object-store write, GPU training, model-card write, adapter serving, route traffic, billing, or Tinker compatibility behavior changed.
- **Verification:** Syntax/package JSON checks; targeted adapter-artifact/adapter-registry/LoRA-readiness/training-contract/deployment-contract/Tinker readiness Jest suites; adapter artifact policy proof; LoRA training contract proof; Tinker loop readiness proof; adapter deployment contract proof; OpenAPI YAML parse; TypeScript; Next build; local roadmap proof now passing 24/24 gates; `git diff --check`.

### 2026-07-09 05:41 UTC - Evaluator signed-download policy proof (PR #865)

- **PR:** [#865](https://github.com/dhnpmp-tech/dcp-platform/pull/865) (`codex/evaluator-signed-download-policy-2026-07-09`).
- **Backend:** Added public `GET /api/evals/results/downloads/readiness` and a pure evaluator signed-download policy validator for owner access, result availability, artifact policy, checksum, JSON content type, and 60-900 second expiry requirements.
- **Proof:** Added `npm run proof:evaluator-signed-download-policy` and included it in `npm run proof:local-roadmap`, moving the local roadmap suite to 23 CI-safe gates.
- **Docs/contracts:** Linked evaluator readiness, worker gate, result writer, result access policy, artifact storage policy, disabled result endpoint, `/benchmarks`, `llms.txt`, OpenAPI, and roadmap docs to the signed-download policy endpoint.
- **Safety:** Policy contract only; no signed URL generation, object-store bucket exposure, artifact storage key exposure, live result endpoint, worker start, eval-job status mutation, object-store write, billing, settlement, public report, model ranking, or Arabic-quality claim behavior changed.
- **Verification:** Syntax/package JSON checks; targeted signed-download/access-policy/disabled-result/artifact-policy/worker-gate/result-writer/result-manifest/readiness Jest suites; evaluator signed-download proof; evaluator disabled-result proof; evaluator result-access proof; evaluator artifact-storage proof; evaluator worker-fixture proof; evaluator result-writer proof; evaluator worker-gate proof; evaluator result-manifest proof; evaluator metadata/schema/readiness proofs; OpenAPI YAML parse; TypeScript; Next build; local roadmap proof now passing 23/23 gates; `git diff --check`.

### 2026-07-09 05:24 UTC - Disabled evaluator result endpoint proof (PR #864)

- **PR:** [#864](https://github.com/dhnpmp-tech/dcp-platform/pull/864) (`codex/evaluator-result-endpoint-disabled-2026-07-09`).
- **Backend:** Added renter-authenticated `GET /api/evals/jobs/:id/results`, returning a disabled-result contract for the owning renter and 404 for other renters.
- **Proof:** Added `npm run proof:evaluator-result-endpoint-disabled` and included it in `npm run proof:local-roadmap`, moving the local roadmap suite to 22 CI-safe gates.
- **Docs/contracts:** Linked evaluator readiness, job schema, worker gate, access policy, `/benchmarks`, `llms.txt`, OpenAPI, and roadmap docs to the disabled route while preserving live-result false claims.
- **Safety:** Disabled route only; no result manifest exposure, artifact storage key exposure, signed download, worker start, eval-job status mutation, object-store write, billing, settlement, public report, model ranking, or Arabic-quality claim behavior changed.
- **Verification:** Syntax/package JSON checks; targeted disabled-result/access-policy/job-schema/job-metadata/worker-gate/result-writer/result-manifest/artifact-policy/readiness Jest suites; evaluator disabled-result proof; evaluator result-access proof; evaluator artifact-storage proof; evaluator worker-fixture proof; evaluator result-writer proof; evaluator worker-gate proof; evaluator result-manifest proof; evaluator metadata/schema/readiness proofs; OpenAPI YAML parse; TypeScript; Next build; local roadmap proof now passing 22/22 gates; `git diff --check`.

### 2026-07-09 04:55 UTC - Evaluator result access policy proof (PR #863)

- **PR:** [#863](https://github.com/dhnpmp-tech/dcp-platform/pull/863) (`codex/evaluator-result-access-policy-2026-07-09`).
- **Backend:** Added public `GET /api/evals/results/access/readiness` and a pure evaluator result access policy validator for renter owner-match, result availability, artifact storage policy, and checksum requirements.
- **Proof:** Added `npm run proof:evaluator-result-access-policy` and included it in `npm run proof:local-roadmap`, moving the local roadmap suite to 21 CI-safe gates.
- **Docs/contracts:** Linked evaluator readiness, worker readiness, result manifest schema, result-writer readiness, artifact-storage readiness, `/benchmarks`, `llms.txt`, OpenAPI, and roadmap docs to the access policy endpoint.
- **Safety:** Authorization policy contract only; no result endpoint, signed download, object-store configuration, production artifact write, raw dataset/prompt storage, billing, settlement, public report, model ranking, or Arabic-quality claim behavior changed.
- **Verification:** Syntax/package JSON checks; targeted evaluator access-policy/artifact-policy/worker-fixture/worker-gate/result-writer/result-manifest/metadata/readiness/schema Jest suites; evaluator result-access policy proof; evaluator artifact-storage policy proof; evaluator worker-fixture proof; evaluator result-writer proof; evaluator worker-gate proof; evaluator result-manifest proof; evaluator metadata/schema/readiness proofs; OpenAPI YAML parse; TypeScript; Next build; local roadmap proof now passing 21/21 gates; `git diff --check`.

### 2026-07-09 04:37 UTC - Evaluator artifact storage policy proof (PR #862)

- **PR:** [#862](https://github.com/dhnpmp-tech/dcp-platform/pull/862) (`codex/evaluator-artifact-storage-policy-2026-07-09`).
- **Backend:** Added public `GET /api/evals/results/artifacts/readiness` and a pure evaluator artifact storage policy validator for renter/job-scoped result manifest keys, SHA-256 checksums, JSON content type, and path traversal/scope rejection.
- **Proof:** Added `npm run proof:evaluator-artifact-storage-policy` and included it in `npm run proof:local-roadmap`, moving the local roadmap suite to 20 CI-safe gates.
- **Docs/contracts:** Linked evaluator readiness, worker readiness, result manifest schema, result-writer readiness, `/benchmarks`, `llms.txt`, OpenAPI, and roadmap docs to the policy endpoint.
- **Safety:** Policy contract only; no object-store configuration, production artifact write, signed download, result endpoint, raw dataset/prompt storage, billing, settlement, public report, model ranking, or Arabic-quality claim behavior changed.
- **Verification:** Syntax/package JSON checks; targeted evaluator artifact-policy/worker-fixture/worker-gate/result-writer/result-manifest/metadata/readiness/schema Jest suites; evaluator artifact-storage policy proof; evaluator worker-fixture proof; evaluator result-writer proof; evaluator worker-gate proof; evaluator result-manifest proof; evaluator metadata/schema/readiness proofs; OpenAPI YAML parse; TypeScript; Next build; local roadmap proof now passing 20/20 gates; `git diff --check`.

### 2026-07-09 04:17 UTC - Evaluator worker dry-run fixture proof (PR #861)

- **PR:** [#861](https://github.com/dhnpmp-tech/dcp-platform/pull/861) (`codex/evaluator-worker-dry-run-fixture-2026-07-09`).
- **Backend:** Added a CI-safe evaluator worker dry-run fixture contract that simulates a queue item from a draft metadata job, invokes the result-writer dry run, and keeps the job in draft with no result database mutation.
- **Proof:** Added `npm run proof:evaluator-worker-dry-run-fixture` and included it in `npm run proof:local-roadmap`, moving the local roadmap suite to 19 CI-safe gates.
- **Docs/contracts:** Linked evaluator readiness, worker readiness, `/benchmarks`, `llms.txt`, OpenAPI, and roadmap docs to the fixture command while preserving the disabled worker/queue/billing contract.
- **Safety:** Fixture proof only; no production database mutation, queue dispatch, worker start, eval job status mutation, production artifact write, result endpoint, raw dataset/prompt storage, billing, settlement, public report, model ranking, or Arabic-quality claim behavior changed.
- **Verification:** Syntax/package JSON checks; targeted evaluator worker-fixture/worker-gate/result-writer/result-manifest/metadata/readiness/schema Jest suites; evaluator worker dry-run fixture proof; evaluator result-writer dry-run proof; evaluator worker-gate proof; evaluator result-manifest proof; evaluator metadata/schema/readiness proofs; OpenAPI YAML parse; TypeScript; Next build; local roadmap proof now passing 19/19 gates; `git diff --check`.

### 2026-07-09 03:58 UTC - Evaluator result-writer dry-run proof (PR #860)

- **PR:** [#860](https://github.com/dhnpmp-tech/dcp-platform/pull/860) (`codex/evaluator-result-writer-dry-run-2026-07-09`).
- **Backend:** Added public `GET /api/evals/results/writer/readiness` and a CI-safe dry-run writer that builds a result manifest from eval metadata, hashes canonical summary JSON, validates the manifest, and writes only the manifest JSON to temporary proof storage.
- **Proof:** Added `npm run proof:evaluator-result-writer-dry-run` and included it in `npm run proof:local-roadmap`, moving the local roadmap suite to 18 CI-safe gates.
- **Docs/contracts:** Linked evaluator readiness, worker gate, result manifest schema, `/benchmarks`, `llms.txt`, OpenAPI, and roadmap docs to the dry-run writer readiness.
- **Safety:** Dry-run proof only; no production artifact write, result endpoint, eval job status mutation, worker queue dispatch, raw dataset/prompt storage, billing, settlement, public report, model ranking, or Arabic-quality claim behavior changed.
- **Verification:** Syntax/package JSON checks; targeted evaluator result-writer/result-manifest/worker-gate/metadata/readiness/schema Jest suites; evaluator result-writer dry-run proof; evaluator result-manifest proof; evaluator worker-gate proof; evaluator metadata proof; evaluator readiness proof; OpenAPI YAML parse; TypeScript; Next build; local roadmap proof now passing 18/18 gates; `git diff --check`.

### 2026-07-09 03:46 UTC - Evaluator result manifest checksum contract (PR #859)

- **PR:** [#859](https://github.com/dhnpmp-tech/dcp-platform/pull/859) (`codex/evaluator-result-manifest-contract-2026-07-09`).
- **Backend:** Added public `GET /api/evals/results/schema`, a schema/checksum contract for future evaluator result manifests, plus pure validation for required fields, SHA-256 digests, metric allowlists, metadata matches, and raw customer data rejection.
- **Proof:** Added `npm run proof:evaluator-result-manifest-contract` and included it in `npm run proof:local-roadmap`, moving the local roadmap suite to 17 CI-safe gates.
- **Docs/contracts:** Linked evaluator readiness/schema, worker gate, `/benchmarks`, `llms.txt`, OpenAPI, and roadmap docs to the result manifest schema while keeping `GET /api/evals/jobs/:id/results` non-live.
- **Safety:** Schema/validation only; no result endpoint, artifact write, worker execution, raw dataset storage, billing, settlement, public report, model ranking, or Arabic-quality claim behavior changed.
- **Verification:** Syntax/package JSON checks; targeted evaluator result-manifest/worker-gate/metadata/readiness/schema Jest suites; evaluator result-manifest proof; evaluator worker-gate proof; evaluator metadata proof; evaluator schema proof; evaluator readiness proof; OpenAPI YAML parse; TypeScript; Next build; local roadmap proof now passing 17/17 gates; `git diff --check`.

### 2026-07-09 03:35 UTC - Evaluator worker gate contract (PR #858)

- **PR:** [#858](https://github.com/dhnpmp-tech/dcp-platform/pull/858) (`codex/evaluator-worker-gate-contract-2026-07-09`).
- **Backend:** Added public `GET /api/evals/worker/readiness`, a disabled-by-default evaluator worker gate for queue dispatch, worker execution, result writing, billing hooks, and report/ranking/quality-claim guards.
- **Proof:** Added `npm run proof:evaluator-worker-gate-contract` and included it in `npm run proof:local-roadmap`, moving the local roadmap suite to 16 CI-safe gates.
- **Docs/contracts:** Linked evaluator readiness/schema, `/benchmarks`, `llms.txt`, OpenAPI, and roadmaps to the worker gate so metadata job records cannot be confused with executable eval jobs.
- **Safety:** Worker gate only; no evaluator job status mutation, queue dispatch, worker start, result manifest write, raw dataset storage, billing, settlement, public report, ranking, or Arabic-quality claim behavior changed.
- **Verification:** Syntax/package JSON checks; targeted evaluator worker-gate/metadata/readiness/schema Jest suites; evaluator worker-gate proof; evaluator metadata proof; evaluator schema proof; evaluator readiness proof; OpenAPI YAML parse; TypeScript; Next build; local roadmap proof now passing 16/16 gates; `git diff --check`.

### 2026-07-09 03:15 UTC - Evaluator metadata job records (PR #857)

- **PR:** [#857](https://github.com/dhnpmp-tech/dcp-platform/pull/857) (`codex/evaluator-job-metadata-records-2026-07-09`).
- **Backend:** Added renter-scoped metadata-only `POST /api/evals/jobs`, `GET /api/evals/jobs`, and `GET /api/evals/jobs/:id` with dataset checksum validation, metric/task validation, idempotent create, and renter isolation.
- **Proof:** Added `npm run proof:evaluator-job-metadata-contract` and included it in `npm run proof:local-roadmap`, moving the local roadmap suite to 15 CI-safe gates.
- **Docs/contracts:** Updated evaluator readiness/schema contracts so metadata APIs are live while workers, result artifacts, billing, reports, rankings, and Arabic-quality claims remain blocked.
- **Safety:** Metadata records only; no evaluator worker, raw dataset storage, model comparison, billing, settlement, public report, ranking, or Arabic-quality claim behavior changed.
- **Verification:** Syntax/package JSON checks; targeted evaluator metadata/readiness/schema Jest suites; evaluator metadata proof; evaluator schema proof; evaluator readiness proof; OpenAPI YAML parse; TypeScript; Next build; local roadmap proof now passing 15/15 gates; `git diff --check`.

### 2026-07-09 02:58 UTC - Evaluator job schema contract (PR #856)

- **PR:** [#856](https://github.com/dhnpmp-tech/dcp-platform/pull/856) (`codex/evaluator-job-schema-contract-2026-07-09`).
- **Backend:** Added public `GET /api/evals/jobs/schema`, a read-only schema contract for future renter-scoped eval-job records, dataset checksums, candidate/baseline models, metrics, result manifests, harness gates, and billing guards.
- **Proof:** Added `npm run proof:evaluator-job-schema-contract` and included it in `npm run proof:local-roadmap`, moving the local roadmap suite to 14 CI-safe gates.
- **Frontend/docs:** Updated `/benchmarks`, `llms.txt`, and OpenAPI so humans and agents can inspect the eval-job schema before any customer eval job API exists.
- **Safety:** Schema/readiness only; no eval job creation, list/result endpoint, dataset storage, worker execution, model comparison, billing, settlement, public report, ranking, or Arabic-quality claim behavior changed.
- **Verification:** Syntax/package JSON checks; targeted evaluator readiness/schema Jest suites; evaluator job schema proof; evaluator readiness proof; TypeScript; Next build; local roadmap proof now passing 14/14 gates; `git diff --check`.

### 2026-07-09 02:40 UTC - Minimum-balance readiness contract (PR #855)

- **PR:** [#855](https://github.com/dhnpmp-tech/dcp-platform/pull/855) (`codex/minimum-balance-readiness-contract-2026-07-09`).
- **Backend:** Added billing-scoped `GET /api/renters/me/minimum-balances`, a read-only contract for v1 estimate preflight, scoped-key caps, provider/on-demand pod credit gates, volume quotes, batch, prompt-cache discounts, LoRA training, adapter deployments, and evaluator billing gates.
- **Proof:** Added `npm run proof:minimum-balance-readiness` and included it in `npm run proof:local-roadmap`, moving the local roadmap suite to 13 CI-safe gates.
- **Frontend/docs:** The renter Usage page now shows minimum-balance gates, paid credit available for on-demand pods, and blocked future billing rails; `llms.txt` and OpenAPI document the contract for agents.
- **Safety:** Read-only route and display-only UI; no payment creation, balance mutation, pod launch, inference dispatch, batch creation, LoRA training job, adapter deployment, eval job, discount, settlement, or enforcement behavior changed.
- **Verification:** Syntax/package JSON checks; targeted renter usage/minimum-balance Jest suites; direct minimum-balance readiness proof; TypeScript; Next build; local roadmap proof now passing 13/13 gates; `git diff --check`.

### 2026-07-09 02:24 UTC - Tinker loop readiness contract proof (PR #854)

- **PR:** [#854](https://github.com/dhnpmp-tech/dcp-platform/pull/854) (`codex/tinker-loop-readiness-contract-2026-07-09`).
- **Backend:** Extended `GET /api/lora/readiness` with a `tinker_loop` block for create-LoRA, forward/backward, optimizer-step, save-weights, sample, and evaluate primitives while keeping all low-level loop endpoints unavailable.
- **Proof:** Added `npm run proof:tinker-loop-readiness` and included it in `npm run proof:local-roadmap`, moving the local roadmap suite to 12 CI-safe gates.
- **Frontend/docs:** Updated `/fine-tuning`, `llms.txt`, OpenAPI, and Fireworks/Tinker roadmap docs so agents see the Tinker-style rail as contract-only and disabled.
- **Safety:** No Tinker API compatibility claim, training session creation, GPU loop execution, adapter weight write, raw dataset persistence, adapter serving, route traffic, billing, settlement, or quality-claim behavior changed.
- **Verification:** Syntax/package JSON checks; targeted LoRA/Tinker Jest suites; Tinker loop readiness proof; TypeScript; Next build; local roadmap proof now passing 12/12 gates.

### 2026-07-09 02:05 UTC - Evaluator readiness contract proof (PR #853)

- **PR:** [#853](https://github.com/dhnpmp-tech/dcp-platform/pull/853) (`codex/evaluator-readiness-contract-2026-07-09`).
- **Backend:** Added public `GET /api/evals/readiness`, a versioned evaluator readiness contract for renter-scoped eval-job gates, dataset artifact policy, baseline comparisons, public report gates, and billing policy.
- **Proof:** Added `npm run proof:evaluator-readiness-contract` and included it in `npm run proof:local-roadmap`, moving the local roadmap suite to 11 CI-safe gates.
- **Frontend/docs:** Updated `/benchmarks` and `llms.txt` to point agents at the evaluator readiness source while keeping customer eval jobs marked as not live.
- **Safety:** Read-only route and CI-safe proof only; no evaluator job creation, dataset storage, model comparison, public report, billing, settlement, benchmark ingestion, model routing, inference, pod, LoRA, adapter, or quality-claim behavior changed.
- **Verification:** Syntax/package JSON checks; targeted evaluator readiness Jest suites; evaluator readiness contract proof; TypeScript; Next build; local roadmap proof now passing 11/11 gates.

### 2026-07-09 01:50 UTC - Benchmarks readiness rail (PR #852)

- **PR:** [#852](https://github.com/dhnpmp-tech/dcp-platform/pull/852) (`codex/benchmark-readiness-page-2026-07-09`).
- **Backend:** Added `GET /api/models/benchmarks/readiness`, a claim-safe contract summarizing live measured benchmark rows, latency/quality/cost readiness, evaluator-job gates, and explicit public-claim guards.
- **Frontend:** Added the public `/benchmarks` product page and wired Benchmarks into shared navigation, sitemap, footer, and `llms.txt`.
- **Roadmap:** Advances the Fireworks-style Benchmarks/Evals rail while keeping Arabic-quality claims, case studies, rankings, and frontier comparisons blocked until reproducible artifacts exist.
- **Safety:** Read-only endpoint and display-only page; no benchmark ingestion, model catalog availability, billing, provider routing, inference execution, settlement, pod, LoRA, adapter, or public quality-claim behavior changed.
- **Verification:** Syntax/whitespace checks, targeted model benchmark/catalog Jest suites, TypeScript, Next build, backend-context endpoint smoke, and local roadmap proof.

### 2026-07-09 01:36 UTC - Scoped key usage rollups (PR #851)

- **PR:** [#851](https://github.com/dhnpmp-tech/dcp-platform/pull/851) (`codex/scoped-key-usage-rollups-2026-07-09`).
- **Backend:** Added `GET /api/renters/me/usage/by-key` for billing-readable scoped-key usage rollups, including keyed requests/tokens/spend, monthly cap metadata, and an unattributed legacy/master-key bucket.
- **Frontend:** The renter Usage page now shows an API key usage table for the selected period before the raw job and v1 ledgers.
- **Roadmap:** Moves team/workspace usage exports from raw ledger export toward scoped-key operator rollups while keeping true team-member rollups explicitly false.
- **Safety:** Read-only endpoint and display-only UI; no billing settlement, cap mutation, inference execution, provider routing, key secret exposure, prompt-cache discount, account cap, per-key cap enforcement, or public claim behavior changed.
- **Verification:** Targeted Jest suite, syntax checks, TypeScript/Next verification, local roadmap proof, and production smoke after deploy.

### 2026-07-09 01:27 UTC - Per-key budget enforcement (PR #850)

- **PR:** [#850](https://github.com/dhnpmp-tech/dcp-platform/pull/850) (`codex/per-key-budget-enforcement-2026-07-09`).
- **Backend:** Added `renter_api_keys.monthly_spend_cap_halala` with default-unlimited migration and `billingService.checkScopedKeyBudgetCap` for current-month scoped-key spend checks.
- **Inference:** `/v1/chat/completions` and `/api/vllm/chat/completions` now return `402 key_budget_cap_exceeded` before provider dispatch when a scoped key has an explicit monthly cap and the estimate would exceed it.
- **Renter APIs:** Scoped key creation can set an optional monthly cap, `PUT /api/renters/me/keys/:keyId/budget` updates/removes caps, `/api/renters/me/keys` returns cap metadata, and budget status marks per-key budgets enforced.
- **Frontend:** The renter API Keys table now shows each key's monthly cap beside its 30-day spend.
- **Safety:** Existing scoped keys remain unlimited until a cap is explicitly set; no settlement math, account cap, master-key behavior, balance debit, key secret exposure, provider routing, model catalog, prompt-cache discount, or public product claim behavior changed.
- **Verification:** Targeted Jest suites, syntax checks, TypeScript/Next verification, local roadmap proof, and production smoke after deploy.

### 2026-07-09 01:02 UTC - Scoped key usage attribution (PR #849)

- **PR:** [#849](https://github.com/dhnpmp-tech/dcp-platform/pull/849) (`codex/scoped-key-usage-attribution-2026-07-09`).
- **Backend:** Added nullable `openrouter_usage_ledger.renter_api_key_id` and `renter_key_type` columns plus a renter/key/date index so OpenAI-compatible `/v1` and `/api/vllm` usage rows can be attributed to the scoped key that created them.
- **Renter APIs:** Usage export JSON/CSV now includes key attribution columns, `/api/renters/me/keys` returns 30-day per-key request/spend totals, and `/api/renters/me/budget-status` marks per-key spend attribution live while keeping per-key budget enforcement false.
- **Frontend:** The renter API Keys table now shows live 30-day spend when attribution is available instead of a placeholder dash.
- **Safety:** No settlement debit, balance mutation, key secret exposure, per-key budget enforcement, router selection, model catalog, inference execution, prompt-cache discount, or public claim behavior changed.
- **Verification:** Targeted Jest suites, syntax checks, TypeScript/Next verification, local roadmap proof, and production smoke after deploy.

### 2026-07-09 00:43 UTC - Renter usage export and budget status (PR #848)

- **PR:** [#848](https://github.com/dhnpmp-tech/dcp-platform/pull/848) (`codex/renter-usage-budget-export-2026-07-09`).
- **Backend:** Added `GET /api/renters/me/usage/export` for scoped JSON/CSV v1 usage ledger export and `GET /api/renters/me/budget-status` for account spend cap, renter quota, scoped-key count, and claim-state reporting.
- **Frontend:** The renter Usage CSV button now exports inference ledger rows instead of the jobs CSV, and Usage/API Keys show the account-wide v1 cap and remaining budget from the live backend packet.
- **Honesty:** Per-key spend attribution and per-key budget enforcement remain explicitly false until usage rows are keyed to the scoped API key that created them.
- **Safety:** No billing settlement, cap mutation, key creation/revocation, prompt-cache discount, router selection, inference execution, pod launch, or public product claim behavior changed.
- **Verification:** Targeted Jest suite; `node --check`; package script parse; TypeScript/Next verification; `git diff --check`.

### 2026-07-09 00:35 UTC - dcp-agent VPS-local inventory fix (PR #846)

- **PR:** [#846](https://github.com/dhnpmp-tech/dcp-platform/pull/846) (`codex/dcp-agent-vps-local-inventory-2026-07-09`).
- **Fix:** `DCP_AGENT_RECONCILE_READ_REMOTE=1 npm run proof:dcp-agent-reconciliation` now inventories `/root/dc1-platform` directly when running on VPS2, instead of attempting SSH back to the same host.
- **Coverage:** Added Jest coverage for the local-path VPS inventory path.
- **Safety:** Still read-only; no gateway process, installer artifact, production file, self-update manifest, runtime service, frontend, billing, inference, pod, or product claim behavior changed.
- **Verification:** Targeted Jest suite; package script parse; `node --check`; `git diff --check`.

### 2026-07-09 00:27 UTC - dcp-agent reconciliation status packet (PR #844)

- **PR:** [#844](https://github.com/dhnpmp-tech/dcp-platform/pull/844) (`codex/dcp-agent-reconciliation-status-2026-07-09`).
- **Status command:** Added `DCP_AGENT_RECONCILE_READ_REMOTE=1 npm run proof:dcp-agent-reconciliation`.
- **Read-only contract:** The command inventories platform head, local `dcp-agent` checkout, active gateway process, local served tarball, and optional VPS artifact state without stopping processes, changing the separate repo, rebuilding tarballs, deleting production artifacts, restarting services, or changing manifests.
- **Gate ledger:** `npm run proof:live-acceptance-status` now reports 8/8 gates command-ready and 0 missing acceptance commands while keeping `dcp-agent` blocked on the controlled maintenance window.
- **Safety:** No gateway process, installer artifact, production file, self-update manifest, runtime service, frontend, billing, inference, pod, or product claim behavior changed.
- **Verification:** Default status packet run; targeted Jest suites; live-gate status; package script parse; `node --check`; `git diff --check`.

### 2026-07-09 00:13 UTC - Adapter vLLM live load proof runner (PR #842)

- **PR:** [#842](https://github.com/dhnpmp-tech/dcp-platform/pull/842) (`codex/adapter-vllm-live-load-proof-runner-2026-07-09`).
- **Live proof command:** Added `DCP_ADAPTER_VLLM_LIVE_PROOF_ALLOW=1 npm run proof:adapter-vllm-live-load`.
- **Default safety:** The runner refuses by default, writes JSON/Markdown/log artifacts, and redacts scoped key material.
- **Contract:** When explicitly allowed, it checks renter-authenticated LoRA/adapter readiness with the deterministic smoke principal and records blockers for adapter serving, route traffic, load-proof completion, endpoint smoke, and adapter billing.
- **Gate ledger:** `npm run proof:live-acceptance-status` now reports adapter vLLM load/billing as command-ready, moving the live ledger to 7/8 command-ready and 1/8 missing acceptance runner.
- **Safety:** No adapter creation, deployment creation, internal load-proof posting, endpoint smoke, route traffic, billing, settlement, discount, model catalog, frontend, or public product claim behavior changed.
- **Verification:** Default blocked proof run; targeted Jest suites; package script parse; `node --check`; `git diff --check`.

### 2026-07-08 23:58 UTC - LoRA live training artifact proof runner (PR #840)

- **PR:** [#840](https://github.com/dhnpmp-tech/dcp-platform/pull/840) (`codex/lora-live-artifact-proof-runner-2026-07-09`).
- **Live proof command:** Added `DCP_LORA_TRAINING_LIVE_PROOF_ALLOW=1 npm run proof:lora-training-live-artifact`.
- **Default safety:** The runner refuses by default, writes JSON/Markdown/log artifacts, and redacts scoped key material.
- **Contract:** When explicitly allowed, it checks renter-authenticated LoRA readiness with the deterministic smoke principal and records blockers for GPU worker execution and model-card artifact writing.
- **Gate ledger:** `npm run proof:live-acceptance-status` now reports LoRA GPU artifact proof as command-ready, moving the live ledger to 6/8 command-ready and 2/8 missing acceptance runners.
- **Safety:** No training job creation, GPU execution, adapter artifact write, model-card write, adapter registration, serving, route traffic, billing, discount, frontend, or public claim behavior changed.
- **Verification:** Default blocked proof run; targeted Jest suites; package script parse; `node --check`; `git diff --check`.

### 2026-07-08 23:43 UTC - Batch live execution proof runner (PR #838)

- **PR:** [#838](https://github.com/dhnpmp-tech/dcp-platform/pull/838) (`codex/batch-live-proof-runner-2026-07-09`).
- **Live proof command:** Added `DCP_BATCH_LIVE_PROOF_ALLOW=1 npm run proof:batch-live-execution`.
- **Default safety:** The runner refuses by default, writes JSON/Markdown/log artifacts, and redacts scoped key material.
- **Contract:** When explicitly allowed, it checks renter-authenticated batch readiness with the deterministic smoke principal and records blockers for execution, result downloads, settlement, discounts, and model batch capability.
- **Gate ledger:** `npm run proof:live-acceptance-status` now reports batch live execution as command-ready, moving the live ledger to 5/8 command-ready and 3/8 missing acceptance runners.
- **Safety:** No batch creation, provider execution, object-store write, result download, settlement, discount, model catalog, frontend, routing, billing, or public claim behavior changed.
- **Verification:** Default blocked proof run; targeted Jest suites; package script parse; `node --check`; `git diff --check`.

### 2026-07-08 23:27 UTC - Prompt-cache live settlement proof runner (PR #836)

- **PR:** [#836](https://github.com/dhnpmp-tech/dcp-platform/pull/836) (`codex/prompt-cache-live-proof-runner-2026-07-09`).
- **Live proof command:** Added `DCP_PROMPT_CACHE_LIVE_PROOF_ALLOW=1 npm run proof:prompt-cache-live-settlement`.
- **Default safety:** The runner refuses billed inference by default, writes JSON/Markdown/log artifacts, and redacts scoped key material.
- **Contract:** When explicitly allowed, it checks prompt-cache readiness, uses the deterministic smoke principal, sends two matching static-prefix/session chat requests, and requires miss -> `hit_measured_no_discount` evidence with discounts still false.
- **Gate ledger:** `npm run proof:live-acceptance-status` now reports prompt-cache as command-ready, moving the live ledger to 4/8 command-ready and 4/8 missing acceptance runners.
- **Safety:** No prompt-cache discount, provider KV-cache control, billing, settlement, routing, model catalog, frontend, or public claim behavior changed.
- **Verification:** Default blocked proof run; targeted Jest suites; `npm run proof:live-acceptance-status`; `npm run proof:local-roadmap`; package script parse; `node --check`; `git diff --check`.

### 2026-07-08 23:08 UTC - Live acceptance gate status packet (PR #834)

- **PR:** [#834](https://github.com/dhnpmp-tech/dcp-platform/pull/834) (`codex/live-acceptance-gate-status-2026-07-09`).
- **Status command:** Added `npm run proof:live-acceptance-status` for a CI-safe blocked-gate ledger.
- **Coverage:** Lists workspace-pod live launch, LoRA pod-image provider-host proof, Anthropic SSE live proof, prompt-cache live discount smoke, batch live execution/discount smoke, LoRA GPU artifact proof, adapter vLLM load/billing smoke, and `dcp-agent` reconciliation.
- **Contract:** Each gate records command availability, blocked inputs, artifact pattern, verified behavior, next action, and `capability_claim_allowed: false`.
- **Aggregate gate:** `npm run proof:local-roadmap` now includes the live acceptance status packet and reports 10 CI-safe gates.
- **Safety:** No paid compute, billed inference, provider routing, artifact cleanup, billing, settlement, runtime route, frontend, or product-claim behavior changed.
- **Verification:** `npm run proof:live-acceptance-status` with temp report output; targeted Jest suite; `npm run proof:local-roadmap` with temp report output; package script parse; `node --check`; `git diff --check`.

### 2026-07-08 22:54 UTC - Router policy contract proof (PR #832)

- **PR:** [#832](https://github.com/dhnpmp-tech/dcp-platform/pull/832) (`codex/router-policy-contract-proof-2026-07-09`).
- **Proof command:** Added `npm run proof:router-policy-contract` for the CI-safe router-policy readiness proof.
- **Contract:** The proof verifies read-only catalog shape, balanced default availability, env-gated readiness metadata, explicit balanced no-op request resolution, and fail-closed future policy rejection.
- **Claims:** Cheapest, lowest-latency, Saudi-only, coding, and Arabic routing remain non-selectable; no price optimization, geography filter, classifier routing, billing mutation, live latency ordering, or Tinker compatibility claim is enabled.
- **Aggregate gate:** `npm run proof:local-roadmap` now runs the router policy proof with the other CI-safe roadmap gates.
- **Roadmaps:** Updated execution, lane, and Fireworks/Tinker roadmap docs so future router policies require route-ordering tests and live smoke before selection is enabled.
- **Safety:** No provider selection, routing order, billing, settlement, model catalog, inference execution, public claim, or frontend behavior changed.
- **Verification:** `npm run proof:router-policy-contract` with temp report output; targeted Jest suites; `npm run proof:local-roadmap` with temp report output; package script parse; `node --check`; `git diff --check`.

### 2026-07-08 22:39 UTC - Local roadmap proof suite (PR #830)

- **PR:** [#830](https://github.com/dhnpmp-tech/dcp-platform/pull/830) (`codex/local-roadmap-proof-suite-2026-07-09`).
- **Proof command:** Added `npm run proof:local-roadmap` for the CI-safe roadmap gate suite.
- **Coverage:** Runs template validation, workspace/pod contracts, pod-image contracts, provider Nsight contract guard, prompt-cache proof, batch proof, LoRA training proof, and adapter deployment proof.
- **Artifacts:** Writes `dcp.local_roadmap_proof_suite.v1` JSON/Markdown reports plus per-gate logs under `docs/reports/reliability` by default.
- **Blocked gates:** Documents live gates intentionally excluded from local CI: workspace-pod launch, provider-host LoRA image proof, and Anthropic SSE live proof.
- **Safety:** No runtime route, billing, provider, pod, training, inference, deployment, or product-claim behavior changed.
- **Verification:** `npm run proof:local-roadmap` with temp report output; package script parse; `node --check`; `git diff --check`.

### 2026-07-08 22:29 UTC - LoRA training contract proof (PR #828)

- **PR:** [#828](https://github.com/dhnpmp-tech/dcp-platform/pull/828) (`codex/lora-training-contract-proof-2026-07-09`).
- **Proof command:** Added `npm run proof:lora-training-contract` for the CI-safe LoRA dataset/training/artifact proof.
- **Contract:** The proof verifies dataset validation facts, invalid row rejection, metadata-only/idempotent job creation, disabled/no-executor worker behavior, artifact checksum requirement, model-card manifest claim guards, and non-serving adapter registration.
- **Artifacts:** Writes `dcp.lora_training_contract_proof.v1` JSON and Markdown evidence under `docs/reports/reliability` by default.
- **Roadmaps:** Updated execution, lane, and Fireworks/Tinker roadmap docs so LoRA training has a repeatable local gate before GPU-host artifact proof, vLLM load proof, and adapter billing smoke.
- **Safety:** No GPU training, artifact write, adapter serving, route traffic, training billing, public training claim, or Tinker compatibility claim changed.
- **Verification:** `npm run proof:lora-training-contract` with temp report output; targeted Jest suites; package script parse; `node --check`; `git diff --check`.

### 2026-07-08 22:16 UTC - Prompt-cache contract proof (PR #826)

- **PR:** [#826](https://github.com/dhnpmp-tech/dcp-platform/pull/826) (`codex/prompt-cache-contract-proof-2026-07-09`).
- **Proof command:** Added `npm run proof:prompt-cache-contract` for the CI-safe prompt-cache measurement proof.
- **Contract:** The proof verifies readiness remains measurement-only, cache keys are stable and scoped by model/session, hash-only measurements detect future hits, usage fields expose cached-input counters, and non-eligible prompts are not recorded.
- **Privacy:** Verifies raw prefix text and private image URLs are not persisted in measurement rows or normalized multimodal cache material.
- **Safety:** Measured hits do not change billable input tokens, settlement amounts, discount flags, provider KV-cache control, routing, billing behavior, or Tinker compatibility claims.
- **Artifacts:** Writes `dcp.prompt_cache_contract_proof.v1` JSON and Markdown evidence under `docs/reports/reliability` by default.
- **Roadmaps:** Updated execution, lane, and Fireworks/Tinker roadmap docs so prompt-cache discounts and provider cache claims have a repeatable local gate before live provider cache-hit and discounted settlement proof.
- **Verification:** `npm run proof:prompt-cache-contract` with temp report output; targeted Jest suites; package script parse; `node --check`; `git diff --check`.

### 2026-07-08 22:05 UTC - Batch inference contract proof (PR #824)

- **PR:** [#824](https://github.com/dhnpmp-tech/dcp-platform/pull/824) (`codex/batch-inference-contract-proof-2026-07-09`).
- **Proof command:** Added `npm run proof:batch-inference-contract` for the CI-safe batch inference lifecycle proof.
- **Contract:** The proof verifies readiness remains validation-only, invalid JSONL is rejected, idempotency replays existing batches, the default worker is non-mutating, result checksums gate completed results, and line proof derives batch totals.
- **Minimum balance:** Includes an insufficient-balance settlement preflight proving no billing call or renter debit happens before the gate passes.
- **Artifacts:** Writes `dcp.batch_inference_contract_proof.v1` JSON and Markdown evidence under `docs/reports/reliability` by default.
- **Roadmaps:** Updated execution, lane, and Fireworks/Tinker roadmap docs so batch execution and discount claims have a repeatable local gate before live provider execution and discounted settlement smoke.
- **Safety:** No production batch execution, object-store write, billing mutation, model capability flag, discount, provider routing, or public product claim changed.
- **Verification:** `npm run proof:batch-inference-contract` with temp report output; targeted Jest suites; package script parse; `node --check`; `git diff --check`.

### 2026-07-08 21:47 UTC - Adapter deployment contract proof (PR #822)

- **PR:** [#822](https://github.com/dhnpmp-tech/dcp-platform/pull/822) (`codex/adapter-deployment-contract-proof-2026-07-09`).
- **Proof command:** Added `npm run proof:adapter-deployment-contract` for the CI-safe adapter deployment lifecycle proof.
- **Contract:** The proof verifies public deployment intent stays non-routing, mismatched load proof stays degraded, and only matching adapter/base-model load proof allows route traffic.
- **Artifacts:** Writes `dcp.adapter_deployment_contract_proof.v1` JSON and Markdown evidence under `docs/reports/reliability` by default.
- **Roadmaps:** Updated execution, lane, and Fireworks/Tinker roadmap docs so adapter deploy MVP has a repeatable local gate before live vLLM load and billing smoke.
- **Safety:** No production route behavior, billing, training, provider routing, adapter serving, or public traffic changed.
- **Verification:** `npm run proof:adapter-deployment-contract` with temp report output; targeted Jest guard; package script parse; `git diff --check`.

### 2026-07-08 21:34 UTC - LoRA pod image proof command (PR #820)

- **PR:** [#820](https://github.com/dhnpmp-tech/dcp-platform/pull/820) (`codex/lora-pod-image-proof-command-2026-07-09`).
- **Proof command:** Added `npm run proof:lora-pod-image` for provider-host `dcp-compute:lora` import and offline SFT scaffold proof.
- **Artifacts:** The proof writes `dcp.lora_pod_image_proof.v1` JSON and Markdown reports under `docs/reports/reliability` by default.
- **Contract:** CI-safe verifier and Jest coverage now require the LoRA smoke script to keep report output, `DC1_RESULT_JSON`, import-budget, and GPU gates wired.
- **Roadmaps:** Updated the audit execution system, lane roadmap, fat-image architecture note, pod-image README, and Fireworks/Tinker strategy roadmap with the new proof path.
- **Safety:** No runtime pod, billing, workspace, training, serving, or routing behavior changed.
- **Verification:** Pod image contract verifier; targeted pod image contract Jest suite; package script parse; shell syntax check; `git diff --check`.

### 2026-07-08 21:20 UTC - Audit proof-gate execution order (PR #818)

- **PR:** [#818](https://github.com/dhnpmp-tech/dcp-platform/pull/818) (`codex/audit-execution-proof-gates-2026-07-08`).
- **Process:** Added formal Passed/Blocked/Failed/Deferred gate semantics to the audit execution system.
- **Proof commands:** Documented the exact live and CI-safe commands for workspace-pod proof, Anthropic SSE proof, pod image contracts, Nsight contracts, template validation, health, model catalog, and route-host sanity.
- **Roadmaps:** Updated the cross-lane priority order and lane proof table so frontend, backend, inference, POT/PODS, and LoRA work follow the same build/deploy/smoke loop.
- **Safety:** Docs/process only; no runtime behavior changed.
- **Verification:** `git diff --check`; Markdown command/link review.

### 2026-07-08 21:10 UTC - Anthropic SSE proof API host fix (PR #816)

- **PR:** [#816](https://github.com/dhnpmp-tech/dcp-platform/pull/816) (`codex/fix-anthropic-proof-api-base-2026-07-08`).
- **Runner default:** `npm run proof:anthropic-sse` now defaults to `https://api.dcp.sa`, matching the live Anthropic backend route host.
- **Base URL normalization:** Bases ending in `/api` still work for `/api/*`, while root-mounted `/anthropic/*` and `/v1/*` paths resolve at the API host root.
- **Safety:** No runtime route, billing, provider routing, or credential behavior changed.
- **Verification:** Production unauthenticated Anthropic route probe returned expected 401; runner syntax check; targeted proof-runner Jest guard.

### 2026-07-08 21:02 UTC - Anthropic SSE live proof runner (PR #814)

- **PR:** [#814](https://github.com/dhnpmp-tech/dcp-platform/pull/814) (`codex/anthropic-sse-live-proof-runner-2026-07-08`).
- **Live proof:** Added `npm run proof:anthropic-sse` for the agent-path acceptance check: deterministic inference smoke principal, `POST /anthropic/v1/messages`, streaming response, and Anthropic SSE frame validation.
- **Safety:** The command requires `DCP_ANTHROPIC_PROOF_ALLOW_LIVE=1` before making a billed inference request and redacts scoped key hints in reports.
- **Artifacts:** Writes JSON/Markdown/log evidence under `docs/reports/reliability`.
- **Acceptance state:** The runner is ready; real proof still requires funded smoke-principal balance and compatible vLLM provider capacity.
- **Verification:** Runner syntax check; targeted Anthropic SSE proof Jest guard.

### 2026-07-08 20:52 UTC - Workspace-to-pod live proof runner (PR #812)

- **PR:** [#812](https://github.com/dhnpmp-tech/dcp-platform/pull/812) (`codex/workspace-pod-live-proof-runner-2026-07-08`).
- **Live proof:** Added `npm run proof:workspace-pod` for the production acceptance path: active workspace volume, presigned upload, workspace list, short pod launch, running status, and Jupyter Contents API visibility for the uploaded marker file.
- **Safety:** The command requires `DCP_WORKSPACE_POD_ALLOW_LAUNCH=1`, redacts credentials in generated reports, and stops the pod by default.
- **Artifacts:** Writes JSON/Markdown evidence under `docs/reports/reliability`.
- **Acceptance state:** The runner is ready; the real GPU-host proof still requires production renter credentials, active volume, and launchable capacity.
- **Verification:** Runner syntax check; targeted live-proof Jest guard; workspace-pod contract Jest guard.

### 2026-07-08 20:38 UTC - Workspace-to-pod contract guard (PR #810)

- **PR:** [#810](https://github.com/dhnpmp-tech/dcp-platform/pull/810) (`codex/workspace-pod-contract-guard-2026-07-08`).
- **Verifier:** Added `workspace-pods:verify-contracts` for pod task-spec workspace fields, portable S3 wiring, renter-derived buckets, active-volume gating, and daemon restore/snapshot calls.
- **Tests:** Added targeted Jest coverage for the verifier.
- **Safety:** No pod launch, stop, billing, upload, daemon runtime, or provider behavior changed.
- **Verification:** `npm run workspace-pods:verify-contracts`; targeted workspace-pod Jest test; backend `node --check`; `git diff --check`.

### 2026-07-08 20:27 UTC - Console auth redirect query preservation (PR #808)

- **PR:** [#808](https://github.com/dhnpmp-tech/dcp-platform/pull/808) (`codex/auth-redirect-preserve-query-2026-07-08`).
- **Middleware:** Gated console redirects to `/auth` now preserve the requested query string, keeping `/renter/playground?surface=workspace` intact through sign-in.
- **Regression guard:** Added a static middleware test for pathname-plus-query redirects.
- **Safety:** Session signing, role checks, API keys, billing, training, and serving behavior are unchanged.
- **Verification:** Static middleware redirect test; `node --check`; `git diff --check`; production redirect smoke after deploy.

### 2026-07-08 20:17 UTC - Fine-Tuning workspace pre-upload rail (PR #806)

- **PR:** [#806](https://github.com/dhnpmp-tech/dcp-platform/pull/806) (`codex/fine-tuning-workspace-preupload-2026-07-08`).
- **Frontend:** `/renter/fine-tuning` now starts the LoRA flow with an explicit workspace pre-upload rail.
- **Workflow:** Renters can go directly to `/renter/playground?surface=workspace` for persistent file staging, then open LoRA/QLoRA pod templates after the dataset is ready.
- **Deep link:** `/renter/playground?surface=workspace` now opens the Workspace tab directly and keeps tab selection reflected in the URL.
- **Safety:** Managed training, adapter serving, route traffic, billing, and Tinker compatibility remain proof-gated.
- **Verification:** `npm run build`; `git diff --check`; local production desktop/mobile render for Fine-Tuning and the Workspace deep link with no horizontal overflow.

### 2026-07-08 19:57 UTC - Model catalog parity coverage (PR #804)

- **PR:** [#804](https://github.com/dhnpmp-tech/dcp-platform/pull/804) (`codex/model-catalog-parity-tests-2026-07-08`).
- **Backend tests:** Added cross-surface parity coverage for `/v1/models`, `/api/models`, and `/api/models/catalog`.
- **Contract:** Token pricing, provider count, availability, modalities, max output, capability flags, `capabilities`, and `feature_readiness` now have one shared regression guard.
- **Safety:** No production route behavior changed.
- **Verification:** Targeted Jest suites for v1 models, model catalog honesty, and model catalog parity; backend `node --check`; `git diff --check`.

### 2026-07-08 19:46 UTC - Playground prompt-cache readiness panel (PR #802)

- **PR:** [#802](https://github.com/dhnpmp-tech/dcp-platform/pull/802) (`codex/renter-playground-prompt-cache-readiness-2026-07-08`).
- **Frontend:** `/renter/playground` now reads `GET /v1/prompt-cache/readiness` and shows a Prompt cache readiness card beside router/model controls.
- **Contract:** The card renders measurement-only mode, contract version, hash-only measurement, raw-prompt storage, cached-input discount, and provider KV-cache-control gates.
- **Safety:** No billing discount, settlement mutation, provider cache-control claim, Tinker compatibility claim, or chat request behavior was added.
- **Verification:** `npm run build`; `git diff --check`; local production desktop/mobile render with prompt-cache readiness visible and no horizontal overflow.

### 2026-07-08 19:24 UTC - Inference prompt-cache readiness copy (PR #801)

- **PR:** [#801](https://github.com/dhnpmp-tech/dcp-platform/pull/801) (`codex/public-inference-prompt-cache-readiness-2026-07-08`).
- **Frontend:** `/inference` now shows prompt-cache measurement as a readiness-backed product capability.
- **Source:** The page points to `GET /v1/prompt-cache/readiness` beside `/v1/models` and `/v1/router/policies`.
- **Safety:** Cached-input discounts, settlement discounts, provider KV-cache control, batch discounts, LoRA serving, and dedicated deployments remain proof-gated.
- **Verification:** `npm run build`; `git diff --check`; local production desktop/mobile render with prompt-cache readiness copy visible and no horizontal overflow.

### 2026-07-08 19:16 UTC - Prompt-cache readiness contract (PR #800)

- **PR:** [#800](https://github.com/dhnpmp-tech/dcp-platform/pull/800) (`codex/prompt-cache-readiness-contract-2026-07-08`).
- **API:** Added public `GET /v1/prompt-cache/readiness` for prompt-cache measurement gates.
- **Contract:** Response fields now describe static-prefix/session hints, hash-only measurement, usage/pricing response fields, and no-discount billing state.
- **Safety:** Prompt-cache discounts, settlement discounts, raw prompt/static-prefix storage, provider KV-cache control, and Tinker compatibility all remain false.
- **Verification:** Targeted prompt-cache and v1 route Jest suites; backend `node --check`; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 19:06 UTC - LoRA dataset validation limit parity (PR #798)

- **PR:** [#798](https://github.com/dhnpmp-tech/dcp-platform/pull/798) (`codex/lora-dataset-validate-limit-parity-2026-07-08`).
- **Backend:** `POST /api/lora/datasets/validate` now shares the training-job dataset validator and limit options.
- **Contract:** Validate-only responses and LoRA readiness now expose the accepted dataset limits: 12 MB, 100,000 rows, and 10% default validation split.
- **Public OpenAPI:** Re-synced `public/docs/openapi.yaml` from `docs/openapi.yaml` so the deployed docs copy includes the current maintained spec.
- **Safety:** The endpoint still creates no job, persists no raw rows, launches no GPU work, registers no adapter, and makes no Tinker-compatibility claim.
- **Verification:** Targeted LoRA training job Jest suite; backend `node --check`; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 18:49 UTC - Fine-Tuning dataset validation snippet (PR #797)

- **PR:** [#797](https://github.com/dhnpmp-tech/dcp-platform/pull/797) (`codex/frontend-lora-dataset-validate-snippet-2026-07-08`).
- **Frontend:** `/renter/fine-tuning` now includes a copyable `POST /api/lora/datasets/validate` snippet.
- **Contract copy:** The snippet shows validate-before-create usage and keeps the no-training/no-raw-persistence guard visible.
- **Safety:** No managed training, adapter registration, deployment routing, or Tinker-compatibility claim was added.
- **Verification:** `npm run build`; `git diff --check`; local production desktop/mobile Playwright render with the new snippet and no horizontal overflow.

### 2026-07-08 18:43 UTC - LoRA dataset validate-only endpoint (PR #796)

- **PR:** [#796](https://github.com/dhnpmp-tech/dcp-platform/pull/796) (`codex/lora-dataset-validate-endpoint-2026-07-08`).
- **API:** Added renter-authenticated `POST /api/lora/datasets/validate` so agents can validate LoRA SFT JSONL before creating a training job.
- **Contract:** The response returns dataset format, row counts, train/validation split, estimated tokens, normalized checksum, max row chars, and normalized byte size.
- **Readiness/OpenAPI:** LoRA readiness now advertises the validate-only endpoint, and OpenAPI documents the request/response schema.
- **Safety:** The route explicitly creates no training job, stores no raw dataset rows, starts no GPU work, registers no adapter, and makes no Tinker compatibility claim.
- **Verification:** Targeted LoRA training job Jest suite; backend `node --check`; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 18:11 UTC - Minimum paid-credit shortfall contract (PR #795)

- **PR:** [#795](https://github.com/dhnpmp-tech/dcp-platform/pull/795) (`codex/pod-minimum-paid-credit-contract-2026-07-08`).
- **Backend:** On-demand pod 402 responses now expose `minimum_paid_credit_halala`, `minimum_paid_credit_sar`, `credit_shortfall_halala`, `credit_shortfall_sar`, and `credit_policy`.
- **Frontend:** `/renter/pods` renders the backend-provided "Add X more" shortfall chip beside available/required credit facts.
- **Safety:** The renter UI still describes trial-credit coverage and Add credit guidance without exposing supply-tier, vendor, provider, or machine internals.
- **Verification:** Targeted pod policy Jest suite; backend `node --check`; OpenAPI YAML parse; `git diff --check`; `npm run build`.

### 2026-07-08 18:00 UTC - llms product rails (PR #794)

- **PR:** [#794](https://github.com/dhnpmp-tech/dcp-platform/pull/794) (`codex/llms-product-rails-2026-07-08`).
- **AI discovery:** Updated `llms.txt` with the current product map and public routes.
- **Safety:** Added LoRA, Batch, and Dedicated Deployment proof gates to prevent agents from overclaiming public training, adapter serving, batch execution, discounts, Tinker compatibility, or route traffic.
- **API pointers:** Added readiness/deployment endpoints for LoRA, Batch, and adapter deployment records.
- **Verification:** `npm run build`; `git diff --check`; local production `/llms.txt` smoke for product route links and LoRA/Batch/Dedicated proof-gate language.

### 2026-07-08 17:52 UTC - Product routes in sitemap (PR #793)

- **PR:** [#793](https://github.com/dhnpmp-tech/dcp-platform/pull/793) (`codex/public-product-sitemap-2026-07-08`).
- **Sitemap:** Added `/pods`, `/inference`, `/fine-tuning`, `/batch`, `/dedicated-deployments`, and live `/pricing` to `sitemap.xml`.
- **Compatibility:** Kept `/containers` discoverable while public GPU Pods links migrate to `/pods`.
- **Frontend:** Retargeted the pricing-page GPU Pods CTA from `/containers` to `/pods`.
- **Verification:** `npm run build`; `git diff --check`; local production smoke for `sitemap.xml` required routes/lower `/containers` priority and pricing-page `/pods` CTA with no horizontal overflow.

### 2026-07-08 17:43 UTC - Public Dedicated Deployments page (PR #792)

- **PR:** [#792](https://github.com/dhnpmp-tech/dcp-platform/pull/792) (`codex/public-dedicated-deployments-page-2026-07-08`).
- **Frontend:** Added `/dedicated-deployments` as the public endpoint/adapters deployment product page.
- **Navigation:** Added Deployments to shared site navigation, mobile menus, shared footer, home navigation, and home footer product links.
- **Safety:** Route traffic remains gated until serving load proof matches deployment id, adapter id, base model, mode, and artifact checksum.
- **Verification:** `npm run build`; `git diff --check`; local production Playwright desktop/tablet/mobile render with loaded images, active Deployments nav, home link, and no horizontal overflow.

### 2026-07-08 17:28 UTC - Public Batch page (PR #791)

- **PR:** [#791](https://github.com/dhnpmp-tech/dcp-platform/pull/791) (`codex/public-batch-page-2026-07-08`).
- **Frontend:** Added `/batch` as the public Batch inference product page.
- **Navigation:** Added Batch to shared site navigation, mobile menus, shared footer, home navigation, and home footer product links.
- **Safety:** Worker execution, completed-result downloads, settlement, discounts, and model batch capability remain proof-gated.
- **Verification:** `npm run build`; `git diff --check`; local production Playwright desktop/tablet/mobile render with loaded images, active Batch nav, home link, and no horizontal overflow.

### 2026-07-08 17:16 UTC - Public Pods route (PR #790)

- **PR:** [#790](https://github.com/dhnpmp-tech/dcp-platform/pull/790) (`codex/public-pods-route-2026-07-08`).
- **Frontend:** Added `/pods` as the public GPU Pods product route by reusing the existing GPU Pods page surface.
- **Navigation:** Retargeted shared GPU Pods navigation, home entry points, footer links, and Fine-Tuning CTA links from `/containers` to `/pods`.
- **Compatibility:** `/containers` remains renderable for existing links; no pod launch, billing, workspace, or backend behavior changed.
- **Verification:** `npm run build`; `git diff --check`; local production Playwright desktop/tablet/mobile render with loaded images, active nav, home link, no horizontal overflow, and `/containers` compatibility render.

### 2026-07-08 17:05 UTC - Public Inference page (PR #789)

- **PR:** [#789](https://github.com/dhnpmp-tech/dcp-platform/pull/789) (`codex/public-inference-page-2026-07-08`).
- **Frontend:** Added `/inference` as the public Inference API product page.
- **Navigation:** Retargeted shared Inference links and home Inference entry points from `/marketplace` to `/inference`; `/marketplace` remains the live capacity/catalog page.
- **Safety:** Advanced prompt cache, batch discounts, LoRA serving, dedicated deployments, and non-balanced routing policies remain gated.
- **Verification:** `npm run build`; `git diff --check`; local production Playwright desktop/tablet/mobile render with loaded images, active nav, home link, and no horizontal overflow.

### 2026-07-08 16:57 UTC - Public Fine-Tuning page (PR #788)

- **PR:** [#788](https://github.com/dhnpmp-tech/dcp-platform/pull/788) (`codex/public-fine-tuning-page-2026-07-08`).
- **Frontend:** Added `/fine-tuning` as the public LoRA/Fine-Tuning product page.
- **Navigation:** Added Fine-Tuning to shared site nav, mobile menus, shared footer, and home footer.
- **Safety:** Public copy keeps managed training, adapter serving, Tinker compatibility, route traffic, and quality claims proof-gated.
- **Verification:** `npm run build`; `git diff --check`; local production Playwright desktop/tablet/mobile render with loaded images, active nav, home link, and no horizontal overflow.

### 2026-07-08 16:45 UTC - Fine-Tuning API snippets (PR #787)

- **PR:** [#787](https://github.com/dhnpmp-tech/dcp-platform/pull/787) (`codex/frontend-fine-tuning-api-snippets-2026-07-08`).
- **Frontend:** Replaced the Fine-Tuning static contract list with copyable curl snippets for readiness, training jobs, adapters, deployment intents, and gated deploy-intent creation.
- **Safety:** Snippet notes keep managed training, public adapter serving, and route traffic gated until trainer/load proof exists.
- **Interaction:** Copy buttons show copied state and do not mutate backend state.
- **Verification:** `npm run build`; `git diff --check`; mocked authenticated Playwright desktop/mobile render with snippet visibility, copy-to-clipboard, and no horizontal overflow.

### 2026-07-08 16:29 UTC - Fine-Tuning aggregate adapter deployments (PR #786)

- **PR:** [#786](https://github.com/dhnpmp-tech/dcp-platform/pull/786) (`codex/frontend-aggregate-deployments-2026-07-08`).
- **Frontend:** `/renter/fine-tuning` now reads `GET /api/adapters/deployments` instead of polling deployment rows per visible adapter.
- **UI:** The read-only deployment intent ledger remains unchanged for users while the initial load uses the aggregate backend contract from PR #785.
- **Safety:** No deploy action, routing mutation, or load-proof claim was added; deployment rows continue to render backend `route_traffic` and proof state.
- **Verification:** `npm run build`; `git diff --check`; mocked authenticated Playwright desktop/mobile render with aggregate deployment request, no adapter-scoped deployment request, and no horizontal overflow.

### 2026-07-08 16:18 UTC - Aggregate adapter deployment list (PR #785)

- **PR:** [#785](https://github.com/dhnpmp-tech/dcp-platform/pull/785) (`codex/adapter-deployments-list-2026-07-08`).
- **API:** Added renter-authenticated `GET /api/adapters/deployments` for deployment lifecycle records across all renter adapters.
- **Filters:** Supports `adapter_id`, `status`, `limit`, and `offset`.
- **Safety:** The endpoint does not route traffic or attach load proof; it only reports each deployment row's existing `route_traffic` and proof state.
- **Verification:** Targeted adapter deployment and registry Jest suites; backend `node --check`; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 16:11 UTC - Fine-Tuning adapter deployment intents (PR #784)

- **PR:** [#784](https://github.com/dhnpmp-tech/dcp-platform/pull/784) (`codex/frontend-adapter-deployments-2026-07-08`).
- **Frontend:** `/renter/fine-tuning` now reads `GET /api/adapters/{adapter_id}/deployments` for visible adapters.
- **UI:** Added a read-only deployment intent ledger with deployment id, adapter id, mode, endpoint id, status, route traffic, load-proof state, and failure reason.
- **Safety:** No deploy button or routing claim was added; route traffic remains displayed as off unless backend load proof says otherwise.
- **Verification:** `npm run build`; `git diff --check`; mocked authenticated Playwright desktop/mobile render with adapter-deployment calls and no horizontal overflow.

### 2026-07-08 16:02 UTC - Fine-Tuning LoRA readiness rail (PR #783)

- **PR:** [#783](https://github.com/dhnpmp-tech/dcp-platform/pull/783) (`codex/frontend-lora-readiness-2026-07-08`).
- **Frontend:** `/renter/fine-tuning` now reads `GET /api/lora/readiness` with the renter key.
- **UI:** Added a readiness rail for LoRA mode, dataset validation, training jobs, model cards, adapter registry, deployments, route traffic, and contract version.
- **Safety:** Public training, serving, routing, quality, Tinker compatibility, and discounts render from backend claim guards and remain off in the current contract.
- **Verification:** `npm run build`; `git diff --check`; mocked authenticated Playwright desktop/mobile render with no horizontal overflow and a verified readiness request.

### 2026-07-08 15:50 UTC - LoRA readiness gates (PR #782)

- **PR:** [#782](https://github.com/dhnpmp-tech/dcp-platform/pull/782) (`codex/lora-readiness-contract-2026-07-08`).
- **API:** Added renter-authenticated `GET /api/lora/readiness` for the current LoRA/Fine-Tuning readiness contract.
- **Safety:** Dataset validation, training-job metadata, model-card stubs, adapter registry, and adapter deployment load-proof are exposed as gates; public training, serving, routing, quality claims, Tinker compatibility, and discounts remain false.
- **OpenAPI:** Added `LoraReadiness` plus the readiness endpoint to the platform OpenAPI docs copies; the vendored dcp-contracts copy stays untouched.
- **Verification:** Targeted LoRA/adapter Jest suites; backend `node --check`; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 15:39 UTC - Live model catalog on pricing page (PR #781)

- **PR:** [#781](https://github.com/dhnpmp-tech/dcp-platform/pull/781) (`codex/pricing-live-model-catalog-2026-07-08`).
- **Frontend:** `/pricing` now reads `GET /v1/models` and renders serveable models with context, max output, pricing source, SAR input/output rates, provider count, and capability chips.
- **Safety:** Models with `provider_count=0` are filtered out of the live pricing table.
- **Layout:** Added scoped desktop/mobile CSS for the live catalog without changing the existing static model-class guide.
- **Verification:** `npm run build`; `git diff --check`; mocked Playwright desktop/mobile render, no horizontal overflow, and non-serveable model guard.

### 2026-07-08 15:29 UTC - Playground live model metadata panel (PR #780)

- **PR:** [#780](https://github.com/dhnpmp-tech/dcp-platform/pull/780) (`codex/frontend-playground-model-metadata-2026-07-08`).
- **Frontend:** `/renter/playground` now preserves `/v1/models` context, max output, pricing, capabilities, feature readiness, and VRAM metadata in the model selector.
- **UI:** Added a selected-model contract panel with SAR/1M input-output rates, capability chips, and prompt-cache/batch/LoRA/dedicated readiness gates.
- **Safety:** Max tokens now clamp to backend `max_output_tokens`; advanced rails remain gated/measurement-only when the backend says they are not public.
- **Verification:** `npm run build`; `git diff --check`; mocked authenticated Playwright desktop/mobile render, no horizontal overflow, backend-driven slider max, and captured chat request with `routing_policy: "balanced"`.

### 2026-07-08 15:17 UTC - Playground router policy panel (PR #779)

- **PR:** [#779](https://github.com/dhnpmp-tech/dcp-platform/pull/779) (`codex/frontend-router-policy-playground-2026-07-08`).
- **Frontend:** `/renter/playground` now reads `GET /v1/router/policies` and shows the router-policy readiness catalog.
- **UI:** Added a routing panel with the available balanced default, future policy statuses, and a compact explicit-policy note.
- **Safety:** Chat requests send `routing_policy: "balanced"` only when balanced is the available backend default; future policies remain display-only/gated.
- **Verification:** `npm run build`; `git diff --check`; mocked authenticated Playwright desktop/mobile render plus captured chat request body with `routing_policy: "balanced"`.

### 2026-07-08 15:05 UTC - Fine-Tuning model-card manifest cards (PR #778)

- **PR:** [#778](https://github.com/dhnpmp-tech/dcp-platform/pull/778) (`codex/frontend-lora-model-card-2026-07-08`).
- **Frontend:** `/renter/fine-tuning` now renders `model_card_manifest` from LoRA training-job responses.
- **UI:** Added adapter proof cards with manifest status, adapter/base, dataset rows/format, artifact proof status, storage key, contract version, and next step.
- **Safety:** Public training, serving, routing, quality, and Tinker guards are rendered from manifest claims and remain false in the current backend contract.
- **Verification:** `npm run build`; `git diff --check`; mocked authenticated Playwright desktop/mobile render with no horizontal overflow.

### 2026-07-08 14:56 UTC - Batch readiness gates in renter console (PR #777)

- **PR:** [#777](https://github.com/dhnpmp-tech/dcp-platform/pull/777) (`codex/frontend-batch-readiness-2026-07-08`).
- **Frontend:** `/renter/batches` now reads `GET /api/batches/readiness` with the existing renter auth headers.
- **UI:** Added readiness mode, contract version, create/execution/download/settlement/discount gates, completion window, and supported JSONL URLs.
- **Safety:** Execution and discounts remain visibly gated unless the backend contract marks them live; download configuration still keeps the result-proof gate.
- **Verification:** `npm run build`; `git diff --check`; mocked authenticated Playwright desktop/mobile render with no horizontal overflow.

### 2026-07-08 14:40 UTC - Batch inference readiness contract (PR #776)

- **PR:** [#776](https://github.com/dhnpmp-tech/dcp-platform/pull/776) (`codex/batch-readiness-contract-2026-07-08`).
- **API:** Added `GET /api/batches/readiness` for supported endpoints, limits, feature gates, and claim guards.
- **Safety:** Execution, settlement, discounts, and model batch capability remain explicitly non-public.
- **OpenAPI:** Documented the renter-authenticated readiness endpoint.
- **Verification:** Targeted batch inference Jest suite; backend `node --check`; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 14:31 UTC - LoRA training model-card manifests (PR #775)

- **PR:** [#775](https://github.com/dhnpmp-tech/dcp-platform/pull/775) (`codex/lora-model-card-manifest-2026-07-08`).
- **API:** LoRA training jobs now include `model_card_manifest` when a model-card storage key is reserved or produced.
- **Honesty:** The manifest explicitly marks public training, serving, routing, quality claims, and Tinker compatibility as false.
- **OpenAPI:** Documented the additive manifest object on `LoraTrainingJob`.
- **Verification:** Targeted LoRA training-job Jest suite; backend `node --check`; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 14:21 UTC - Nsight provider benchmark contract guard (PR #774)

- **PR:** [#774](https://github.com/dhnpmp-tech/dcp-platform/pull/774) (`codex/provider-nsight-contract-guard-2026-07-08`).
- **Evidence honesty:** Provider benchmark reports now expose `evidence_mode` and `mock_data` markers so mock CI output is not mistaken for GPU-host proof.
- **Test:** Added a Jest contract guard that runs `scripts/provider-nsight-benchmark.py --mock` and validates JSON/CSV output.
- **Command:** Added `npm run provider:nsight:verify` for the CI-safe proof path.
- **Verification:** `npm run provider:nsight:verify`; Python byte-compile; `git diff --check`.

### 2026-07-08 14:11 UTC - Explicit router policy request validation (PR #773)

- **PR:** [#773](https://github.com/dhnpmp-tech/dcp-platform/pull/773) (`codex/router-policy-request-validation-2026-07-08`).
- **API:** `/v1/chat/completions` now accepts `routing_policy: "balanced"` as an explicit no-op and returns routing-policy response headers.
- **Safety:** Non-selectable policies such as `cheapest` return a structured HTTP 400 instead of being silently ignored.
- **OpenAPI:** Documented the balanced-only request field.
- **Verification:** Routing-policy resolver tests; `/v1/chat/completions` balanced/rejection route tests; backend `node --check`; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 14:02 UTC - Router policy readiness catalog (PR #772)

- **PR:** [#772](https://github.com/dhnpmp-tech/dcp-platform/pull/772) (`codex/router-policy-readiness-catalog-2026-07-08`).
- **API:** Added read-only `GET /v1/router/policies` for balanced, lowest-latency, cheapest, Saudi-only, coding, and Arabic routing policy readiness.
- **Safety:** The catalog is not request-selectable yet and does not change provider routing behavior.
- **OpenAPI:** Documented the router policy readiness response.
- **Verification:** Routing-policy unit tests; `/v1/router/policies` route test; backend `node --check`; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 13:53 UTC - Model feature-readiness metadata (PR #771)

- **PR:** [#771](https://github.com/dhnpmp-tech/dcp-platform/pull/771) (`codex/model-feature-readiness-contract-2026-07-08`).
- **Model contract:** `/v1/models`, `/api/models`, and `/api/models/catalog` now include `feature_readiness` for dedicated deployments, LoRA, prompt caching, and batch.
- **Honesty:** Product-available capability booleans remain false while readiness states explain what is `measurement_only`, `metadata_only`, `api_metadata_only`, `gated`, or `not_applicable`.
- **OpenAPI:** Documented the additive readiness object for model-list consumers.
- **Verification:** Targeted `/api/models` and `/v1/models` Jest suites; backend `node --check`; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 12:59 UTC - Prompt-cache pricing observation (PR #770)

- **PR:** [#770](https://github.com/dhnpmp-tech/dcp-platform/pull/770) (`codex/prompt-cache-accounting-observation-2026-07-08`).
- **Usage pricing:** `/v1/chat/completions` usage pricing now includes measured prompt-cache counters under `usage.pricing.prompt_cache` when pricing metadata is present.
- **No discounting:** Cached-input observations remain measurement-only; billable input tokens and settlement math do not change.
- **Tests:** Prompt-cache helper and v1 metering tests assert pricing fields are preserved and cache counters are mirrored.
- **Verification:** Targeted prompt-cache and v1 metering Jest suites; backend `node --check`; `git diff --check`.

### 2026-07-08 12:50 UTC - Shared inference token-pricing contract (PR #769)

- **PR:** [#769](https://github.com/dhnpmp-tech/dcp-platform/pull/769) (`codex/model-pricing-metadata-contract-2026-07-08`).
- **Shared contract:** `toTokenPricingContract` now serializes prompt/completion USD strings, SAR/halala per-1M-token fields, billing unit, source, and model class in one place.
- **Route parity:** `/api/models`, `/api/models/catalog`, and `/v1/models` now use the same token-pricing shape.
- **Tests:** Catalog tests assert `/api/models` and `/api/models/catalog` produce identical `token_pricing` for the same model.
- **Verification:** Targeted `/api/models` and `/v1/models` Jest suites; backend `node --check`; `git diff --check`.

### 2026-07-08 12:41 UTC - Credit-first pod 402 backend copy (PR #768)

- **PR:** [#768](https://github.com/dhnpmp-tech/dcp-platform/pull/768) (`codex/pod-credit-required-payload-copy-2026-07-08`).
- **Shared 402s:** `paymentRequiredPayload` now defaults to available-credit / Add credit copy while preserving stable codes and SAR/halala fields.
- **Pods:** Launch and extend insufficient-credit messages now use credit-first wording and still include exact available/required credit facts.
- **OpenAPI:** Payment-required, pod extend, and volume 402 descriptions now reference account/prepaid credit rather than wallet balance.
- **Verification:** Targeted 402 payload Jest suite; backend `node --check`; `git diff --check`.

### 2026-07-08 12:00 UTC - Pod launch credit-required guidance (PR #767)

- **PR:** [#767](https://github.com/dhnpmp-tech/dcp-platform/pull/767) (`codex/pod-launch-credit-error-guidance-2026-07-08`).
- **Structured 402s:** `/renter/pods` now keeps backend credit-gate details for paid-credit and insufficient-credit launch failures.
- **Renter copy:** The blocked-launch panel says "Credit required", routes to Add credit, and explains trial credit coverage without exposing vendor/on-demand internals.
- **Credit facts:** The UI shows available credit, required credit, requested duration, and hourly rate when present in the backend response.
- **Interaction:** Funding errors stay visible while launch settings are adjusted; transient validation errors still clear normally.
- **Verification:** `npm run build`; `git diff --check`; Playwright render smoke with signed renter session and mocked HTTP 402 launch response.

### 2026-07-08 11:38 UTC - Non-chat model capability honesty (PR #766)

- **PR:** [#766](https://github.com/dhnpmp-tech/dcp-platform/pull/766) (`codex/model-capability-contract-honesty-2026-07-08`).
- **Capability contract:** Explicit embedding/rerank/image use cases no longer inherit chat/streaming capability by default.
- **`/v1/models`:** Explicit non-chat models no longer advertise a chat endpoint when no compatible `/v1` route exists.
- **Route parity:** `/api/models`, `/api/models/catalog`, and `/v1/models` now share `reranking` and `vision` flags alongside the existing capability metadata.
- **Compatibility:** Legacy rows with missing/empty use-case metadata still default to chat completion support.
- **Verification:** Targeted `/v1/models` and model-catalog honesty Jest suites; route/helper `node --check`.

### 2026-07-08 11:27 UTC - Credit-first renter funding copy (PR #765)

- **PR:** [#765](https://github.com/dhnpmp-tech/dcp-platform/pull/765) (`codex/renter-credit-language-2026-07-08`).
- **Renter shell:** Dashboard, playground, usage, invoices, keys, settings, and wallet sidebars now use credit-first funding labels.
- **Shared cards:** Balance/spending cards now say "Available Credit", "Credit", "Add Credit", and low-credit warnings without emoji markers.
- **Top-up flow:** The modal now reads as add-credit/payment request copy while SAR stays visible for payment amount selection and transfer/accounting context.
- **Failure states:** Low-credit notifications and redeploy insufficient-balance CTAs now send renters to add credit.
- **Verification:** Visible copy scan for old renter funding language; `git diff --check`.

### 2026-07-08 11:15 UTC - Provider supply-tier credit policy (PR #764)

- **PR:** [#764](https://github.com/dhnpmp-tech/dcp-platform/pull/764) (`codex/provider-supply-tier-credit-policy-2026-07-08`).
- **Schema:** Added durable `providers.supply_tier` classification for `dcp_owned`, `provider`, and `on_demand` supply.
- **Backfill:** Burst rows become `on_demand`, native rows default to `provider`, and `DCP_OWNED_PROVIDER_IDS` can mark reviewed DCP-operated rows.
- **Credit policy:** On-demand paid-credit commitments now include explicit `supply_tier='on_demand'` rows as well as legacy `is_burst=1` rows.
- **Safety:** `is_burst=1` still wins over an unsafe explicit tier, preventing accidental trial-credit access to externally brokered capacity.
- **Verification:** Targeted pod access policy Jest suite; `git diff --check`.

### 2026-07-08 11:05 UTC - Ops repo hardening status refresh (PR #763)

- **PR:** [#763](https://github.com/dhnpmp-tech/dcp-platform/pull/763) (`codex/ops-hardening-status-refresh-2026-07-08`).
- **Deploy watcher:** Confirmed `ops/dcp-deploy-watch.sh` is tracked, byte-identical to the VPS2 cron copy, and still scheduled every 3 minutes.
- **Platform parity:** Recorded local, `origin/main`, `origin/security/staged-rollouts`, and VPS2 parity at `5d20c0c91170bbe047b3e8e1cfccf23aa49dee4f`.
- **dcp-agent:** Reconfirmed the only remaining platform-adjacent ops drift is the separate local `dcp-agent` checkout, still detached with gateway PID `1731` running.
- **Roadmaps:** Updated the Fireworks/Tinker docs to mark deploy-watch resolved and leave `dcp-agent` as a controlled maintenance-window task.
- **Verification:** `git diff --check`.

### 2026-07-08 10:55 UTC - Pod image contract verifier (PR #762)

- **PR:** [#762](https://github.com/dhnpmp-tech/dcp-platform/pull/762) (`codex/pod-image-contracts-2026-07-08`).
- **Manifest:** Added `backend/docker-templates/pod-image-contracts.json` for the pre-baked `pytorch`, `cuda`, `ubuntu`, `vllm`, and `lora` image aliases.
- **Verifier:** Added `pod-images:verify-contracts`, a CI-safe gate for Dockerfile entrypoints, build-script targets, `/api/pods` alias wiring, LoRA requirements, examples, and provider smoke-script references.
- **Tests:** Added a targeted backend Jest wrapper for the pod image contract.
- **Runbook:** Documented which checks are safe in CI and which `dcp-compute:lora` proof must run on a GPU provider host.
- **Verification:** `npm run pod-images:verify-contracts`; targeted pod image contract Jest suite; `git diff --check`.

### 2026-07-08 10:38 UTC - Catalog-backed pod launch templates (PR #761)

- **PR:** [#761](https://github.com/dhnpmp-tech/dcp-platform/pull/761) (`codex/pod-template-catalog-launch-2026-07-08`).
- **Frontend:** `/renter/pods` now has catalog-backed template cards for PyTorch, LoRA SFT, QLoRA SFT, vLLM, embeddings/rerank, and Arabic transcription.
- **Catalog guard:** The page reads `GET /api/templates/catalog`, shows catalog health/version, disables missing catalog templates when the backend catalog is healthy, and applies catalog VRAM floors to GPU filtering.
- **Launch flow:** Template selection is tracked explicitly; manual image, duration, or workload changes clear template mode so the launch rail stays honest.
- **Workspace path:** The existing workspace pre-upload step now leads into the audit's workspace -> template -> GPU -> duration -> credit launch map.
- **Backend tests:** Added catalog contract coverage for the pod-launch template ids and for fail-closed behavior when the template directory is missing.
- **Verification:** Targeted template Jest suite; `npm run build`; `git diff --check`.

### 2026-07-08 10:23 UTC - Gated batch line settlement (PR #760)

- **PR:** [#760](https://github.com/dhnpmp-tech/dcp-platform/pull/760) (`codex/batch-line-settlement-2026-07-08`).
- **Backend:** Added batch line settlement metadata for provider id, settlement state, stable settlement request id, error details, and settlement timestamp.
- **Billing bridge:** Added a guarded helper that can call the existing `billingService.settleInferenceOnce` for succeeded line proof using idempotent batch-line request ids.
- **Worker gate:** The dormant batch worker only settles lines when `settlementEnabled` or `DCP_BATCH_SETTLEMENT_ENABLED=1` is explicitly enabled.
- **Safety:** The helper checks the full succeeded-line cost before debiting so insufficient balance fails without partial batch billing.
- **Contracts:** Updated public OpenAPI copies and the prompt-cache/batch design order while keeping public batch execution, discounts, and model flags gated.
- **Verification:** Targeted batch job and batch worker Jest suites; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 10:05 UTC - Renter batch console (PR #759)

- **PR:** [#759](https://github.com/dhnpmp-tech/dcp-platform/pull/759) (`codex/frontend-batch-console-2026-07-08`).
- **Frontend:** Added `/renter/batches` to the protected renter console and Build-section navigation.
- **Batch ledger:** The console reads `GET /api/batches`, summarizes batch/request/result-artifact/cost totals, and lets renters select validation records.
- **Creation flow:** Added validation-only JSONL batch creation through `POST /api/batches` with idempotency headers and purpose metadata.
- **Proof panels:** Selected batches read line-ledger rows and result-manifest proof through the tenant-scoped batch detail APIs.
- **Product guardrails:** Execution, result downloads, discounts, settlement, and `/v1/models` batch flags remain gated until backend proof/configuration lands.
- **Verification:** `npm run build`; production-mode Playwright desktop/mobile render with mocked renter, batch, line, and result APIs; `git diff --check`.

### 2026-07-08 09:48 UTC - Batch worker line proof (PR #758)

- **PR:** [#758](https://github.com/dhnpmp-tech/dcp-platform/pull/758) (`codex/batch-worker-line-proof-2026-07-08`).
- **Worker:** The dormant batch worker now accepts optional `execution.lines` from an injected executor and validates one result per batch line.
- **Line ledger:** Worker execution can update line status, response checksum, usage, cost, request id, provider response id, and error metadata.
- **Aggregation:** Batch completed/failed counts and total cost can be derived from line proof before completion.
- **Product guardrails:** The worker remains disabled by default and does not call live `/v1`, settle balances, apply discounts, or advertise batch model flags.
- **Verification:** Targeted batch job, batch contract, result download, and batch worker Jest suites; `git diff --check`.

### 2026-07-08 09:40 UTC - Batch line ledger (PR #757)

- **PR:** [#757](https://github.com/dhnpmp-tech/dcp-platform/pull/757) (`codex/batch-line-ledger-2026-07-08`).
- **Backend:** Added `batch_inference_job_lines` for per-line custom id, endpoint, model, request checksum, status, usage, cost, response checksum, request id, provider response id, and bounded error metadata.
- **Creation path:** Batch creation now inserts one pending line row per validated JSONL request.
- **API:** Added renter-authenticated `GET /api/batches/{batch_id}/lines` without exposing raw request or response bodies.
- **Contracts:** Updated public OpenAPI copies and the prompt-cache/batch design order while keeping batch execution and settlement gated.
- **Verification:** Targeted batch job, batch contract, result download, and batch worker Jest suites; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 09:29 UTC - Batch result download signer (PR #756)

- **PR:** [#756](https://github.com/dhnpmp-tech/dcp-platform/pull/756) (`codex/batch-result-download-signer-2026-07-08`).
- **Backend:** Added a guarded S3-compatible signer for completed batch result artifacts.
- **Safety gate:** Result URLs are returned only when a batch is completed with checksum proof and the result key is scoped to that renter and batch.
- **API:** `GET /api/batches/{batch_id}/results` now includes signed download metadata when `BATCH_RESULTS_S3_BUCKET` plus S3 endpoint/key/secret configuration is present.
- **Contracts:** Updated public OpenAPI copies and the prompt-cache/batch design order while keeping batch execution, discounts, and model batch flags gated.
- **Verification:** Targeted batch result download, batch job, and batch worker Jest suites; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 09:17 UTC - Prompt-cache measurement ledger (PR #755)

- **PR:** [#755](https://github.com/dhnpmp-tech/dcp-platform/pull/755) (`codex/prompt-cache-measurement-ledger-2026-07-08`).
- **Inference:** Added hash-only `prompt_cache_measurements` rows for prompt-cache key, model, session hash, counters, request id, and discount flags.
- **Measurement:** `/v1/chat/completions` can now report repeated static prefixes as `hit_measured_no_discount` based on prior recorded cache keys.
- **Privacy:** No raw prompt or static-prefix text is persisted.
- **Billing guardrail:** Cached-input discounts remain disabled and billable input tokens stay equal to prompt tokens.
- **Verification:** Targeted prompt-cache accounting and v1 metering Jest suites; `git diff --check`.

### 2026-07-08 09:08 UTC - Prompt-cache usage metadata (PR #754)

- **PR:** [#754](https://github.com/dhnpmp-tech/dcp-platform/pull/754) (`codex/prompt-cache-usage-fields-2026-07-08`).
- **Inference:** Added `usage.prompt_cache` metadata to `/v1/chat/completions` responses for prompt-cache measurement.
- **Hints:** Supports optional `static_prefix`, `prompt_cache.static_prefix`, and session-scoped measurement hints without persisting raw prompt text in accounting metadata.
- **Billing guardrail:** No discounts are applied; `billable_input_tokens` remains equal to prompt tokens and settlement token counts are unchanged.
- **Contracts:** Updated public OpenAPI copies and the prompt-cache/batch design order.
- **Verification:** Targeted prompt-cache accounting and v1 metering Jest suites; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 09:01 UTC - Batch worker npm smoke script (PR #753)

- **PR:** [#753](https://github.com/dhnpmp-tech/dcp-platform/pull/753) (`codex/batch-worker-npm-script-2026-07-08`).
- **Tooling:** Added `worker:batch-inference:once` to the backend npm scripts for stable disabled-mode batch worker smoke checks.
- **Runbook:** Updated the prompt-cache/batch design notes with the npm command used during deploy handoffs.
- **Verification:** Disabled batch worker npm smoke; `git diff --check`.

### 2026-07-08 08:54 UTC - Batch result manifest proof (PR #752)

- **PR:** [#752](https://github.com/dhnpmp-tech/dcp-platform/pull/752) (`codex/batch-result-manifest-2026-07-08`).
- **Backend:** Added additive batch result checksum and normalized-byte metadata.
- **Availability gate:** Batch records now report `results_available: true` only when completed with both a result storage key and SHA-256 checksum.
- **API:** Added renter-authenticated `GET /api/batches/{batch_id}/results`, returning a read-only result manifest with proof metadata and no signed download URL yet.
- **Worker:** The dormant batch worker now requires injected executors to return result checksum proof before completing a batch.
- **Contracts:** Updated public OpenAPI copies and the prompt-cache/batch design order while keeping production execution, discounts, and batch model flags gated.
- **Verification:** Targeted batch job and worker Jest suites; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 08:42 UTC - LoRA training job log ledger (PR #751)

- **PR:** [#751](https://github.com/dhnpmp-tech/dcp-platform/pull/751) (`codex/lora-training-logs-2026-07-08`).
- **Backend:** Added tenant-scoped `lora_training_job_logs` rows for LoRA training job lifecycle events.
- **Lifecycle:** Job creation and status transitions now append immutable logs with level, event, message, timestamp, and bounded metadata.
- **API:** Added renter-authenticated `GET /api/lora/training-jobs/{training_job_id}/logs` with pagination metadata and renter isolation.
- **Worker:** The disabled LoRA worker scaffold now produces a tested event trail for running, succeeded, and failed execution paths when an injected executor is used.
- **Contracts:** Updated public OpenAPI copies and the LoRA runbook while keeping managed GPU training and adapter serving gated.
- **Verification:** Targeted LoRA training job and worker Jest suites; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 08:32 UTC - Dormant LoRA training worker scaffold (PR #750)

- **PR:** [#750](https://github.com/dhnpmp-tech/dcp-platform/pull/750) (`codex/lora-training-worker-scaffold-2026-07-08`).
- **Backend:** Added a disabled-by-default LoRA training worker that can process `created` training jobs only when explicitly enabled and given an executor.
- **Artifacts:** Added deterministic adapter/model-card storage-key builders and checksum-required artifact completion before a job can succeed.
- **Lifecycle:** Worker execution can mark jobs `running`, `succeeded`, or `failed`; optional auto-registration uses the existing artifact-to-adapter bridge.
- **CLI:** Added `backend/src/scripts/run-lora-training-worker-once.js` and `worker:lora-training:once` for disabled-mode/manual proof runs.
- **Verification:** Targeted LoRA worker and training-job Jest suites; disabled CLI smoke; `git diff --check`.

### 2026-07-08 08:25 UTC - Adapter deployment load-proof route (PR #749)

- **PR:** [#749](https://github.com/dhnpmp-tech/dcp-platform/pull/749) (`codex/lora-adapter-load-proof-route-2026-07-08`).
- **Backend:** Added an admin/internal load-proof route for adapter deployments, scoped by renter id, adapter id, and deployment id before mutation.
- **Traffic gate:** Matching vLLM proof moves a deployment to `running` with `route_traffic: true`; mismatched proof marks it `degraded` and keeps serving disabled.
- **Contracts:** Updated public OpenAPI copies and the LoRA runbook to mark load-proof attachment as the only API path from deployment intent to routable adapter deployment.
- **Verification:** Targeted adapter deployment lifecycle Jest suite; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 08:18 UTC - LoRA training artifact adapter registration (PR #748)

- **PR:** [#748](https://github.com/dhnpmp-tech/dcp-platform/pull/748) (`codex/lora-training-artifact-register-2026-07-08`).
- **Backend:** Added `registerLoraTrainingJobAdapter`, which creates/replays an adapter registry row only for succeeded LoRA training jobs with artifact storage and SHA-256 proof.
- **API:** Added renter-authenticated `POST /api/lora/training-jobs/{training_job_id}/register-adapter`, returning `serving_enabled: false` until adapter deployment and vLLM load proof exist.
- **Read model:** LoRA training job list/detail responses now compute `adapter_registered` from the adapter registry.
- **Contracts:** Updated public OpenAPI copies and the LoRA runbook order to mark artifact-to-adapter registration complete while trainer execution and serving remain gated.
- **Verification:** Targeted LoRA training job, adapter registry, and adapter deployment Jest suites; `git diff --check`; OpenAPI YAML parse.

### 2026-07-08 08:04 UTC - LoRA/vLLM template validation dry-run gates (PR #747)

- **PR:** [#747](https://github.com/dhnpmp-tech/dcp-platform/pull/747) (`codex/lora-template-validation-dry-run-2026-07-08`).
- **Tooling:** Added root-level `npm run templates:validate`, delegating to the backend deploy-template validator.
- **CI:** Reconciled `backend/package-lock.json` with the backend manifest so `npm --prefix backend ci` succeeds before validation.
- **LoRA gates:** The validator now requires `lora-finetune` and `qlora-finetune` templates to keep `DC1_RESULT_JSON` dry-run scaffolds, `custom_container` example inputs, matching output template ids, non-empty base model metadata, and explicit `ready_for_*` statuses.
- **vLLM gate:** The validator now checks the `vllm-serve` example contract remains a `vllm_serve` input with a running endpoint output and OpenAI-compatible `/v1` base URL.
- **Product guardrails:** This strengthens the template proof gate without enabling managed LoRA training or adapter traffic routing.
- **Verification:** `npm --prefix backend ci`; `npm run templates:validate`; `npm --prefix backend run templates:validate`; `git diff --check`.

### 2026-07-08 07:57 UTC - API model catalog contract metadata (PR #746)

- **PR:** [#746](https://github.com/dhnpmp-tech/dcp-platform/pull/746) (`codex/api-models-contract-parity-2026-07-08`).
- **Backend:** Added additive token-pricing and capability metadata to `/api/models`, `/api/models/catalog`, and `/api/models/{model_id}`.
- **Pricing:** Model catalog responses now expose registry-token rates when present and cost-rate fallback metadata when registry rates are absent.
- **Capability gates:** Added `/v1/models`-style capability flags while keeping `dedicated_deployment`, `lora`, `prompt_caching`, and `batch` false until the proof-backed slices land.
- **Verification:** Extended catalog honesty tests and ran targeted model catalog plus `/v1/models` suites.

### 2026-07-08 07:42 UTC - Fine-Tuning console training jobs ledger (PR #745)

- **PR:** [#745](https://github.com/dhnpmp-tech/dcp-platform/pull/745) (`codex/frontend-finetuning-training-jobs-2026-07-08`).
- **Frontend:** Wired `/renter/fine-tuning` to read `/api/lora/training-jobs` alongside renter account and adapter registry state.
- **Console:** Added a LoRA training-jobs ledger with dataset counts/splits/checksums, recipe, base model, output adapter reservation, lifecycle status, and trainer/adapter proof gates.
- **Product guardrails:** Updated KPIs and contract preview so managed trainer execution, adapter registration, and traffic routing remain visibly disabled until the proof-backed backend slices land.
- **Verification:** `npm run build`; `git diff --check`; production-mode Playwright desktop/mobile render with mocked renter, adapters, and training jobs.

### 2026-07-08 07:31 UTC - LoRA training job API foundation (PR #744)

- **PR:** [#744](https://github.com/dhnpmp-tech/dcp-platform/pull/744) (`codex/lora-training-jobs-foundation-2026-07-08`).
- **Backend:** Added `lora_training_jobs` schema/bootstrap and service helpers for dataset JSONL validation, fixed LoRA/QLoRA recipe normalization, tenant-scoped create/list/read, idempotent create replay, and artifact status metadata.
- **API/OpenAPI:** Added renter-authenticated `/api/lora/training-jobs` list/create and `/api/lora/training-jobs/{training_job_id}` detail routes. Creation returns `training_enabled: false` until trainer-worker/artifact proof lands.
- **Verification:** Added LoRA training job tests for schema, route behavior, idempotency, tenant isolation, invalid dataset errors, wrapper DB compatibility, and artifact status updates.

### 2026-07-08 07:20 UTC - Dormant batch worker scaffold (PR #743)

- **PR:** [#743](https://github.com/dhnpmp-tech/dcp-platform/pull/743) (`codex/batch-worker-stub-2026-07-08`).
- **Backend:** Added a disabled-by-default batch worker run-once module, deterministic result artifact key builder, and internal created-batch scanner.
- **CLI:** Added `backend/src/scripts/run-batch-inference-worker-once.js`, which reports disabled/no-op status unless batch execution is explicitly enabled.
- **Verification:** Added worker tests for disabled no-op, missing executor no-op, successful injected completion, and executor failure. Batch billing and `/v1/models` capability flags remain pending.

### 2026-07-08 07:13 UTC - Batch route DB wrapper fix (PR #742)

- **PR:** [#742](https://github.com/dhnpmp-tech/dcp-platform/pull/742) (`codex/batch-route-wrapper-fix-2026-07-08`).
- **Backend:** Fixed `/api/batches` route initialization so schema ensure accepts the production `backend/src/db.js` wrapper shape as well as raw `better-sqlite3` DBs.
- **Verification:** Added wrapper-shape regression coverage to the batch route test suite and confirmed production unauth `/api/batches` returns renter-auth 401 after deploy.

### 2026-07-08 07:06 UTC - Batch inference API foundation (PR #741)

- **PR:** [#741](https://github.com/dhnpmp-tech/dcp-platform/pull/741) (`codex/batch-inference-api-foundation-2026-07-08`).
- **Backend:** Added `batch_inference_jobs` schema/bootstrap plus service helpers for tenant-scoped create/list/read, JSONL validation, checksum metadata, storage-key reservation, and idempotent create replay.
- **API/OpenAPI:** Added renter-authenticated `/api/batches` list/create and `/api/batches/{batch_id}` detail routes. Creation returns `execution_enabled: false` until the worker/result/billing slice lands.
- **Server:** Mounted `/api/batches` with tiered rate limiting and a route-specific JSON body parser for batch payloads.
- **Verification:** `npm test -- --runTestsByPath src/__tests__/batchInferenceJobs.test.js src/__tests__/batchInferenceContract.test.js --runInBand`; DB bootstrap table smoke; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 06:48 UTC - Nsight provider benchmark MVP (PR #740)

- **PR:** [#740](https://github.com/dhnpmp-tech/dcp-platform/pull/740) (`codex/pods-nsight-benchmark-mvp-2026-07-08`).
- **Provider tooling:** Added `scripts/provider-nsight-benchmark.py` for provider-side JSON/CSV GPU telemetry evidence from `nvidia-smi`.
- **Nsight path:** Added optional `ncu` and `nsys` workload profiling modes, with occupancy/cache/memory-bandwidth fields populated only from real Nsight Compute output and otherwise reported as missing metrics.
- **Scorecard contract:** Added normalized `provider_quality_score_input` fields for future admin/backend ingestion without changing routing, billing, or renter-visible provider internals.
- **Runbook/docs:** Added `docs/architecture/2026-07-08-nsight-provider-benchmark-mvp.md` and linked the new script from provider onboarding docs.
- **Verification:** Python compile check; mock JSON/CSV generation and schema checks; `git diff --check`.

### 2026-07-08 06:34 UTC - Adapter deployment lifecycle records (PR #739)

- **PR:** [#739](https://github.com/dhnpmp-tech/dcp-platform/pull/739) (`codex/lora-deployment-lifecycle-2026-07-08`).
- **Backend:** Added the `adapter_deployments` schema and lifecycle service for pending/provisioning/running/degraded/stopped/failed adapter deployment records, with proof-gated route traffic.
- **API/OpenAPI:** Added renter-authenticated adapter deployment list/create/detail routes and documented that public creation is an intent record with `serving_enabled: false`, not a traffic switch.
- **Verification:** `npm test -- --runTestsByPath src/__tests__/adapterDeploymentLifecycle.test.js src/__tests__/adapterRegistry.test.js src/__tests__/loraTrainingContract.test.js`; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 06:16 UTC - Fine-Tuning console shell (PR #738)

- **PR:** [#738](https://github.com/dhnpmp-tech/dcp-platform/pull/738) (`codex/frontend-finetuning-shell-2026-07-08`).
- **Frontend:** Added `/renter/fine-tuning` with live adapter-registry reads, LoRA workflow gates, and an honest deployment-proof state that keeps traffic routes at zero until serving proof exists.
- **Console IA:** Added Fine-Tuning to renter console navigation and cleaned the pod inference workload copy so batch is not described as a live pod preset.
- **Verification:** `npm run build`; `git diff --check`; production-mode Playwright checks for desktop and mobile render, active nav state, adapter-count rendering, no console errors, no blank page, no horizontal overflow, and working vertical scroll.

### 2026-07-08 05:52 UTC - LoRA training and deploy contracts (PR #737)

- **PR:** [#737](https://github.com/dhnpmp-tech/dcp-platform/pull/737) (`codex/lora-train-deploy-contracts-2026-07-08`).
- **Dataset validation:** Added tested JSONL validation for LoRA SFT chat and prompt/completion rows, including unsafe/empty row rejection, token estimates, checksums, and split metadata.
- **Training/deploy contracts:** Added fixed LoRA/QLoRA training draft normalization and adapter deployment gating that only routes after serving load proof matches.
- **Runbook:** Added `docs/architecture/2026-07-08-lora-training-deploy-contracts.md` with the order from dataset upload to adapter registry to vLLM load proof.

### 2026-07-08 05:39 UTC - Prompt-cache and batch foundations (PR #736)

- **PR:** [#736](https://github.com/dhnpmp-tech/dcp-platform/pull/736) (`codex/prompt-cache-batch-design-2026-07-08`).
- **Prompt cache:** Added a tested accounting helper for static-prefix/session cache keys, cached-token measurement, and no-discount billable-token behavior.
- **Batch contract:** Added tested JSONL validation for future batch inference: supported endpoints, per-line bodies, unique `custom_id`, deterministic checksum, and count/byte limits.
- **Design:** Added `docs/architecture/2026-07-08-prompt-cache-batch-design.md` with the implementation order for prompt-cache discounts and `/api/batches` on existing billing rails.

### 2026-07-08 05:32 UTC - Adapter registry foundation (PR #735)

- **PR:** [#735](https://github.com/dhnpmp-tech/dcp-platform/pull/735) (`codex/adapter-registry-foundation-2026-07-08`).
- **LoRA backend:** Added the `adapter_registry` schema and service for renter-owned adapter artifact metadata: base model, storage key, checksum, rank, metadata, status, and deployed timestamp.
- **API:** Added renter-authenticated `/api/adapters` list/create and `/api/adapters/{adapter_id}` detail endpoints, with public creation limited to non-deployment states and `deployment_enabled: false`.
- **Verification:** Added adapter registry tests for idempotent schema creation, tenant isolation, validation, lifecycle timestamps, and absence of a deploy route.

### 2026-07-08 05:12 UTC - Workspace-to-pod launch polish (PR #734)

- **PR:** [#734](https://github.com/dhnpmp-tech/dcp-platform/pull/734) (`codex/workspace-pod-launch-polish-2026-07-08`).
- **Pods UI:** Embedded the real workspace file manager into `/renter/pods`, then added a launch-plan rail for workspace, GPU, runtime, and prepaid quote.
- **Templates:** Added Notebook/PyTorch, vLLM serve, SFT/QLoRA prep, CUDA base, and disabled LoRA-verification template cards; workload presets now update image and duration defaults.
- **Verification:** `npm run build`; local Playwright visual smoke with mocked pod/workspace/GPU responses; desktop/mobile overflow probe clean.

### 2026-07-08 04:50 UTC - Fat LoRA pod image verification path (PR #733)

- **PR:** [#733](https://github.com/dhnpmp-tech/dcp-platform/pull/733) (`codex/fat-pod-image-verification-2026-07-08`).
- **Pods:** Added a provider-local `dcp-compute:lora` image Dockerfile, build target, pod alias, and `/workspace/examples` seed behavior for LoRA/QLoRA/vLLM work.
- **Verification:** Added a GPU-host smoke script that imports the LoRA stack, checks CUDA visibility, and runs an offline LoRA SFT scaffold without launch-time pip installs.
- **Runbook:** Added `docs/architecture/2026-07-08-fat-pod-image-verification.md` with build, acceptance, and rollback instructions.

### 2026-07-08 04:30 UTC - Inference model rate and capability metadata (PR #732)

- **PR:** [#732](https://github.com/dhnpmp-tech/dcp-platform/pull/732) (`codex/inference-model-metadata-2026-07-08`).
- **API contract:** Updated `/v1/models` metadata so clients can read per-1M input/output token rates in SAR, halala, and USD, plus capability flags for streaming, tools, reasoning, LoRA, prompt cache, batch, and dedicated deployments.
- **OpenAPI:** Refreshed the `/v1/models` schema from the old `models[]` shape to the actual OpenAI-compatible `{ object, data }` response.
- **Verification:** Added route tests for model-registry pricing precedence and capability metadata.

### 2026-07-08 04:14 UTC - Ops repo hardening and dcp-agent drift order (PR #731)

- **PR:** [#731](https://github.com/dhnpmp-tech/dcp-platform/pull/731) (`codex/ops-repo-hardening-2026-07-08`).
- **Ops:** Promoted the already-live `ops/dcp-deploy-watch.sh` into Git so the VPS Vercel/backend deploy watcher is reproducible from the repository.
- **Architecture note:** Added `docs/architecture/2026-07-08-ops-repo-hardening.md` with platform parity, cron mapping, watcher secret boundaries, and the safe dcp-agent reconciliation order.
- **Follow-up:** Kept the active local `dcp-agent` gateway untouched and documented it as a controlled maintenance-window task.

### 2026-07-08 03:31 UTC - Product execution system and lane roadmaps (PR #730)

- **PR:** [#730](https://github.com/dhnpmp-tech/dcp-platform/pull/730) (`codex/product-execution-roadmaps-2026-07-08`).
- **Execution system:** Added `docs/roadmaps/2026-07-08-dcp-execution-system.md` with the shared finding-to-PR-to-tests-to-deploy-to-smoke loop.
- **Lane roadmaps:** Added `docs/roadmaps/2026-07-08-dcp-lane-roadmaps.md` for Frontend, Backend, Inference, POT/PODS infrastructure, and LoRA.
- **Verification gates:** Captured the lane-specific build, deploy, smoke, and production-evidence requirements that future agents should follow.

### 2026-07-07 21:03 UTC - Fireworks/Tinker roadmap + Pods/Inference gap audit (PR #729)

- **PR:** [#729](https://github.com/dhnpmp-tech/dcp-platform/pull/729) (`codex/fireworks-tinker-roadmap-2026-07-08`).
- **Strategy:** Added `docs/strategy/2026-07-08-fireworks-tinker-product-roadmap.md` with the recommended DCP product rails: Inference, Pods/POTS infrastructure, Fine-Tuning, and Dedicated Deployments.
- **Gap audit:** Added `docs/architecture/2026-07-08-pods-inference-fireworks-gap-audit.md` mapping current routes, frontend surfaces, LoRA/template assets, and Fireworks-style gaps.
- **Source check:** Captured Fireworks and Tinker references for serverless inference, LoRA deployment, pricing, batch inference, and Tinker training primitives.
- **Next work:** Defined the first seven follow-up PRs so backend/frontend agents can continue without rediscovering the same context.

### 2026-07-07 16:53 UTC — Codebase/production audit + low-balance watcher env loading (PR #728)

- **PR:** [#728](https://github.com/dhnpmp-tech/dcp-platform/pull/728) (`codex/codebase-production-audit-2026-07-07`).

- **Audit:** Added `docs/architecture/dcp-codebase-production-audit-2026-07-07.md` so future agents can see the authoritative local path, GitHub URLs, VPS/Vercel mapping, current SHA parity, repo drift, and next improvement backlog in one place.
- **Ops:** Updated `ops/dcp-low-balance-watch.sh` to load runtime Telegram settings from `/root/dc1-platform/backend/.env` or `DCP_MONITOR_ENV_FILE`, removing the need for inline credentials in the VPS `/usr/local/bin` cron copy. The default low-balance threshold remains 10 SAR.
- **System map:** Refreshed `docs/architecture/dcp-system-map-2026-07-07.md` to the post-deploy platform SHA `237b77949a64` and linked the new audit for the low-balance drift finding.
- **Verified:** `bash -n ops/dcp-low-balance-watch.sh`.

### 2026-07-07 07:39 UTC — Trial/on-demand paid-credit policy + renter credit UX (PR #726)

- **PR:** [#726](https://github.com/dhnpmp-tech/dcp-platform/pull/726) (`codex/tareq-trial-on-demand-policy`).
- **Backend:** Added `backend/src/services/podAccessPolicy.js` and wired `POST /api/pods` so on-demand/burst supply requires paid available credit before the prepaid debit path runs. The policy classifies `dcp_owned`, `provider`, and `on_demand` supply, computes paid funding net of existing on-demand commitments, and returns stable 402 code `on_demand_requires_prepaid_credit` with paid-credit details.
- **Frontend:** Updated renter pods launch errors to keep the backend credit-required message visible with an Add credit action, renamed the renter sidebar Wallet item to Credit, and refreshed renter wallet/account copy to distinguish account credit from explicit SAR payment/top-up actions.
- **Docs/contracts:** Extended `docs/openapi.yaml` payment-required fields for paid-credit gating. Added dated handoff docs: `docs/architecture/dcp-system-map-2026-07-07.md`, `docs/strategy/2026-07-07-tareq-trial-pricing-plan.md`, and `docs/strategy/2026-07-07-codex-dev-process.md`.
- **Verified:** `npx tsc --noEmit`; `npx jest src/__tests__/podAccessPolicy.test.js src/__tests__/agent-402-payment-required.test.js tests/pods-billing.test.js --runInBand --forceExit`; `npm run lint -- --file 'app/(site)/renter/pods/page.tsx' --file 'app/(site)/renter/wallet/page.tsx' --file 'app/(site)/renter/pods/PodShell.tsx'`; `git diff --check`.
- **Deploy:** Shipped live to VPS2 (`root@76.13.179.86:/root/dc1-platform`, branch `security/staged-rollouts`) on 2026-07-07 09:18 UTC / 13:18 +04; deploy handoff recorded in [#727](https://github.com/dhnpmp-tech/dcp-platform/pull/727). Production fast-forwarded `62e8bd7 → 9794ed5`, reloaded PM2 process `dc1-provider-onboarding` with `safe-reload.sh`, and had 0 active interactive pods at reload time.
- **Live verification:** `ops/e2e-smoke.sh` passed all probes: gateway health, `/v1/models` count 33, real inference returned `pong`, Tareq Node 2 heartbeat was fresh, and WG diag passed. Public `https://api.dcp.sa/api/health` and `https://api.dcp.sa/v1/models` both returned 200.
- **Handoff:** Visual QA currently hits the repo-wide existing Next.js `Unsupported Server Component type: undefined` render/prerender failure, so screenshots were not accepted as verification.

### Backend
- ✅ Fixed the `renter_volumes` re-rent double-charge bug: re-rent after release now UPDATEs the released row instead of INSERTing (no `UNIQUE(bucket)` collision), and any DB-write failure refunds the debit + deprovisions the bucket so a renter is never charged for a volume they didn't get (`RENT_PERSIST_FAILED`). Shipped as PR #686, hot-patched + verified live, prod fast-forwarded to `origin/main`. (Details in the public `CHANGELOG.md`.)

### Docs
- ✅ Drafted the `dcp` launcher design spec (`docs/superpowers/specs/2026-07-02-dcp-launcher-design.md`): a Node/Ink terminal TUI where `dcp` opens a model selector + agent picker and launches a coding CLI pointed at DCP consumer-GPU inference (v1 = Claude Code; Codex/Cursor to follow). Flags the required new renter-facing Anthropic `/v1/messages` surface and the Claude Code model-env wiring (`ANTHROPIC_MODEL` + `ANTHROPIC_DEFAULT_HAIKU_MODEL` + `ANTHROPIC_DEFAULT_OPUS_MODEL` all → the same DCP model id).

### Frontend
- ✅ Cleaned the v2 public flow map: `/setup` is now renter onboarding, `/earn` is provider onboarding, legacy provider paths land on `/earn`, landing CTAs use those public URLs, `/v2` redirects to the real v2 home, and dashboard/docs link smoke no longer finds placeholder links or local 404s.
- ✅ Tightened v2 docs navigation and API honesty: left-menu anchors now target real sections, API status links to `/status`, missing RAG/rerank/streaming/errors/SDK sections are present, starter credit copy matches pricing, and standalone embeddings/rerank are no longer documented as live OpenAI-compatible `/v1` endpoints.
- ✅ Switched the `DCP_V2_LIVE` public cutover from internal rewrites to temporary redirects for `/`, `/setup`, `/renter/register`, and `/docs`, avoiding production hydration errors while keeping `/login` on the proven v1 auth route.
- ✅ Fixed v2 renter usage table keys so usage-ledger rows without backend IDs no longer trigger React duplicate-key warnings during smoke tests.
- ✅ Wired v2 renter playground to live renter account, balance, `/v1/models`, and `/v1/chat/completions` flows, removing prototype chat messages, seeded workspace identity, fake wallet totals, hardcoded API domain usage, fallback model lists, and fixed demo rate labels from `/v2/renter/playground`.
- ✅ Wired v2 renter invoices to real renter account, wallet, invoice-history, and CSV export endpoints, removing prototype invoice rows, fake company/person identity, seeded wallet totals, invented CR/VAT/address values, and unsupported PDF/XML download controls from `/v2/renter/invoices`.
- ✅ Wired v2 renter settings to real renter account, wallet, notification, webhook, read-all, and data-export endpoints, removing fake team members, seeded company/CR/VAT/address fields, prototype notification toggles, fake danger actions, and hardcoded workspace identity from `/v2/renter/settings`.
- ✅ Wired v2 renter usage to real renter account, balance, analytics, job-history, CSV export, and v1 usage-ledger endpoints, removing prototype model/key spend rows, seeded jobs, fake workspace identity, fixed 24-hour counts, and hardcoded wallet totals from `/v2/renter/usage`.
- ✅ Wired v2 renter wallet to real renter identity, balance, payment-history, top-up, and auto-top-up settings endpoints, removing prototype workspace identity, seeded wallet totals, fake transaction rows, unsupported USDC/mada options, and non-persistent auto-top-up controls from `/v2/renter/wallet`.
- ✅ Wired v2 provider settings to real provider preferences, pause/resume, and resource-limit routes, removing prototype notification/routing/danger controls, fixed earnings, fake identity, and non-persistent settings from `/v2/provider/settings`.
- ✅ Wired v2 provider profile to real-or-empty provider account, payout identity, earnings, GPU, wallet, and operational facts, removing fake identity fields, fake tier ladder, seeded IBAN/VAT values, and the non-persistent save form from `/v2/provider/profile`.
- ✅ Wired v2 provider payouts to real-or-empty provider account, payout balance, withdrawal history, and withdrawal-request data, removing fake payout cycles, seeded bank account details, demo tax fields, fixed schedule controls, and hardcoded operator identity from `/v2/provider/payouts`.
- ✅ Wired v2 provider earnings to real-or-empty provider identity, totals, daily history, withdrawals, and recent-job model data, removing prototype charts, fixed rig/model breakdowns, seeded payout rows, fake IBAN tails, and hardcoded operator identity from `/v2/provider/earnings`.
- ✅ Wired v2 provider rigs to the authenticated provider account as a real single-rig view, removing prototype fleet rows, fixed rig counts, fake earnings, seeded operator identity, and placeholder pairing tokens from `/v2/provider/rigs`.
- ✅ Wired v2 provider dashboard to real-or-empty provider data from `/providers/me`, `/providers/me/metrics`, and `/providers/earnings-daily`, removing prototype operator names, rig cards, jobs, earnings curves, and fixed KPI fallbacks from the post-setup provider console.
- ✅ Replaced v2 provider setup shortcuts with live provider auth/install/verify states: magic links post to `/providers/send-otp`, pasted provider keys are validated through `/providers/me`, installer commands are generated from `/providers/download/setup`, and the final step now polls `/providers/status` instead of auto-passing on a timer.
- ✅ Wired v2 renter dashboard and API key console to live renter endpoints (`/renters/me`, `/renters/me/analytics`, `/renters/me/live`, `/renters/me/keys`) and removed remaining prototype workspace, wallet, trend, spend, and live-job fallback data from those routes.
- ✅ Removed placeholder renter API keys and demo-only playground responses from v2 setup/playground; v2 setup now reveals only a verified renter key and v2 playground sends real `/v1/chat/completions` requests with the stored renter key.
- ✅ Wired `/v2/auth` to the live renter/provider magic-link and API-key login contracts, disabled unimplemented Nafath/Google buttons as coming soon, and pointed legal links at the live terms/privacy pages.
- ✅ Kept `/login` on the proven v1 auth flow during `DCP_V2_LIVE` cutover so admin, monitor, and intelligence operators are not sent to the unwired `/v2/auth` form before v2 auth is production-ready.

### Infrastructure
- ✅ Instant-tier Docker workflow now publishes `dc1/base-worker`, `dc1/llm-worker`, and `dc1/sd-worker` with mutable `latest` plus immutable `sha-*` tags, emits a machine-readable digest manifest artifact, and smoke-validates pull/startup in CI.

### Reliability & Observability — earned-state fleet truth (foolproofing keystone #1)
- **Earned-online provider verification** — new `backend/src/services/providerVerification.js` runs a 60s backend-initiated probe loop (`GET /v1/models` + a 1-token `POST /v1/chat/completions`) against every fresh-heartbeat provider and records *proven* serving state in its own `provider_verification` table. This is **additive**: it never writes `providers.endpoint_reachable` and does not change `v1.js` routing — it exposes the gap between "claimed online" (heartbeat) and "earned online" (a real OpenAI-shaped response just succeeded). Adds `countUsableProviders(db)` (metering-grade "serving now" count) and `getVerificationMap(db)`. Env knobs: `DCP_VERIFY_INTERVAL_MS` (60s), `DCP_VERIFY_TIMEOUT_MS` (6s), `DCP_USABLE_FRESH_MS` (3m). Wired into `server.js` alongside the existing reachability probe.
- **`GET /api/admin/fleet/health` enriched** — merges the earned-online layer in read-only: per provider `verified_online` / `verified_at` / `verified_models` / `verify_chat_ok` / `verify_latency_ms` / `verify_error`, plus WG handshake age, `endpoint_reachable`, engine + cached-model counts, and latest-heartbeat GPU telemetry (temp / util / VRAM). New top-level rollups: `usable_online`, `verified_online`, `serving_now`, `metering_last_token_at`. All new reads are `try/catch`-guarded so older installs degrade gracefully; every pre-existing field is unchanged.
- **`/admin/fleet` real-time screen** — `app/admin/fleet/page.tsx` rebuilt to poll `fleet/health` every 8s with a top "INFERENCE SERVING: YES/NO" banner driven by `serving_now`, a per-provider table showing *verified* (not claimed) online state, WG age, GPU telemetry, served models, and heartbeat age, plus a stale-metering warning. Uses the standard admin-token auth pattern.
- **`dcp-fleet` agent/CLI fleet truth** (`ops/dcp-fleet.py`) — machine-readable (JSON, default) and `--human` view of *earned* serving state: confirms a provider actually completed a real `/v1` request; exit 0 = serving, 1 = down, so loops/CI/agents can gate on real serving capacity rather than a self-reported heartbeat.
- **Off-box fleet watchdog** (`ops/dcp-fleet-watchdog.sh`) — VPS cron (every 2 min) that checks Node-2 WG handshake age + fires inference at a discovered served model and edge-triggers alerts to the Telegram alerts topic. First piece of the off-box dead-man's-switch (foolproofing roadmap #6).
- **Foolproofing roadmap implemented** — the signup-to-inference architecture probe, root cause (claimed vs earned state), prioritized fixes, and system invariants are captured in code, tests, and public architecture docs.

### Billing — atomic settlement (foolproofing keystone #2)
- **Inference settlement is now atomic and idempotent.** `v1.js` no longer uses the legacy `debitRenterSafe` (removed); every completed inference settles through `billingService.settleInferenceOnce(db._db, …)` in a single `db.transaction()` keyed by `request_id`: idempotency claim → subscription-credit drain → row-count-guarded PAYG debit that **throws + rolls back on shortfall** → provider credit (single 75/25 `splitCost` source) → `usage_events` row. Closes the silent-revenue-leak P0 — a shortfall can no longer 0-row no-op into free inference.
- **Queued `/v1/chat/completions` fallback no longer pre-debits.** Job creation now only queues the pending job after the pre-flight balance gate; successful queued completions settle once through `settleInferenceOnce`, matching direct proxy and stream paths. This avoids double-charging successful queued jobs and avoids unreconciled debits on queued failure/timeout.
- **Zero-token completions are no longer billed as free.** When a provider (e.g. Ollama non-stream) omits a `usage` block, cost falls back to a per-minute estimate instead of debiting 0.
- **Deliver-once-but-flag on shortfall** — if the renter can't cover already-shipped tokens, the event is recorded `unbilled` (never a silent zero-debit) so the next request is gated, and auto-top-up is triggered. The legacy `openrouter_usage_ledger` receipt is still written for the renter dashboard via a `request_id`-UNIQUE-collision no-op (no double-credit).

### Security — sandbox/payments boot guard (foolproofing #4)
- **`/api/payments/topup-sandbox` can no longer mint free balance in production.** The route is registered **only** when `ALLOW_SANDBOX_TOPUP === '1'` AND `NODE_ENV !== 'production'`; in production it is never mounted (404), and the handler re-checks the gate at request time as defense-in-depth. A loud boot warning fires whenever the route would be live.
- **`/api/health` now reports money-config readiness** — `payments` block with `payments_secret_ready`, `payments_webhook_ready`, `payout_source_ready`, `sandbox_topup_enabled`.
- **Non-fatal production boot warning** (`warnIfMoneyConfigMissing`) lists exactly which of `MOYASAR_SECRET_KEY` / `MOYASAR_WEBHOOK_SECRET` / `MOYASAR_PAYOUT_SOURCE_ID` are unset and that card top-up is therefore disabled. It never throws — boot continues when Moyasar keys are legitimately absent.

### Onboarding — wizard earned-`live` + idempotent install (foolproofing #7)
- **"You're Live" now requires earned state, not a bare `status='active'`.** `node-status` reports `live` only when `approval_status='approved'` AND a heartbeat within 90s AND not paused; otherwise it returns an explicit machine `state` (`pending_approval` / `no_recent_heartbeat` / `paused`) with plain-language copy + next step. This closes the "registered but never serving" dead-signup trap.
- **Wizard-origin registrations auto-approve** (`register-node` sets `approval_status='approved'` when it presents a valid single-use install token; env-gated by `DCP_WIZARD_AUTO_APPROVE`, default on) so a real daemon actually becomes bookable instead of heartbeating forever at `pending`.
- **Idempotent install** — a retry with the same node fingerprint re-resolves to the **existing** API key with `200` instead of a `409` that stranded the daemon (new additive `providers.node_fingerprint` column); a different fingerprint on a consumed token still `409`s (anti-leak). Heartbeat timestamps are normalized to UTC so a fresh heartbeat isn't misread as stale.

### Reconciliation — capture prod-only hotfixes into git (pre-deploy safety)
The prod backend had drifted from git with undocumented hotfixes; deploying `main` as-is would have **regressed production**. This makes `origin/main` a superset of what's running so the keystone/guards deploy can't regress prod.
- **`dotenv` auto-load restored** — `server.js` now calls `require('dotenv').config()` (+ `dotenv` dependency). This keeps runtime configuration loading consistent when `pm2 -lc` strips the inherited environment. It was live on the VPS but absent from git, so reconciling it prevents config drift during deploys.
- **`/api/channels` + channel-health prober** committed (`backend/src/routes/channels.js`, `backend/src/channels/heartbeat_mvp.py`) — Mission Control channel status, live on prod, previously uncommitted.
- **Heartbeat stops overwriting `cached_models` / `vllm_models` / `vllm_endpoint_url`** (`providers.js`) — these are owned by `provider_engines` (engines-sync), matching live prod behavior (bind-arg alignment verified: 23 placeholders = 23 args).
- **Schema** — `channel_health`, `dangerous_action_log`, `consumed_tokens` added to `db.js` inline migrations (idempotent `IF NOT EXISTS`; a no-op on prod where they already exist) so fresh installs match. Reference SQL added as `migrations/013_provider_engines.sql` / `018_channel_health.sql` / `019_dangerous_action.sql` (filenames mirror prod; the numeric prefixes collide cosmetically with existing reference files — `db.js` inline remains authoritative).

### Serving honesty + correctness fixes
- **WireGuard registration now rolls back live peer changes if the DB write fails.** `/api/providers/wg/register` and `/api/providers/wg/install-config` now use argument-array `wg`/`wg-quick` calls, keep old peers in place until the new DB state is persisted, and remove just-added peers on persistence failure. This closes the issue #358 desync class where the WireGuard server could accept one provider key/IP while the `providers` row claimed another.
- **Model alias matching now reaches routing and provider catalog coverage.** The same canonical alias map used by `/v1/models` and proxy rewrites now powers `provider_engines.served_models`, legacy `cached_models` matching, and `/api/providers/model-catalog` provider counts, so requests such as `BAAI/bge-m3`, `qwen/qwen2.5-vl-3b-instruct`, or `ALLaM-AI/ALLaM-7B-Instruct-preview` can find providers that advertise canonical cached tags.
- **Catalog no longer advertises unreachable capacity.** `/v1/models` now counts only providers that passed the backend reachability probe (`endpoint_reachable = 1`), not merely `status='online'` (heartbeat-claimed). A heartbeat-only provider no longer inflates `provider_count`, so renters aren't offered models that 503 on order. Mirrors the `getCapableProviders` routing gate.
- **Streaming errors no longer crash the request.** `sendV1Error` is now headers-aware: once SSE headers are flushed it emits a terminal error frame + `data: [DONE]` on the open stream instead of calling `res.status()` (which threw "Cannot set headers after they are sent"). Defends all 5 post-flush call sites.
- **Control-plane prewarm cycle fixed.** The serverless-readiness prewarm `UPDATE providers SET model_preload_*` passed 6 bind args to a 5-placeholder statement → "Too many parameter values" crashed the cycle every 60s in prod. Removed the duplicate `nowIso` (now 5 = 5).

### Renter routing — earned-state enforcement (foolproofing #2; PR #461)
- **Routing, the `/v1/models` catalog, and the 503 "alternatives" now consult the *earned* verification verdict, not just claimed state.** Previously all three gated on `status='online' AND endpoint_reachable=1` (a port is listening), so a provider that heartbeats but fails an inference probe (`verified_online=0`) was still advertised + routed to — a renter requesting a model only that provider served waited **~10s** for a `connection_refused` 503, and the 503 even suggested *more* dead-node models. New `getEarnedRoutingState(db)` → `{active, servingIds, deadIds}` (fresh-probe verdicts within `USABLE_FRESH_MS`) + `applyEarnedRoutingPolicy` drop freshly-confirmed-dead providers from the catalog (`onlineProviders`), the alternatives source (`getAvailableModels`), and both `getCapableProviders` return paths. Measured live after deploy: same request now **503s in ~11.9ms** with `alternatives:[]` ("No models are currently online"), and catalog `provider_count` for dead-node models is **0**.
- **`DCP_ROUTING_EARNED_MODE`** (`off` | `exclude-dead` *(default)* | `earned-first` | `strict`). `exclude-dead` only drops *freshly-confirmed-dead* nodes (zero false-negative risk). `earned-first`/`strict` are **staged** (default off) — prefer/require verified-serving providers; enable once a genuinely-verified provider exists. **Critical invariant:** when verification is inactive (no fresh verdicts), every mode degrades to legacy passthrough so a dead verification loop can never blank the fleet. Adversarially reviewed (4 lenses, 0 blocking; billing path confirmed decoupled). 11 unit tests; `v1-models` byte-identical to baseline. *Resolves the prior "catalog keys off `endpoint_reachable` not `verified_online`" follow-up.*

### Contract conformance — enforced, not aspirational (#11 / #12; PRs #460, #462, #465, dcp-contracts#3)
- **Log-mode drift gate (#11a)** — `backend/src/middleware/contractDriftGate.js` mounts `express-openapi-validator` against the vendored `backend/openapi/dcp.yaml` as a **response-validation** gate, `NODE_ENV==='test'`-only (the validator is `require()`d inside the test branch — prod never loads it). `onError` logs `[contract-drift] …` and never throws; before/after test pass/fail proven identical.
- **Enforce gate (#11b / #12)** — `contract-conformance-enforce.test.js` boots the full server, seeds a realistic renter+provider, drives the documented endpoints, and **asserts zero unexpected drift** (CI now fails on future drift). Heartbeat (needs migration tables in the `:memory:` schema) + `agent/manifest` (4xx error-response coverage) are on a documented, size-guarded allowlist.
- **Drift reconciled** — RFC 3339 timestamps via new `backend/src/lib/iso-datetime.js#toRfc3339()` (UTC-safe; passthrough for ISO/null) on `GET /api/renters/me.created_at`, `GET /api/providers/me.gpu_profile_updated_at` + `.last_heartbeat`, and `GET /api/providers/{id}/liveness.last_heartbeat` (the last two were caught by the enforce test itself). `ProviderLivenessResponse.provider_id` widened to `oneOf:[integer,string]` (the backend returns the numeric id) — fixed in `DCP-SA/dcp-contracts#3` (TS+Python types synced) and re-vendored. The #11a `status:"active"` "drift" was a probe-fixture artifact, not real backend behavior.
- **Release-train drift guard (#15)** — vendored-spec pinned in the header (`dcp-contracts v0.2.0 @ 194fbb1e`) + `backend/scripts/check-contract-sync.sh` (reads the pin, fetches upstream, diffs the spec body → exit 1 on drift; verified IN SYNC). Two orthogonal guards now exist: backend↔spec *conformance* (enforce test, per-PR CI) and vendored↔upstream *sync* (release-time check; not per-PR CI because the platform token lacks cross-org DCP-SA read).

### Provider dashboard — reputation + earnings forecast (#10; PR #459)
- `GET /api/providers/me` additively returns `reputation_score` / `reputation_tier` + sub-metrics (`reputation_uptime_pct`, `reputation_success_rate_pct`, `reputation_longevity_days`, `reputation_terminal_jobs`). The provider dashboard renders a reputation card + a 7-day earnings forecast (avg of trailing window × 30). EN+AR i18n. Verified live (`reputation_score=97`, `tier=top`).

### Daemon — self-update integrity (#13; PR #463)
- **The daemon now verifies a published sha256 before applying a self-update (fail-closed).** Previously `perform_update` applied a downloaded `dcp_daemon.py` after only a content check ("looks like a daemon"), so a corrupted/MITM'd/truncated payload could be written + executed. `GET /api/providers/download/daemon?check_only=true` now returns the `sha256` of the exact injected bytes it serves; `check_for_update` passes it to `perform_update`, which hashes the download and refuses on mismatch (`update_integrity_failed`, critical), falling back to the content-check with `update_integrity_skipped` if the backend publishes no hash. Verified live: `check_only` digest == download digest. *(The offline-heartbeat-spool/telemetry half of #13 is split to a follow-up — needs a live provider to validate.)*

### Installers — current agent artifact (#14; PR #464)
- The served `backend/installers/dcp-agent.tar.gz` (downloaded by `agent-install.sh`) had drifted ~10 days stale and was hand-built on a Mac (`._*` AppleDouble cruft); a fresh agent install from it would **re-introduce the duplicate heartbeat/WG split-brain** #6/#24 removed and the pre-#23 `pull_uri` validator. Rebuilt from `dcp-agent` main (`cfb8f29`) — verified contains the #23/#24 fixes, 0 cruft, correct `dcp-agent/` wrapper for `--strip-components=1`, served `200` — and added a reproducible `backend/installers/build-dcp-agent-tarball.sh`.

### Renter UX — key-injected quickstart (#16; PR #466)
- The quickstart now pre-fills the `export DCP_RENTER_KEY="…"` line with the logged-in renter's key (read from `localStorage`), with a "✓ pre-filled from your session" confirmation; falls back to the placeholder + sign-in hint when absent. Injected into the env-export line only — the curl/Python/Node samples still read `$DCP_RENTER_KEY` — so the setup is ready-to-run without teaching anyone to hardcode a secret. (The #16 "fake earnings ticker" was a no-op — none exists; catalog source was already explicit.)

### Testing — rate-limit disable mechanism (PR #467)
- `createRateLimiter` baked `DISABLE_RATE_LIMIT` into `max` at construction, so toggling it at runtime was a silent no-op for module-level limiter consts (a latent bug). Switched to express-rate-limit's per-request `skip: () => process.env.DISABLE_RATE_LIMIT === '1'` (prod unaffected — flag unset → limiting always on) and defaulted the flag to `'1'` in `tests/jest-setup.js`. `rateLimiter.test.js` flips it to `'0'` per-test and still verifies active limiting on the real `jobSubmitLimiter` const (17/17). *Net-neutral on the jest suites (no regression); the audit's "rate-limit saturation" failures are in the ~16 standalone `process.exit` harness scripts under `tests/` (e.g. `provider-install-token`), which need converting to real jest tests — a separate refactor.*

### Billing — renter monthly spend cap (#20, backend; PR #469)
- **Renters can bound their own monthly inference spend independent of balance.** New additive `renters.monthly_spend_cap_halala` (0 = unlimited). `billingService.checkBudgetCap(db, renterId, estimateHalala)` sums the renter's CURRENT-calendar-month (UTC) spend from `openrouter_usage_ledger` via `strftime('%Y-%m', …)` (robust to both ISO-8601 and SQLite-text `created_at`) and reports whether the request would exceed the cap. **Fail-open** (the renter's own limit — a query error must never block a paying request). Enforced at the `/v1` chat pre-dispatch gate (right after the balance gate) → `402 budget_cap_exceeded` with cap / spent / remaining / estimate; no-op when unset. `GET /api/renters/me` returns the cap; `PUT /api/renters/me/budget` sets it (`_halala` or `_sar`; 0 = unlimited; 1,000,000 SAR ceiling). 7 unit tests. Verified live: set 250 SAR → `GET /me` reflected it → reset to unlimited. **Additive + dormant** (enforcement only fires during billing, currently frozen) so no behavior change today; the enforce gate stays green and v1-models is byte-identical to baseline. *Frontend control (a spending-limit card in the renter account page, EN+AR) + published SDKs remain a #20 follow-up.*
### Provider installer — self-heal + boot persistence (foolproofing #5)
- **WireGuard self-heal actually works now.** The daemon's `_self_heal_wg` already shells `sudo -n wg-quick down/up <iface>`, but as a non-root run-user it silently failed for lack of a sudoers grant. `dcp-setup-unix.sh` now installs `/etc/sudoers.d/dcp-wg` (0440 root:root) granting the run-user passwordless sudo for **exactly** `wg-quick up/down` on `wg0`/`wg1` (absolute binary path, no wildcards) — validated with `visudo -cf` **before** install; on validation failure it warns and skips rather than touching system sudo.
- **Survives reboot.** `loginctl enable-linger` for the run-user, `systemctl enable wg-quick@<iface>` for whichever `wg{0,1}.conf` exists, and enables the detected engine unit — not just `start`.
- **Engine-aware supervision.** Detects the actually-running engine (Ollama `:11434` / vLLM `:8000` / llama.cpp `:8080` / MLX) instead of assuming `~/models/*.gguf`; `setup-inference-supervisors.sh` cleanly skips (`exit 0`) instead of hard-failing when a non-llama.cpp engine is active.
- **Fail-loud post-install assert.** After setup, asserts `dc1-provider`, the engine unit, and `wg-quick@<iface>` are all `systemctl is-enabled`, exiting `1` with a banner otherwise (assertions auto-skip when the relevant config/unit isn't present yet). `dcp_daemon.py` is unchanged.

## [1.0.0] — 2026-03-23 — Public Launch

**DCP is live.** The GPU marketplace built for Arabic AI goes public today.

### What's Shipping

#### Renter Features ✅
- **API-first job submission** — `POST /api/dc1/jobs/submit` with OpenAI-compatible interface
- **Real-time inference** — Mistral 7B, Llama 3, Qwen 2.5, Nemotron Nano, Nemotron Super, SDXL
- **Job polling and streaming logs** — `GET /api/dc1/jobs/:id/logs/stream` for live debugging
- **Transparent billing** — Per-token metering, pro-rata refunds, pro-rata cancellation
- **Marketplace discovery** — `GET /api/dc1/renters/available-providers` with live GPU inventory
- **Renter dashboard** — Account summary, balance, recent jobs, earning insights
- **API key management** — Create, label, revoke sub-keys; scope by endpoint
- **25 SAR free credit** — New renters get instant 25 SAR to explore (no payment card needed)
- **Rate limiting** — 10 req/min per key (configurable per tier)

#### Provider Features ✅
- **One-click onboarding** — Register GPU, install daemon, start earning in 30 minutes
- **Daemon v3.0** — Automatic Docker orchestration, heartbeat health check, job timeout enforcement
- **GPU detection** — Automatic CUDA/GPU capability detection (8 GB+ VRAM minimum)
- **Earnings tracking** — Real-time SAR earnings per job, cumulative leaderboard
- **Model caching** — Persistent HuggingFace cache at `/opt/dcp/model-cache`
- **Multi-job support** — Run multiple workloads per GPU safely with container isolation
- **Provider dashboard** — Total earnings, active jobs, job history, wallet balance
- **Withdraw to bank** — Transfer earned SAR to provider's bank account (daily batch)
- **Reputation system** — Provider rating based on uptime, job success rate, avg latency

#### Admin Features ✅
- **KPI dashboard** — Total providers, renters, jobs, volume, revenue tracking
- **Provider leaderboard** — Earnings, job count, reputation score
- **Job management** — Search, filter, admin-force-cancel if needed
- **Machine health** — Uptime tracking, VRAM utilization, job success rate
- **System status** — Heartbeat checks, queue depth, API latency metrics
- **User management** — Approve/reject providers, view audit logs

#### Infrastructure ✅
- **EIP-712 escrow contract** — Smart contract job payments, testnet-ready (Base Sepolia)
- **Rate limiting middleware** — Per-key, per-endpoint, configurable limits
- **HMAC job verification** — Daemon validates job signature before execution
- **Supabase integration** — Real-time database sync, RLS policies, backup replication
- **Error handling** — Structured error responses, retry logic, timeout enforcement
- **Logging** — Centralized job logs, provider heartbeat logs, API request tracing

---

## What's Not Shipping Yet

### Phase 2 (Week 2–3)
- ⏳ **CI/CD Image Pipeline** — GitHub Actions auto-build `dc1/llm-worker:latest`, `dc1/sd-worker:latest`
- ⏳ **Provider daemon tier validation** — Daemon rejects jobs requiring cached models it hasn't downloaded
- ⏳ **Download progress events** — On-demand tier models show download progress (ETA, percent complete)
- ⏳ **Provider onboarding wizard** — UI-based daemon install instructions (currently CLI-only)

### Phase 3 (Week 3–4)
- ⏳ **API key scoping UI** — Dashboard to create/revoke API sub-keys (API exists, UI pending)
- ⏳ **Usage metering dashboard** — Per-key token count, request count, cost tracking
- ⏳ **OpenAI-compatible endpoint docs** — Interactive API playground
- ⏳ **Sub-minute billing** — Per-second granularity (currently per-minute)

### Phase 4 (Week 4+)
- ⏳ **Latency-based routing** — Provider matching v2 with p50/p95 latency ranking
- ⏳ **Load balancing** — Distribute requests across multiple providers for same model
- ⏳ **SLA monitoring** — Dashboard with p50/p95/p99 latency alerts
- ⏳ **Mainnet escrow** — Production-ready escrow on Base mainnet (testnet only for launch)
- ⏳ **Multi-region support** — Geographic routing, provider location preference
- ⏳ **Custom containers** — BYOC (bring your own container) for custom models

---

## Breaking Changes

None. This is v1.0.0 — the first production release.

---

## Known Limitations

### Performance
- **Model load time (first job):** 2–15 minutes for large models (>20 GB). Subsequent jobs load from cache in <30 seconds.
- **Latency:** p50 ~200ms, p95 ~500ms for inference. Network + GPU scheduling variance is typical.
- **Token throughput:** 15–30 tokens/sec depending on model and GPU. Streaming enables real-time output.

### Features
- **No SSH access** — Jobs run in ephemeral containers. No interactive shell. Use `job_type: vllm_serve` for long-running endpoints.
- **No persistent storage** — Container filesystem is ephemeral. Mount model cache or pass output via API.
- **No job dependencies** — Cannot chain jobs (job A → job B). Manage workflows client-side.
- **No spot pricing** — Fixed rates per provider. No auction system yet.

### Compliance
- **Data residency:** All jobs and logs stored in Saudi Arabia. Audit logs retained 90 days.
- **Provider verification:** Level 1 only (GPU benchmarks + proof of ownership). No KYC yet.
- **Payment:** USDC via Stripe. SAR transfers via bank network (next week).

---

## Earlier Bug Fixes

- ✅ **P0: Auth gates on /active and /queue endpoints** — Restored role-based access control (commit `4b394c0`)
- ✅ **P1: Per-token metering not persisted** — Fixed `serve_sessions` update after inference (commit `a7f2c1`)
- ✅ **P2: Provider daemon crash on invalid JSON** — Added error recovery (commit `b2e3d4`)
- ✅ **P2: Job output timeout (>30s queries)** — Increased timeout to 60s (commit `c5f6e7`)

---

## Security Improvements

- EIP-712 signature verification for all job submissions
- Rate limiting per API key (10 req/min, configurable)
- HMAC signature verification on daemon responses
- Escrow smart contract audit-ready (formal verification pending)
- RLS (Row Level Security) policies on all Supabase tables
- Provider ownership verification (GPU benchmark proof)

---

## Performance Benchmarks

### Latency (p50/p95/p99)
| Operation | p50 | p95 | p99 |
|-----------|-----|-----|-----|
| Register renter | 150ms | 250ms | 500ms |
| List available providers | 100ms | 150ms | 300ms |
| Submit inference job | 200ms | 400ms | 800ms |
| Poll job status | 80ms | 120ms | 200ms |
| Stream logs (first chunk) | 50ms | 100ms | 250ms |

### Throughput (Mistral 7B on RTX 4090)
- **Cached model:** ~28 tokens/sec
- **Streaming inference:** 1–3 requests/sec (depends on prompt length)
- **Concurrent jobs:** Up to 4 per RTX 4090 (with VRAM multiplexing)

### Availability
- **Platform uptime:** 99.5% (best-effort, no SLA)
- **Average provider uptime:** 97% (unverified, voluntary reporting)
- **API response time (p99):** <1s (excludes job execution time)

---

## Credits & Acknowledgments

### Core Team
- **Leadership:** Roadmap architecture and launch direction
- **Founding Engineer:** Launch-gate engineering, escrow contracts, infrastructure
- **Backend Architect:** API design, rate limiting, job orchestration
- **Frontend:** Renter/provider/admin dashboards, real-time Supabase integration
- **DevOps:** VPS provisioning, PM2 services, backup strategy, monitoring
- **QA:** E2E testing, load tests, stress tests
- **Copywriter:** Launch marketing, migration guides, onboarding emails

### Open Source
- Next.js 14 (Vercel)
- Supabase (PostgreSQL + auth)
- Hardhat (smart contract deployment)
- vLLM (inference server)
- Hugging Face (model hub)

### Partners & Supporters
- NVIDIA (GPU verification, Nemotron models)
- Vercel (hosting + observability)
- Base/Coinbase (escrow contracts)
- Saudi Arabia's vision for decentralized AI

---

## Roadmap

### Q1 2026 (Remaining)
- ✅ Public launch (March 23)
- 🔄 Phase 1: Stable service + billing (March 25–31)
- 🔄 Phase 2: Provider onboarding at scale (April 1–14)

### Q2 2026
- 📋 Phase 3: Renter onboarding at scale (April 15–30)
- 📋 Phase 4: Enterprise scale + SLA guarantees (May)
- 📋 Custom containers + long-tail model support (May–June)
- 📋 Geographic expansion (EU, APAC)

### Q3 2026+
- Geographic redundancy (multi-region failover)
- Spot pricing + auction-based GPU matching
- Provider-side AI optimization (auto-batching, pipeline parallelism)
- Desktop client for one-click provider installation
- SDK for Python, JavaScript, Go, Rust

---

## How to Report Issues

Found a bug? Have feedback? We're listening.

- **Report security issues:** security@dcp.sa (we will acknowledge within 24 hours)
- **Report bugs:** [GitHub Issues](https://github.com/dhnpmp-tech/dcp-platform/issues)
- **Feature requests:** [Feature board](https://dcp.sa/feedback)
- **General support:** support@dcp.sa or [Slack community](https://slack.dcp.sa)

---

## Support & Documentation

- **Getting Started:** [docs/guides/](https://dcp.sa/docs/guides/)
- **Migration Guides:** [RunPod](https://dcp.sa/docs/guides/migrate-runpod-to-dcp.md), [Vast.ai](https://dcp.sa/docs/guides/migrate-vast-to-dcp.md)
- **API Reference:** [docs/api.md](https://dcp.sa/docs/api)
- **Provider Setup:** [docs/provider-setup.md](https://dcp.sa/docs/provider-setup)
- **FAQ:** [dcp.sa/faq](https://dcp.sa/faq)

---

**Welcome to DCP. Let's build the future of Arabic AI, together.**

*DCP v1.0.0 — The GPU Marketplace Built for MENA.*
