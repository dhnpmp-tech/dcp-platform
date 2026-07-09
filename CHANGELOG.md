# Changelog

This is the canonical public changelog for the `dhnpmp-tech/dcp-platform`
repository.

Format:
- newest entries first
- timestamps are UTC merge times
- every entry links to the GitHub PR
- each entry lists what was included, not just a feature headline

Internal handoffs, private operations notes, generated reports, and launch
checklists do not belong in this public changelog.

## [Unreleased]

### 2026-07-09 14:44 UTC - `feat(pods): add collapsible workspace folder index and GPU request rail - PR #893`

**PR:** [#893](https://github.com/dhnpmp-tech/dcp-platform/pull/893) (`codex/pods-workspace-collapsible-gpu-clarity-2026-07-09`).
**Local timestamp:** 2026-07-09 18:44 +04.

**What:** Tareq pods/workspace feedback follow-up. Keeps large staged workspaces scannable, answers trial-account handling directly, and makes the actual GPU request more prominent while browsing cards.

- **Workspace organization:** The compact Stage 1 checkpoint now has a collapsible folder index, letting renters browse all folders and open one folder without expanding the full manifest or scrolling through every file.
- **Stage clarity:** The Stage 2 rail now names the decision as the template plus actual GPU request, keeping Stage 1, Stage 2, and Stage 3 visible as distinct launch decisions.
- **GPU request clarity:** The selected-GPU strip is now a sticky final-launch-request rail while browsing GPUs, and it separates the final request from browse-only VRAM filters.
- **Trial routing clarity:** The pod launch flow now states whether a live trial-account tag exists, surfaces credit-provenance/grant-balance handling, and keeps native/community trial routing distinct from paid high-demand routing.
- **Regression:** Updated the focused `/renter/pods` Playwright regression for folder-index browsing, trial-tag answer copy, and the final-launch GPU request rail.
- **Safety:** Frontend/read-only UX change; no pod launch body change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, workspace API behavior, GPU-host execution, vendor/provider exposure, or supply-tier exposure was added.
- **Verification:** Focused `/renter/pods` Playwright regression; TypeScript; Next build; `git diff --check`.

### 2026-07-09 14:30 UTC - `feat(inference): expose prompt-cache and batch live proof gates - PR #892`

**PR:** [#892](https://github.com/dhnpmp-tech/dcp-platform/pull/892) (`codex/inference-batch-live-proof-readiness-2026-07-09`).
**Local timestamp:** 2026-07-09 18:30 +04.

**What:** Fireworks/Tinker inference roadmap slice. Makes the blocked live acceptance gates visible in prompt-cache and batch readiness contracts, proofs, OpenAPI, and product surfaces without enabling discounts or execution.

- **Prompt-cache readiness:** `GET /v1/prompt-cache/readiness` now names the blocked `prompt_cache_provider_discount_smoke` live gate, the exact opt-in proof command, blockers, and verified no-discount evidence expectations.
- **Batch readiness:** `GET /api/batches/readiness` now names the blocked `batch_live_execution_discount_smoke` gate, the exact opt-in proof command, blockers, and result/download/discount verification expectations.
- **Product surfaces:** Public `/inference`, public `/batch`, and renter `/renter/batches` now surface the blocked live proof gates from readiness metadata so users see what evidence is still missing before prompt-cache discounts or batch execution claims.
- **Proofs/contracts:** Prompt-cache and batch contract proof packets now include the live-acceptance metadata, and public OpenAPI copies document both readiness gate blocks.
- **Safety:** Read-only contract/UI/docs/proof change; no prompt-cache discount, provider KV-cache control, batch execution, result object write/download, settlement, billing, model batch flag, route selection, provider routing, or balance mutation was enabled.
- **Verification:** OpenAPI YAML parse; targeted prompt-cache/batch/v1 Jest suites; prompt-cache contract proof; batch inference contract proof; focused `/inference` and `/renter/batches` Playwright regressions; TypeScript; local roadmap proof suite passing 35/35 gates; Next build; `git diff --check`.

### 2026-07-09 14:09 UTC - `feat(pods): polish workspace folders, trial policy, and GPU request UX - PR #891`

**PR:** [#891](https://github.com/dhnpmp-tech/dcp-platform/pull/891) (`codex/pods-workspace-trial-gpu-polish-2026-07-09`).
**Local timestamp:** 2026-07-09 18:09 +04.

**What:** Tareq pods/workspace feedback follow-up. Makes the launch flow more folder-first, makes trial handling answerable without reading chips, and makes the actual GPU request harder to confuse with browse filters.

- **Workspace organization:** The compact Stage 1 workspace checkpoint now exposes top folder controls directly, so renters with many staged files can open one folder from the summary instead of expanding the full manifest.
- **Workspace actions:** The compact checkpoint now uses a clearer "Manage files" action while preserving the direct continue-to-Stage-2 path.
- **GPU request clarity:** Stage 2 now labels the source-of-truth panel as the actual launch GPU, makes auto-pick say no GPU is pinned, and renames the VRAM control to a browse-only filter.
- **Trial routing clarity:** `/renter/pods` now has a dedicated trial routing policy block that states credit-provenance handling, native/community trial routing, paid high-demand routing, and hidden provider identity.
- **Regression:** Updated the focused `/renter/pods` Playwright regression for compact folder controls, the trial policy block, and the clearer actual-GPU/browse-filter wording.
- **Safety:** Frontend/read-only UX change; no pod launch body change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, workspace API behavior, GPU-host execution, vendor/provider exposure, or supply-tier exposure was added.
- **Verification:** TypeScript; focused `/renter/pods` Playwright regression; Next build; `git diff --check`.

### 2026-07-09 13:42 UTC - `feat(pods): sharpen workspace, trial, and GPU request UX - PR #890`

**PR:** [#890](https://github.com/dhnpmp-tech/dcp-platform/pull/890) (`codex/pods-workspace-gpu-trial-ux-2026-07-09`).
**Local timestamp:** 2026-07-09 17:42 +04.

**What:** Tareq pods/workspace feedback follow-up. Makes the launch flow answer the three operator questions directly: where the staged workspace ends, whether the account is trial-tagged, and what GPU request will be sent.

- **Stage clarity:** The launch plan now names Stage 1, Stage 2, Stage 3, and Launch instead of mixing numbered flow items with stage headers.
- **GPU request clarity:** Stage 2 now has an explicit auto-pick/fixed-GPU mode control, keeps auto-pick selected until a GPU card is chosen, and shows the final GPU request again in the launch review.
- **Trial routing clarity:** `/renter/pods` now states whether trial handling is explicit-tag based or credit-provenance based, alongside trial-capacity and high-demand paid-credit copy from the backend readiness packet.
- **Workspace continuity:** The existing compact Stage 1 workspace checkpoint and folder-first disclosure remain the path for large workspaces, with the launch review preserving the workspace state near the launch action.
- **Regression:** Updated the focused `/renter/pods` Playwright regression for the new Stage 2 decision panel, trial-account wording, request-mode segmented control, and final launch review.
- **Safety:** Frontend/read-only UX change; no pod launch body change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, workspace API behavior, GPU-host execution, vendor/provider exposure, or supply-tier exposure was added.
- **Verification:** Focused `/renter/pods` Playwright regression; Playwright visual smoke of the Stage 2 decision and launch review panels; TypeScript/Next build; `git diff --check`.

### 2026-07-09 13:24 UTC - `feat(pods): surface infrastructure proof readiness and launch UX - PR #889`

**PR:** [#889](https://github.com/dhnpmp-tech/dcp-platform/pull/889) (`codex/pods-infrastructure-proof-readiness-2026-07-09`).
**Local timestamp:** 2026-07-09 17:24 +04.

**What:** POT/PODS roadmap slice and Tareq launch UX follow-up. Makes workspace-to-pod and LoRA pod-image proof gates visible through the existing pod readiness contract, while making the pod launch flow easier to scan with large workspaces.

- **Backend contract:** Extended `GET /api/pods/trial-routing/readiness` with `infrastructure_proofs` for the CI-safe workspace contract, the opt-in workspace live acceptance command, and the LoRA pod-image provider-host proof command.
- **Workspace UX:** `/renter/pods` now defaults Stage 1 to a compact ready checkpoint when a renter already has staged files, with explicit open-workspace and continue-to-Stage-2 actions so large workspaces no longer force a file-manager scroll before compute selection.
- **GPU request clarity:** Stage 2 now reads as "Template + GPU request"; the launch request strips call out auto-pick vs fixed GPU, template VRAM recommendations, browse filters, and trial-credit provenance without implying filters select the launch GPU.
- **Frontend visibility:** `/renter/pods` now shows a compact "Pod proof gates" strip with workspace contract, workspace live acceptance, and LoRA image proof status while keeping live GPU-host proof explicitly blocked.
- **Docs/contracts:** OpenAPI now documents the infrastructure proof block, and roadmap notes link the pod UX to the existing proof commands.
- **Regression:** Updated pod readiness Jest/proof coverage and the focused `/renter/pods` Playwright test so proof gates, compact workspace behavior, GPU request wording, trial-policy chips, and false-claim guards cannot drift.
- **Safety:** Read-only contract/UI/docs change; no pod launch body change, image selection change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, workspace API behavior, GPU-host execution, vendor/provider exposure, or supply-tier exposure was added.
- **Verification:** OpenAPI YAML parse; targeted pod readiness Jest/proof suites; pod trial-routing readiness proof; focused `/renter/pods` Playwright regression; TypeScript; local roadmap proof suite passing 35/35 gates; Next build; `git diff --check`.

### 2026-07-09 12:40 UTC - `feat(pods): clarify workspace manifest and GPU request - PR #888`

**PR:** [#888](https://github.com/dhnpmp-tech/dcp-platform/pull/888) (`codex/pods-workspace-compute-clarity-2026-07-09`).
**Local timestamp:** 2026-07-09 16:40 +04.

**What:** Tareq feedback follow-up for `/renter/pods`. Makes Stage 1 feel like a checkpoint instead of a file wall and separates GPU browsing filters from the actual GPU request sent at launch.

- **Workspace manifest:** Added a compact Stage 1 manifest with file/group counts, total size, folder count, a review-folders action, and a primary continue-to-Stage-2 action so large workspaces do not force a full file scan.
- **GPU request clarity:** Renamed the selected-compute summary to "Launch GPU request", added fixed-vs-auto request mode chips, and made auto-pick explicitly say no fixed GPU type is selected.
- **Filter clarity:** VRAM controls now read as card filters and show a warning when a renter filters cards without selecting a GPU, preventing the filter from being mistaken for a launch constraint.
- **Trial policy clarity:** Trial handling now reads as explicit tag vs credit provenance beside the backend-synced credit policy.
- **Regression:** Extended the focused `/renter/pods` Playwright test to cover the workspace manifest, Stage 2 continuation, request mode, trial handling, and card-filter wording.
- **Safety:** Frontend-only UX/copy change; no pod launch body change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, workspace API behavior, vendor/provider exposure, or supply-tier exposure was added.
- **Verification:** Focused Playwright browser regression for `/renter/pods`; TypeScript; Next build; `git diff --check`.

### 2026-07-09 12:21 UTC - `feat(lora): surface adapter deployment proof readiness - PR #887`

**PR:** [#887](https://github.com/dhnpmp-tech/dcp-platform/pull/887) (`codex/lora-deployment-proof-readiness-surface-2026-07-09`).
**Local timestamp:** 2026-07-09 16:21 +04.

**What:** LoRA/deployment roadmap slice. Makes the existing adapter deployment lifecycle proof discoverable through `/api/lora/readiness`, OpenAPI, and Fine-Tuning product/console surfaces.

- **Readiness contract:** Added `adapter_deployments.deployment_contract_proof` to the LoRA readiness response with proof status, command, local-roadmap gate id, and verified lifecycle invariants.
- **Frontend visibility:** The renter Fine-Tuning readiness grid now shows deployment proof status beside the load-proof-required deployment state, and the public Fine-Tuning page/snippets point users and agents at the deployment proof command and readiness field.
- **Docs/contracts:** Updated OpenAPI and roadmap notes so the deployment proof signal is discoverable from API docs as well as product copy.
- **Safety:** Read-only contract/UI/docs change; no adapter registration behavior, artifact upload, deployment creation, load-proof attach, route traffic, usage/billing write, balance mutation, provider/vendor exposure, or GPU-host execution was enabled.
- **Verification:** OpenAPI YAML parse; targeted LoRA readiness Jest suite; adapter deployment contract proof; TypeScript; focused Fine-Tuning Playwright regression; Next build; local roadmap proof suite passing 35/35 gates; `git diff --check`.

### 2026-07-09 12:10 UTC - `feat(pods): improve workspace folder disclosure - PR #886`

**PR:** [#886](https://github.com/dhnpmp-tech/dcp-platform/pull/886) (`codex/pods-workspace-folder-disclosure-2026-07-09`).
**Local timestamp:** 2026-07-09 16:10 +04.

**What:** Tareq feedback follow-up for `/renter/pods`. Makes large staged workspaces folder-first and makes the trial-credit handling visible beside selected compute.

- **Workspace disclosure:** In pod-launch context, staged files now stay collapsed by folder first. Summary chips are real controls that open exactly one folder instead of expanding the whole workspace.
- **Folder controls:** Added explicit expand-all and collapse-all actions once the file groups are open, so power users can still inspect everything quickly.
- **Trial policy clarity:** The selected-compute summary now surfaces whether trial accounts are represented by explicit account tags or credit provenance, matching the backend trial-routing readiness packet.
- **Regression:** Extended the focused `/renter/pods` Playwright test to prove folder-summary controls, one-folder expansion, bulk expand/collapse, and the trial policy chip.
- **Safety:** Frontend/read-only readiness display only; no pod launch body change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, workspace API behavior, vendor/provider exposure, or supply-tier exposure was added.
- **Verification:** TypeScript; focused Playwright browser regression for `/renter/pods`; Next build; `git diff --check`.

### 2026-07-09 11:58 UTC - `feat(lora): surface adapter registry proof readiness - PR #885`

**PR:** [#885](https://github.com/dhnpmp-tech/dcp-platform/pull/885) (`codex/lora-readiness-registry-proof-surface-2026-07-09`).
**Local timestamp:** 2026-07-09 15:58 +04.

**What:** LoRA roadmap slice. Makes the new adapter registry contract proof visible through `/api/lora/readiness`, OpenAPI, and the Fine-Tuning product/console surfaces.

- **Readiness contract:** Added `adapter_registry.registry_contract_proof` to the LoRA readiness response with proof status, command, local-roadmap gate id, and verified invariants.
- **Frontend visibility:** The renter Fine-Tuning readiness grid now shows registry proof status beside the registry state, and the public Fine-Tuning page/snippets point users and agents at the proof command and readiness field.
- **Docs/contracts:** Updated OpenAPI and LoRA roadmap notes so the registry proof is discoverable from API docs as well as product copy.
- **Safety:** Read-only contract/UI/docs change; no adapter registration behavior, artifact upload, deployment creation, load-proof attach, route traffic, usage/billing write, balance mutation, provider/vendor exposure, or GPU-host execution was enabled.
- **Verification:** OpenAPI YAML parse; targeted LoRA readiness and artifact-policy Jest suites; TypeScript; focused Fine-Tuning Playwright regression; Next build; `git diff --check`.

### 2026-07-09 11:49 UTC - `test(lora): add adapter registry contract proof - PR #884`

**PR:** [#884](https://github.com/dhnpmp-tech/dcp-platform/pull/884) (`codex/adapter-registry-contract-proof-2026-07-09`).
**Local timestamp:** 2026-07-09 15:49 +04.

**What:** LoRA roadmap slice. Adds a first-class CI-safe proof packet for the existing adapter registry schema/API so the registry foundation is covered by the local roadmap gate before live adapter serving work.

- **Proof command:** Added `npm run proof:adapter-registry-contract`, backed by `backend/tests/adapter-registry-contract-proof.js`.
- **Coverage:** The proof exercises schema idempotency/indexes, metadata-only adapter registration, storage-key and checksum rejection, tenant isolation, status lifecycle/deployed timestamp behavior, public route status restrictions, list/read tenant boundaries, and the absence of a public deploy shortcut.
- **Local roadmap:** Added the proof to `npm run proof:local-roadmap`, moving the CI-safe suite to 35 gates.
- **Docs:** Updated the LoRA roadmap and Fireworks/Tinker strategy notes so they no longer describe the adapter registry/API as missing.
- **Safety:** Test/proof/docs only; no artifact upload, deployment creation, load-proof attach, adapter traffic routing, usage/billing write, balance mutation, provider/vendor exposure, or GPU-host execution was enabled.
- **Verification:** Package JSON parse; Node syntax check; adapter registry proof; focused adapter registry Jest suite; local roadmap proof now passing 35/35 gates; Next build; `git diff --check`.

### 2026-07-09 11:38 UTC - `test(templates): add workflow contract proof - PR #883`

**PR:** [#883](https://github.com/dhnpmp-tech/dcp-platform/pull/883) (`codex/template-workflow-contract-proof-2026-07-09`).
**Local timestamp:** 2026-07-09 15:38 +04.

**What:** LoRA/POT/inference roadmap slice. Makes template workflow metadata explicit for LoRA, QLoRA, and vLLM without claiming managed training, public routing, billing, or GPU-host execution.

- **Template contracts:** Added `workflow_contract` metadata to `lora-finetune`, `qlora-finetune`, and `vllm-serve`, including workspace mount, dataset validation, adapter artifact checksum expectations, pod-local vLLM endpoint scope, and the next opt-in live proof command.
- **Catalog exposure:** `/api/templates/catalog` now sanitizes and exposes workflow contracts for templates that declare them.
- **Proof command:** Added `npm run proof:template-workflow-contract`, backed by a CI-safe proof packet that runs deploy-template validation, route exposure coverage, contract invariants, and read-only claim guards.
- **Local roadmap:** Added the proof to `npm run proof:local-roadmap`, moving the CI-safe suite to 34 gates.
- **Safety:** Contract/proof only; no pod launch, training-job creation, dataset row storage, adapter artifact upload, public endpoint routing, balance mutation, usage recording, adapter billing, provider/vendor exposure, or GPU-host execution was enabled.
- **Verification:** Template JSON parse; deploy-template validation; template workflow proof; focused template catalog Jest coverage; local roadmap proof now passing 34/34 gates; `git diff --check`.

### 2026-07-09 11:08 UTC - `feat(pods): add stage navigation and explicit VRAM filters - PR #882`

**PR:** [#882](https://github.com/dhnpmp-tech/dcp-platform/pull/882) (`codex/pods-stage-navigation-vram-filter-2026-07-09`).
**Local timestamp:** 2026-07-09 15:08 +04.

**What:** Tareq feedback follow-up for `/renter/pods`. Makes large workspaces easier to move past and removes ambiguity between VRAM filtering and the selected GPU.

- **Stage navigation:** Added a three-step jump rail above the pod launch flow, with in-page anchors for Stage 1 workspace, Stage 2 template/GPU, and Stage 3 runtime/launch.
- **Workspace escape hatch:** The embedded workspace panel now exposes Stage 2 jump actions in pod-launch context, so users with many staged files can move directly to compute selection without expanding folder groups.
- **GPU filter clarity:** Replaced the min-VRAM slider with explicit VRAM filter chips and changed the selection strip copy from "Min VRAM" to "Filter" so filtering cannot be confused with the GPU selected for launch.
- **Regression:** Extended the focused `/renter/pods` Playwright test to assert stage navigation, collapsed file summaries, the Stage 2 jump, VRAM filter chips, and selected GPU confirmation after choosing an RTX 4090.
- **Safety:** Frontend-only UX change; no pod launch body change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, workspace API behavior, vendor/provider exposure, or supply-tier exposure was added.
- **Verification:** TypeScript; focused Playwright browser regression for `/renter/pods`; Next build; `git diff --check`.

### 2026-07-09 10:44 UTC - `test(inference): add model catalog parity proof - PR #881`

**PR:** [#881](https://github.com/dhnpmp-tech/dcp-platform/pull/881) (`codex/model-catalog-parity-proof-2026-07-09`).
**Local timestamp:** 2026-07-09 14:44 +04.

**What:** Inference/backend roadmap slice. Adds a repeatable CI-safe proof command for model catalog parity across `/v1/models`, `/api/models`, and `/api/models/catalog`.

- **Proof command:** Added `npm run proof:model-catalog-parity`, backed by `backend/tests/model-catalog-parity-proof.js`, which runs the deterministic mocked route parity test and writes JSON/Markdown proof artifacts.
- **Local roadmap:** Added the proof to `npm run proof:local-roadmap`, moving the CI-safe suite to 33 gates.
- **Coverage:** The proof covers token pricing/source parity, provider count and availability, capability flags/capabilities mirrors, advanced feature readiness, modalities, and max-output metadata across all three model catalog surfaces.
- **Safety:** Test/proof only; no model catalog semantics, provider selection, request routing, pricing, billing, settlement, prompt-cache, batch, LoRA, or deployment behavior changed.
- **Verification:** Package JSON parse; `npm run proof:model-catalog-parity`; targeted Jest for parity proof and route parity; `npm run proof:local-roadmap` now passing 33/33 gates; Next build; `git diff --check`.

### 2026-07-09 10:31 UTC - `feat(inference): show live model catalog metadata - PR #880`

**PR:** [#880](https://github.com/dhnpmp-tech/dcp-platform/pull/880) (`codex/inference-model-catalog-live-rail-2026-07-09`).
**Local timestamp:** 2026-07-09 14:31 +04.

**What:** Inference roadmap slice. Makes the public `/inference` model-metadata section render a live `/v1/models` catalog summary instead of relying only on prose.

- **Public catalog rail:** `/inference` now fetches `/v1/models` and renders serving model count, provider-backed count, maximum context window, sample model rows, provider counts, SAR input/output pricing, and serving/catalog-only state from backend data.
- **Claim safety:** Rows with zero providers remain visible only as catalog metadata; the rail does not convert unavailable models into capacity claims.
- **Regression:** Added a focused Playwright test with a mocked model catalog and updated the router-policy rail test to mock both live reads.
- **Safety:** Frontend/read-only fetch only; no model catalog semantics, provider selection, request routing, pricing, billing, settlement, prompt-cache, batch, LoRA, or deployment behavior changed.
- **Verification:** TypeScript; focused Playwright browser regressions for `/inference` model-catalog and router-policy rails; Next build; `git diff --check`.

### 2026-07-09 10:18 UTC - `feat(inference): show live router policy readiness - PR #879`

**PR:** [#879](https://github.com/dhnpmp-tech/dcp-platform/pull/879) (`codex/inference-router-policy-live-rail-2026-07-09`).
**Local timestamp:** 2026-07-09 14:18 +04.

**What:** Inference roadmap slice. Makes the public `/inference` route-policy boundary consume the live `/v1/router/policies` contract instead of relying only on static copy.

- **Public inference rail:** `/inference` now fetches `/v1/router/policies` and renders contract version, default policy, available/gated counts, and policy status chips from backend data.
- **Claim safety:** Balanced remains the only available policy in the rendered contract; future policies stay marked as gated/not selectable until route-specific proof exists.
- **Regression:** Added a focused Playwright test with a mocked router-policy catalog to prove the public page renders the live readiness rail.
- **Safety:** Frontend/read-only fetch only; no request routing, provider ordering, routing-policy selectability, pricing, billing, settlement, prompt-cache, batch, LoRA, or model catalog behavior changed.
- **Verification:** TypeScript; focused Playwright browser regression for `/inference`; router-policy contract proof; Next build; `git diff --check`.

### 2026-07-09 10:08 UTC - `feat(pods): make GPU selection state prominent - PR #878`

**PR:** [#878](https://github.com/dhnpmp-tech/dcp-platform/pull/878) (`codex/pods-gpu-selection-clarity-2026-07-09`).
**Local timestamp:** 2026-07-09 14:08 +04.

**What:** Tareq feedback follow-up for `/renter/pods`. Makes the selected GPU or auto-pick state visible before users work through the GPU filters and card grid.

- **GPU selection clarity:** Added a compact selector-status strip above the GPU toolbar that shows auto-pick vs selected GPU, VRAM, hourly price, active workload/filter state, and visible GPU count.
- **Control ergonomics:** The strip includes direct "Back to auto-pick" and "Clear filters" actions when relevant, so users do not need to scroll back through the card grid to understand or reset the choice.
- **Regression:** Extended the focused `/renter/pods` Playwright test to assert the new strip before and after selecting an RTX 4090.
- **Safety:** Frontend-only UX change; no pod launch body change, provider selection change, pricing calculation change, billing change, balance mutation, trial-accounting mutation, vendor/provider exposure, or supply-tier exposure was added.
- **Verification:** TypeScript; focused Playwright browser regression for `/renter/pods`; Next build; `git diff --check`.

### 2026-07-09 10:00 UTC - `feat(pods): sync launch credit policy from backend - PR #877`

**PR:** [#877](https://github.com/dhnpmp-tech/dcp-platform/pull/877) (`codex/pods-trial-routing-ui-readiness-2026-07-09`).
**Local timestamp:** 2026-07-09 14:00 +04.

**What:** Tareq feedback follow-up for `/renter/pods`. The compute summary now reads the pod trial-routing readiness contract instead of relying only on static copy.

- **Frontend contract sync:** `/renter/pods` fetches `GET /api/pods/trial-routing/readiness` and renders a compact "Credit policy: synced" chip when the backend contract confirms no launch, billing, balance, trial-accounting, provider, vendor, or supply-tier exposure changes.
- **Fallback UX:** If the readiness endpoint is temporarily unavailable, the launch screen keeps the built-in renter-safe policy copy and states that backend gates still control launch.
- **Regression:** The focused Playwright test now mocks the readiness endpoint with distinct policy copy, proving the UI is consuming the backend contract.
- **Safety:** UI/read-only fetch only; no pod launch body change, provider selection change, billing change, balance mutation, trial-accounting mutation, payment creation, vendor/provider exposure, or supply-tier exposure was added.
- **Verification:** TypeScript; focused Playwright browser regression for `/renter/pods`; Next build; `git diff --check`.

### 2026-07-09 09:47 UTC - `test(pods): add trial routing readiness proof - PR #876`

**PR:** [#876](https://github.com/dhnpmp-tech/dcp-platform/pull/876) (`codex/pod-trial-routing-readiness-2026-07-09`).
**Local timestamp:** 2026-07-09 13:47 +04.

**What:** Tareq feedback follow-up for trial accounts and high-demand pod access. Adds a public read-only contract that documents how DCP currently classifies trial credit and paid credit before pod launch.

- **Backend contract:** Added public `GET /api/pods/trial-routing/readiness`, returning the current no-mutation policy for trial-credit provenance, paid-credit derivation, native/community capacity, and high-demand paid-credit gates.
- **Proof command:** Added `npm run proof:pod-trial-routing-readiness` and included it in `npm run proof:local-roadmap`, raising the suite to 32 CI-safe gates.
- **Public surface:** OpenAPI and `llms.txt` now point agents to the trial-routing readiness endpoint alongside minimum-balance policy.
- **Safety:** Readiness/policy only; no provider selection change, pod launch mutation, billing change, payment creation, balance mutation, trial-accounting mutation, vendor/provider exposure, or supply-tier exposure was enabled.
- **Verification:** Syntax/package JSON checks; OpenAPI YAML parse; targeted pod trial-routing and pod access-policy Jest suites; pod trial-routing readiness proof; local roadmap proof now passing 32/32 gates; TypeScript; Next build; `git diff --check`.

### 2026-07-09 09:27 UTC - `feat(pods): clarify workspace stages and compute selection - PR #875`

**PR:** [#875](https://github.com/dhnpmp-tech/dcp-platform/pull/875) (`codex/workspace-trial-ux-2026-07-09`).
**Local timestamp:** 2026-07-09 13:27 +04.

**What:** Tareq feedback slice for `/renter/pods`. Makes workspace staging easier to scan when renters have many files and makes the GPU/trial-credit state clearer before launch.

- **Workspace UX:** The embedded workspace manager now defaults staged files to a collapsed summary in pod-launch context, groups expanded files by top-level folder/root files, and keeps download/delete actions inside each group.
- **Launch flow:** `/renter/pods` now labels the flow as Stage 1 workspace, Stage 2 template/GPU, and Stage 3 runtime/launch, instead of leaving later stages implicit.
- **Compute clarity:** Added a prominent selected-compute panel showing the selected GPU or auto-pick state, min-VRAM filter, quote when available, and a one-click return to auto-pick.
- **Trial-credit clarity:** The launch screen now states the current product policy without exposing supply-tier/vendor internals: trial credit covers DCP/community capacity; high-demand capacity requires paid credit.
- **Safety:** Frontend-only UX/copy change; no pod launch body change, provider selection change, trial-credit accounting change, payment creation, balance mutation, billing/refund path, workspace API behavior, or vendor/provider exposure was added.
- **Verification:** TypeScript; Next build; focused Playwright browser regression for `/renter/pods` with mocked workspace/provider APIs; `git diff --check`.

### 2026-07-09 09:08 UTC - `test(lora): add adapter billing approval readiness proof - PR #874`

**PR:** [#874](https://github.com/dhnpmp-tech/dcp-platform/pull/874) (`codex/adapter-billing-approval-readiness-2026-07-09`).
**Local timestamp:** 2026-07-09 13:08 +04.

**What:** Next Fireworks/Tinker execution slice. Adds the read-only founder approval gate required before adapter billing can be enabled.

- **Backend contract:** Added public `GET /api/adapters/billing/approval/readiness` plus a pure approval evaluator for strict load proof, endpoint smoke, usage attribution, minimum-balance policy, settlement policy, local-roadmap proof, production smoke, evidence-packet hash, and founder signoff.
- **Proof command:** Added `npm run proof:adapter-billing-approval` and included it in `npm run proof:local-roadmap`, raising the suite to 31 CI-safe gates.
- **Public surface:** Adapter billing and settlement readiness, OpenAPI, `/fine-tuning`, `/dedicated-deployments`, renter Fine-Tuning snippets, `llms.txt`, and roadmap docs now describe the approval gate.
- **Safety:** Readiness/policy only; no approval mutation, adapter dispatch, route traffic, usage ledger write, balance mutation, invoice, provider payout, adapter billing, raw prompt/response exposure, or Tinker compatibility behavior was enabled.
- **Verification:** Syntax/package JSON checks; OpenAPI YAML parse; targeted adapter approval/billing/settlement Jest suites; adapter billing approval proof; local roadmap proof now passing 31/31 gates; TypeScript; Next build; `git diff --check`.

### 2026-07-09 08:48 UTC - `test(lora): add adapter settlement readiness proof - PR #873`

**PR:** [#873](https://github.com/dhnpmp-tech/dcp-platform/pull/873) (`codex/adapter-settlement-readiness-policy-2026-07-09`).
**Local timestamp:** 2026-07-09 12:48 +04.

**What:** Next Fireworks/Tinker execution slice. Adds the read-only adapter settlement policy gate required before dedicated LoRA/adapter endpoint usage can become billable or payable.

- **Backend contract:** Added public `GET /api/adapters/settlement/readiness` plus a pure adapter settlement evaluator for strict load proof, endpoint smoke, adapter usage attribution, minimum-balance policy, split-policy approval, founder approval, and provider/platform share reconciliation.
- **Proof command:** Added `npm run proof:adapter-settlement-readiness` and included it in `npm run proof:local-roadmap`, raising the suite to 30 CI-safe gates.
- **Public surface:** Adapter billing readiness, OpenAPI, `/fine-tuning`, `/dedicated-deployments`, renter Fine-Tuning snippets, `llms.txt`, and roadmap docs now describe the settlement gate.
- **Safety:** Readiness/policy only; no adapter dispatch, load-proof mutation, route traffic, usage ledger write, balance mutation, invoice, provider payout, platform revenue split, minimum-balance enforcement change, adapter billing, raw prompt/response exposure, or Tinker compatibility behavior was enabled.
- **Verification:** Syntax/package JSON checks; OpenAPI YAML parse; targeted adapter settlement/billing/usage/endpoint-smoke Jest suites; adapter settlement proof; adapter billing readiness proof; local roadmap proof now passing 30/30 gates; TypeScript; Next build; `git diff --check`.

### 2026-07-09 08:32 UTC - `test(lora): add disabled endpoint smoke status proof - PR #872`

**PR:** [#872](https://github.com/dhnpmp-tech/dcp-platform/pull/872) (`codex/adapter-endpoint-smoke-status-contract-2026-07-09`).
**Local timestamp:** 2026-07-09 12:32 +04.

**What:** Next Fireworks/Tinker execution slice. Adds the disabled renter-scoped endpoint-smoke GET status contract needed before dashboards or agents can poll recorded smoke evidence.

- **Backend contract:** Added disabled `GET /api/adapters/{adapter_id}/deployments/{deployment_id}/endpoint-smoke`, returning no-record status, strict load-proof readiness, and missing inputs while endpoint-smoke recording remains disabled.
- **Proof command:** Added `npm run proof:adapter-endpoint-smoke-status` and included it in `npm run proof:local-roadmap`, raising the suite to 29 CI-safe gates.
- **Public surface:** OpenAPI, `/fine-tuning`, `/dedicated-deployments`, renter Fine-Tuning snippets, `llms.txt`, and roadmap docs now describe the no-record endpoint-smoke status route.
- **Safety:** Disabled status contract only; no adapter dispatch, smoke recording, load-proof mutation, route traffic, usage ledger write, balance mutation, invoice, provider payout, raw prompt/response exposure, adapter billing, or Tinker compatibility behavior was enabled.
- **Verification:** Syntax/package JSON checks; OpenAPI YAML parse; targeted endpoint-smoke status/submission/readiness/deployment Jest suites; endpoint-smoke status proof; endpoint-smoke submission proof; endpoint-smoke readiness proof; local roadmap proof now passing 29/29 gates; TypeScript; Next build; `git diff --check`.

### 2026-07-09 08:12 UTC - `test(lora): add disabled endpoint smoke submission proof - PR #871`

**PR:** [#871](https://github.com/dhnpmp-tech/dcp-platform/pull/871) (`codex/adapter-endpoint-smoke-submission-contract-2026-07-09`).
**Local timestamp:** 2026-07-09 12:12 +04.

**What:** Next Fireworks/Tinker execution slice. Adds the disabled renter-scoped endpoint-smoke POST contract needed before live smoke recording can be safely enabled.

- **Backend contract:** Added disabled `POST /api/adapters/{adapter_id}/deployments/{deployment_id}/endpoint-smoke`, returning a 409 no-record contract that evaluates strict load proof, funded principal, request attribution, response hash, latency, token totals, and adapter trace.
- **Proof command:** Added `npm run proof:adapter-endpoint-smoke-submission` and included it in `npm run proof:local-roadmap`, raising the suite to 28 CI-safe gates.
- **Public surface:** OpenAPI, `/fine-tuning`, `/dedicated-deployments`, renter Fine-Tuning snippets, `llms.txt`, and roadmap docs now describe the disabled endpoint-smoke submission route.
- **Safety:** Disabled contract only; no adapter dispatch, smoke recording, load-proof mutation, route traffic, usage ledger write, balance mutation, invoice, provider payout, raw prompt/response exposure, adapter billing, or Tinker compatibility behavior was enabled.
- **Verification:** Syntax/package JSON checks; OpenAPI YAML parse; targeted endpoint-smoke submission/readiness/deployment Jest suites; endpoint-smoke submission proof; endpoint-smoke readiness proof; local roadmap proof now passing 28/28 gates; TypeScript; Next build; `git diff --check`.

### 2026-07-09 07:57 UTC - `test(lora): add adapter endpoint smoke readiness proof - PR #870`

**PR:** [#870](https://github.com/dhnpmp-tech/dcp-platform/pull/870) (`codex/adapter-endpoint-smoke-readiness-2026-07-09`).
**Local timestamp:** 2026-07-09 11:57 +04.

**What:** Next Fireworks/Tinker execution slice. Adds the disabled endpoint-smoke evidence gate required before dedicated LoRA/adapter endpoint smoke can feed usage attribution or billing.

- **Backend contract:** Added public `GET /api/adapters/endpoints/smoke/readiness` plus a pure adapter endpoint-smoke evaluator for strict load proof, funded principal, request attribution, response hash, latency, token totals, and adapter trace.
- **Proof command:** Added `npm run proof:adapter-endpoint-smoke` and included it in `npm run proof:local-roadmap`, raising the suite to 27 CI-safe gates.
- **Public surface:** LoRA readiness, adapter usage attribution readiness, adapter billing readiness, OpenAPI, `/fine-tuning`, `/dedicated-deployments`, renter Fine-Tuning snippets, `llms.txt`, and roadmap docs now point to the disabled endpoint-smoke policy.
- **Safety:** Readiness/policy only; no adapter dispatch, smoke recording, load-proof mutation, route traffic, usage ledger write, balance mutation, invoice, provider payout, raw prompt/response exposure, adapter billing, or Tinker compatibility behavior was enabled.
- **Verification:** Syntax/package JSON checks; OpenAPI YAML parse; targeted adapter endpoint-smoke/usage/billing/LoRA Jest suites; adapter endpoint-smoke proof; adapter usage attribution proof; adapter billing readiness proof; local roadmap proof now passing 27/27 gates; TypeScript; Next build; `git diff --check`.

### 2026-07-09 07:23 UTC - `test(lora): add adapter usage attribution readiness proof - PR #869`

**PR:** [#869](https://github.com/dhnpmp-tech/dcp-platform/pull/869) (`codex/adapter-usage-attribution-readiness-2026-07-09`).
**Local timestamp:** 2026-07-09 11:23 +04.

**What:** Next Fireworks/Tinker execution slice. Adds the disabled usage-ledger attribution gate required before dedicated LoRA/adapter endpoint usage rows can become billable.

- **Backend contract:** Added public `GET /api/adapters/usage/attribution/readiness` plus a pure adapter usage attribution evaluator for deployment, adapter, endpoint, checksum, provider, request, scoped-key, token, cost, and pending-settlement fields.
- **Proof command:** Added `npm run proof:adapter-usage-attribution` and included it in `npm run proof:local-roadmap`, raising the suite to 26 CI-safe gates.
- **Public surface:** LoRA readiness, adapter billing readiness, OpenAPI, `/fine-tuning`, `/dedicated-deployments`, renter Fine-Tuning snippets, `llms.txt`, and roadmap docs now point to the disabled adapter usage-attribution policy.
- **Safety:** Readiness/policy only; no adapter dispatch, load-proof mutation, route traffic, usage ledger write, balance mutation, invoice, provider payout, budget cap change, adapter billing, or Tinker compatibility behavior was enabled.
- **Verification:** Syntax/package JSON checks; OpenAPI YAML parse; targeted adapter usage/billing/LoRA/minimum-balance Jest suites; adapter usage attribution proof; adapter billing readiness proof; local roadmap proof now passing 26/26 gates; TypeScript; Next build; `git diff --check`.

### 2026-07-09 06:52 UTC - `test(lora): add adapter billing readiness proof - PR #868`

**PR:** [#868](https://github.com/dhnpmp-tech/dcp-platform/pull/868) (`codex/adapter-billing-readiness-policy-2026-07-09`).
**Local timestamp:** 2026-07-09 10:52 +04.

**What:** Next Fireworks/Tinker execution slice. Adds the disabled billing-policy gate required before dedicated LoRA/adapter endpoint traffic can become billable.

- **Backend contract:** Added public `GET /api/adapters/billing/readiness` plus a pure adapter billing policy evaluator for strict load proof, endpoint smoke, funded principal, minimum-balance policy, usage attribution, settlement policy, and founder approval prerequisites.
- **Proof command:** Added `npm run proof:adapter-billing-readiness` and included it in `npm run proof:local-roadmap`, raising the suite to 25 CI-safe gates.
- **Public surface:** LoRA readiness, adapter artifact readiness, minimum-balance readiness, OpenAPI, `/fine-tuning`, `/dedicated-deployments`, renter Fine-Tuning snippets, `llms.txt`, and roadmap docs now point to the disabled adapter billing policy.
- **Safety:** Readiness/policy only; no adapter dispatch, load-proof mutation, route traffic, usage ledger write, balance mutation, invoice, provider payout, minimum-balance enforcement change, or Tinker compatibility behavior was enabled.
- **Verified:** Syntax/package JSON checks; targeted adapter-billing/artifact/LoRA/minimum-balance Jest suites; adapter billing readiness proof; adapter artifact policy proof; minimum-balance readiness proof; local roadmap proof now passing 25/25 gates; OpenAPI YAML parse; TypeScript; Next build; `git diff --check`.

### 2026-07-09 06:23 UTC - `test(lora): require strict adapter load proof - PR #867`

**PR:** [#867](https://github.com/dhnpmp-tech/dcp-platform/pull/867) (`codex/adapter-load-proof-strict-match-2026-07-09`).
**Local timestamp:** 2026-07-09 10:23 +04.

**What:** Next Fireworks/Tinker execution slice. Tightens the adapter deployment routing gate so a vLLM load proof must match the deployment row and registered adapter artifact before traffic can route.

- **Backend contract:** Adapter deployment load proof now has to match deployment id, adapter id, base model, mode, endpoint id when present, and adapter artifact checksum before `route_traffic` can become true.
- **Proof command:** Strengthened `npm run proof:adapter-deployment-contract` with checksum-mismatch coverage and a verified proof packet that records deployment, adapter, model, mode, endpoint, checksum, timestamp, and provider.
- **Public surface:** OpenAPI, `/fine-tuning`, `/dedicated-deployments`, renter Fine-Tuning copy, `llms.txt`, and roadmap docs now describe the stricter proof gate.
- **Safety:** Contract tightening only; no public deploy action, serving load mutation access, adapter serving, route traffic, billing, GPU training, or Tinker compatibility behavior was enabled.
- **Verified:** Syntax checks; targeted LoRA/deployment/artifact-policy Jest suites; adapter deployment contract proof; adapter artifact policy proof; local roadmap proof still passing 24/24 gates; OpenAPI YAML parse; TypeScript; Next build; `git diff --check`.

### 2026-07-09 06:03 UTC - `test(lora): add adapter artifact policy proof - PR #866`

**PR:** [#866](https://github.com/dhnpmp-tech/dcp-platform/pull/866) (`codex/adapter-artifact-policy-2026-07-09`).
**Local timestamp:** 2026-07-09 10:03 +04.

**What:** Next Fireworks/Tinker execution slice. Defines LoRA adapter artifact and model-card key requirements before any artifact upload, object-store write, adapter serving, or route traffic claim can go live.

- **Backend contract:** Added public `GET /api/adapters/artifacts/readiness` plus a pure adapter artifact policy validator for renter/adapter-scoped `adapter.safetensors`, `model-card.json`, and SHA-256 checksum requirements.
- **Proof command:** Added `npm run proof:adapter-artifact-policy` and included it in `npm run proof:local-roadmap`, raising the suite to 24 CI-safe gates.
- **Public surface:** LoRA readiness, adapter registry docs, `/fine-tuning`, `llms.txt`, OpenAPI, and roadmap docs now link to the adapter artifact policy before deployment/load-proof claims.
- **Safety:** Policy/readiness only; no artifact upload endpoint, object-store write, GPU training, model-card write, adapter serving, route traffic, billing, or Tinker compatibility behavior changed.
- **Verified:** Syntax/package JSON checks; targeted adapter-artifact/adapter-registry/LoRA-readiness/training-contract/deployment-contract/Tinker readiness Jest suites; adapter artifact policy proof; LoRA training contract proof; Tinker loop readiness proof; adapter deployment contract proof; OpenAPI YAML parse; TypeScript; Next build; local roadmap proof now passing 24/24 gates; `git diff --check`.

### 2026-07-09 05:41 UTC - `test(evals): add signed download policy proof - PR #865`

**PR:** [#865](https://github.com/dhnpmp-tech/dcp-platform/pull/865) (`codex/evaluator-signed-download-policy-2026-07-09`).
**Local timestamp:** 2026-07-09 09:41 +04.

**What:** Next Fireworks/Tinker execution slice. Defines the signed-download policy prerequisites for evaluator results while keeping signed URLs, object-store keys, and live result downloads disabled.

- **Backend contract:** Added public `GET /api/evals/results/downloads/readiness` plus a pure signed-download policy validator for renter access, result availability, artifact storage policy, checksum, JSON content type, and 60-900 second expiry requirements.
- **Proof command:** Added `npm run proof:evaluator-signed-download-policy` and included it in `npm run proof:local-roadmap`, raising the suite to 23 CI-safe gates.
- **Public surface:** Evaluator readiness, worker gate, result writer, result access policy, artifact storage policy, disabled result endpoint, `/benchmarks`, `llms.txt`, OpenAPI, and roadmap docs now link to the signed-download policy.
- **Safety:** Policy/readiness only; no signed URL generation, object-store bucket exposure, artifact storage key exposure, live result endpoint, worker start, eval-job status mutation, object-store write, billing, settlement, public report, model ranking, or Arabic-quality claim behavior changed.
- **Verified:** Syntax/package JSON checks; targeted signed-download/access-policy/disabled-result/artifact-policy/worker-gate/result-writer/result-manifest/readiness Jest suites; evaluator signed-download proof; evaluator disabled-result proof; evaluator result-access proof; evaluator artifact-storage proof; evaluator worker-fixture proof; evaluator result-writer proof; evaluator worker-gate proof; evaluator result-manifest proof; evaluator metadata/schema/readiness proofs; OpenAPI YAML parse; TypeScript; Next build; local roadmap proof now passing 23/23 gates; `git diff --check`.

### 2026-07-09 05:24 UTC - `test(evals): add disabled result endpoint proof - PR #864`

**PR:** [#864](https://github.com/dhnpmp-tech/dcp-platform/pull/864) (`codex/evaluator-result-endpoint-disabled-2026-07-09`).
**Local timestamp:** 2026-07-09 09:24 +04.

**What:** Next Fireworks/Tinker execution slice. Makes the future evaluator result route explicit and renter-scoped while keeping result manifests and signed downloads disabled.

- **Backend contract:** Added renter-authenticated `GET /api/evals/jobs/:id/results`, returning a disabled-result contract for the owning renter and 404 for other renters.
- **Proof command:** Added `npm run proof:evaluator-result-endpoint-disabled` and included it in `npm run proof:local-roadmap`, raising the suite to 22 CI-safe gates.
- **Public surface:** Evaluator readiness, job schema, worker gate, access policy, `/benchmarks`, `llms.txt`, OpenAPI, and roadmap docs now distinguish the disabled result route from any live result download API.
- **Safety:** Disabled route only; no result manifest exposure, artifact storage key exposure, signed download, worker start, eval-job status mutation, object-store write, billing, settlement, public report, model ranking, or Arabic-quality claim behavior changed.
- **Verified:** Syntax/package JSON checks; targeted disabled-result/access-policy/job-schema/job-metadata/worker-gate/result-writer/result-manifest/artifact-policy/readiness Jest suites; evaluator disabled-result proof; evaluator result-access proof; evaluator artifact-storage proof; evaluator worker-fixture proof; evaluator result-writer proof; evaluator worker-gate proof; evaluator result-manifest proof; evaluator metadata/schema/readiness proofs; OpenAPI YAML parse; TypeScript; Next build; local roadmap proof now passing 22/22 gates; `git diff --check`.

### 2026-07-09 04:55 UTC - `test(evals): add result access policy proof - PR #863`

**PR:** [#863](https://github.com/dhnpmp-tech/dcp-platform/pull/863) (`codex/evaluator-result-access-policy-2026-07-09`).
**Local timestamp:** 2026-07-09 08:55 +04.

**What:** Next Fireworks/Tinker execution slice. Defines evaluator result access authorization before any result endpoint, signed download, or public eval report can go live.

- **Backend contract:** Added public `GET /api/evals/results/access/readiness` plus a pure result-access policy validator for renter owner-match, result availability, artifact-storage policy, and checksum requirements.
- **Proof command:** Added `npm run proof:evaluator-result-access-policy` and included it in `npm run proof:local-roadmap`, raising the suite to 21 CI-safe gates.
- **Public surface:** Evaluator readiness, worker gate, result manifest schema, result-writer readiness, artifact-storage readiness, `/benchmarks`, `llms.txt`, OpenAPI, and roadmap docs now link to the access policy endpoint.
- **Safety:** Policy/readiness only; no result endpoint, signed download, object-store configuration, production artifact write, raw dataset/prompt storage, billing, settlement, public report, model ranking, or Arabic-quality claim behavior changed.
- **Verified:** Syntax/package JSON checks; targeted evaluator access-policy/artifact-policy/worker-fixture/worker-gate/result-writer/result-manifest/metadata/readiness/schema Jest suites; evaluator result-access policy proof; evaluator artifact-storage policy proof; evaluator worker-fixture proof; evaluator result-writer proof; evaluator worker-gate proof; evaluator result-manifest proof; evaluator metadata/schema/readiness proofs; OpenAPI YAML parse; TypeScript; Next build; local roadmap proof now passing 21/21 gates; `git diff --check`.

### 2026-07-09 04:37 UTC - `test(evals): add artifact storage policy proof - PR #862`

**PR:** [#862](https://github.com/dhnpmp-tech/dcp-platform/pull/862) (`codex/evaluator-artifact-storage-policy-2026-07-09`).
**Local timestamp:** 2026-07-09 08:37 +04.

**What:** Next Fireworks/Tinker execution slice. Defines the renter/job-scoped result artifact storage policy before any evaluator production object-store write, result download, or signed URL exists.

- **Backend contract:** Added public `GET /api/evals/results/artifacts/readiness` plus a pure validator for `eval-results/renter-{renter_id}/{eval_job_id}/result-manifest.json`, SHA-256 checksums, content type, and path-safety guards.
- **Proof command:** Added `npm run proof:evaluator-artifact-storage-policy` and included it in `npm run proof:local-roadmap`, raising the suite to 20 CI-safe gates.
- **Public surface:** Evaluator readiness, worker gate, result manifest schema, result-writer readiness, `/benchmarks`, `llms.txt`, OpenAPI, and roadmap docs now link to the policy endpoint.
- **Safety:** Policy/readiness only; no object-store configuration, production artifact write, signed download, result endpoint, raw dataset/prompt storage, billing, settlement, public report, model ranking, or Arabic-quality claim behavior changed.
- **Verified:** Syntax/package JSON checks; targeted evaluator artifact-policy/worker-fixture/worker-gate/result-writer/result-manifest/metadata/readiness/schema Jest suites; evaluator artifact-storage policy proof; evaluator worker-fixture proof; evaluator result-writer proof; evaluator worker-gate proof; evaluator result-manifest proof; evaluator metadata/schema/readiness proofs; OpenAPI YAML parse; TypeScript; Next build; local roadmap proof now passing 20/20 gates; `git diff --check`.

### 2026-07-09 04:17 UTC - `test(evals): add worker dry-run fixture proof - PR #861`

**PR:** [#861](https://github.com/dhnpmp-tech/dcp-platform/pull/861) (`codex/evaluator-worker-dry-run-fixture-2026-07-09`).
**Local timestamp:** 2026-07-09 08:17 +04.

**What:** Next Fireworks/Tinker execution slice. Proves a draft evaluator metadata job can be passed through a simulated worker queue fixture and the result-writer dry run before any real queue dispatch or production result artifact exists.

- **Backend proof path:** Added a worker dry-run fixture service and contract that simulates a queue item from a draft eval job, calls the result-writer dry run, and preserves draft job status.
- **Proof command:** Added `npm run proof:evaluator-worker-dry-run-fixture` and included it in `npm run proof:local-roadmap`, raising the suite to 19 CI-safe gates.
- **Public surface:** Evaluator readiness, worker readiness, `/benchmarks`, `llms.txt`, OpenAPI, and roadmap docs now surface the fixture command while keeping worker availability false.
- **Safety:** No production database mutation, real queue dispatch, worker start, eval job status mutation, production artifact write, result endpoint, raw dataset/prompt storage, billing, settlement, public report, model ranking, or Arabic-quality claim behavior changed.
- **Verified:** Syntax/package JSON checks; targeted evaluator worker-fixture/worker-gate/result-writer/result-manifest/metadata/readiness/schema Jest suites; evaluator worker dry-run fixture proof; evaluator result-writer dry-run proof; evaluator worker-gate proof; evaluator result-manifest proof; evaluator metadata/schema/readiness proofs; OpenAPI YAML parse; TypeScript; Next build; local roadmap proof now passing 19/19 gates; `git diff --check`.

### 2026-07-09 03:58 UTC - `test(evals): add result writer dry-run proof - PR #860`

**PR:** [#860](https://github.com/dhnpmp-tech/dcp-platform/pull/860) (`codex/evaluator-result-writer-dry-run-2026-07-09`).
**Local timestamp:** 2026-07-09 07:58 +04.

**What:** Next Fireworks/Tinker execution slice. Proves the future evaluator result writer can produce a valid manifest in temporary proof storage before any production artifact write or result download API exists.

- **Backend proof path:** Added public `GET /api/evals/results/writer/readiness` and a dry-run writer that hashes canonical summary JSON, validates the manifest, and writes manifest JSON to temp proof storage only.
- **Proof command:** Added `npm run proof:evaluator-result-writer-dry-run` and included it in `npm run proof:local-roadmap`, raising the suite to 18 CI-safe gates.
- **Public surface:** `/benchmarks`, `llms.txt`, OpenAPI, evaluator readiness, worker gate, result manifest schema, and roadmap docs now point to the dry-run writer.
- **Safety:** No production artifact write, result endpoint, eval job status mutation, worker queue dispatch, raw dataset/prompt storage, billing, settlement, public report, model ranking, or Arabic-quality claim behavior changed.
- **Verified:** Syntax/package JSON checks; targeted evaluator result-writer/result-manifest/worker-gate/metadata/readiness/schema Jest suites; evaluator result-writer dry-run proof; evaluator result-manifest proof; evaluator worker-gate proof; evaluator metadata proof; evaluator readiness proof; OpenAPI YAML parse; TypeScript; Next build; local roadmap proof now passing 18/18 gates; `git diff --check`.

### 2026-07-09 03:46 UTC - `test(evals): add result manifest checksum proof - PR #859`

**PR:** [#859](https://github.com/dhnpmp-tech/dcp-platform/pull/859) (`codex/evaluator-result-manifest-contract-2026-07-09`).
**Local timestamp:** 2026-07-09 07:46 +04.

**What:** Next Fireworks/Tinker execution slice. Defines the result artifact manifest contract before any evaluator worker can expose result downloads or public reports.

- **Backend contract:** Added public `GET /api/evals/results/schema` and a pure validator for required manifest fields, SHA-256 checksums, metric allowlists, expected job metadata matches, and raw customer data rejection.
- **Proof command:** Added `npm run proof:evaluator-result-manifest-contract` and included it in `npm run proof:local-roadmap`, raising the suite to 17 CI-safe gates.
- **Public surface:** `/benchmarks`, `llms.txt`, OpenAPI, evaluator readiness/schema, worker gate, and roadmap docs now point to the manifest schema.
- **Safety:** No result endpoint, artifact write, worker execution, raw dataset storage, billing, settlement, public report, model ranking, or Arabic-quality claim behavior changed.
- **Verified:** Syntax/package JSON checks; targeted evaluator result-manifest/worker-gate/metadata/readiness/schema Jest suites; evaluator result-manifest proof; evaluator worker-gate proof; evaluator metadata proof; evaluator schema proof; evaluator readiness proof; OpenAPI YAML parse; TypeScript; Next build; local roadmap proof now passing 17/17 gates; `git diff --check`.

### 2026-07-09 03:35 UTC - `test(evals): add evaluator worker gate proof - PR #858`

**PR:** [#858](https://github.com/dhnpmp-tech/dcp-platform/pull/858) (`codex/evaluator-worker-gate-contract-2026-07-09`).
**Local timestamp:** 2026-07-09 07:35 +04.

**What:** Next Fireworks/Tinker execution slice. Adds an explicit disabled-by-default worker gate so metadata eval jobs are not mistaken for executable customer evals.

- **Backend readiness:** Added public `GET /api/evals/worker/readiness` for queue dispatch, worker execution, result writer, billing hook, and report/ranking/quality-claim gates.
- **Proof command:** Added `npm run proof:evaluator-worker-gate-contract` and included it in `npm run proof:local-roadmap`, raising the suite to 16 CI-safe gates.
- **Public surface:** `/benchmarks`, `llms.txt`, OpenAPI, evaluator readiness/schema, and roadmap docs now point to the worker gate.
- **Safety:** No evaluator job status mutation, queue dispatch, worker execution, result manifest write, raw dataset storage, billing, settlement, report, ranking, or Arabic-quality claim behavior changed.
- **Verified:** Syntax/package JSON checks; targeted evaluator worker-gate/metadata/readiness/schema Jest suites; evaluator worker-gate proof; evaluator metadata proof; evaluator schema proof; evaluator readiness proof; OpenAPI YAML parse; TypeScript; Next build; local roadmap proof now passing 16/16 gates; `git diff --check`.

### 2026-07-09 03:15 UTC - `feat(evals): add metadata-only evaluator jobs - PR #857`

**PR:** [#857](https://github.com/dhnpmp-tech/dcp-platform/pull/857) (`codex/evaluator-job-metadata-records-2026-07-09`).
**Local timestamp:** 2026-07-09 07:15 +04.

**What:** Next Fireworks/Tinker execution slice. Adds renter-scoped evaluator job records as metadata only, so customers and agents can prepare eval intent without running workers or billing.

- **Backend records:** Added durable `evaluator_jobs` schema plus renter-scoped create/list/read endpoints under `/api/evals/jobs`.
- **Contract safety:** Records validate dataset SHA-256, task, metrics, candidate model, optional baselines, and budget metadata; idempotency prevents duplicate creates.
- **Proof command:** Added `npm run proof:evaluator-job-metadata-contract` and included it in `npm run proof:local-roadmap`, raising the suite to 15 CI-safe gates.
- **Gates:** Readiness/schema now mark metadata APIs live while result artifacts, workers, billing, reports, rankings, and Arabic-quality claims remain blocked.
- **Verified:** Syntax/package JSON checks; targeted evaluator metadata/readiness/schema Jest suites; evaluator metadata proof; evaluator schema proof; evaluator readiness proof; OpenAPI YAML parse; TypeScript; Next build; local roadmap proof now passing 15/15 gates; `git diff --check`.

### 2026-07-09 02:58 UTC - `test(evals): add evaluator job schema proof - PR #856`

**PR:** [#856](https://github.com/dhnpmp-tech/dcp-platform/pull/856) (`codex/evaluator-job-schema-contract-2026-07-09`).
**Local timestamp:** 2026-07-09 06:58 +04.

**What:** Next Fireworks/Tinker execution slice. Turns customer eval jobs from "next" into a public schema contract while keeping all job, worker, billing, and claim behavior disabled.

- **Backend readiness:** Added public `GET /api/evals/jobs/schema` and linked it from `GET /api/evals/readiness`.
- **Proof command:** Added `npm run proof:evaluator-job-schema-contract` and included it in `npm run proof:local-roadmap`, raising the local suite to 14 CI-safe gates.
- **Public surface:** `/benchmarks`, `llms.txt`, and OpenAPI now point to the schema contract for dataset checksums, candidate/baseline models, metrics, result manifests, scoring harness gates, and billing guards.
- **Safety:** No eval job creation, list/result endpoint, dataset storage, worker execution, model comparison, billing, settlement, public report, ranking, or Arabic-quality claim behavior changed.
- **Verified:** Syntax/package JSON checks; targeted evaluator readiness/schema Jest suites; evaluator job schema proof; evaluator readiness proof; TypeScript; Next build; local roadmap proof now passing 14/14 gates; `git diff --check`.

### 2026-07-09 02:40 UTC - `feat(billing): add minimum-balance readiness contract - PR #855`

**PR:** [#855](https://github.com/dhnpmp-tech/dcp-platform/pull/855) (`codex/minimum-balance-readiness-contract-2026-07-09`).
**Local timestamp:** 2026-07-09 06:40 +04.

**What:** Next Fireworks/Tinker execution slice. Turns Tareq's minimum-balance concern into one read-only policy packet for renters, UI, and agents.

- **Backend readiness:** Added billing-scoped `GET /api/renters/me/minimum-balances` for current balance, paid available credit, on-demand commitments, v1 cap remaining, and per-rail minimum-balance policy.
- **Proof command:** Added `npm run proof:minimum-balance-readiness` and included it in `npm run proof:local-roadmap`, raising the local suite to 13 CI-safe gates.
- **Renter surface:** The Usage page now shows v1 estimate preflight, on-demand paid credit available, blocked future billing rails, and whether the contract changes enforcement.
- **Safety:** No payment creation, balance mutation, pod launch, inference dispatch, batch creation, LoRA training job, adapter deployment, eval job, discount, settlement, or enforcement behavior changed.
- **Verified:** Syntax/package JSON checks; targeted renter usage/minimum-balance Jest suites; direct minimum-balance readiness proof; TypeScript; Next build; local roadmap proof now passing 13/13 gates; `git diff --check`.

### 2026-07-09 02:24 UTC - `test(lora): add Tinker loop readiness proof - PR #854`

**PR:** [#854](https://github.com/dhnpmp-tech/dcp-platform/pull/854) (`codex/tinker-loop-readiness-contract-2026-07-09`).
**Local timestamp:** 2026-07-09 06:24 +04.

**What:** Next Fireworks/Tinker execution slice. Makes the desired Tinker-style LoRA local-loop primitives visible as disabled readiness gates before any compatibility claim or GPU mutation.

- **Backend readiness:** Extended renter-authenticated `GET /api/lora/readiness` with `tinker_loop` gates for create-LoRA, forward/backward, optimizer-step, save-weights, sample, and evaluate.
- **Proof command:** Added `npm run proof:tinker-loop-readiness` and included it in `npm run proof:local-roadmap`, raising the local suite to 12 CI-safe gates.
- **Public surface:** Updated `/fine-tuning`, `llms.txt`, and OpenAPI so product copy and agents point at the contract while saying low-level loop APIs remain disabled.
- **Safety:** No Tinker API compatibility claim, training session creation, GPU loop execution, adapter weight write, raw dataset persistence, adapter serving, route traffic, billing, settlement, or quality-claim behavior changed.
- **Verified:** Syntax/package JSON checks; targeted LoRA/Tinker Jest suites; Tinker loop readiness proof; TypeScript; Next build; local roadmap proof now passing 12/12 gates.

### 2026-07-09 02:05 UTC - `test(evals): add evaluator readiness proof - PR #853`

**PR:** [#853](https://github.com/dhnpmp-tech/dcp-platform/pull/853) (`codex/evaluator-readiness-contract-2026-07-09`).
**Local timestamp:** 2026-07-09 06:05 +04.

**What:** Next Fireworks/Tinker execution slice. Promotes customer evaluator jobs from page copy to a versioned readiness contract and CI-safe proof gate.

- **Backend readiness:** Added public `GET /api/evals/readiness`, exposing evaluator job, dataset artifact, baseline comparison, public report, and billing-policy gates without creating jobs.
- **Proof command:** Added `npm run proof:evaluator-readiness-contract` and included it in `npm run proof:local-roadmap`, raising the local suite to 11 CI-safe gates.
- **Public surface:** Updated `/benchmarks` and `llms.txt` to point at the evaluator readiness source while keeping customer eval jobs and public quality reports gated.
- **Safety:** No evaluator job creation, dataset storage, model comparison, public report, billing, settlement, benchmark ingestion, provider routing, inference, pod, LoRA, adapter, or quality-claim behavior changed.
- **Verified:** Syntax/package JSON checks; targeted evaluator readiness Jest suites; evaluator readiness contract proof; TypeScript; Next build; local roadmap proof now passing 11/11 gates.

### 2026-07-09 01:50 UTC - `feat(benchmarks): add readiness rail - PR #852`

**PR:** [#852](https://github.com/dhnpmp-tech/dcp-platform/pull/852) (`codex/benchmark-readiness-page-2026-07-09`).
**Local timestamp:** 2026-07-09 05:50 +04.

**What:** Next Fireworks/Tinker execution slice. Adds a claim-safe Benchmarks/Evals product rail before public quality claims.

- **Backend readiness:** Added `GET /api/models/benchmarks/readiness`, summarizing live measured benchmark rows, live latency/quality/cost counts, evaluator-job gates, and explicit public-claim guards.
- **Public page:** Added `/benchmarks`, tied to the readiness contract and copy that keeps Arabic-quality claims, case studies, rankings, and frontier comparisons gated until reproducible artifacts exist.
- **Discovery:** Wired Benchmarks into shared site navigation, footer, sitemap, and `llms.txt` so humans and agents see it alongside Inference, Pods, Fine-Tuning, Batch, and Deployments.
- **Safety:** No benchmark ingestion, model catalog availability, billing, provider routing, inference execution, settlement, pod, LoRA, adapter, or public quality-claim behavior changed.
- **Verified:** Syntax/whitespace checks; targeted model benchmark/catalog Jest suites; TypeScript; Next build; backend-context endpoint smoke; local roadmap proof.

### 2026-07-09 00:35 UTC - `fix(ops): read dcp-agent VPS inventory locally on VPS - PR #846`

**PR:** [#846](https://github.com/dhnpmp-tech/dcp-platform/pull/846) (`codex/dcp-agent-vps-local-inventory-2026-07-09`).
**Local timestamp:** 2026-07-09 04:35 +04.

**What:** Ninetieth Fireworks/Tinker execution slice. Fixes the dcp-agent reconciliation status packet so VPS-local runs do not SSH back into the same VPS for read-only inventory.

- **VPS-local inventory:** `DCP_AGENT_RECONCILE_READ_REMOTE=1 npm run proof:dcp-agent-reconciliation` now inventories `/root/dc1-platform` directly when that path exists, instead of attempting SSH to `root@76.13.179.86`.
- **Coverage:** Added Jest coverage for the local-path VPS inventory path, including git head/status and served tarball inspection.
- **Safety:** Still read-only; no gateway process, installer artifact, production file, self-update manifest, runtime service, frontend, billing, inference, pod, or product claim behavior changed.
- **Verified:** Targeted dcp-agent reconciliation Jest suite; VPS-local remote-inclusive proof rerun planned after deploy; package script parse; `node --check`; `git diff --check`.

### 2026-07-09 00:27 UTC - `test(ops): add dcp-agent reconciliation status packet - PR #844`

**PR:** [#844](https://github.com/dhnpmp-tech/dcp-platform/pull/844) (`codex/dcp-agent-reconciliation-status-2026-07-09`).
**Local timestamp:** 2026-07-09 04:27 +04.

**What:** Eighty-ninth Fireworks/Tinker execution slice. Promotes the final live acceptance item, `dcp-agent` reconciliation, from missing-runner status to a read-only status packet command.

- **Status command:** Added `DCP_AGENT_RECONCILE_READ_REMOTE=1 npm run proof:dcp-agent-reconciliation`, backed by `scripts/run-dcp-agent-reconciliation-status.js`.
- **Read-only scope:** The command inventories platform head, local `dcp-agent` checkout, active gateway process, local served tarball, and optional VPS artifact state without stopping processes, changing the separate repo, rebuilding tarballs, deleting production artifacts, restarting services, or changing manifests.
- **Gate ledger:** `npm run proof:live-acceptance-status` now reports 8/8 gates command-ready and 0 missing acceptance commands while keeping `dcp-agent` blocked on a controlled maintenance window and artifact ownership decision.
- **Roadmaps:** Updated the Fireworks/Tinker and execution docs so `dcp-agent` is a command-ready blocked maintenance item rather than an undocumented manual step.
- **Safety:** No gateway process, installer artifact, production file, self-update manifest, runtime service, frontend, billing, inference, pod, or product claim behavior changed.
- **Verified:** Default local run of `npm run proof:dcp-agent-reconciliation` with temp report output; targeted dcp-agent status and live-gate status Jest suites; `npm run proof:live-acceptance-status`; package script parse; `node --check`; `git diff --check`.

### 2026-07-09 00:13 UTC - `test(lora): add adapter vLLM live load proof runner - PR #842`

**PR:** [#842](https://github.com/dhnpmp-tech/dcp-platform/pull/842) (`codex/adapter-vllm-live-load-proof-runner-2026-07-09`).
**Local timestamp:** 2026-07-09 04:13 +04.

**What:** Eighty-eighth Fireworks/Tinker execution slice. Promotes the adapter vLLM load/billing gate from missing-runner status to an opt-in live readiness proof command.

- **Live proof runner:** Added `DCP_ADAPTER_VLLM_LIVE_PROOF_ALLOW=1 npm run proof:adapter-vllm-live-load`, backed by `backend/tests/adapter-vllm-live-load-proof.js`.
- **Default safety:** The runner refuses by default, writes JSON/Markdown/log artifacts, and redacts scoped key material.
- **Readiness gate:** When explicitly allowed, it mints/reuses the deterministic smoke principal, checks renter-authenticated `GET /api/lora/readiness`, and records the exact blockers while current readiness keeps adapter serving, route traffic, load-proof completion, endpoint smoke, and billing disabled.
- **Gate ledger:** `npm run proof:live-acceptance-status` now marks the adapter vLLM load/billing gate command-ready, moving the ledger to 7/8 command-ready and 1/8 missing live acceptance runner.
- **Roadmaps:** Updated the local roadmap external gates and Fireworks/Tinker roadmap docs so adapter vLLM load, route traffic, endpoint smoke, and adapter billing have a stable opt-in command before public serving claims.
- **Safety:** No adapter creation, deployment creation, internal load-proof posting, endpoint smoke, route traffic, billing, settlement, discount, model catalog, frontend, or public product claim behavior changed.
- **Verified:** Default blocked run of `npm run proof:adapter-vllm-live-load` with temp report output; targeted adapter live runner and live-gate status Jest suites; package script parse; `node --check`; `git diff --check`.

### 2026-07-08 23:58 UTC - `test(lora): add live training artifact proof runner - PR #840`

**PR:** [#840](https://github.com/dhnpmp-tech/dcp-platform/pull/840) (`codex/lora-live-artifact-proof-runner-2026-07-09`).
**Local timestamp:** 2026-07-09 03:58 +04.

**What:** Eighty-seventh Fireworks/Tinker execution slice. Promotes the LoRA GPU training artifact gate from missing-runner status to an opt-in live readiness proof command.

- **Live proof runner:** Added `DCP_LORA_TRAINING_LIVE_PROOF_ALLOW=1 npm run proof:lora-training-live-artifact`, backed by `backend/tests/lora-training-live-artifact-proof.js`.
- **Default safety:** The runner refuses by default, writes JSON/Markdown/log artifacts, and redacts scoped key material.
- **Readiness gate:** When explicitly allowed, it mints/reuses the deterministic smoke principal, checks renter-authenticated `GET /api/lora/readiness`, and records the exact blockers while current readiness keeps GPU worker execution and model-card artifact writing disabled.
- **Gate ledger:** `npm run proof:live-acceptance-status` now marks the LoRA GPU artifact gate command-ready, moving the ledger to 6/8 command-ready and 2/8 missing live acceptance runners.
- **Roadmaps:** Updated the local roadmap external gates and Fireworks/Tinker roadmap docs so GPU-host LoRA training artifact proof has a stable opt-in command before public training or Tinker claims.
- **Safety:** No training job creation, GPU execution, adapter artifact write, model-card write, adapter registration, serving, route traffic, billing, discount, frontend, or public product claim behavior changed.
- **Verified:** Default blocked run of `npm run proof:lora-training-live-artifact` with temp report output; targeted LoRA live runner and live-gate status Jest suites; package script parse; `node --check`; `git diff --check`.

### 2026-07-08 23:43 UTC - `test(inference): add batch live execution proof runner - PR #838`

**PR:** [#838](https://github.com/dhnpmp-tech/dcp-platform/pull/838) (`codex/batch-live-proof-runner-2026-07-09`).
**Local timestamp:** 2026-07-09 03:43 +04.

**What:** Eighty-sixth Fireworks/Tinker execution slice. Promotes the batch live execution/discount gate from missing-runner status to an opt-in live readiness proof command.

- **Live proof runner:** Added `DCP_BATCH_LIVE_PROOF_ALLOW=1 npm run proof:batch-live-execution`, backed by `backend/tests/batch-live-execution-proof.js`.
- **Default safety:** The runner refuses by default, writes JSON/Markdown/log artifacts, and redacts scoped key material.
- **Readiness gate:** When explicitly allowed, it mints/reuses the deterministic smoke principal, checks renter-authenticated `GET /api/batches/readiness`, and records the exact blockers while current readiness keeps execution, result downloads, settlement, discounts, and model batch capability disabled.
- **Gate ledger:** `npm run proof:live-acceptance-status` now marks the batch live gate command-ready, moving the ledger to 5/8 command-ready and 3/8 missing live acceptance runners.
- **Roadmaps:** Updated the local roadmap external gates so batch live execution has a stable opt-in command before live provider execution and discounted settlement are enabled.
- **Safety:** No batch creation, provider execution, object-store write, result download, settlement, discount, model catalog, frontend, routing, billing, or public product claim behavior changed.
- **Verified:** Default blocked run of `npm run proof:batch-live-execution` with temp report output; targeted batch live runner and live-gate status Jest suites; package script parse; `node --check`; `git diff --check`.

### 2026-07-08 23:27 UTC - `test(inference): add prompt-cache live settlement proof runner - PR #836`

**PR:** [#836](https://github.com/dhnpmp-tech/dcp-platform/pull/836) (`codex/prompt-cache-live-proof-runner-2026-07-09`).
**Local timestamp:** 2026-07-09 03:27 +04.

**What:** Eighty-fifth Fireworks/Tinker execution slice. Promotes the prompt-cache live provider/settlement gate from missing-runner status to an opt-in live proof command.

- **Live proof runner:** Added `DCP_PROMPT_CACHE_LIVE_PROOF_ALLOW=1 npm run proof:prompt-cache-live-settlement`, backed by `backend/tests/prompt-cache-live-settlement-proof.js`.
- **Default safety:** The runner refuses to make billed inference requests unless explicitly allowed, writes JSON/Markdown/log artifacts, and redacts scoped key material.
- **Live contract:** When allowed, the runner checks `GET /v1/prompt-cache/readiness`, mints/reuses the deterministic smoke principal, sends two `/v1/chat/completions` requests with the same static prefix/session, and requires miss -> `hit_measured_no_discount` evidence.
- **No-discount guard:** Passing evidence must keep prompt-cache discounts, provider KV-cache control, settlement discounts, billing/settlement mutation claims, and Tinker compatibility false.
- **Gate ledger:** `npm run proof:live-acceptance-status` now marks the prompt-cache live gate command-ready, moving the ledger to 4/8 command-ready and 4/8 missing live acceptance runners.
- **Roadmaps:** Updated execution, lane, and Fireworks/Tinker roadmap docs with the new live command and blocked funded/provider/policy inputs.
- **Safety:** No production prompt-cache discount, provider KV-cache control, billing, settlement, routing, model catalog, frontend, or public claim behavior changed.
- **Verified:** Default blocked run of `npm run proof:prompt-cache-live-settlement` with temp report output; targeted prompt-cache live runner and live-gate status Jest suites; `npm run proof:live-acceptance-status`; `npm run proof:local-roadmap`; package script parse; `node --check`; `git diff --check`.

### 2026-07-08 23:08 UTC - `test(ops): add live acceptance gate status packet - PR #834`

**PR:** [#834](https://github.com/dhnpmp-tech/dcp-platform/pull/834) (`codex/live-acceptance-gate-status-2026-07-09`).
**Local timestamp:** 2026-07-09 03:08 +04.

**What:** Eighty-fourth Fireworks/Tinker execution slice. Adds one CI-safe status artifact for the live acceptance gates that remain blocked or still need dedicated live proof runners.

- **Status command:** Added `npm run proof:live-acceptance-status`, backed by `scripts/run-live-acceptance-gate-status.js`.
- **Gate ledger:** The report lists workspace-pod live launch, LoRA pod-image provider-host proof, Anthropic SSE live proof, prompt-cache live discount smoke, batch live execution/discount smoke, LoRA GPU artifact proof, adapter vLLM load/billing smoke, and `dcp-agent` reconciliation.
- **Blocked-state clarity:** Each gate records command availability, blocked inputs, artifact pattern, verified behavior, next action, and `capability_claim_allowed: false`.
- **Aggregate gate:** `npm run proof:local-roadmap` now runs the live acceptance status packet, expanding the CI-safe suite to 10 gates.
- **Roadmaps:** Updated the execution system, lane roadmap, and Fireworks/Tinker strategy roadmap so blocked live gates and missing acceptance runners stay visible in handoff.
- **Safety:** No paid compute, billed inference, provider routing, artifact cleanup, billing, settlement, runtime route, frontend, or product-claim behavior changed.
- **Verified:** `npm run proof:live-acceptance-status` with temp report output; targeted live-gate status Jest suite; `npm run proof:local-roadmap` with temp report output; package script parse; `node --check`; `git diff --check`.

### 2026-07-08 22:54 UTC - `test(inference): add router policy contract proof - PR #832`

**PR:** [#832](https://github.com/dhnpmp-tech/dcp-platform/pull/832) (`codex/router-policy-contract-proof-2026-07-09`).
**Local timestamp:** 2026-07-09 02:54 +04.

**What:** Eighty-third Fireworks/Tinker execution slice. Promotes the router-policy readiness/no-claim gates into a repeatable CI-safe proof command.

- **Proof command:** Added `npm run proof:router-policy-contract`, backed by `backend/tests/router-policy-contract-proof.js`.
- **Contract proof:** The runner verifies the read-only policy catalog shape, balanced as the only available default, env-gated latency/earned metadata, and explicit balanced no-op request resolution across supported request shapes.
- **Fail-closed guard:** The proof verifies lowest-latency, cheapest, Saudi-only, coding, and Arabic policies return structured non-selectable failures, while unknown and invalid policy ids return explicit 400-class contract errors.
- **No-claim guard:** The proof records that price-optimized routing, geography/residency routing, coding/Arabic classifier routing, billing/settlement changes, live latency ordering, and Tinker compatibility are not enabled by this slice.
- **Aggregate gate:** `npm run proof:local-roadmap` now includes the router policy proof alongside the existing template, workspace, pod-image, Nsight, prompt-cache, batch, LoRA training, and adapter deployment gates.
- **Roadmaps:** Updated the execution system, lane roadmap, and Fireworks/Tinker strategy roadmap so future router policies have a local contract proof before route-ordering tests, billing/no-billing proofs, and live smoke.
- **Safety:** No production provider selection, routing order, billing, settlement, model catalog, inference execution, public product claim, or frontend behavior changed.
- **Verified:** `npm run proof:router-policy-contract` with temp report output; targeted router proof/policy/v1 Jest suites; `npm run proof:local-roadmap` with temp report output; package script parse; `node --check`; `git diff --check`.

### 2026-07-08 22:39 UTC - `test(ops): add local roadmap proof suite - PR #830`

**PR:** [#830](https://github.com/dhnpmp-tech/dcp-platform/pull/830) (`codex/local-roadmap-proof-suite-2026-07-09`).
**Local timestamp:** 2026-07-09 02:39 +04.

**What:** Eighty-second Fireworks/Tinker execution slice. Adds one local command for the CI-safe audit roadmap proof gates.

- **Proof command:** Added `npm run proof:local-roadmap`, backed by `scripts/run-local-roadmap-proof-suite.mjs`.
- **Suite coverage:** Runs template validation, workspace-pod contracts, pod-image contracts, provider Nsight contract guard, prompt-cache contract proof, batch inference contract proof, LoRA training contract proof, and adapter deployment contract proof.
- **Evidence artifacts:** Writes `dcp.local_roadmap_proof_suite.v1` JSON and Markdown reports plus per-gate logs under `docs/reports/reliability` by default, with temp-output support for CI/handoffs.
- **Blocked gates:** The suite explicitly documents live/external gates it does not run: workspace-pod live launch, provider-host LoRA pod image proof, and Anthropic SSE live proof.
- **Roadmaps:** Updated the execution system and lane roadmap so agents can run the CI-safe local gate set before PR merge/deploy while keeping live gates blocked until credentials/capacity exist.
- **Safety:** No runtime route, billing, provider, pod, training, inference, deployment, or product-claim behavior changed.
- **Verified:** `npm run proof:local-roadmap` with temp report output; package script parse; `node --check`; `git diff --check`.

### 2026-07-08 22:29 UTC - `test(lora): add LoRA training contract proof - PR #828`

**PR:** [#828](https://github.com/dhnpmp-tech/dcp-platform/pull/828) (`codex/lora-training-contract-proof-2026-07-09`).
**Local timestamp:** 2026-07-09 02:29 +04.

**What:** Eighty-first Fireworks/Tinker execution slice. Promotes the LoRA dataset/training/artifact metadata gates into a repeatable CI-safe proof command.

- **Proof command:** Added `npm run proof:lora-training-contract`, wired through the backend reliability script table to `backend/tests/lora-training-contract-proof.js`.
- **Contract proof:** The runner uses an in-memory database and injected worker executor to prove dataset validation returns checksum/split/token facts, invalid rows are rejected, training job creation is metadata-only and idempotent, the default/no-executor worker cannot mutate jobs, and missing adapter artifact checksum fails the job.
- **Artifact/model-card gate:** The proof verifies succeeded jobs require adapter artifact checksum proof before model-card manifest metadata appears, and the manifest keeps public training, serving, routing, quality, and Tinker claims false.
- **Adapter registry gate:** The proof auto-registers an adapter only after checksum proof and verifies the registry row remains metadata-only, undeployed, and marked as requiring serving-load proof before traffic.
- **Evidence artifacts:** The proof writes `dcp.lora_training_contract_proof.v1` JSON and Markdown reports under `docs/reports/reliability` by default, with latest symlike copies for handoff.
- **Regression guard:** Added a targeted Jest test for the proof runner and report contract.
- **Roadmaps:** Updated the execution system, lane roadmap, and Fireworks/Tinker strategy roadmap so LoRA training has a local proof gate before GPU-host artifact proof, vLLM load proof, and adapter billing smoke.
- **Safety:** No GPU training, artifact write, adapter serving, route traffic, training billing, public training claim, or Tinker compatibility claim changed.
- **Verified:** `npm run proof:lora-training-contract` with temp report output; targeted LoRA proof/job/worker Jest suites; package script parse; `node --check`; `git diff --check`.

### 2026-07-08 22:16 UTC - `test(inference): add prompt-cache contract proof - PR #826`

**PR:** [#826](https://github.com/dhnpmp-tech/dcp-platform/pull/826) (`codex/prompt-cache-contract-proof-2026-07-09`).
**Local timestamp:** 2026-07-09 02:16 +04.

**What:** Eightieth Fireworks/Tinker execution slice. Promotes prompt-cache measurement gates into a repeatable CI-safe proof command.

- **Proof command:** Added `npm run proof:prompt-cache-contract`, wired through the backend reliability script table to `backend/tests/prompt-cache-contract-proof.js`.
- **Contract proof:** The runner uses an in-memory database to prove readiness stays measurement-only, cache keys are stable for equivalent prefixes and scoped by model/session, hash-only measurement detects future hits, response usage fields expose cached-input counters, and legacy/non-eligible prompts are not recorded.
- **Privacy guard:** The proof verifies raw system/developer prefix text and private image URLs are not persisted in measurement rows or normalized multimodal cache material.
- **No-discount guard:** Measured hits keep `billable_input_tokens` equal to input tokens and keep prompt-cache discount flags at zero/false in both `usage.prompt_cache` and `usage.pricing`.
- **Evidence artifacts:** The proof writes `dcp.prompt_cache_contract_proof.v1` JSON and Markdown reports under `docs/reports/reliability` by default, with latest symlike copies for handoff.
- **Regression guard:** Added a targeted Jest test for the proof runner and report contract.
- **Roadmaps:** Updated the execution system, lane roadmap, and Fireworks/Tinker strategy roadmap so prompt-cache discounts and provider KV-cache claims have a CI-safe local gate before live provider cache-hit and settlement proof.
- **Safety:** No production prompt-cache discount, settlement amount, provider KV-cache control, raw prompt storage, Tinker compatibility claim, routing, or billing behavior changed.
- **Verified:** `npm run proof:prompt-cache-contract` with temp report output; targeted prompt-cache proof/accounting/v1 model Jest suites; package script parse; `node --check`; `git diff --check`.

### 2026-07-08 22:05 UTC - `test(inference): add batch inference contract proof - PR #824`

**PR:** [#824](https://github.com/dhnpmp-tech/dcp-platform/pull/824) (`codex/batch-inference-contract-proof-2026-07-09`).
**Local timestamp:** 2026-07-09 02:05 +04.

**What:** Seventy-ninth Fireworks/Tinker execution slice. Promotes the batch inference readiness/job/worker/settlement gates into one repeatable CI-safe proof command.

- **Proof command:** Added `npm run proof:batch-inference-contract`, wired through the backend reliability script table to `backend/tests/batch-inference-contract-proof.js`.
- **Contract proof:** The runner uses an in-memory database and injected executor to prove readiness stays validation-only, invalid JSONL is rejected, idempotency replays an existing batch, the default worker does not mutate jobs, result checksums gate completed results, and line proof drives success/failure/cost totals.
- **Minimum balance:** The proof includes a settlement preflight scenario where insufficient renter balance fails the batch line before any billing call or renter debit.
- **Evidence artifacts:** The proof writes `dcp.batch_inference_contract_proof.v1` JSON and Markdown reports under `docs/reports/reliability` by default, with latest symlike copies for handoff.
- **Regression guard:** Added a targeted Jest test for the proof runner and report contract.
- **Roadmaps:** Updated the execution system, lane roadmap, and Fireworks/Tinker strategy roadmap so batch execution/discount claims have a CI-safe local gate before live provider execution and real discounted settlement smoke.
- **Safety:** No production batch execution, object-store write, billing mutation, model capability flag, discount, provider routing, or public product claim changed.
- **Verified:** `npm run proof:batch-inference-contract` with temp report output; targeted batch proof/job/worker Jest suites; package script parse; `node --check`; `git diff --check`.

### 2026-07-08 21:47 UTC - `test(lora): add adapter deployment contract proof - PR #822`

**PR:** [#822](https://github.com/dhnpmp-tech/dcp-platform/pull/822) (`codex/adapter-deployment-contract-proof-2026-07-09`).
**Local timestamp:** 2026-07-09 01:47 +04.

**What:** Seventy-eighth Fireworks/Tinker execution slice. Promotes the adapter deployment load-proof invariant into a repeatable CI-safe proof command.

- **Proof command:** Added `npm run proof:adapter-deployment-contract`, wired through the backend reliability script table to `backend/tests/adapter-deployment-contract-proof.js`.
- **Contract proof:** The runner uses an in-memory database to prove public deployment requests stay non-routing, mismatched load proof stays `degraded` with `route_traffic=false`, and only matching adapter/base-model load proof transitions a deployment to `running`.
- **Evidence artifacts:** The proof writes `dcp.adapter_deployment_contract_proof.v1` JSON and Markdown reports under `docs/reports/reliability` by default, with latest symlike copies for handoff.
- **Regression guard:** Added a targeted Jest test for the proof runner and report contract.
- **Roadmaps:** Updated the execution system, lane roadmap, and Fireworks/Tinker strategy roadmap so adapter deploy MVP has a CI-safe contract proof before live vLLM load and adapter billing smoke.
- **Safety:** No production route behavior, billing, training, provider routing, adapter serving, or public traffic changed. Real vLLM load proof and adapter endpoint billing smoke remain required before public serving claims.
- **Verified:** `npm run proof:adapter-deployment-contract` with temp report output; targeted adapter deployment proof Jest suite; package script parse; `git diff --check`.

### 2026-07-08 21:34 UTC - `test(pods): add LoRA pod image proof command - PR #820`

**PR:** [#820](https://github.com/dhnpmp-tech/dcp-platform/pull/820) (`codex/lora-pod-image-proof-command-2026-07-09`).
**Local timestamp:** 2026-07-09 01:34 +04.

**What:** Seventy-seventh Fireworks/Tinker execution slice. Makes the fat LoRA pod image provider-host gate a first-class proof command with handoff artifacts.

- **Proof command:** Added `npm run proof:lora-pod-image`, wired through the backend reliability script table to `backend/docker-templates/verify-lora-pod-image.sh`.
- **Evidence artifacts:** The provider-host smoke now writes `dcp.lora_pod_image_proof.v1` JSON and Markdown reports under `docs/reports/reliability` by default, capturing image, host, import budget, GPU requirement, LoRA stack-smoke payload, and offline SFT scaffold payload.
- **Contract guard:** Extended the CI-safe pod image verifier and Jest coverage so the LoRA image smoke script must keep report output, `DC1_RESULT_JSON` parsing, import-budget, and GPU-requirement gates wired.
- **Roadmaps:** Updated the execution system, lane roadmap, fat-image architecture note, pod-image README, and Fireworks/Tinker strategy roadmap to point at the new command while keeping GPU-host acceptance blocked until a real provider run passes.
- **Safety:** No pod launch, billing, workspace, training, adapter serving, provider routing, or product-claim behavior changed.
- **Verified:** Pod image contract verifier; targeted pod image contract Jest suite; package script parse; shell syntax check; `git diff --check`.

### 2026-07-08 21:20 UTC - `docs(roadmap): codify audit proof gates - PR #818`

**PR:** [#818](https://github.com/dhnpmp-tech/dcp-platform/pull/818) (`codex/audit-execution-proof-gates-2026-07-08`).
**Local timestamp:** 2026-07-09 01:20 +04.

**What:** Seventy-sixth Fireworks/Tinker execution slice. Turns the audit-derived roadmap into an explicit build/deploy/smoke/proof order so future agents can continue without guessing acceptance states.

- **Gate semantics:** Added Passed/Blocked/Failed/Deferred definitions so missing funded credentials, live GPU capacity, or provider-host access are tracked as blocked acceptance gates rather than silently treated as complete.
- **Proof command map:** Documented the exact commands for build integrity, workspace-to-pod contracts, live workspace-pod proof, pod image contracts, Nsight evidence contracts, template validation, Anthropic SSE proof, production health, model catalog smoke, and Anthropic route-host sanity.
- **Technical order:** Added the no-skips audit order: repo parity, proof harnesses, POT/PODS hardening, inference streaming/catalog hardening, prompt-cache/batch economics, LoRA artifact proof, adapter deployment, and product packaging.
- **Lane alignment:** Updated the lane roadmaps with proof-first priority and a lane proof command table covering frontend, backend, inference, POT/PODS, and LoRA.
- **Safety:** Documentation/process only. No runtime routes, billing, deployment, training, inference, credentials, or provider behavior changed.
- **Verified:** `git diff --check`; Markdown command/link review.

### 2026-07-08 21:10 UTC - `fix(inference): point Anthropic SSE proof at API host - PR #816`

**PR:** [#816](https://github.com/dhnpmp-tech/dcp-platform/pull/816) (`codex/fix-anthropic-proof-api-base-2026-07-08`).
**Local timestamp:** 2026-07-09 01:10 +04.

**What:** Seventy-fifth Fireworks/Tinker execution slice. Fixes the Anthropic SSE proof runner packaging after production smoke showed `dcp.sa/anthropic/...` is not the backend route host.

- **Runner default:** `npm run proof:anthropic-sse` now defaults to `https://api.dcp.sa`, matching the live Anthropic backend route.
- **Base URL normalization:** If an operator passes a base ending in `/api`, the runner keeps `/api/*` paths there but correctly maps root-mounted `/anthropic/*` and `/v1/*` paths back to the API host root.
- **Regression guard:** Extended the static proof-runner test for `/api`, `/anthropic`, and `/v1` base handling.
- **Safety:** No Anthropic route, billing, provider routing, credential, or runtime behavior changed.
- **Verified:** Production unauthenticated probe to `https://api.dcp.sa/anthropic/v1/messages` returns the expected 401; runner syntax check; targeted Anthropic SSE proof Jest guard.

### 2026-07-08 21:02 UTC - `test(inference): add Anthropic SSE live proof runner - PR #814`

**PR:** [#814](https://github.com/dhnpmp-tech/dcp-platform/pull/814) (`codex/anthropic-sse-live-proof-runner-2026-07-08`).
**Local timestamp:** 2026-07-09 01:02 +04.

**What:** Seventy-fourth Fireworks/Tinker execution slice. Adds a repeatable Anthropic Messages SSE proof path for agent-compatible inference.

- **Live proof runner:** Added `npm run proof:anthropic-sse`, a gated smoke that mints/reuses the deterministic inference smoke principal, calls `POST /anthropic/v1/messages` with `stream: true`, and validates `text/event-stream` plus Anthropic `message_start`/`message_stop` frames.
- **Safety gates:** The runner refuses to make a billed inference request unless `DCP_ANTHROPIC_PROOF_ALLOW_LIVE=1` is set and redacts scoped key hints in generated reports.
- **Evidence artifacts:** Successful or failed runs write JSON/Markdown/log proof artifacts under `docs/reports/reliability`.
- **Regression guard:** Added a targeted Jest test for SSE-frame detection, base URL handling, credential redaction, and route/header coverage.
- **Acceptance state:** No Anthropic route, billing, provider routing, or runtime behavior changed. The real live proof still requires a funded smoke principal and compatible vLLM provider capacity.
- **Verified:** Runner syntax check; targeted Anthropic SSE proof Jest guard.

### 2026-07-08 20:52 UTC - `test(pods): add workspace-to-pod live proof runner - PR #812`

**PR:** [#812](https://github.com/dhnpmp-tech/dcp-platform/pull/812) (`codex/workspace-pod-live-proof-runner-2026-07-08`).
**Local timestamp:** 2026-07-09 00:52 +04.

**What:** Seventy-third Fireworks/Tinker execution slice. Converts the remaining provider-host workspace acceptance gate into a repeatable live proof command.

- **Live proof runner:** Added `npm run proof:workspace-pod`, an opt-in smoke that checks renter auth, active portable volume, presigned workspace upload, workspace listing, short pod launch, running pod status, and Jupyter Contents API visibility for the uploaded marker under `/workspace`.
- **Safety gates:** The runner refuses to launch paid compute unless `DCP_WORKSPACE_POD_ALLOW_LAUNCH=1` is set, redacts renter/Jupyter credentials in reports, stops the pod by default, and supports explicit keep-running/delete-marker/rent-volume switches.
- **Evidence artifacts:** Successful or failed runs write JSON/Markdown proof reports under `docs/reports/reliability` for handoff and postmortem review.
- **Regression guard:** Added a targeted Jest test that locks the runner to the full upload -> pod -> Jupyter visibility path without touching production.
- **Acceptance state:** No runtime route, billing, workspace, daemon, or provider behavior changed. The live GPU-host run still needs production renter credentials, active volume, and launchable capacity to close the acceptance gate.
- **Verified:** Runner syntax check; targeted workspace-pod live-proof Jest guard; workspace-pod contract Jest guard.

### 2026-07-08 20:38 UTC - `test(pods): add workspace-to-pod contract guard - PR #810`

**PR:** [#810](https://github.com/dhnpmp-tech/dcp-platform/pull/810) (`codex/workspace-pod-contract-guard-2026-07-08`).
**Local timestamp:** 2026-07-09 00:38 +04.

**What:** Seventy-second Fireworks/Tinker execution slice. Adds a CI-safe guard for the workspace upload -> pod launch -> `/workspace` restore/snapshot contract before real GPU-host proof.

- **Verifier:** Added `workspace-pods:verify-contracts`, checking pod launch task specs, portable S3 workspace wiring, renter-derived workspace buckets, workspace API active-volume gating, and daemon restore/snapshot calls.
- **Backend tests:** Added Jest coverage for the workspace-pod contract verifier.
- **POTS evidence:** The guard proves the code path remains wired while the real provider-host smoke remains the acceptance gate for file visibility inside `/workspace`.
- **Safety:** No pod launch, stop, billing, workspace upload, daemon runtime, or provider behavior changed.
- **Verified:** `npm run workspace-pods:verify-contracts`; targeted workspace-pod Jest test; backend `node --check`; `git diff --check`.

### 2026-07-08 20:27 UTC - `fix(auth): preserve query strings in console auth redirects - PR #808`

**PR:** [#808](https://github.com/dhnpmp-tech/dcp-platform/pull/808) (`codex/auth-redirect-preserve-query-2026-07-08`).
**Local timestamp:** 2026-07-09 00:27 +04.

**What:** Seventy-first Fireworks/Tinker execution slice. Hardens deep links into gated console routes after the workspace pre-upload rollout.

- **Middleware:** Auth redirects now preserve the original pathname plus query string, so links such as `/renter/playground?surface=workspace` survive the sign-in bounce.
- **Regression guard:** Added a static middleware test that prevents reverting to pathname-only redirects.
- **Safety:** No auth role, cookie, session-signing, API-key, billing, training, or serving behavior changed.
- **Verified:** Static middleware redirect test; `node --check`; `git diff --check`; production smoke finding rechecked after deploy.

### 2026-07-08 20:17 UTC - `feat(frontend): make fine-tuning workspace pre-upload first-class - PR #806`

**PR:** [#806](https://github.com/dhnpmp-tech/dcp-platform/pull/806) (`codex/fine-tuning-workspace-preupload-2026-07-08`).
**Local timestamp:** 2026-07-09 00:17 +04.

**What:** Seventieth Fireworks/Tinker execution slice. Makes workspace staging the normal first step before LoRA validation, pod launch, or adapter proof.

- **Frontend:** `/renter/fine-tuning` now renders a Step zero workspace pre-upload rail ahead of the LoRA workflow gates.
- **Workflow:** The rail sends renters to the persistent workspace file manager first, then to LoRA/QLoRA pod templates after dataset files are staged.
- **Deep link:** `/renter/playground?surface=workspace` now opens the Workspace tab directly and keeps tab changes reflected in the URL.
- **Safety:** No managed training, adapter serving, route traffic, billing change, or Tinker-compatibility claim was added; copy keeps GPU-host and serving-load proof gates explicit.
- **Verified:** `npm run build`; `git diff --check`; local production Playwright render for `/renter/fine-tuning` and `/renter/playground?surface=workspace` on desktop/mobile with no horizontal overflow.

### 2026-07-08 19:57 UTC - `test(backend): add model catalog parity coverage - PR #804`

**PR:** [#804](https://github.com/dhnpmp-tech/dcp-platform/pull/804) (`codex/model-catalog-parity-tests-2026-07-08`).
**Local timestamp:** 2026-07-08 23:57 +04.

**What:** Sixty-ninth Fireworks/Tinker execution slice. Hardens the model metadata contract that powers pricing, Playground, and inference product surfaces.

- **Backend tests:** Added a cross-surface parity test that mounts `/v1/models`, `/api/models`, and `/api/models/catalog` against the same mocked model/provider/rate fixture.
- **Contract guard:** The test proves token pricing, provider count, availability, modalities, max output, capability flags, `capabilities`, and `feature_readiness` stay aligned across OpenAI-compatible and DCP catalog surfaces.
- **Safety:** No production route behavior changed; this is a regression guard for future pricing/capability drift.
- **Verified:** Targeted Jest suites for `/v1/models`, `/api/models` catalog honesty, and the new parity test; backend `node --check`; `git diff --check`.

### 2026-07-08 19:46 UTC - `feat(frontend): show prompt-cache readiness in renter Playground - PR #802`

**PR:** [#802](https://github.com/dhnpmp-tech/dcp-platform/pull/802) (`codex/renter-playground-prompt-cache-readiness-2026-07-08`).
**Local timestamp:** 2026-07-08 23:46 +04.

**What:** Sixty-eighth Fireworks/Tinker execution slice. Brings the prompt-cache readiness contract into the renter Playground alongside router and model metadata.

- **Frontend:** `/renter/playground` now fetches `GET /v1/prompt-cache/readiness` without renter authentication and renders a compact Prompt cache contract panel in the left rail.
- **Contract visibility:** The panel shows the current measurement-only mode, contract version, hash-only measurement, raw-prompt storage state, cached-input discount gate, and provider KV-cache-control gate.
- **Safety:** No billing discount, settlement change, provider cache-control claim, Tinker compatibility claim, or chat request behavior was added.
- **Verified:** `npm run build`; `git diff --check`; local production Playwright render for `/renter/playground` on desktop/mobile with the prompt-cache readiness panel visible and no horizontal overflow.

### 2026-07-08 19:24 UTC - `feat(frontend): surface prompt-cache readiness on Inference page - PR #801`

**PR:** [#801](https://github.com/dhnpmp-tech/dcp-platform/pull/801) (`codex/public-inference-prompt-cache-readiness-2026-07-08`).
**Local timestamp:** 2026-07-08 23:24 +04.

**What:** Sixty-seventh Fireworks/Tinker execution slice. Packages the prompt-cache readiness contract on the public Inference product page.

- **Public route:** `/inference` now lists prompt-cache measurement as a shipped readiness source pointing to `GET /v1/prompt-cache/readiness`.
- **Claim guard:** Page copy now separates hash-only prompt-cache measurement from cached-input discounts, settlement discounts, and provider KV-cache control.
- **Product gates:** Added a dedicated prompt-cache gate card while keeping batch, LoRA serving, and dedicated deployments proof-gated.
- **Verified:** `npm run build`; `git diff --check`; local production Playwright render for `/inference` on desktop/mobile with the prompt-cache readiness copy visible and no horizontal overflow.

### 2026-07-08 19:16 UTC - `feat(inference): add prompt-cache readiness contract - PR #800`

**PR:** [#800](https://github.com/dhnpmp-tech/dcp-platform/pull/800) (`codex/prompt-cache-readiness-contract-2026-07-08`).
**Local timestamp:** 2026-07-08 23:16 +04.

**What:** Sixty-sixth Fireworks/Tinker execution slice. Adds a read-only prompt-cache readiness contract for the OpenAI-compatible inference API.

- **API:** Added public `GET /v1/prompt-cache/readiness` beside router-policy readiness.
- **Contract:** The response exposes supported prompt-cache hints, response usage fields, hash-only measurement state, and no-discount billing gates.
- **Safety:** The contract explicitly says DCP does not yet apply prompt-cache discounts, alter settlement, store raw prompts/static prefixes, control provider KV caches, or claim Tinker compatibility.
- **OpenAPI:** Documented `PromptCacheReadiness` and the new `/v1/prompt-cache/readiness` path, then synced `public/docs/openapi.yaml`.
- **Verified:** Targeted prompt-cache and v1 route Jest suites; backend `node --check`; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 19:06 UTC - `fix(lora): align dataset validation limits - PR #798`

**PR:** [#798](https://github.com/dhnpmp-tech/dcp-platform/pull/798) (`codex/lora-dataset-validate-limit-parity-2026-07-08`).
**Local timestamp:** 2026-07-08 23:06 +04.

**What:** Sixty-fifth Fireworks/Tinker execution slice. Makes LoRA validate-only checks enforce the same dataset limits as training-job creation.

- **Backend contract:** `POST /api/lora/datasets/validate` now uses the training-job dataset validator, matching the existing 12 MB / 100,000-row job-creation limits.
- **Readiness:** `GET /api/lora/readiness` now exposes dataset validation limits so agents know the current accepted size envelope before submit.
- **Response shape:** Validate-only responses include a `limits` object with max bytes, max rows, and default validation split.
- **Public OpenAPI:** Re-synced `public/docs/openapi.yaml` from the maintained spec so deployed docs include current LoRA validation, batch, model-card, and credit-contract additions.
- **Parity tests:** Route tests prove validate-only and create-job reject over-limit datasets with the same machine-readable error codes.
- **Verified:** Targeted LoRA training job Jest suite; backend `node --check`; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 18:49 UTC - `feat(frontend): add LoRA dataset validation snippet - PR #797`

**PR:** [#797](https://github.com/dhnpmp-tech/dcp-platform/pull/797) (`codex/frontend-lora-dataset-validate-snippet-2026-07-08`).
**Local timestamp:** 2026-07-08 22:49 +04.

**What:** Sixty-fourth Fireworks/Tinker execution slice. Exposes the new validate-only LoRA dataset API in the renter Fine-Tuning console.

- **Frontend:** Added a copyable `POST /api/lora/datasets/validate` curl snippet to `/renter/fine-tuning`.
- **Contract copy:** The snippet shows JSONL validation before job creation and says it returns checksum/split/token/size facts without creating a training job or storing raw rows.
- **Safety:** No training, adapter registration, deployment routing, or Tinker-compatibility claim was added.
- **Verified:** `npm run build`; `git diff --check`; local production Playwright render for `/renter/fine-tuning` on desktop/mobile with the new snippet visible and no horizontal overflow.

### 2026-07-08 18:43 UTC - `feat(lora): add dataset validate-only endpoint - PR #796`

**PR:** [#796](https://github.com/dhnpmp-tech/dcp-platform/pull/796) (`codex/lora-dataset-validate-endpoint-2026-07-08`).
**Local timestamp:** 2026-07-08 22:43 +04.

**What:** Sixty-third Fireworks/Tinker execution slice. Adds a validate-only LoRA dataset API before managed training execution is enabled.

- **API:** Added renter-authenticated `POST /api/lora/datasets/validate` for chat-message or prompt/completion JSONL validation.
- **Contract:** The endpoint returns row count, train/validation split, estimated tokens, normalized checksum, max row chars, normalized bytes, and explicit no-training/no-persistence flags.
- **Readiness:** `GET /api/lora/readiness` now advertises the validate-only endpoint under LoRA dataset validation.
- **Safety:** The route does not create a training job, persist raw dataset rows, launch GPU work, register an adapter, or claim Tinker compatibility.
- **Verified:** Targeted LoRA training job Jest suite; backend `node --check`; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 18:11 UTC - `feat(pods): expose minimum paid-credit shortfall - PR #795`

**PR:** [#795](https://github.com/dhnpmp-tech/dcp-platform/pull/795) (`codex/pod-minimum-paid-credit-contract-2026-07-08`).
**Local timestamp:** 2026-07-08 22:11 +04.

**What:** Sixty-second Fireworks/Tinker execution slice. Makes Tareq's on-demand paid-credit gate more actionable without changing billing economics.

- **Backend contract:** On-demand pod 402 responses now include `minimum_paid_credit_*`, `credit_shortfall_*`, and `credit_policy` fields alongside the existing required/available credit facts.
- **SAR 10 edge:** Tests now prove that 10 SAR paid credit allows a 10 SAR on-demand quote while 10.01 SAR returns a 0.01 SAR shortfall.
- **Renter UI:** `/renter/pods` shows the exact "Add X more" fact from the backend response while keeping vendor/on-demand internals hidden.
- **OpenAPI:** Documented the additive paid-credit shortfall fields on `PaymentRequiredError`.
- **Verified:** Targeted pod access policy Jest suite; backend `node --check`; OpenAPI YAML parse; `git diff --check`; `npm run build`.

### 2026-07-08 18:00 UTC - `docs(ai): update llms product rails - PR #794`

**PR:** [#794](https://github.com/dhnpmp-tech/dcp-platform/pull/794) (`codex/llms-product-rails-2026-07-08`).
**Local timestamp:** 2026-07-08 22:00 +04.

**What:** Sixty-first Fireworks/Tinker execution slice. Updates `llms.txt` so agents and answer engines see the current product rails and proof gates.

- **AI discovery:** Added product map links for Pods, Inference, Fine-Tuning, Batch, Dedicated Deployments, and Pricing.
- **Claim guard:** Documented LoRA, Batch, and Dedicated Deployment gates so agents do not overstate public training, adapter serving, batch execution, discounts, Tinker compatibility, or route traffic.
- **API pointers:** Added readiness/deployment endpoints for LoRA, Batch, and adapter deployment records.
- **Verified:** `npm run build`; `git diff --check`; local production `/llms.txt` smoke for product route links and LoRA/Batch/Dedicated proof-gate language.

### 2026-07-08 17:52 UTC - `chore(frontend): publish product routes in sitemap - PR #793`

**PR:** [#793](https://github.com/dhnpmp-tech/dcp-platform/pull/793) (`codex/public-product-sitemap-2026-07-08`).
**Local timestamp:** 2026-07-08 21:52 +04.

**What:** Sixtieth Fireworks/Tinker execution slice. Updates public route discovery after the product-page rollout.

- **Sitemap:** Added `/pods`, `/inference`, `/fine-tuning`, `/batch`, `/dedicated-deployments`, and live `/pricing` to `sitemap.xml`.
- **Compatibility:** Kept `/containers` in the sitemap as a lower-priority compatibility URL while public GPU Pods links migrate to `/pods`.
- **Pricing CTA:** Retargeted the pricing-page GPU Pods CTA from `/containers` to `/pods`.
- **Verified:** `npm run build`; `git diff --check`; local production smoke for `sitemap.xml` required routes/lower `/containers` priority and pricing-page `/pods` CTA with no horizontal overflow.

### 2026-07-08 17:43 UTC - `feat(frontend): add public Dedicated Deployments page - PR #792`

**PR:** [#792](https://github.com/dhnpmp-tech/dcp-platform/pull/792) (`codex/public-dedicated-deployments-page-2026-07-08`).
**Local timestamp:** 2026-07-08 21:43 +04.

**What:** Fifty-ninth Fireworks/Tinker execution slice. Adds a public `/dedicated-deployments` product page for the adapter-to-endpoint rail while keeping route traffic gated by serving load proof.

- **Public route:** Added `/dedicated-deployments` with deployment intent, vLLM load-proof, route-traffic, and multi-LoRA gate positioning.
- **Product IA:** Added Deployments to shared site navigation, mobile menus, shared footer, home navigation, and home footer product links.
- **Claim guard:** The page states that deployment rows are planning/audit records until endpoint proof matches deployment id, adapter id, base model, mode, and artifact checksum.
- **Verified:** `npm run build`; `git diff --check`; local production Playwright render for `/dedicated-deployments` on desktop/tablet/mobile with loaded images, active Deployments nav, home link, and no horizontal overflow.

### 2026-07-08 17:28 UTC - `feat(frontend): add public Batch page - PR #791`

**PR:** [#791](https://github.com/dhnpmp-tech/dcp-platform/pull/791) (`codex/public-batch-page-2026-07-08`).
**Local timestamp:** 2026-07-08 21:28 +04.

**What:** Fifty-eighth Fireworks/Tinker execution slice. Adds a public `/batch` product page that packages the shipped batch-inference readiness and metadata contract without claiming live execution or discounts.

- **Public route:** Added `/batch` with JSONL validation, line-ledger, result-manifest, and discount-gate positioning.
- **Product IA:** Added Batch to shared site navigation, mobile menus, shared footer, home navigation, and home footer product links.
- **Claim guard:** The page states that worker execution, completed-result downloads, settlement, discounts, and model batch capability remain gated until proof exists.
- **Verified:** `npm run build`; `git diff --check`; local production Playwright render for `/batch` on desktop/tablet/mobile with loaded images, active Batch nav, home link, and no horizontal overflow.

### 2026-07-08 17:16 UTC - `feat(frontend): add public Pods route - PR #790`

**PR:** [#790](https://github.com/dhnpmp-tech/dcp-platform/pull/790) (`codex/public-pods-route-2026-07-08`).
**Local timestamp:** 2026-07-08 21:16 +04.

**What:** Fifty-seventh Fireworks/Tinker execution slice. Adds `/pods` as the public GPU Pods product route while keeping the existing `/containers` compatibility URL alive.

- **Public route:** Added `/pods` by reusing the existing GPU Pods product surface, including Jupyter, root SSH, GPU availability, template, and workspace positioning.
- **Product IA:** Retargeted shared GPU Pods navigation, home entry points, footer links, and Fine-Tuning CTA links from `/containers` to `/pods`.
- **Compatibility:** `/containers` remains renderable for existing links; no pod launch, billing, workspace, or backend behavior changed.
- **Verified:** `npm run build`; `git diff --check`; local production Playwright render for `/pods` on desktop/tablet/mobile with loaded images, active nav, home link, no horizontal overflow, and `/containers` compatibility render.

### 2026-07-08 17:05 UTC - `feat(frontend): add public Inference page - PR #789`

**PR:** [#789](https://github.com/dhnpmp-tech/dcp-platform/pull/789) (`codex/public-inference-page-2026-07-08`).
**Local timestamp:** 2026-07-08 21:05 +04.

**What:** Fifty-sixth Fireworks/Tinker execution slice. Adds a public `/inference` product page so the Inference API has a product entry separate from the live marketplace.

- **Public route:** Added `/inference` with product visuals, OpenAI-compatible API positioning, model-catalog metadata gates, SAR metering notes, and a Python client snippet.
- **Product IA:** Retargeted shared "Inference" navigation and home Inference entry points from `/marketplace` to `/inference`; `/marketplace` remains the live capacity/catalog page.
- **Claim guard:** Advanced prompt cache, batch discounts, LoRA serving, dedicated deployments, premium/cost/latency routing, and feature-readiness rails remain explicitly gated until implementation and evidence land.
- **Verified:** `npm run build`; `git diff --check`; local production Playwright render for `/inference` on desktop/tablet/mobile with loaded images, active nav, home link, and no horizontal overflow.

### 2026-07-08 16:57 UTC - `feat(frontend): add public Fine-Tuning page - PR #788`

**PR:** [#788](https://github.com/dhnpmp-tech/dcp-platform/pull/788) (`codex/public-fine-tuning-page-2026-07-08`).
**Local timestamp:** 2026-07-08 20:57 +04.

**What:** Fifty-fifth Fireworks/Tinker execution slice. Adds the first public Fine-Tuning product page tied to shipped LoRA contracts rather than future serving claims.

- **Public route:** Added `/fine-tuning` with product photography, LoRA readiness/deployment-intent positioning, API snippets, and proof-gated workflow copy.
- **Product IA:** Added Fine-Tuning links to shared site nav, mobile menus, shared footer, and home footer.
- **Claim guard:** The page says managed training, public adapter serving, Tinker compatibility, route traffic, and quality claims remain gated until GPU artifact proof, vLLM load proof, and benchmark artifacts exist.
- **Verified:** `npm run build`; `git diff --check`; local production Playwright render for `/fine-tuning` on desktop/tablet/mobile with loaded images, active nav, home link, and no horizontal overflow.

### 2026-07-08 16:45 UTC - `feat(frontend): add Fine-Tuning API snippets - PR #787`

**PR:** [#787](https://github.com/dhnpmp-tech/dcp-platform/pull/787) (`codex/frontend-fine-tuning-api-snippets-2026-07-08`).
**Local timestamp:** 2026-07-08 20:45 +04.

**What:** Fifty-fourth Fireworks/Tinker execution slice. Completes the Fine-Tuning dashboard's curl/API snippet gap with shipped-contract examples instead of static endpoint labels.

- **Frontend contract:** Replaced the Fine-Tuning sidebar contract preview with copyable curl snippets for LoRA readiness, training jobs, adapter registry, aggregate deployment intents, and gated deploy-intent creation.
- **Claim guard:** Snippet notes explicitly keep GPU trainer proof, public adapter serving, and deployment routing gated until backend proof exists.
- **Interaction:** Added per-snippet copy feedback without changing any training, adapter, deployment, or routing API behavior.
- **Verified:** `npm run build`; `git diff --check`; mocked authenticated Playwright desktop/mobile render for `/renter/fine-tuning`, including snippet visibility, copy-to-clipboard, and no horizontal overflow.

### 2026-07-08 16:29 UTC - `feat(frontend): use aggregate adapter deployments - PR #786`

**PR:** [#786](https://github.com/dhnpmp-tech/dcp-platform/pull/786) (`codex/frontend-aggregate-deployments-2026-07-08`).
**Local timestamp:** 2026-07-08 20:29 +04.

**What:** Fifty-third Fireworks/Tinker execution slice. Moves the Fine-Tuning deployment ledger onto the renter-wide deployment list from PR #785 so the frontend no longer fans out one request per adapter.

- **Frontend contract:** `/renter/fine-tuning` now fetches `GET /api/adapters/deployments` with the renter key alongside adapters, training jobs, and LoRA readiness.
- **Request shape:** Removed per-adapter deployment polling from the initial page load while preserving the same read-only deployment intent table.
- **Claim guard:** The page still exposes no deploy button or routing claim; route traffic and load proof remain driven entirely by backend deployment rows.
- **Verified:** `npm run build`; `git diff --check`; mocked authenticated Playwright desktop/mobile render proving the aggregate deployment endpoint is used, adapter-scoped deployment requests are not used, and no horizontal overflow appears.

### 2026-07-08 16:18 UTC - `feat(adapters): list renter deployment records - PR #785`

**PR:** [#785](https://github.com/dhnpmp-tech/dcp-platform/pull/785) (`codex/adapter-deployments-list-2026-07-08`).
**Local timestamp:** 2026-07-08 20:18 +04.

**What:** Fifty-second Fireworks/Tinker execution slice. Adds a renter-wide adapter deployment list so dashboards and agents can read deployment intent state without one request per adapter.

- **Backend contract:** Added `GET /api/adapters/deployments` before the dynamic adapter route, returning renter-owned deployment lifecycle records across adapters.
- **Filters:** Supports optional `adapter_id`, `status`, `limit`, and `offset` while reusing the existing deployment status and pagination normalization.
- **Safety:** The response remains metadata/proof state only; routing is still represented solely by each row's `route_traffic` flag.
- **OpenAPI:** Documented the renter-authenticated aggregate deployment list in the platform API docs copies.
- **Verified:** Targeted adapter deployment and adapter registry Jest suites; backend route/service `node --check`; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 16:11 UTC - `feat(frontend): show adapter deployment intents - PR #784`

**PR:** [#784](https://github.com/dhnpmp-tech/dcp-platform/pull/784) (`codex/frontend-adapter-deployments-2026-07-08`).
**Local timestamp:** 2026-07-08 20:11 +04.

**What:** Fifty-first Fireworks/Tinker execution slice. Extends the renter Fine-Tuning console from training jobs and adapter registry rows into read-only adapter deployment intent visibility.

- **Frontend contract:** `/renter/fine-tuning` now fetches `GET /api/adapters/{adapter_id}/deployments` for the first adapter set.
- **Deployment ledger:** Added a read-only table for deployment id, adapter id, mode, endpoint id, lifecycle status, route-traffic state, load-proof state, and failure reason.
- **Claim guard:** The UI still exposes no deploy action and shows routes/load proof as gated unless the backend deployment row says otherwise.
- **KPI update:** The fourth KPI now counts deployment intents and keeps ready-adapter context in the sublabel.
- **Verified:** `npm run build`; `git diff --check`; mocked authenticated Playwright render smoke for `/renter/fine-tuning` on desktop and mobile, including adapter-deployment endpoint calls and no horizontal overflow.

### 2026-07-08 16:02 UTC - `feat(frontend): render LoRA readiness gates - PR #783`

**PR:** [#783](https://github.com/dhnpmp-tech/dcp-platform/pull/783) (`codex/frontend-lora-readiness-2026-07-08`).
**Local timestamp:** 2026-07-08 20:02 +04.

**What:** Fiftieth Fireworks/Tinker execution slice. Connects the renter Fine-Tuning console to the LoRA readiness contract from PR #782.

- **Frontend contract:** `/renter/fine-tuning` now fetches `GET /api/lora/readiness` with the renter key alongside renter, adapter, and training-job state.
- **Readiness rail:** Added a compact LoRA readiness panel for current mode, dataset validation, training jobs, model cards, adapter registry, adapter deployments, route traffic, and contract version.
- **Claim guard:** Public training, serving, routing, quality, Tinker compatibility, and discounts are rendered from backend `claim_guards` instead of duplicated static copy.
- **Responsive layout:** Added scoped desktop/tablet/mobile CSS for the readiness rail without changing existing training-job tables or model-card proof cards.
- **Verified:** `npm run build`; `git diff --check`; mocked authenticated Playwright render smoke for `/renter/fine-tuning` on desktop and mobile, including a `/api/lora/readiness` request and no horizontal overflow.

### 2026-07-08 15:50 UTC - `feat(lora): publish readiness gates - PR #782`

**PR:** [#782](https://github.com/dhnpmp-tech/dcp-platform/pull/782) (`codex/lora-readiness-contract-2026-07-08`).
**Local timestamp:** 2026-07-08 19:50 +04.

**What:** Forty-ninth Fireworks/Tinker execution slice. Publishes a renter-authenticated LoRA readiness contract so Fine-Tuning UI, docs, and agents can distinguish the shipped metadata foundation from future GPU training and adapter serving work.

- **Readiness API:** Added `GET /api/lora/readiness` with dataset-validation, training-job, model-card, adapter-registry, adapter-deployment, and endpoint-map gates.
- **Claim guard:** The contract explicitly keeps public training, public serving, routing, quality claims, Tinker compatibility, and discounts false until GPU-host artifact proof and vLLM load proof exist.
- **LoRA handoff:** Exposes the current mode as `metadata_and_artifact_proof_only`, matching the existing training-job, model-card, adapter-registry, and deployment-load-proof foundations.
- **OpenAPI:** Documented the renter-authenticated readiness endpoint and `LoraReadiness` schema in the platform API docs copies while leaving the vendored dcp-contracts file untouched.
- **Verified:** Targeted LoRA/adapter Jest suites; backend `node --check`; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 15:39 UTC - `feat(frontend): add live model catalog to pricing - PR #781`

**PR:** [#781](https://github.com/dhnpmp-tech/dcp-platform/pull/781) (`codex/pricing-live-model-catalog-2026-07-08`).
**Local timestamp:** 2026-07-08 19:39 +04.

**What:** Forty-eighth Fireworks/Tinker execution slice. Moves the public pricing page closer to the live inference contract by adding a serveable-model rate table from `/v1/models`.

- **Frontend contract:** `/pricing` now fetches `GET /v1/models` and maps serveable models with provider count, context, max output, pricing source, SAR input/output rates, and capability chips.
- **Pricing surface:** Added a live API catalog block below the model-class guide while keeping the existing class-rate guide for coarse pricing context.
- **Claim guard:** Models with `provider_count=0` are filtered out of the live pricing table, so the page does not advertise prices for currently unservable models.
- **Responsive layout:** Added scoped pricing-table CSS so the live catalog renders cleanly on desktop and mobile without affecting other model/capacity tables.
- **Verified:** `npm run build`; `git diff --check`; mocked Playwright render smoke for `/pricing` on desktop and mobile, including no horizontal overflow and a guard that non-serveable models stay hidden.

### 2026-07-08 15:29 UTC - `feat(frontend): show live model metadata in playground - PR #780`

**PR:** [#780](https://github.com/dhnpmp-tech/dcp-platform/pull/780) (`codex/frontend-playground-model-metadata-2026-07-08`).
**Local timestamp:** 2026-07-08 19:29 +04.

**What:** Forty-seventh Fireworks/Tinker execution slice. Makes the renter Playground consume the richer `/v1/models` contract from PRs #766/#769/#771 instead of showing only a live-provider count.

- **Frontend contract:** Playground model options now preserve provider count, context length, max output tokens, token pricing, capability flags, feature readiness, and max VRAM from `/v1/models`.
- **Model metadata panel:** The selected model now shows live contract status, context, max output, providers, max VRAM, SAR input/output rates per 1M tokens, capability chips, and advanced feature readiness.
- **Request guard:** The max-tokens slider now clamps to the selected model's backend `max_output_tokens` instead of always using a static 4096 ceiling.
- **Claim guard:** Prompt cache, batch, LoRA, and dedicated deployment states are rendered from backend readiness and stay visibly gated/measurement-only when not public.
- **Verified:** `npm run build`; `git diff --check`; mocked authenticated Playwright render smoke for `/renter/playground` on desktop and mobile, including no horizontal overflow, backend-driven slider max, and captured chat request body with `routing_policy: "balanced"`.

### 2026-07-08 15:17 UTC - `feat(frontend): show router policies in playground - PR #779`

**PR:** [#779](https://github.com/dhnpmp-tech/dcp-platform/pull/779) (`codex/frontend-router-policy-playground-2026-07-08`).
**Local timestamp:** 2026-07-08 19:17 +04.

**What:** Forty-sixth Fireworks/Tinker execution slice. Connects the renter Playground to the router-policy readiness contract from PRs #772/#773 without enabling future routing policies or changing balanced routing behavior.

- **Frontend contract:** `/renter/playground` now fetches `GET /v1/router/policies` and renders the live router-policy catalog.
- **Routing panel:** Added default-policy, readiness-status, and future-policy gate display for balanced, latency, cheapest, Saudi-only, coding, and Arabic policies.
- **Explicit default:** Playground chat requests now send `routing_policy: "balanced"` only when the backend marks balanced as the available default policy.
- **Claim guard:** Future policies stay display-only/gated; the UI does not offer selection for non-selectable policies.
- **Verified:** `npm run build`; `git diff --check`; mocked authenticated Playwright render smoke for `/renter/playground` on desktop and mobile, including captured request body with `routing_policy: "balanced"` and no horizontal overflow.

### 2026-07-08 15:05 UTC - `feat(frontend): show LoRA model-card manifests - PR #778`

**PR:** [#778](https://github.com/dhnpmp-tech/dcp-platform/pull/778) (`codex/frontend-lora-model-card-2026-07-08`).
**Local timestamp:** 2026-07-08 19:05 +04.

**What:** Forty-fifth Fireworks/Tinker execution slice. Connects the renter Fine-Tuning console to the LoRA model-card manifest contract from PR #775 without enabling managed training, adapter serving, quality claims, or Tinker compatibility claims.

- **Frontend contract:** `/renter/fine-tuning` now types and renders `model_card_manifest` from LoRA training-job responses.
- **Proof cards:** Added read-only adapter proof cards for manifest status, adapter/base model, dataset row count and format, artifact proof status, storage key, contract version, and next step.
- **Claim guard:** The card renders public training, serving, routing, quality, and Tinker guards from the manifest claims object; the default backend path keeps them false.
- **Console metrics:** Replaced the previous zero-traffic KPI with model-card count plus ready-adapter count while still showing routes as off.
- **Verified:** `npm run build`; `git diff --check`; mocked authenticated Playwright render smoke for `/renter/fine-tuning` on desktop and mobile with a manifest payload and no horizontal overflow.

### 2026-07-08 14:56 UTC - `feat(frontend): render batch readiness gates - PR #777`

**PR:** [#777](https://github.com/dhnpmp-tech/dcp-platform/pull/777) (`codex/frontend-batch-readiness-2026-07-08`).
**Local timestamp:** 2026-07-08 18:56 +04.

**What:** Forty-fourth Fireworks/Tinker execution slice. Wires the renter batch console to the new batch readiness contract so the UI derives product gates from the backend instead of hardcoded copy.

- **Frontend contract:** `/renter/batches` now fetches `GET /api/batches/readiness` alongside renter and batch data.
- **Readiness rail:** Added a compact console rail for current mode, create, execution, downloads, settlement, discounts, completion window, contract version, and supported JSONL URLs.
- **Claim guard:** Batch execution and discounts continue to render as gated/not enabled unless the backend readiness contract says otherwise; configured downloads still show the result-proof gate.
- **Create gate:** The create button and submit handler now honor `request_creation_enabled` from the readiness response.
- **Verified:** `npm run build`; `git diff --check`; mocked authenticated Playwright render smoke for `/renter/batches` on desktop and mobile with no horizontal overflow.

### 2026-07-08 14:40 UTC - `feat(batch): publish batch inference readiness contract - PR #776`

**PR:** [#776](https://github.com/dhnpmp-tech/dcp-platform/pull/776) (`codex/batch-readiness-contract-2026-07-08`).
**Local timestamp:** 2026-07-08 18:40 +04.

**What:** Forty-third Fireworks/Tinker execution slice. Adds a compact readiness contract for the gated batch inference product surface so UI and agents can distinguish validation-only metadata from live execution.

- **Readiness API:** Added `GET /api/batches/readiness` before the dynamic batch-id route, returning supported JSONL URLs, limits, endpoint map, current mode, feature gates, claim guards, and next step.
- **Config awareness:** Result-download readiness now reflects object-store signer configuration without exposing secrets; worker execution and settlement flags stay marked non-public even if env flags are set.
- **Claim guard:** The contract explicitly keeps batch execution, batch discounts, and `/v1/models` batch capability false until live executor, billing, and result smoke proof exist.
- **OpenAPI:** Documented the renter-authenticated readiness endpoint.
- **Verified:** Targeted batch inference Jest suite; backend `node --check`; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 14:31 UTC - `feat(lora): expose training model-card manifest stubs - PR #775`

**PR:** [#775](https://github.com/dhnpmp-tech/dcp-platform/pull/775) (`codex/lora-model-card-manifest-2026-07-08`).
**Local timestamp:** 2026-07-08 18:31 +04.

**What:** Forty-second Fireworks/Tinker execution slice. Adds a deterministic model-card manifest contract for LoRA training jobs without enabling public training, adapter serving, quality claims, or Tinker compatibility claims.

- **Model-card manifest:** LoRA training jobs with a reserved `model_card_storage_key` now expose `model_card_manifest` with adapter, dataset, artifact-proof, training lifecycle, safety, and next-step metadata.
- **Claim guard:** The manifest explicitly sets `public_training_enabled`, `serving_enabled`, `route_traffic`, `quality_claims`, and `tinker_compatible` to false.
- **Frontend handoff:** Fine-tuning dashboards can now render a stable metadata card from the training-job API while waiting for GPU-host artifact proof and object-store model-card writing.
- **OpenAPI:** Documented the additive `model_card_manifest` object on `LoraTrainingJob`.
- **Verified:** Targeted LoRA training-job Jest suite; backend `node --check`; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 14:21 UTC - `test(pods): guard Nsight provider benchmark evidence contract - PR #774`

**PR:** [#774](https://github.com/dhnpmp-tech/dcp-platform/pull/774) (`codex/provider-nsight-contract-guard-2026-07-08`).
**Local timestamp:** 2026-07-08 18:21 +04.

**What:** Forty-first Fireworks/Tinker execution slice. Hardens the Pods/POTS provider benchmark MVP so future agents can prove the evidence contract without a GPU host.

- **Evidence honesty:** `scripts/provider-nsight-benchmark.py` now marks top-level reports and provider-score inputs with `evidence_mode` plus `mock_data` so CI mock output cannot be confused with provider-host proof.
- **Contract guard:** Added a Jest test that runs the real Python CLI in `--mock` mode and verifies JSON schema, score-input fields, Nsight mock metrics, sample count, and CSV headers.
- **Verification command:** Added `npm run provider:nsight:verify` as the CI-safe proof command for this lane.
- **Roadmaps:** Marked the Nsight provider benchmark MVP as having a contract guard while GPU-host proof remains a separate required evidence item.
- **Verified:** `npm run provider:nsight:verify`; Python byte-compile for the script; `git diff --check`.

### 2026-07-08 14:11 UTC - `feat(inference): validate explicit routing policy requests - PR #773`

**PR:** [#773](https://github.com/dhnpmp-tech/dcp-platform/pull/773) (`codex/router-policy-request-validation-2026-07-08`).
**Local timestamp:** 2026-07-08 18:11 +04.

**What:** Fortieth Fireworks/Tinker execution slice. Turns the router-policy catalog into an enforceable request contract without changing provider selection.

- **Explicit no-op:** `/v1/chat/completions` now accepts `routing_policy: "balanced"` and returns `x-dcp-routing-policy: balanced` / `x-dcp-routing-policy-explicit: true`.
- **No silent overclaiming:** Non-selectable catalog policies such as `cheapest` now return a structured HTTP 400 instead of being silently ignored.
- **Compatibility:** Requests without `routing_policy` keep existing balanced routing behavior and receive `x-dcp-routing-policy-explicit: false`.
- **OpenAPI:** Documented the balanced-only `routing_policy` request field and the `/v1/router/policies` discovery path remains the source for future readiness.
- **Verified:** Routing-policy resolver tests; `/v1/chat/completions` balanced/rejection route tests; backend `node --check`; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 14:02 UTC - `feat(inference): publish router policy readiness catalog - PR #772`

**PR:** [#772](https://github.com/dhnpmp-tech/dcp-platform/pull/772) (`codex/router-policy-readiness-catalog-2026-07-08`).
**Local timestamp:** 2026-07-08 18:02 +04.

**What:** Thirty-ninth Fireworks/Tinker execution slice. Adds the first customer-facing router policy contract without changing live provider selection.

- **Read-only catalog:** Added `GET /v1/router/policies` with `balanced`, `lowest_latency`, `cheapest`, `saudi_only`, `coding`, and `arabic` policy readiness.
- **Honest routing states:** `balanced` is marked available with existing earned-state, reachability, latency/stream-health, and GPU-utilization signals; future policies are marked telemetry-only, catalog-only, gated, or not enabled.
- **No routing mutation:** The endpoint is explicitly not request-selectable and does not introduce a `routing_policy` request parameter yet.
- **OpenAPI:** Documented the router policy catalog response and readiness vocabulary.
- **Verified:** Routing-policy unit tests; `/v1/router/policies` route test; backend `node --check`; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 13:53 UTC - `feat(inference): expose model feature readiness metadata - PR #771`

**PR:** [#771](https://github.com/dhnpmp-tech/dcp-platform/pull/771) (`codex/model-feature-readiness-contract-2026-07-08`).
**Local timestamp:** 2026-07-08 17:53 +04.

**What:** Thirty-eighth Fireworks/Tinker execution slice. Adds a shared model feature-readiness contract so `/v1/models`, `/api/models`, and `/api/models/catalog` can explain advanced rails without falsely marking gated products as generally available.

- **Shared contract:** Added `feature_readiness.version: dcp.model_feature_readiness.v1` with deterministic readiness objects for dedicated deployments, LoRA, prompt caching, and batch.
- **Honest states:** Chat-capable models now expose prompt cache as `measurement_only`, batch as `api_metadata_only`, LoRA as `metadata_only`, and dedicated deployment as `gated`; embedding/non-chat models mark those rails `not_applicable`.
- **Compatibility:** Existing `capability_flags` booleans remain product-available flags, so `batch`, `prompt_caching`, `lora`, and `dedicated_deployment` stay false until routing, discounts, or serving traffic are actually enabled.
- **Route parity:** `/api/models`, `/api/models/catalog`, and `/v1/models` now emit the same readiness vocabulary.
- **OpenAPI:** Documented the additive `feature_readiness` object for model-list consumers.
- **Verified:** Targeted `/api/models` and `/v1/models` Jest suites; backend `node --check`; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 12:59 UTC - `feat(inference): mirror prompt-cache accounting into usage pricing - PR #770`

**PR:** [#770](https://github.com/dhnpmp-tech/dcp-platform/pull/770) (`codex/prompt-cache-accounting-observation-2026-07-08`).
**Local timestamp:** 2026-07-08 16:59 +04.

**What:** Thirty-seventh Fireworks/Tinker execution slice. Makes measured prompt-cache accounting visible inside the `/v1/chat/completions` usage pricing metadata so clients can reconcile cached-input observations with billing totals without enabling discounts.

- **Pricing observation:** When `usage.pricing` exists, `attachPromptCacheUsage` now mirrors measured cache counters under `usage.pricing.prompt_cache` and top-level pricing counter aliases.
- **No discount change:** `billable_input_tokens` still equals prompt input tokens, `discount_applied` remains false, and settlement math is untouched.
- **API proof:** `/v1/chat/completions` route tests now assert prompt-cache pricing metadata is returned alongside the existing `usage.prompt_cache` payload.
- **Helper proof:** Prompt-cache accounting unit tests verify existing pricing fields are preserved while measurement-only cache fields are added.
- **Verified:** Targeted prompt-cache and v1 metering Jest suites; backend `node --check`; `git diff --check`.

### 2026-07-08 12:50 UTC - `refactor(inference): share token-pricing metadata contract - PR #769`

**PR:** [#769](https://github.com/dhnpmp-tech/dcp-platform/pull/769) (`codex/model-pricing-metadata-contract-2026-07-08`).
**Local timestamp:** 2026-07-08 16:50 +04.

**What:** Thirty-sixth Fireworks/Tinker execution slice. Reduces pricing drift across `/api/models`, `/api/models/catalog`, and `/v1/models` by moving token-pricing serialization into the shared model catalog contract.

- **Shared contract:** Added `toTokenPricingContract` with prompt/completion USD micro-price strings, SAR per 1M token strings, halala per 1M token integers, billing unit, source, and model class.
- **Route parity:** `/api/models` and `/v1/models` now build token-pricing metadata from the same helper rather than duplicating SAR/USD/halala serialization.
- **Catalog proof:** Model catalog tests now assert that `/api/models` and `/api/models/catalog` emit byte-equivalent `token_pricing` payloads for the same model.
- **Compatibility:** Existing machine-readable fields and pricing values are preserved; this is a contract centralization and regression-test slice.
- **Verified:** Targeted `/api/models` and `/v1/models` Jest suites; backend `node --check`; `git diff --check`.

### 2026-07-08 12:41 UTC - `fix(backend): use credit-first pod 402 copy - PR #768`

**PR:** [#768](https://github.com/dhnpmp-tech/dcp-platform/pull/768) (`codex/pod-credit-required-payload-copy-2026-07-08`).
**Local timestamp:** 2026-07-08 16:41 +04.

**What:** Thirty-fifth Fireworks/Tinker execution slice. Aligns backend and OpenAPI HTTP 402 copy with the credit-first renter language shipped in PRs #765 and #767 while preserving stable machine-readable error codes and money fields.

- **Shared 402 contract:** `paymentRequiredPayload` now defaults to "Available credit" / "Add credit" copy instead of wallet/top-up wording.
- **Pod launch:** Generic insufficient-credit pod launches now return a credit-first message with available credit, required credit, duration, and early-stop refund guidance.
- **Pod extend:** Extend failures now say insufficient credit and Add credit, while keeping `INSUFFICIENT_BALANCE` / HTTP 402 behavior unchanged.
- **OpenAPI:** `PaymentRequiredError`, pod extend, and volume 402 descriptions now describe account/prepaid credit instead of wallet balance.
- **Verified:** Targeted 402 payload Jest suite; `node --check` for touched backend files; `git diff --check`.

### 2026-07-08 12:00 UTC - `feat(frontend): add pod launch credit-required guidance - PR #767`

**PR:** [#767](https://github.com/dhnpmp-tech/dcp-platform/pull/767) (`codex/pod-launch-credit-error-guidance-2026-07-08`).
**Local timestamp:** 2026-07-08 16:00 +04.

**What:** Thirty-fourth Fireworks/Tinker execution slice. Completes the frontend half of Tareq's on-demand/paid-credit gate by making `/renter/pods` render structured HTTP 402 launch guidance instead of collapsing the backend policy response into a generic string.

- **Structured 402s:** Pod launch now preserves `on_demand_requires_prepaid_credit` / `insufficient_balance` details, including available credit, required credit, requested duration, and hourly rate when the backend supplies them.
- **Credit-first UX:** The blocked-launch panel now says "Credit required", sends renters to Add credit, and explains that trial credit covers DCP/community GPUs without exposing vendor or on-demand internals.
- **Sticky remediation:** Funding errors remain visible while renters adjust template, GPU, image, token, or duration choices; transient validation/network errors still clear the structured credit state.
- **Layout:** Added scoped credit-fact chips so the renter sees the exact funding gap without changing shared dashboard error styling.
- **Verified:** `npm run build`; `git diff --check`; Playwright render smoke with signed renter session and mocked HTTP 402 launch response.

### 2026-07-08 11:38 UTC - `fix(inference): stop advertising non-chat models as chat-capable - PR #766`

**PR:** [#766](https://github.com/dhnpmp-tech/dcp-platform/pull/766) (`codex/model-capability-contract-honesty-2026-07-08`).
**Local timestamp:** 2026-07-08 15:38 +04.

**What:** Thirty-third Fireworks/Tinker execution slice. Tightens the model capability contract so `/v1/models`, `/api/models`, and `/api/models/catalog` do not overstate explicit embedding/rerank/image entries as chat/streaming capable.

- **Capability contract:** `model-catalog-contract` now infers chat, embeddings, reranking, image generation, vision, multilingual, reasoning, code, and tool support from explicit use cases instead of defaulting every model to chat.
- **API honesty:** `/v1/models` now omits chat endpoints for explicit non-chat models when no compatible `/v1` route exists.
- **Compatibility:** Legacy rows with missing/empty use-case metadata still default to chat completion support.
- **Route parity:** `/api/models` and `/api/models/catalog` now expose the same `reranking` and `vision` capability flags as `/v1/models`.
- **Verified:** Targeted `/v1/models` and model-catalog honesty Jest suites; route/helper `node --check`.

### 2026-07-08 11:27 UTC - `feat(frontend): use credit-first renter funding copy - PR #765`

**PR:** [#765](https://github.com/dhnpmp-tech/dcp-platform/pull/765) (`codex/renter-credit-language-2026-07-08`).
**Local timestamp:** 2026-07-08 15:27 +04.

**What:** Thirty-second Fireworks/Tinker execution slice. Advances Tareq's renter funding language by presenting account funding as "Credit" across the renter console while keeping SAR language where it belongs for payments, invoices, spend, and accounting.

- **Renter shell:** Dashboard, playground, usage, invoices, keys, settings, and wallet sidebars now label the funding pool as credit instead of wallet/balance/SAR-first copy.
- **Shared cards:** Balance and spending cards now say "Available Credit", "Credit", "Add Credit", and low-credit warnings without emoji markers.
- **Top-up flow:** The funding modal now reads as an add-credit/payment request flow while preserving SAR amount selection and bank-transfer accounting language.
- **Failure states:** Low-credit notifications and redeploy insufficient-balance CTAs now direct renters to add credit instead of topping up a wallet.
- **Verified:** Visible copy scan for old renter funding language; `git diff --check`.

### 2026-07-08 11:15 UTC - `feat(pods): persist provider supply tiers - PR #764`

**PR:** [#764](https://github.com/dhnpmp-tech/dcp-platform/pull/764) (`codex/provider-supply-tier-credit-policy-2026-07-08`).
**Local timestamp:** 2026-07-08 15:15 +04.

**What:** Thirty-first Fireworks/Tinker execution slice. Advances Tareq's minimum-balance/on-demand policy by making provider supply tier a durable backend field instead of only an `is_burst` derivation.

- **Schema:** Added `providers.supply_tier` plus fresh-schema burst fields for deterministic `dcp_owned` / `provider` / `on_demand` classification.
- **Backfill:** Marks burst rows as `on_demand`, defaults native rows to `provider`, and honors `DCP_OWNED_PROVIDER_IDS` for reviewed DCP-operated capacity.
- **Credit policy:** Paid-credit commitments now count explicit `supply_tier='on_demand'` pods as well as legacy `is_burst=1` pods.
- **Safety:** `is_burst=1` cannot be downgraded by a bad explicit tier, so externally brokered capacity still requires paid credit.
- **Verified:** Targeted pod access policy Jest suite; `git diff --check`.

### 2026-07-08 11:05 UTC - `docs(ops): refresh repo hardening status - PR #763`

**PR:** [#763](https://github.com/dhnpmp-tech/dcp-platform/pull/763) (`codex/ops-hardening-status-refresh-2026-07-08`).
**Local timestamp:** 2026-07-08 15:05 +04.

**What:** Thirtieth Fireworks/Tinker execution slice. Refreshes the ops/repo-hardening audit state so future agents do not treat the already-promoted deploy watcher as unresolved drift.

- **Deploy watcher:** Confirmed `ops/dcp-deploy-watch.sh` is tracked, byte-identical to the VPS2 cron copy, and still scheduled every 3 minutes on VPS2.
- **Platform parity:** Recorded local, `origin/main`, `origin/security/staged-rollouts`, and VPS2 parity at `5d20c0c91170bbe047b3e8e1cfccf23aa49dee4f`.
- **dcp-agent:** Reconfirmed the only remaining platform-adjacent ops drift is the separate local `dcp-agent` checkout, still detached at `faf4cf9fff924a17290c2248c71362b6e21385bf` with gateway PID `1731` running.
- **Roadmaps:** Updated the Fireworks/Tinker roadmap, lane roadmap, and gap audit to mark deploy-watch resolved and leave `dcp-agent` as a controlled maintenance-window task.
- **Verified:** `git diff --check`.

### 2026-07-08 10:55 UTC - `chore(pods): add pod image contract verifier - PR #762`

**PR:** [#762](https://github.com/dhnpmp-tech/dcp-platform/pull/762) (`codex/pod-image-contracts-2026-07-08`).
**Local timestamp:** 2026-07-08 14:55 +04.

**What:** Twenty-ninth Fireworks/Tinker execution slice. Adds a CI-safe contract gate for the provider-local pod images behind the pod launch templates, especially the fat LoRA/QLoRA image.

- **Manifest:** Added `backend/docker-templates/pod-image-contracts.json` for the pre-baked `pytorch`, `cuda`, `ubuntu`, `vllm`, and `lora` image aliases.
- **Verifier:** Added `pod-images:verify-contracts`, which checks Dockerfile entrypoints, build-script targets, `/api/pods` alias wiring, LoRA requirements, examples, and provider smoke-script references without building Docker images.
- **Test coverage:** Added a Jest wrapper so the pod image contract runs in backend test workflows.
- **Runbook:** Documented CI-safe checks versus the GPU provider-host proof command for `dcp-compute:lora`.
- **Verified:** `npm run pod-images:verify-contracts`; targeted pod image contract Jest suite; `git diff --check`.

### 2026-07-08 10:38 UTC - `feat(frontend): add catalog-backed pod launch templates - PR #761`

**PR:** [#761](https://github.com/dhnpmp-tech/dcp-platform/pull/761) (`codex/pod-template-catalog-launch-2026-07-08`).
**Local timestamp:** 2026-07-08 14:38 +04.

**What:** Twenty-eighth Fireworks/Tinker execution slice. Turns pod launch templates into a first-class catalog-backed renter flow while keeping actual pod launch, prepaid billing, and provider invisibility unchanged.

- **Frontend:** `/renter/pods` now presents catalog-backed launch paths for PyTorch, LoRA SFT, QLoRA SFT, vLLM, embeddings/rerank, and Arabic transcription.
- **Catalog contract:** The page reads `GET /api/templates/catalog`, shows catalog health/version, disables template cards that are missing from a healthy backend catalog, and uses catalog VRAM metadata to set GPU filters.
- **Launch flow:** The runtime rail now tracks the selected template explicitly; manual image/duration/workload edits clear template mode so edited launches are not mislabeled as catalog templates.
- **Workspace story:** The existing workspace pre-upload step now feeds directly into the template -> GPU -> duration -> credit launch map from the audit order.
- **Tests:** Added backend contract coverage proving the pod-launch template ids exist in `/api/templates/catalog` and that a missing template directory fails closed.
- **Verified:** Targeted template Jest suite; `npm run build`; `git diff --check`.

### 2026-07-08 10:23 UTC - `feat(inference): add gated batch line settlement - PR #760`

**PR:** [#760](https://github.com/dhnpmp-tech/dcp-platform/pull/760) (`codex/batch-line-settlement-2026-07-08`).
**Local timestamp:** 2026-07-08 14:23 +04.

**What:** Twenty-seventh Fireworks/Tinker execution slice. Adds the first guarded bridge from batch line proof to the existing atomic inference billing service without enabling public batch execution.

- **Settlement metadata:** Batch line rows now track `provider_id`, `settlement_status`, settlement request id, settlement error metadata, and settlement timestamp.
- **Billing bridge:** Added `batchInferenceSettlement`, which settles succeeded batch lines through `billingService.settleInferenceOnce` using stable `batch-line:{batch_id}:{custom_id}` request ids.
- **Worker gate:** The dormant batch worker can apply settlement only when `settlementEnabled` or `DCP_BATCH_SETTLEMENT_ENABLED=1` is explicit; disabled production behavior is unchanged.
- **Safety gate:** The helper preflights the full succeeded-line cost before any debit, so insufficient balance fails the batch settlement path without partial billing.
- **Contracts/docs:** Updated public OpenAPI copies and the prompt-cache/batch design order with the new settlement fields and gating language.
- **Verified:** Targeted batch job and batch worker Jest suites; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 10:05 UTC - `feat(frontend): add renter batch console - PR #759`

**PR:** [#759](https://github.com/dhnpmp-tech/dcp-platform/pull/759) (`codex/frontend-batch-console-2026-07-08`).
**Local timestamp:** 2026-07-08 14:05 +04.

**What:** Twenty-sixth Fireworks/Tinker execution slice. Adds the first renter-facing batch inference console on top of the proof-backed batch APIs while keeping production execution and settlement visibly gated.

- **Frontend:** Added `/renter/batches` inside the existing renter console shell with protected-session behavior, renter API-key reads, and Build-section navigation.
- **Batch ledger:** The page reads `GET /api/batches`, lets renters inspect validation records, and summarizes batch/request/result-artifact/cost totals.
- **Creation flow:** Added a JSONL form for validation-only `POST /api/batches` creation with idempotency headers and purpose metadata.
- **Proof panels:** Selected batches load tenant-scoped line ledger rows and result-manifest proof through `GET /api/batches/{batch_id}/lines` and `GET /api/batches/{batch_id}/results`.
- **Product honesty:** The page states that line ledger, result proof, execution, downloads, discounts, and settlement remain gated unless backend proof/configuration exists.
- **Verified:** `npm run build`; production-mode Playwright desktop/mobile render with mocked renter, batch, line, and result APIs; `git diff --check`.

### 2026-07-08 09:48 UTC - `feat(inference): apply batch worker line proof - PR #758`

**PR:** [#758](https://github.com/dhnpmp-tech/dcp-platform/pull/758) (`codex/batch-worker-line-proof-2026-07-08`).
**Local timestamp:** 2026-07-08 13:48 +04.

**What:** Twenty-fifth Fireworks/Tinker execution slice. Connects the dormant batch worker to the per-line ledger so injected executors can prove line-level outcomes before batch-level completion.

- **Worker proof:** `runBatchInferenceWorkerOnce` now accepts optional `execution.lines` from an injected executor and validates one result per batch line.
- **Line updates:** The worker updates line status, response checksum, usage, cost, request id, provider response id, and error metadata through the ledger helper.
- **Aggregation:** Completed/failed counts and total batch cost can now be derived from line proof instead of executor-provided aggregate counters.
- **Safety gates:** The worker remains disabled by default and still does not call live `/v1` inference, debit balances, apply discounts, or flip `/v1/models` batch flags.
- **Docs/tests:** Updated the prompt-cache/batch design order and added worker coverage for mixed success/failure line proof and incomplete proof rejection.
- **Verified:** Targeted batch job, batch contract, result download, and batch worker Jest suites; `git diff --check`.

### 2026-07-08 09:40 UTC - `feat(inference): add batch line ledger - PR #757`

**PR:** [#757](https://github.com/dhnpmp-tech/dcp-platform/pull/757) (`codex/batch-line-ledger-2026-07-08`).
**Local timestamp:** 2026-07-08 13:40 +04.

**What:** Twenty-fourth Fireworks/Tinker execution slice. Adds per-line batch inference ledger rows so future worker execution can write usage, cost, and settlement proof without storing raw prompts in the DB.

- **Schema:** Added `batch_inference_job_lines` with custom id, endpoint, model, request checksum, lifecycle status, usage, cost, response checksum, request id, provider response id, and bounded error metadata.
- **Creation path:** Batch creation now inserts one pending line row per normalized JSONL request using a stable request checksum.
- **API:** Added renter-authenticated `GET /api/batches/{batch_id}/lines`, preserving tenant isolation and omitting raw request/response bodies.
- **Future billing gate:** Added line update helpers for succeeded/failed/cancelled proof metadata; production batch execution and settlement remain disabled.
- **Docs/tests:** Updated public OpenAPI copies and the prompt-cache/batch design order with targeted service/route coverage.
- **Verified:** Targeted batch job, batch contract, result download, and batch worker Jest suites; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 09:29 UTC - `feat(inference): add batch result download signer - PR #756`

**PR:** [#756](https://github.com/dhnpmp-tech/dcp-platform/pull/756) (`codex/batch-result-download-signer-2026-07-08`).
**Local timestamp:** 2026-07-08 13:29 +04.

**What:** Twenty-third Fireworks/Tinker execution slice. Converts batch result manifests from proof-only metadata into a guarded download contract for completed result artifacts.

- **Signer:** Added an S3-compatible batch result download signer using `BATCH_RESULTS_S3_BUCKET` plus batch-result or workspace S3 endpoint/key/secret configuration.
- **Safety gates:** Signed URLs are minted only for completed batches with checksum proof and result keys scoped to `batch-results/renter-{id}/{batch_id}/`.
- **API:** `GET /api/batches/{batch_id}/results` can now include `download_url`, method, TTL, expiry, and configured-state metadata when signing is available.
- **Product honesty:** Production batch execution, per-line billing, discounts, and `/v1/models` batch capability flags remain disabled until the executor/billing proof lands.
- **Docs/tests:** Updated public OpenAPI copies and the prompt-cache/batch design order with targeted service and route coverage.
- **Verified:** Targeted batch result download, batch job, and batch worker Jest suites; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 09:17 UTC - `feat(inference): add prompt-cache measurement ledger - PR #755`

**PR:** [#755](https://github.com/dhnpmp-tech/dcp-platform/pull/755) (`codex/prompt-cache-measurement-ledger-2026-07-08`).
**Local timestamp:** 2026-07-08 13:17 +04.

**What:** Twenty-second Fireworks/Tinker execution slice. Adds durable, hash-only prompt-cache measurement so repeated static prefixes can be reported as measured hits without changing billing.

- **Ledger:** Added `prompt_cache_measurements` with renter id, cache key/hash, model id, session hash, status, counters, discount flags, request id, provider response id, and timestamp.
- **Hit measurement:** `/v1/chat/completions` now checks prior cache-key measurements and can return `usage.prompt_cache.status: hit_measured_no_discount` for repeated prefixes.
- **Recording:** Successful non-streaming and streaming chat completions record prompt-cache measurements best-effort after settlement.
- **Privacy:** The ledger stores hashes and counters only; raw prompt/static-prefix text is not persisted.
- **Billing safety:** Cached-input discounts remain disabled and `billable_input_tokens` still equals prompt tokens.
- **Docs/tests:** Updated the prompt-cache/batch design order with targeted prompt-cache ledger and v1 metering coverage.
- **Verified:** Targeted prompt-cache accounting and v1 metering Jest suites; `git diff --check`.

### 2026-07-08 09:08 UTC - `feat(inference): expose prompt-cache usage metadata - PR #754`

**PR:** [#754](https://github.com/dhnpmp-tech/dcp-platform/pull/754) (`codex/prompt-cache-usage-fields-2026-07-08`).
**Local timestamp:** 2026-07-08 13:08 +04.

**What:** Twenty-first Fireworks/Tinker execution slice. Wires the existing prompt-cache accounting contract into `/v1/chat/completions` usage responses without applying any cached-input discount.

- **Usage metadata:** Added `usage.prompt_cache` to non-streaming responses and final/synthetic streaming usage chunks.
- **Hints:** Accepts optional `static_prefix`, `prompt_cache.static_prefix`, and session-scoped hints for cache-key measurement.
- **Billing safety:** `billable_input_tokens` remains equal to prompt tokens, `discount_applied` remains false, and settlement still uses the same prompt/completion token counts.
- **Compatibility:** Keeps OpenAI-compatible top-level usage totals unchanged while adding nested DCP measurement metadata.
- **Docs/tests:** Updated public OpenAPI copies and the prompt-cache/batch design order with targeted prompt-cache and v1 metering coverage.
- **Verified:** Targeted prompt-cache accounting and v1 metering Jest suites; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 09:01 UTC - `chore(inference): add batch worker smoke script - PR #753`

**PR:** [#753](https://github.com/dhnpmp-tech/dcp-platform/pull/753) (`codex/batch-worker-npm-script-2026-07-08`).
**Local timestamp:** 2026-07-08 13:01 +04.

**What:** Follow-up from the PR #752 production smoke. Adds the missing npm wrapper for the dormant batch worker so deploy handoffs can run a stable command instead of a raw node path.

- **Script:** Added `npm --prefix backend run worker:batch-inference:once -- --limit 1`, matching the existing LoRA worker smoke style.
- **Process:** Updated the batch design/runbook notes so future agents use the npm script during batch-worker verification.
- **Product honesty:** This does not enable production batch execution; disabled mode remains a no-op unless `DCP_BATCH_WORKER_ENABLED=1` and an executor are configured.
- **Verified:** Disabled batch worker npm smoke; `git diff --check`.

### 2026-07-08 08:54 UTC - `feat(inference): add batch result manifest proof - PR #752`

**PR:** [#752](https://github.com/dhnpmp-tech/dcp-platform/pull/752) (`codex/batch-result-manifest-2026-07-08`).
**Local timestamp:** 2026-07-08 12:54 +04.

**What:** Twentieth Fireworks/Tinker execution slice. Strengthens the batch-inference result artifact contract before batch execution, discounts, or public model capability flags are enabled.

- **Result proof:** Added additive batch result checksum and normalized-byte metadata. A batch is `results_available: true` only when completed with both `result_storage_key` and `result_checksum_sha256`.
- **API:** Added renter-authenticated `GET /api/batches/{batch_id}/results`, returning a read-only result manifest with availability, proof metadata, counts, cost, and next step.
- **Worker contract:** The dormant batch worker now requires injected executors to return a SHA-256 result digest before completing a batch; missing proof fails the batch instead of marking unverifiable output available.
- **Schema safety:** Existing batch tables are upgraded idempotently with the new result proof columns.
- **Product honesty:** This does not issue signed result downloads, apply batch discounts, run production batch execution, or flip `/v1/models` batch capability flags.
- **Docs/tests:** Updated public OpenAPI copies and the prompt-cache/batch design order with targeted batch service/route/worker coverage.
- **Verified:** Targeted batch job and worker Jest suites; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 08:42 UTC - `feat(lora): add training job log ledger - PR #751`

**PR:** [#751](https://github.com/dhnpmp-tech/dcp-platform/pull/751) (`codex/lora-training-logs-2026-07-08`).
**Local timestamp:** 2026-07-08 12:42 +04.

**What:** Nineteenth Fireworks/Tinker execution slice. Adds an observable, tenant-scoped LoRA training log ledger so the managed trainer path has customer-visible lifecycle metadata before real GPU execution is enabled.

- **Log schema:** Added `lora_training_job_logs` with renter id, training job id, level, event, message, metadata JSON, and timestamp.
- **Lifecycle events:** Training job creation and explicit status transitions now append immutable metadata logs, including artifact proof fields on success and failure reason on failure.
- **API:** Added renter-authenticated `GET /api/lora/training-jobs/{training_job_id}/logs`, preserving tenant isolation and returning list pagination metadata.
- **Worker observability:** The disabled LoRA worker scaffold now leaves a tested event trail for `created -> running -> succeeded/failed` paths when an injected executor is used.
- **Product honesty:** This does not enable managed GPU training, public adapter serving, or Tinker compatibility; it makes the future trainer path auditable.
- **Docs/tests:** Updated public OpenAPI copies and the LoRA runbook, with targeted service/route/worker coverage.
- **Verified:** Targeted LoRA training job and worker Jest suites; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 08:32 UTC - `feat(lora): add dormant training worker scaffold - PR #750`

**PR:** [#750](https://github.com/dhnpmp-tech/dcp-platform/pull/750) (`codex/lora-training-worker-scaffold-2026-07-08`).
**Local timestamp:** 2026-07-08 12:32 +04.

**What:** Eighteenth Fireworks/Tinker execution slice. Adds a disabled-by-default LoRA trainer worker scaffold so the training-job lifecycle has a tested execution slot before any real GPU training is enabled.

- **Worker scaffold:** Added `runLoraTrainingWorkerOnce`, which scans `created` LoRA training jobs only when explicitly enabled and an executor is provided.
- **Artifact contract:** Added deterministic adapter/model-card storage-key builders and checksum-required artifact completion.
- **Lifecycle:** Injected execution can mark jobs `running -> succeeded` with artifact metadata, optionally register the adapter, or mark jobs `failed` with a bounded reason.
- **CLI:** Added `backend/src/scripts/run-lora-training-worker-once.js` and `npm --prefix backend run worker:lora-training:once`; disabled mode reports no mutation.
- **Product honesty:** This does not run GPU training by itself and remains disabled unless `DCP_LORA_TRAINING_WORKER_ENABLED=1` plus a real executor are configured.
- **Docs/tests:** Updated the LoRA runbook and added worker coverage for disabled/no-executor/success/auto-register/failure paths.
- **Verified:** Targeted LoRA worker and training-job Jest suites; disabled CLI smoke; `git diff --check`.

### 2026-07-08 08:25 UTC - `feat(lora): add adapter deployment load-proof route - PR #749`

**PR:** [#749](https://github.com/dhnpmp-tech/dcp-platform/pull/749) (`codex/lora-adapter-load-proof-route-2026-07-08`).
**Local timestamp:** 2026-07-08 12:25 +04.

**What:** Seventeenth Fireworks/Tinker execution slice. Exposes the proof gate that lets an adapter deployment become routable only after admin/internal vLLM load proof matches the adapter and base model.

- **Admin proof route:** Added `POST /api/adapters/{adapter_id}/deployments/{deployment_id}/load-proof` behind admin auth. Renter deployment creation still cannot attach serving proof.
- **Adapter scoping:** Added `attachAdapterDeploymentLoadProof`, which checks renter id, deployment id, and adapter id before mutating proof state.
- **Traffic gate:** Matching proof moves the deployment to `running` with `route_traffic: true`; mismatched proof stores the proof, marks the deployment `degraded`, and keeps routing disabled.
- **API contract:** Documented the admin/internal load-proof endpoint in the public OpenAPI copies and updated the LoRA runbook order.
- **Verified:** Targeted adapter deployment lifecycle Jest suite; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 08:18 UTC - `feat(lora): register adapters from training artifacts - PR #748`

**PR:** [#748](https://github.com/dhnpmp-tech/dcp-platform/pull/748) (`codex/lora-training-artifact-register-2026-07-08`).
**Local timestamp:** 2026-07-08 12:18 +04.

**What:** Sixteenth Fireworks/Tinker execution slice. Bridges succeeded LoRA training-job artifact proof into the adapter registry without enabling trainer execution or adapter serving.

- **Artifact bridge:** Added `registerLoraTrainingJobAdapter`, which only registers an adapter when a LoRA job is `succeeded` and has artifact storage plus SHA-256 proof.
- **Idempotency:** Re-registering a matching artifact returns the existing adapter as an idempotent replay; conflicting existing adapter metadata is rejected.
- **API:** Added renter-authenticated `POST /api/lora/training-jobs/{training_job_id}/register-adapter`, returning `serving_enabled: false` and the next vLLM load-proof step.
- **Read model:** LoRA training job list/detail responses now compute `adapter_registered` from the adapter registry table.
- **DB wrapper hardening:** Adapter registry schema ensure now accepts the production DB wrapper shape used by route factories.
- **Docs/OpenAPI:** Documented the register-adapter endpoint in the public OpenAPI copies and updated the LoRA runbook order.
- **Verified:** Targeted LoRA training job, adapter registry, and adapter deployment Jest suites; `git diff --check`; OpenAPI YAML parse.

### 2026-07-08 08:04 UTC - `chore(lora): wire template validation dry-run gates - PR #747`

**PR:** [#747](https://github.com/dhnpmp-tech/dcp-platform/pull/747) (`codex/lora-template-validation-dry-run-2026-07-08`).
**Local timestamp:** 2026-07-08 12:04 +04.

**What:** Fifteenth Fireworks/Tinker execution slice. Hardens the LoRA/QLoRA/vLLM template gate so agents and CI can run the roadmap’s template validation command before any GPU-host training proof is claimed.

- **Root command:** Added `npm run templates:validate`, delegating to the existing backend deploy-template validator.
- **CI reproducibility:** Reconciled `backend/package-lock.json` with the current backend dependency manifest so `npm --prefix backend ci` can install cleanly before validation.
- **LoRA dry-run gates:** Validator now requires `lora-finetune` and `qlora-finetune` templates to preserve `DC1_RESULT_JSON` dry-run scaffolds, `custom_container` example inputs, matching output template ids, non-empty base model, and explicit `ready_for_*` status output.
- **vLLM serving gate:** Validator now checks the `vllm-serve` example contract remains a `vllm_serve` input with an endpoint output, running status, and OpenAI-compatible `/v1` base URL.
- **Product honesty:** This does not enable managed LoRA training or adapter serving; it strengthens the pre-GPU proof gate for the existing templates.
- **Verified:** `npm --prefix backend ci`; `npm run templates:validate`; `npm --prefix backend run templates:validate`; `git diff --check`.

### 2026-07-08 07:57 UTC - `feat(inference): add API model catalog contract metadata - PR #746`

**PR:** [#746](https://github.com/dhnpmp-tech/dcp-platform/pull/746) (`codex/api-models-contract-parity-2026-07-08`).
**Local timestamp:** 2026-07-08 11:57 +04.

**What:** Fourteenth Fireworks/Tinker execution slice. Adds `/api/models` contract metadata so frontend/product pages can read model token pricing and capability flags from backend data instead of guessing from VRAM or duplicated copy.

- **Catalog contract:** Added token-pricing metadata to `/api/models`, `/api/models/catalog`, and `/api/models/{model_id}` with prompt/completion USD-per-token strings, SAR/halala per 1M token rates, billing unit, source, and model class.
- **Rate precedence:** Uses `model_registry.price_in_halala_per_1m_tok` / `price_out_halala_per_1m_tok` when configured and falls back to active `cost_rates` when registry token rates are absent.
- **Capability metadata:** Added `/v1/models`-style `capability_flags`, `capabilities`, `modalities`, `supported_features`, `max_output_tokens`, `provider_count`, and `available` fields to model catalog responses.
- **Honesty gates:** Keeps `dedicated_deployment`, `lora`, `prompt_caching`, and `batch` false until the backend proof/billing slices are complete.
- **Tests:** Extended model catalog honesty tests for registry-token precedence, cost-rate fallback, managed catalog parity, and proof-gated capability flags.
- **Verified:** Targeted model catalog and `/v1/models` Jest suites; `git diff --check`.

### 2026-07-08 07:42 UTC - `feat(frontend): wire fine-tuning console to LoRA training jobs - PR #745`

**PR:** [#745](https://github.com/dhnpmp-tech/dcp-platform/pull/745) (`codex/frontend-finetuning-training-jobs-2026-07-08`).
**Local timestamp:** 2026-07-08 11:42 +04.

**What:** Thirteenth Fireworks/Tinker execution slice. Connects the renter Fine-Tuning console to the LoRA training-job API foundation from PR #744 while keeping trainer execution and adapter routing visibly proof-gated.

- **Frontend data flow:** `/renter/fine-tuning` now fetches renter account state, adapter registry rows, and `/api/lora/training-jobs` together behind the renter key.
- **Training ledger:** Added a LoRA training jobs table with job id, output adapter reservation, dataset row/split/checksum metadata, base model, recipe, lifecycle status, and explicit trainer/adapter gates.
- **Console metrics:** Reworked the Fine-Tuning KPIs around training jobs, dataset rows, estimated tokens, ready adapters, and zero traffic routes until serving proof lands.
- **Contract preview:** Updated the on-page API contract to include training-job list/create and adapter deployment intent routes, with `training_enabled: false` and `route_traffic: false` gates.
- **UX guardrails:** Split the console ledger into training jobs first and adapter registry second, preserving responsive scroll behavior and honest empty states for both layers.
- **Verified:** `npm run build`; `git diff --check`; production-mode Playwright render of `/renter/fine-tuning` with mocked renter/adapters/training-jobs data on desktop and mobile.

### 2026-07-08 07:31 UTC - `feat(lora): add training job API foundation - PR #744`

**PR:** [#744](https://github.com/dhnpmp-tech/dcp-platform/pull/744) (`codex/lora-training-jobs-foundation-2026-07-08`).
**Local timestamp:** 2026-07-08 11:31 +04.

**What:** Twelfth Fireworks/Tinker execution slice. Adds the managed LoRA/QLoRA SFT training-job metadata API foundation without launching GPU training or registering adapters prematurely.

- **Schema:** Added idempotent `lora_training_jobs` bootstrap with training job id, renter id, recipe, base model, dataset storage/checksum/format/counts, output adapter reservation, normalized spec, dataset validation, lifecycle status, artifact fields, idempotency key, and timestamps.
- **Service:** Added tenant-scoped create/list/read/update helpers that reuse the LoRA dataset validator and fixed training-spec normalizer from PR #737.
- **API:** Added renter-authenticated `/api/lora/training-jobs` list/create and `/api/lora/training-jobs/{training_job_id}` detail routes. Creation returns `training_enabled: false` and `adapter_registered: false` until trainer-worker/artifact proof exists.
- **Server/OpenAPI:** Mounted `/api/lora` with tiered rate limiting and route-specific JSON body limit; documented `LoraTrainingJob` and training-job routes.
- **Docs/tests:** Updated the LoRA training/deploy runbook to mark the job-row/API step complete and added tests for schema, idempotency, tenant isolation, invalid dataset errors, route behavior, production DB wrapper compatibility, and artifact status updates.
- **Verified:** Targeted LoRA training job and LoRA contract Jest suites; DB bootstrap table smoke; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 07:20 UTC - `feat(inference): add dormant batch worker scaffold - PR #743`

**PR:** [#743](https://github.com/dhnpmp-tech/dcp-platform/pull/743) (`codex/batch-worker-stub-2026-07-08`).
**Local timestamp:** 2026-07-08 11:20 +04.

**What:** Eleventh Fireworks/Tinker execution slice. Adds the next batch-inference implementation step: a result-artifact path contract and testable worker scaffold without enabling production execution.

- **Worker scaffold:** Added `runBatchInferenceWorkerOnce`, a dormant batch worker cycle that stays no-op unless explicitly enabled and provided an executor.
- **Result artifacts:** Added deterministic batch result storage keys under `batch-results/renter-{id}/{batch_id}/output.jsonl`.
- **Internal scan:** Added an internal service helper to scan `created` batch records across renters for future worker execution.
- **CLI:** Added `backend/src/scripts/run-batch-inference-worker-once.js`, which reports disabled/no-op status by default unless `DCP_BATCH_WORKER_ENABLED=1` is configured.
- **Tests/docs:** Added worker tests for disabled no-op, missing executor no-op, successful injected execution, and executor failure; updated the batch design order to mark the worker scaffold complete while billing/capability flags remain pending.
- **Verified:** Targeted batch worker/job/contract Jest suites; CLI disabled-mode smoke; `git diff --check`.

### 2026-07-08 07:13 UTC - `fix(inference): accept production DB wrapper in batch route - PR #742`

**PR:** [#742](https://github.com/dhnpmp-tech/dcp-platform/pull/742) (`codex/batch-route-wrapper-fix-2026-07-08`).
**Local timestamp:** 2026-07-08 11:13 +04.

**What:** Production smoke follow-up for PR #741. Fixes `/api/batches` route initialization against the production DB wrapper shape used by `backend/src/db.js`.

- **Fix:** Updated `ensureBatchInferenceJobSchema` to accept either a raw `better-sqlite3` database with `.exec()` or the repository DB wrapper with `._db.exec()`.
- **Regression coverage:** Added a route-factory test that mounts `/api/batches` with the production-style wrapper and verifies batch creation succeeds.
- **Verified:** Targeted batch Jest suite; production `/api/batches` unauth smoke after deploy returns renter-auth 401 instead of 500.

### 2026-07-08 07:06 UTC - `feat(inference): add batch API foundation - PR #741`

**PR:** [#741](https://github.com/dhnpmp-tech/dcp-platform/pull/741) (`codex/batch-inference-api-foundation-2026-07-08`).
**Local timestamp:** 2026-07-08 11:06 +04.

**What:** Tenth Fireworks/Tinker execution slice. Turns the batch-inference JSONL contract from PR #736 into a renter-authenticated API metadata foundation without enabling execution, discounts, or model capability flags prematurely.

- **Schema:** Added idempotent `batch_inference_jobs` bootstrap with batch id, renter id, input storage key, input checksum, normalized byte count, request count, completion window, lifecycle status, result key, counters, total cost, idempotency key, and timestamps.
- **Service:** Added batch job creation/list/read helpers that reuse the tested JSONL contract, generate stable checksums/storage keys, preserve tenant boundaries, and replay existing rows for matching idempotency keys.
- **API:** Added `/api/batches` list/create and `/api/batches/{batch_id}` detail routes behind renter auth. Creation returns `execution_enabled: false` and `results_available: false` until the worker/result/billing slice exists.
- **Server:** Mounted `/api/batches` with authenticated/public tiered rate limiting and a route-specific JSON body limit for JSONL batch payloads.
- **OpenAPI/docs:** Documented `BatchInferenceJob`, `/api/batches`, and the remaining worker/billing/result order. `/v1/models` batch capability remains false.
- **Verified:** Targeted Jest coverage for batch job schema/service/routes plus existing batch JSONL contract; DB bootstrap table smoke; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 06:48 UTC - `feat(pods): add Nsight provider benchmark MVP - PR #740`

**PR:** [#740](https://github.com/dhnpmp-tech/dcp-platform/pull/740) (`codex/pods-nsight-benchmark-mvp-2026-07-08`).
**Local timestamp:** 2026-07-08 10:48 +04.

**What:** Ninth Fireworks/Tinker execution slice. Adds the provider-side GPU telemetry evidence path needed before DCP can build admin-reviewed provider quality scorecards.

- **Benchmark script:** Added `scripts/provider-nsight-benchmark.py`, a Python provider-side evidence collector that emits JSON reports and optional CSV telemetry from `nvidia-smi`.
- **Nsight hooks:** Added optional workload profiling modes for Nsight Compute (`ncu`) and Nsight Systems (`nsys`). Occupancy, cache-hit, and memory-bandwidth utilization fields are populated only when Nsight Compute captures a workload; otherwise they are explicit missing metrics.
- **Quality input:** Added normalized `provider_quality_score_input` fields for future admin/backend ingestion, including utilization, memory, thermals, power, sustained-load signal, Nsight profile status, and missing metric names.
- **Runbook:** Documented baseline telemetry, Nsight workload modes, CI mock mode, output contract, and the safe backend ingestion order without exposing provider internals to renters.
- **Provider docs:** Linked the new evidence script from the provider onboarding integration points so the existing JS benchmark is not mistaken for the final quality-score path.
- **Verified:** Python compile check; mock JSON/CSV generation and schema checks; `git diff --check`.

### 2026-07-08 06:34 UTC - `feat(lora): add adapter deployment lifecycle records - PR #739`

**PR:** [#739](https://github.com/dhnpmp-tech/dcp-platform/pull/739) (`codex/lora-deployment-lifecycle-2026-07-08`).
**Local timestamp:** 2026-07-08 10:34 +04.

**What:** Eighth Fireworks/Tinker execution slice. Adds the backend deployment lifecycle primitive needed before DCP can safely expose adapter serving controls.

- **Schema:** Added an idempotent `adapter_deployments` table with deployment id, renter id, adapter id, base model, mode, endpoint id, lifecycle status, route-traffic gate, serving load proof, failure reason, and lifecycle timestamps.
- **Service:** Added deployment lifecycle helpers for pending deployment creation, tenant-scoped list/read, status updates, and load-proof attachment. Matching proof is the only path to `running` with `route_traffic: true`; mismatched proof becomes `degraded`.
- **API:** Added renter-authenticated `/api/adapters/{adapter_id}/deployments` list/create and `/api/adapters/{adapter_id}/deployments/{deployment_id}` detail endpoints. Public creation requires a ready adapter and always returns `serving_enabled: false`.
- **OpenAPI:** Documented `AdapterDeployment` and the new deployment-record routes, explicitly marking public deployment requests as intent records, not a traffic switch.
- **Verified:** Adapter deployment lifecycle Jest coverage plus existing adapter registry and LoRA contract suites; OpenAPI YAML parse; `git diff --check`.

### 2026-07-08 06:16 UTC - `feat(frontend): add fine-tuning console shell - PR #738`

**PR:** [#738](https://github.com/dhnpmp-tech/dcp-platform/pull/738) (`codex/frontend-finetuning-shell-2026-07-08`).
**Local timestamp:** 2026-07-08 10:16 +04.

**What:** Seventh Fireworks/Tinker execution slice. Adds the first renter-facing Fine-Tuning console surface tied to the LoRA backend contracts from PRs #735-#737, without claiming managed training or adapter serving is live.

- **Fine-Tuning route:** Added `/renter/fine-tuning` with the existing renter console shell, live adapter-registry fetches, adapter/base-model/ready counts, and an honest zero-traffic deployment state.
- **Workflow gates:** Added a LoRA workflow view for dataset validation, LoRA/QLoRA job draft normalization, adapter registry, and deployment proof gating.
- **Console IA:** Added Fine-Tuning to renter console navigation across dashboard, playground, keys, usage, pods, wallet, invoices, settings, and the shared Pods shell.
- **Copy cleanup:** Removed the premature "batch" wording from the pod inference/serving workload preset until batch inference becomes a productized route.
- **Responsive fix:** Added a route-local scroll-root override so the long Fine-Tuning console scrolls correctly on mobile after importing the legacy renter shell CSS.
- **Verified:** `npm run build`; `git diff --check`; production-mode Playwright render of `/renter/fine-tuning` with mocked renter/adapters data at 1440x1100 and 390x1000, proving active nav state, adapter count rendering, no console errors, no blank page, no horizontal overflow, and working vertical scroll.

### 2026-07-08 05:52 UTC - `feat(lora): add training and deploy contracts - PR #737`

**PR:** [#737](https://github.com/dhnpmp-tech/dcp-platform/pull/737) (`codex/lora-train-deploy-contracts-2026-07-08`).
**Local timestamp:** 2026-07-08 09:52 +04.

**What:** Sixth Fireworks/Tinker execution slice. Adds the backend validation contracts required before DCP can safely expose managed LoRA SFT jobs or adapter deployment.

- **Dataset validation:** Added SFT JSONL validation for chat-message and prompt/completion rows, with unsafe/empty row rejection, token/size estimates, deterministic checksum, and train/validation split metadata.
- **Training contract:** Added fixed LoRA/QLoRA SFT draft normalization with safe dataset storage keys, bounded hyperparameters, adapter artifact output metadata, and GPU-host proof requirements.
- **Deploy contract:** Added adapter deployment normalization that keeps `route_traffic: false` until serving load proof matches the adapter id and base model.
- **Runbook:** Documented the train-here/deploy-here order from dataset upload through adapter registry and vLLM load proof, without claiming managed training or serving is live.
- **Verified:** Added LoRA contract Jest coverage and kept deploy template validation in the required gate for this slice.

### 2026-07-08 05:39 UTC - `docs(inference): add prompt-cache and batch foundations - PR #736`

**PR:** [#736](https://github.com/dhnpmp-tech/dcp-platform/pull/736) (`codex/prompt-cache-batch-design-2026-07-08`).
**Local timestamp:** 2026-07-08 09:39 +04.

**What:** Fifth Fireworks/Tinker execution slice. Adds backend contract foundations for prompt-cache accounting and batch inference without turning on discounts or exposing a public batch product prematurely.

- **Prompt cache:** Added a pure accounting helper that builds stable static-prefix/session cache keys, estimates cached input tokens, and keeps billable input tokens unchanged until measurement is trusted.
- **Batch contract:** Added a JSONL batch request validator for future `/api/batches` work, including deterministic checksums, duplicate `custom_id` rejection, endpoint/body validation, and size/count limits.
- **Design doc:** Added the technical order of operations for prompt-cache discounts and batch inference implementation on existing job/billing rails.
- **Honesty gate:** Kept `/v1/models` batch and prompt-cache capability flags false; this slice is measurement/design only.
- **Verified:** Targeted Jest coverage for prompt-cache accounting and batch JSONL contract behavior.

### 2026-07-08 05:32 UTC - `feat(lora): add adapter registry foundation - PR #735`

**PR:** [#735](https://github.com/dhnpmp-tech/dcp-platform/pull/735) (`codex/adapter-registry-foundation-2026-07-08`).
**Local timestamp:** 2026-07-08 09:32 +04.

**What:** Fourth Fireworks/Tinker execution slice. Adds the backend adapter registry foundation required before managed LoRA training or adapter deployment can be honestly exposed.

- **Schema:** Added an idempotent `adapter_registry` table for renter-owned adapter artifacts with adapter id/name, base model, storage key, SHA-256 checksum, rank, metadata, lifecycle status, and created/updated/deployed timestamps.
- **Service:** Added validation and tenant-scoped registry helpers for creating, listing, reading, and status-updating adapter records without binding them to inference routing.
- **API:** Added `/api/adapters` list/create and `/api/adapters/{adapter_id}` detail endpoints behind renter auth. Public creation only accepts non-deployment initial states and returns `deployment_enabled: false`.
- **OpenAPI:** Documented the adapter metadata contract and explicitly states that registry rows do not imply adapter deployment or serving.
- **Verified:** Adapter registry Jest coverage proves migration idempotency, tenant isolation, checksum/storage-key validation, status/deployed timestamp behavior, and that no deploy route exists in this foundation slice.

### 2026-07-08 05:12 UTC - `feat(pods): polish workspace-to-pod launch flow - PR #734`

**PR:** [#734](https://github.com/dhnpmp-tech/dcp-platform/pull/734) (`codex/workspace-pod-launch-polish-2026-07-08`).
**Local timestamp:** 2026-07-08 09:12 +04.

**What:** Third Pods/POTS execution slice from the Fireworks/Tinker roadmap. The renter GPU Pods page now connects persistent workspace staging to the launch flow and gives renters a clearer template-driven path from data upload to pod runtime selection.

- **Workspace staging:** Embedded the real `WorkspacePanel` on `/renter/pods`, so renters can rent/inspect their persistent `/workspace` volume, upload datasets/notebooks/adapters, and see staged files before launching a GPU pod.
- **Launch plan:** Added a compact plan rail that summarizes workspace state, selected GPU, runtime image/duration, and estimated prepaid quote as the renter configures the pod.
- **Templates:** Added launch-template cards for Notebook/PyTorch, vLLM serving, SFT/QLoRA prep, and CUDA base. Workload presets now set matching image and duration defaults instead of only filtering GPUs.
- **LoRA honesty gate:** Added a disabled "LoRA stack image" card marked verification pending, keeping the #733 image path visible without exposing a public LoRA launch promise before GPU-host smoke verification passes.
- **Responsive polish:** Added mobile-safe layout styles for workspace staging, plan rail, and template cards, plus pod-launch-specific upload copy.
- **Verified:** `git diff --check`; `npm run build` on locked Next 15.5.20 / React 19.2.7 deps; Playwright local visual flow with mocked pod/workspace/GPU API responses, including SFT template + RTX 4090 selection updating the plan to `20 GB /workspace | RTX 4090 | PyTorch · 4h | ~SAR 13.00`; mobile overflow probe returned no overflowing template, plan, button, file-row, or GPU-card labels.

### 2026-07-08 04:50 UTC - `feat(pods): add fat LoRA pod image verification path - PR #733`

**PR:** [#733](https://github.com/dhnpmp-tech/dcp-platform/pull/733) (`codex/fat-pod-image-verification-2026-07-08`).
**Local timestamp:** 2026-07-08 08:50 +04.

**What:** Second Fireworks/Tinker execution slice for Pods/POTS infrastructure. Adds a provider-local `dcp-compute:lora` image build path and GPU-host verification script before any public LoRA training claim or UI launch flow.

- **Fat image path:** Added `backend/docker-templates/dcp-lora.Dockerfile` with PyTorch/CUDA, SSH/Jupyter, LoRA/QLoRA libraries, vLLM, and workspace example scaffolds.
- **Provider proof:** Added `verify-lora-pod-image.sh` to prove imports, CUDA visibility, and the offline LoRA SFT scaffold on a real provider host without pip installing at pod launch time.
- **Pod alias:** Added the `lora` pod image alias to resolve to `dcp-compute:lora` without daemon SSH bootstrap, guarded by docs that it should only be exposed after GPU-host smoke passes.
- **Docs/tests:** Documented the provider build/verification contract and added route-level image alias coverage.

### 2026-07-08 04:30 UTC - `feat(inference): expose per-model rate and capability metadata - PR #732`

**PR:** [#732](https://github.com/dhnpmp-tech/dcp-platform/pull/732) (`codex/inference-model-metadata-2026-07-08`).
**Local timestamp:** 2026-07-08 08:30 +04.

**What:** First inference-product hardening slice from the Fireworks/Tinker roadmap. `/v1/models` now exposes billing-grade per-model rate metadata and honest capability flags that pricing pages, playgrounds, and CLI clients can consume consistently.

- **Catalog pricing:** `/v1/models` now prefers `model_registry.price_in_halala_per_1m_tok` and `price_out_halala_per_1m_tok` over legacy `cost_rates`, while keeping OpenAI/OpenRouter-compatible `prompt_tokens` and `completion_tokens` fields.
- **SAR/halala metadata:** Each model row now includes SAR and halala per-1M input/output token rates, `billing_unit`, and pricing `source`.
- **Capability metadata:** Each model row now includes explicit flags for chat completions, streaming, tool calling, reasoning, code generation, embeddings, image generation, multilingual, dedicated deployments, LoRA, prompt caching, and batch. Not-yet-built product rails are exposed as `false`, not overclaimed.
- **Fresh installs:** Inline DB boot migrations now add and seed the per-1M model rate columns so new installs do not silently fall back to legacy default pricing.
- **Contract/tests:** Updated the OpenAPI `/v1/models` schema and added route tests proving model-registry input/output prices win over legacy defaults.

### 2026-07-08 04:14 UTC - `docs/ops: promote deploy watcher and capture dcp-agent drift order - PR #731`

**PR:** [#731](https://github.com/dhnpmp-tech/dcp-platform/pull/731) (`codex/ops-repo-hardening-2026-07-08`).
**Local timestamp:** 2026-07-08 08:14 +04.

**What:** Started the execution-order ops hardening slice by moving the already-live deploy watcher into Git and documenting the remaining repo/process drift that must be reconciled with care.

- **Ops:** Added `ops/dcp-deploy-watch.sh`, byte-identical to the VPS2 cron copy, so Vercel frontend deploy failures and backend health regressions are tracked from source control instead of living only on the server.
- **Runbook:** Added `docs/architecture/2026-07-08-ops-repo-hardening.md` with local/GitHub/VPS parity at the start of the slice, the deploy watcher cron path, and the no-secrets runtime env-file boundary.
- **dcp-agent:** Captured the local detached `dcp-agent` checkout and active gateway process, including the safe stop/fast-forward/restart order required before reconciling that separate repo.
- **Ops overview:** Clarified that VPS cron jobs should prefer tracked scripts under `/root/dc1-platform/ops/`.

### 2026-07-08 03:31 UTC - `docs(roadmaps): add product execution system and lane roadmaps - PR #730`

**PR:** [#730](https://github.com/dhnpmp-tech/dcp-platform/pull/730) (`codex/product-execution-roadmaps-2026-07-08`).
**Local timestamp:** 2026-07-08 07:31 +04.

**What:** Turned the Fireworks/Tinker audit into an execution process with concrete build, test, deploy, smoke, and feedback gates for the product lanes Peter called out.

- **Execution system:** Added `docs/roadmaps/2026-07-08-dcp-execution-system.md` with the shared loop from finding to PR to tests to deploy to production smoke to next improvement.
- **Lane roadmaps:** Added `docs/roadmaps/2026-07-08-dcp-lane-roadmaps.md` for Frontend, Backend, Inference, POT/PODS infrastructure, and LoRA.
- **Gates:** Captured lane-specific checks for Next.js/frontend, backend/Jest, inference streaming and billing, pod launch/stop/refund, GPU-host image verification, and LoRA adapter proof.
- **Cadence:** Added the weekly and daily operating rhythm so future agents can keep improving DCP without rediscovering process or shipping unverified claims.

### 2026-07-07 21:03 UTC - `docs(strategy): Fireworks/Tinker roadmap + Pods/Inference gap audit - PR #729`

**PR:** [#729](https://github.com/dhnpmp-tech/dcp-platform/pull/729) (`codex/fireworks-tinker-roadmap-2026-07-08`).
**Local timestamp:** 2026-07-08 01:03 +04.

**What:** Captured the Fireworks.ai/Tinker product direction as a repo-visible roadmap and audited the current Pods/POTS and Inference surfaces against that target before starting larger backend/frontend implementation slices.

- **Strategy:** Added `docs/strategy/2026-07-08-fireworks-tinker-product-roadmap.md` with the recommended DCP product rails: Inference, Pods/POTS infrastructure, Fine-Tuning, and Dedicated Deployments.
- **Gap audit:** Added `docs/architecture/2026-07-08-pods-inference-fireworks-gap-audit.md` mapping current routes, frontend surfaces, LoRA/template assets, and Fireworks-style gaps.
- **External source check:** Documented current Fireworks and Tinker source links for serverless inference, LoRA deployment, pricing, batch inference, and Tinker training primitives.
- **Implementation sequence:** Defined the first seven follow-up PRs: ops cleanup, fat pod image plan, Nsight provider benchmark MVP, inference metadata/pricing audit, workspace-to-pod launch polish, and adapter registry/API design.
- **Verdict:** DCP already has real pod, billing, workspace, OpenAI/Anthropic inference, and vLLM primitives; the next work is product consolidation plus LoRA/adapters/batch/cache rails, not a platform restart.

### 2026-07-07 16:53 UTC — `docs/ops: codebase-production audit + low-balance watcher env loading — PR #728`

**PR:** [#728](https://github.com/dhnpmp-tech/dcp-platform/pull/728) (`codex/codebase-production-audit-2026-07-07`).
**Local timestamp:** 2026-07-07 20:53 +04.

**What:** Added the July 7 codebase/production reconciliation audit and cleaned the tracked low-balance watcher so the VPS cron copy can stop carrying inline runtime Telegram values.

- **Audit:** Added `docs/architecture/dcp-codebase-production-audit-2026-07-07.md` with the local/GitHub/VPS/Vercel parity table, GitHub repo inventory, production mapping, and next improvement backlog.
- **Ops:** Updated `ops/dcp-low-balance-watch.sh` to load `/root/dc1-platform/backend/.env` (or `DCP_MONITOR_ENV_FILE`) and read Telegram settings from env/defaults. Default minimum balance remains `1000` halala / 10 SAR, deduped once per renter per UTC day.
- **System map:** Refreshed the July 7 system map head from the pre-deploy SHA to `237b77949a64`.
- **Findings captured:** `dcp-platform` aligned local/GitHub/VPS at `237b77949a64`; `dcp-desktop`, `dcp-contracts`, `dcp-mcp`, `dcpgpuscreen`, and `dc1-platform-internal` aligned locally; `dcp-agent` remains detached/stale locally while an active gateway process runs from that checkout.
- **Verified:** `bash -n ops/dcp-low-balance-watch.sh`.

### 2026-07-07 07:39 UTC — `feat(pods): require paid credit for on-demand GPUs + renter credit UX — PR #726`

**PR:** [#726](https://github.com/dhnpmp-tech/dcp-platform/pull/726) (`codex/tareq-trial-on-demand-policy`).
**Local timestamp:** 2026-07-07 11:39 +04.

**What:** First Tareq trial-pricing implementation slice. Free/trial credit can still unlock ordinary DCP/provider supply, but on-demand/burst launches now require real paid credit already available in the renter account, so trial abuse cannot spill onto third-party GPU costs.

- **Backend:** Added a pod access policy service that classifies supply tiers (`dcp_owned`, `provider`, `on_demand`), computes paid funding minus existing on-demand commitments, and gates on-demand launches before any debit. `POST /api/pods` now returns a stable 402 code (`on_demand_requires_prepaid_credit`) with paid-credit context when an on-demand quote is not covered.
- **Frontend:** Updated renter pod launch handling to preserve the backend "credit required" message and show an Add credit action. Renter shell and wallet/account copy now use credit-first language while keeping SAR/payment labels where money movement is explicit.
- **Contracts/docs:** Extended the OpenAPI 402 schema with paid-credit fields, and added dated reference docs for the system map, Tareq trial/pricing plan, and Codex development process.
- **Verified:** `npx tsc --noEmit`; `npx jest src/__tests__/podAccessPolicy.test.js src/__tests__/agent-402-payment-required.test.js tests/pods-billing.test.js --runInBand --forceExit`; `npm run lint -- --file 'app/(site)/renter/pods/page.tsx' --file 'app/(site)/renter/wallet/page.tsx' --file 'app/(site)/renter/pods/PodShell.tsx'`; `git diff --check`.
- **Deploy:** Shipped live to VPS2 (`root@76.13.179.86:/root/dc1-platform`, branch `security/staged-rollouts`) on 2026-07-07 09:18 UTC / 13:18 +04; deploy handoff recorded in [#727](https://github.com/dhnpmp-tech/dcp-platform/pull/727). Production fast-forwarded `62e8bd7 → 9794ed5`, reloaded PM2 process `dc1-provider-onboarding` with `safe-reload.sh`, and had 0 active interactive pods at reload time.
- **Live verification:** `ops/e2e-smoke.sh` passed all probes: gateway health, `/v1/models` count 33, real inference returned `pong`, Tareq Node 2 heartbeat was fresh, and WG diag passed. Public `https://api.dcp.sa/api/health` and `https://api.dcp.sa/v1/models` both returned 200.
- **Known follow-up:** Visual QA is blocked by an existing broad Next.js render/prerender failure (`Unsupported Server Component type: undefined`) across unrelated routes.

### 2026-07-03 — `feat(daemon): 4.6.0 → 4.7.2 — bare-vLLM eviction + foreign-proc heartbeat scan + pod-GPU-ownership enforcement — PRs #721 #722 #724 #725 (+ ops #723)`

**What:** The Node-2 pod-launch incident (17:19Z — Tareq's pod failed with "Insufficient VRAM: 1742 MiB free, 4000 MiB required" because a hand-started Phase-0 vLLM was parking 22.4/24 GB) drove four daemon releases + a watchdog upgrade in one day. All shipped to production; Node 2 auto-updated itself through every step (daemon auto-update pipeline validated end-to-end).

- **4.6.0 / #721 — bare-vLLM make-room tier 3.** `evict_bare_inference_for_pod()` runs at pod launch: when a pod needs VRAM an idle bare inference server (vLLM and friends, matched by `DCP_BARE_EVICT_PATTERNS`, default `vllm`) is squatting, it gets a SIGTERM→SIGKILL cascade (each kill logged with PID + ~MiB freed). The first reactive fix for the 17:19Z failure.
- **4.7.0 / #722 — foreign-proc heartbeat scan + hygiene CLI.** Every heartbeat now names every GPU compute process and classifies it as **pod** / **known engine** / **foreign** into `gpu_status.foreign_gpu_procs` (`{pid, used_mib, engine, pod_managed, cmd}`) — the field the VRAM-parking watcher and the backend fleet screen read. Deterministic classification (Tito rec #2 / incident 2026-07-03). New provider-side CLI `dcp_daemon.py --status` (print pod/engine/foreign table) and `--clean` (offer to stop each non-pod process); one-shot, no API key needed, exits before any network use.
- **4.7.1 / #724 — continuous squatter eviction while a pod owns the GPU.** `enforce_pod_gpu_ownership()` runs on the same ~60s heartbeat cadence: while an interactive pod owns the GPU, any bare known-engine GPU process (a respawned squatter) is re-evicted continuously, not only at launch. Closes the respawn hole (the original vLLM was under a supervisor that restarted it after the 4.6.0 launch-time kill).
- **4.7.2 / #725 — ownership gate on the live pod container.** 4.7.1's gate keyed off the inference-drain marker, but `DCP_DRAIN_INFERENCE_FOR_PODS` was `off` on Node 2 — so 4.7.1 was blind there. 4.7.2 re-gates the ownership check on the **live pod container** (the reaper's `docker ps` probe), independent of the drain flag, so enforcement works regardless of drain config.
- **ops / #723 — vram-watch v2.1.** Watchdog upgrade matching the new heartbeat field: pod-active providers are healthy (paid VRAM holding is NOT parking) — kills the false-alert class; adds a partial-parking tier (40–70% VRAM at ~0% util for 2h+ → softer alert, catches forgotten test instances early) and an exception register (`vram-exceptions.json`) for time-boxed registered experiments.

**Known limitation (honest):** eviction fires only while a pod **owns or is claiming** the GPU. A bare squatter with **no active pod** is left untouched — deliberate, because preemptively killing provider user processes is risky. This is why a parked bare vLLM with no pod can persist (the overnight Node-2 recurrence). The proposed 4.7.3 — Tareq's "auto-scan on heartbeat to evict sustained pod-less squatters (>X% VRAM, ~0% util, no pod, Y hours) with a server-side exception register" — is the prevention-at-source follow-up; **not built**.

**Verified:** Node 2 auto-pulled each version through the distribution endpoint and reported it back in the heartbeat (4.6.0 at 19:10Z → 4.7.0 → 4.7.1 → 4.7.2 at 00:19Z Jul 4), no restart, no manual step. Live squatter eviction verified on Node 2 post-4.7.2 upgrade.

### 2026-07-03 — `fix/feat: dcp-desktop installer lifecycle — daemon stop + one-click uninstall — DCP-SA/dcp-desktop #26`

**What:** Tareq's two daemon requests, implemented and merged (NOT yet rolled out — rollout needs a version bump + manual artifact copy to the VPS after the layer-3 UAC check). Windows NSIS hooks (`installerHooks` .nsh): PREINSTALL always kills running `dcp_daemon.py` processes (CIM command-line match) so reinstalls/updates never fight a live daemon; PREUNINSTALL stops and deregisters `WireGuardTunnel$wg0` (`wireguard.exe /uninstalltunnelservice`, elevated `sc.exe stop/delete` fallback for orphaned services); POSTUNINSTALL purges the downloaded runtime (embedded python, caches) while **keeping `config.json` + `wg0.conf`** so a re-install reconnects with the same provider identity. All disruptive steps are `$UpdateMode`-guarded — silent auto-updates never prompt UAC or drop the tunnel. Linux parity via deb `prerm` (stop service, pkill daemon, wg-quick down; identity kept). **Verified:** Linux 6/6 in an isolated container; Windows 12/12 via a NEW permanent CI job `windows-e2e-lifecycle` that executes the freshly built installer on windows-latest with real WireGuard, a registered tunnel service and a running fake daemon (fresh install / silent update / one-click uninstall / orphaned-service fallback). Remaining for layer-3: interactive UAC-decline on real hardware.

### 2026-07-03 — `feat: Next.js 15 + React 19, View Transitions, WebGPU hero, /setup mesh — PRs #717 #718 #719`

**What:** Framework wave. **#717**: next 14.2→15.5 + react 19 with `experimental.viewTransition` — client-side navigations now soft cross-fade (200ms, reduced-motion safe); three async-`params` route handlers migrated, one `<a>`→`<Link>`; all 60 pages build green; trade-off: +12 KB shared JS from the experimental React build. **#718**: the hero background renders via **WebGPU** (WGSL port, full effect parity: cover-fit, zoom breathe, pointer parallax, luminance-depth, pointer light, sweep, grain, vignette) when the browser supports it — the honesty badge then reads "Rendered live on your <device> · WebGPU · N fps"; WebGL path untouched as fallback, canvas only claimed after adapter+device+pipeline all succeed. **#719**: /setup (last plain page) gets the dimmed living-mesh backdrop. Verified live on production: dcp.sa hero canvas owned by a real `webgpu` context at 60 fps.

### 2026-07-03 — `feat: demo streaming + guardrails, one chrome everywhere, micro-interactions — PRs #712–#716`

**What:** The home demo now **streams**: backend `?stream=1` unwraps upstream SSE deltas into a progressive plain-text body, the Vercel catch-all proxy passes `X-Dcp-Stream`-marked bodies through instead of buffering, and tokens render in the browser as the KSA GPU produces them ("first token in X.Xs from your network"); a no-live-data guardrail in the demo system prompt ends the "[insert average temperature]" placeholder answers, plus three curated bilingual starter chips (backend hot-patched on prod + committed on the prod branch). **One menu bar everywhere:** six bespoke page headers (marketplace/containers/agents/pricing/architecture/docs) replaced by the shared product-first SiteHeader. **Micro-interactions:** PodMeter ("this page rented a pod when you arrived" — live per-second SAR counter, stop→refund spool, on home + /pricing), scroll-driven signal pulses on every section hairline (CSS `animation-timeline: view()`, zero JS), the type-`gpu` boot-terminal easter egg (site-wide, hero GPU word + footer whisper clickable), rate-rail hover flips SAR/hr→SAR/s, docs copy buttons with the "copied · 0.0000 SAR" receipt, VRAM-share ignition bars on GPU cards, Arabic token glyphs drifting off the cursor over the inference visual, live fps meter in the hero badge, /auth + /status aligned to the v2 design language. **Truth fixes:** provider payout corrected **85/15 → 75/25** everywhere (backend enforces `PROVIDER_EARN_SHARE=0.75`); pod billing wording unified to **per GPU-second** across agents/docs/terms/JSON-LD (settlement = `elapsedSeconds × ratePerGpuSecond`, minimum booking 5 minutes); stale "0.33 SAR/hr" metadata → 2.5; llms.txt + agents-page RTX 3090 0.5→2.5 SAR/hr; removed the dormant USDC funding claim.

### 2026-07-03 — `fix: dead in-text anchors + subpage backdrops — PRs #710 #711`

**What:** Deep link crawl across 34 rendered pages (internal routes, anchors, external links, mailto, GEO files). Fixed: `/#pricing` links in SiteFooter + terms (the anchor died when pricing became its own page) and `/support?…#contact-form` deep links from /security + /trust-center (useSearchParams CSR-bailout means the anchor never exists at first paint — hash-jump re-run after mount). Photographic hero backdrops added to /security (chip-city macro) and /architecture (terrain constellation) via the dcp-kit `.hero-bg--photo` pattern.


### 2026-07-03 — `feat(frontend): dcp.sa v2 product-first redesign — living hero, product showcases, truth fixes — PR #709`

**What:** Full marketing-site redesign, product-first. **Home:** full-bleed animated hero (WebGL scene + interactive node mesh — autonomous signals travel the edges, node colors drift teal↔amber, scene picked per visit from 3 generated backdrops; badge shows the visitor's real GPU + live fps), product doors with price anchors, GPU Pods + Inference API editorial showcases with generated cinematic imagery and a rate rail fed from `structured-data.ts` (single source of truth with the JSON-LD offers), full-bleed Riyadh-skyline sovereignty band, "Every way in" section (terminal / any OpenAI SDK / browser console / MCP agent + honest time-to-pod strip), providers showcase, visible FAQ expanded 3 → 6 mirroring the JSON-LD 1:1 (GEO parity, EN+AR). **Subpages:** photographic hero backdrops on /earn, /agents, /containers, /trust-center (all assets generated in-palette, 38–125 KB webp, lazy/masked). **Truth fixes:** provider payout corrected 85/15 → **75/25** everywhere (backend enforces `PROVIDER_EARN_SHARE = 0.75`); pod billing wording unified to **per GPU-second** across agents/docs/terms/JSON-LD (settlement math is `elapsedSeconds × ratePerGpuSecond`); stale "from 0.33 SAR/hr" metadata → 2.5 SAR/hr; llms.txt RTX 3090 row 0.50 → 2.50 SAR/hr. **Fixes:** mobile hamburger never rendered (CSS order bug); internal link crawl of 32 routes — all healthy. Nav is product-first (GPU Pods, Inference lead).

**What:** Creating a pod **by GPU-type name** ("NVIDIA GeForce RTX 3060 Ti") failed with *"Unknown GPU type"* because `resolveGpuType` only searched burst providers (`is_burst=1`) — native daemon machines (Node 2's 3090, Fadi's 3060 Ti) were invisible to that path (pinning a specific provider always worked; the by-type path never supported native). Native providers can host pods — the daemon already preempts inference to free VRAM (`GPU MAKE-ROOM / INFERENCE↔COMPUTE MUTEX`). Broadened the candidate query to include native **NVIDIA** providers; **Apple Silicon excluded** (pod images are CUDA, M2 is inference-only). Also corrected native pod pricing: the RTX 3060 Ti was on a stale flat `0.25 halala/s` (**9 SAR/hr**, A100-tier) — reset to `0.0333` (**1.2 SAR/hr**, RunPod-small-secure comparable); the 3090 stays `0.0694` (2.5 SAR/hr = RunPod-secure +40%). Verified live: "RTX 3060 Ti" → Fadi, "RTX 3090" → Node 2.

### 2026-07-02 — `feat: ship dcp-desktop 0.2.9 — Windows providers can finally connect + serve — PR #704 (+ DCP-SA/dcp-desktop #25)`

**What:** Windows provider nodes were installing, heartbeating, and showing "online" but **could not serve** — `endpoint_reachable=0`, no WireGuard handshake, mesh IP unreachable. Root cause: the desktop app activates the WG tunnel with `wireguard.exe /installtunnelservice`, which registers a Windows *service* and **requires admin**, but the app runs as a normal user (`RequestExecutionLevel user`) — so the call failed silently, the config was saved to `~/.dcp/wg0.conf`, and the tunnel never activated. Fix (`DCP-SA/dcp-desktop` #25): elevate the activation via a single UAC prompt (`Start-Process -Verb RunAs`), standard for VPN clients. Shipped as **0.2.9** and rolled out through the Tauri auto-updater: `LATEST_APP_VERSION` bumped `0.2.0 → 0.2.9` in `server.js`, and the 0.2.9 setup.exe + updater bundle + signature placed in `backend/public/` (the auto-update artifacts were previously missing entirely, so this also makes auto-update work for the first time). Verified live on `api.dcp.sa`: `/download/windows` serves the new 4.49 MB installer, and `/api/providers/updates/windows-x86_64/0.2.8` returns the signed 0.2.9 manifest (0.2.9 clients get 204). Existing installs auto-update; new downloads get the fix; Windows providers now connect to the mesh and serve.

### 2026-07-02 — `fix(providers): accept x-api-key on daemon manifest + download — PR #702`

**What:** Provider onboarding via the Tauri "DCP Provider" desktop app (v0.2.8) failed at the final setup step — *"Start provider daemon: Couldn't fetch daemon from platform: Failed to fetch daemon manifest: HTTP 400 Bad Request"* — even though every prior step (GPU detect, sign-in, Ollama, model) passed. The installer (`dcp-desktop` `fetch_verified_daemon`) sends the provider key via the `x-api-key` header only (a security change to keep the key out of the URL), but the backend's `GET /download/daemon/manifest` read `?key=` alone, and the shared `resolveProviderFromDownloadQuery` helper accepted `Authorization: Bearer` and `x-provider-key` but not `x-api-key`. Fix: the helper now also accepts `x-api-key`, and the manifest route routes through the shared resolver (token / `?key=` / Bearer / `x-provider-key` / `x-api-key`) instead of raw `?key=` — which also covers the subsequent `/download/daemon` call. Verified live on `api.dcp.sa`: manifest returns `200 {version, size, sha256}` and `/download/daemon` returns `200` with a byte count matching the manifest size, so the app-side sha256 verification passes and the daemon starts.

### 2026-07-02 — `feat: the dcp launcher CLI + supporting backend — PRs #691–#694 (dcp launcher v1 complete)`

**What:** The `dcp` CLI (`clients/dcp-cli/`, npm-packagable as `@dcp/cli`): run `dcp`, get an interactive terminal picker (agent + live model availability + balance), press Enter, and Claude Code launches against DCP GPU inference — per-token, on the renter's balance. Plus the two backend pieces it needed: `GET /v1/coding/models` (#691 — curated coding catalog with live vLLM availability; pricing shared with the `/anthropic` settlement path so the advertised rate is exactly what's charged) and device-code login at `/v1/cli` (#692 — OAuth-style flow; approval mints a one-time-claim scoped `dc1-sk-` inference key).

**CLI (#693, #694):** ESM Node (commander/execa/ink/vitest). `dcp login` (browser device flow or `--key` paste), `dcp` (Ink TUI picker; remembers last agent+model so run two is one Enter; non-TTY falls back to a plain listing), `dcp launch claude --model <id>` (non-interactive), `dcp status`, `dcp logout`. The ClaudeCode adapter sets the full verified env map — `ANTHROPIC_BASE_URL=<base>/anthropic`, auth token, and `ANTHROPIC_MODEL`+`ANTHROPIC_DEFAULT_HAIKU_MODEL`+`ANTHROPIC_DEFAULT_OPUS_MODEL` all pinned to the chosen DCP model (Claude Code silently calls different model roles; single-model endpoints break otherwise), with `ANTHROPIC_API_KEY=''` so an inherited real key never leaks upstream. Codex/Cursor appear as "coming soon".

**Verified:** 94 tests across backend+CLI suites (21 backend, 73 CLI); live on prod: catalog + device flow smoked on `api.dcp.sa`, real `dcp login`/`status` against prod, and a real Claude Code session launched through the adapter env completed a tool round-trip on provider GPU inference. `npm pack` clean (8.8 kB). Publishing to npm + the `dcp.sa/cli-login` approval page are follow-ups.

### 2026-07-02 — `feat(backend): renter-facing Anthropic /v1/messages surface — PRs #687, #688 (dcp launcher Phase 0)`

**What:** New renter-key-gated Anthropic Messages API at `https://api.dcp.sa/anthropic/v1/messages` (+ `/count_tokens`) so coding agents that speak the Anthropic protocol — Claude Code first — can run against DCP GPU inference by setting `ANTHROPIC_BASE_URL`. First shipped piece of the `dcp` launcher (spec + plan in `docs/superpowers/`, PR #689).

**How:** Same renter auth as `/v1/chat/completions` (`v1.shared.requireAuth`; provider keys rejected); provider resolution via `provider_engines` filtered to vLLM engines; direct passthrough to the provider's **native Anthropic** endpoint over the WireGuard mesh — deliberately no Anthropic↔OpenAI translation (avoids the translation-layer tool-call corruption class). SSE streamed byte-for-byte (`X-Accel-Buffering: no`); `anthropic-version`/`anthropic-beta` headers forwarded; renter Authorization never leaks upstream. Billing: 402 pre-flight via `checkBalanceGate`, settlement through the single money path (`settleInferenceOnce` — idempotent, sub-credit drain, 75/25 split, `usage_events`); streaming settles from the final `message_delta` usage via a side-tap that never touches piped bytes. #688 adds Claude Code compat: `role:'system'` entries injected inside `messages[]` are hoisted into the spec-correct top-level `system` field (vLLM strictly rejects them otherwise — found by the live ship-gate test). Nexus's `/api/agent/gateway/v1/messages` (provider-key-gated) is untouched.

**Verified:** 12 supertest cases green; live end-to-end on prod — a real Claude Code session (`ANTHROPIC_BASE_URL=https://api.dcp.sa/anthropic`, model `qwen3-30b-a3b` on a provider RTX 3090 via vLLM) completed a multi-step tool loop (Read → file write → Bash) with clean streaming `tool_use` frames and correct settlement rows in `usage_events`.

### 2026-07-01 13:41 UTC — `fix(volumes): reuse released row + refund on re-rent to stop silent double-charge — PR #686`

**Bug:** `POST /api/volumes/rent` INSERTed a new `renter_volumes` row on every rent, but `bucket` is `TEXT NOT NULL UNIQUE` per renter and a released rental keeps its row (`status='released'`) for audit. A renter who released a volume then re-rented hit `UNIQUE constraint failed: renter_volumes.bucket` — the first-month debit had **already** succeeded and `provisionVolume` had succeeded, then the INSERT threw and the outer catch returned `500 {error:'Failed to rent volume'}` with **no refund**, so each retry silently re-charged the renter.

**Fix (`backend/src/routes/volumes.js`):** re-rent now **UPDATEs the existing released row** back to `active` instead of INSERTing (no UNIQUE collision). The DB write is wrapped in its own try/catch: on any failure it **refunds the debit** and deprovisions the just-(re)created MinIO bucket, so a renter is never charged for a volume they didn't get (`code:'RENT_PERSIST_FAILED'`). The log line gains a `(re-rent)` marker on the UPDATE path; the first-rent INSERT path is unchanged.

**Deploy:** hot-patched on prod 2026-07-01, then committed via PR #686 with prod fast-forwarded to `origin/main` so a redeploy cannot regress it. **Verified:** a live rent→release→re-rent cycle returned the same reused row id with HTTP 200; first-rent unaffected. Renters affected by the earlier double-charge were reconciled with refunds (audited).

### 2026-06-30 10:48 UTC — `fix(jobs): settle full-duration interactive-pod payouts on timeout (provider-earnings leak) — hot-patched on prod, PR #675`

**Bug:** `enforceJobTimeouts` marked `interactive_pod` jobs `completed` when they reached their scheduled `max_duration`, but never ran the money-flow settlement that `stopPodCore` runs on a renter-initiated stop. The `escrow_holds` row was flipped to `released_provider` and the code relied on a downstream sweep that does not exist — `reconcileProcessingPayouts` reconciles Moyasar *withdrawals* (`payout_requests`), not escrow → provider earnings. So for every pod that ran to its full scheduled duration, the provider's `claimable_earnings_halala` was never credited, DCP's 25% fee was never booked, and the renter's `total_spent_halala` was never incremented. Renters were correctly debited at launch (prepaid) and the escrow was released, but the provider side of the settlement was skipped entirely.

**Prod impact confirmed (2026-06-30):** 3 completed pods on Tareq Node 2 (`provider 1774351995321`) with `provider_earned_halala IS NULL` — escrow amounts 250 / 1000 / 1000 halala (2250 total), of which 1687 halala (75%) was the provider share and 563 halala (25%) was DCP's fee, all stuck. (A 4th edge-case pod with escrow `released_renter` after running 4h of a 6h max duration is a separate race condition, flagged for investigation.)

**Fix:** `backend/src/routes/jobs.js` `enforceJobTimeouts` now mirrors `stopPodCore`'s settlement exactly, gated by a race-safe once-only guard (`WHERE status='running'` + `changes === 1`) so a concurrent renter stop that already set `stopped` makes this a no-op (no double-credit) — the same proven guard pattern used in `failBurstJobAndRefund`. Computes `actualCostHalala = min(prepaid, ceil(elapsedSeconds × ratePerGpuSecond × gpuCount))`, splits 75/25 (`POD_PROVIDER_EARN_SHARE = 0.75` — explicitly *not* `splitBilling()`, which is the 85/15 inference-job split and would under-book DCP's fee by 10pp), credits `providers.claimable_earnings_halala` + `total_earnings` + `total_jobs`, refunds unused prepaid to the renter, writes `actual_cost_halala` / `provider_earned_halala` / `dc1_fee_halala` / `duration_seconds` on the job row, and releases escrow only when this caller won the race.

**Deploy:** hot-patched on prod (`root@76.13.179.86`, pm2 `dc1-provider-onboarding`) 2026-06-30; `safe-reload.sh` (0 active pods, clean reload); `node --check` passed on prod; local `jobs.js` sha256 verified identical to prod before commit. **Smoke:** `ops/e2e-smoke.sh` 5/5 pass — gateway health 200, 33 models served, inference `pong`/`stop`, Tareq Node 2 daemon heartbeat 8s, WG diag OK. **PR #675** lands the fix in git so the next deploy-from-main does not regress the live hot-patch.

**Pending (separate, owner sign-off required):** corrective backfill of the 3 historical leaked pods (credit Tareq `claimable_earnings_halala += 1687` + `total_earnings += 16.87` SAR + `total_jobs += 3`, book 563 halala DCP fee across the 3 job rows, update renter accounting) — a real-money DB write to a provider's withdrawable balance, flagged for explicit owner approval. Also flagged: a `splitBilling` (85/15 inference) vs pod (75/25) rev-share inconsistency, and a `cost_halala` (quote) vs `escrow_holds.amount_halala` (real debit) divergence on one of the 3 pods (1500 vs 1000) — the backfill uses the escrow amount as the source of truth; the going-forward fix uses `cost_halala` to mirror `stopPodCore`.

### 2026-06-30 08:30 UTC — `chore(release): ship main → prod (security/staged-rollouts fast-forward 0135afd9..186b0a23) + smoke-verified`

Production deploy of the 2026-06-30 task batch (tasks #1–#10) plus all other merged `main` work since the last prod update. The prod backend (`root@76.13.179.86:/root/dc1-platform`) runs the `security/staged-rollouts` branch, which had fallen **77 commits behind `origin/main`** (`0135afd9` → `186b0a23`), **0 commits ahead** — a pure stale snapshot with no unique prod-only commits. Reconciliation was therefore a clean fast-forward with zero conflict risk and zero unique work to lose.

**Pre-deploy reconciliation (done on the VPS, live-state-verified — the 2026-06-28 memory snapshot was stale and wrong):**

- **Inspected live prod state, not the memory snapshot.** Memory claimed "19 uncommitted files + 1 untracked required `renter-job-view.js`". Reality: only **1 modified tracked file** (`.gitignore`) + 9 untracked paths; `renter-job-view.js` was already tracked and present on `main` at `backend/src/lib/renter-job-view.js` — never missing. The memory was discarded in favor of `git status` ground truth.
- **`.gitignore` local modification discarded** — it added secret-protection rules (`ops/.watchdog-env`, `*.bak`, `.hotpatch-backups/`, `*.prepared`); `origin/main`'s `.gitignore` already contains the byte-identical rules (committed in `0e48bf23`). `git restore .gitignore` → zero loss; the fast-forward brings the same content.
- **4 untracked files removed (byte-identical to `main`'s tracked versions):** `safe-reload.sh`, `ops/e2e-smoke.sh`, `ops/morning-digest.sh`, `docs/security/README.md` — all committed to `main` by `0e48bf23` from these very prod files. `diff` confirmed identical before removal; the fast-forward recreated them as tracked. Zero loss.
- **5 untracked runtime/artifact paths left in place (untouched by FF, intentionally untracked):** `backend/installers/*.tar.gz` + `*.exe`, `backend/src/data/provider-logs/`, `docs/reports/runtime-parity/*.json`, `extensions/dc1-vscode/*.vsix`. Runtime logs / build artifacts, not source.

**Deploy (2026-06-30 08:29:56Z):**

- **Fast-forward** `security/staged-rollouts` `0135afd9..186b0a23` — pure FF, no merge commit, no conflicts.
- **Backend = pm2 process `dc1-provider-onboarding`** (PID 1615 → 2613597), `node /root/dc1-platform/backend/src/server.js` (JS, no build step), cwd `/root/dc1-platform/backend`, fork mode, node 22.22.0, listening on `:8083` ← nginx `api.dcp.sa` upstream. Confirmed the pm2 process name is misleading: despite being named "onboarding", it is the full DCP API backend.
- **Reload via `safe-reload.sh`** — 0 active interactive pods (no `--force` needed), `pm2 reload dc1-provider-onboarding`, restarts 0→1, status `online`. Health blip: `000` at t=1s (restart), `200` at t=2s. No live pods were disrupted.
- **Syntax + require-resolve pre-checks** (before touching the running process): `node --check` passed on `server.js`, `routes/renters.js`, `routes/pods.js`, `services/burstPricingService.js`, `services/burstLaunchRefund.js`, `lib/renter-job-view.js`; the two new service modules loaded cleanly with the expected exports (`burstPricingService` → `computeCostPerGpuSecondHalala` + 4 constants; `burstLaunchRefund` → `failBurstJobAndRefund`); `renters`/`pods` route modules loaded (require chain resolves).
- **No `backend/package.json` / lockfile changes** in the 77-commit range → no `npm install` needed.

**Smoke tests (all PASS, 2026-06-30 08:30Z):**

- **Pricing (task #7):** `GET /api/renters/pricing` returns real cost-plus SAR/hr derived from `providers.cost_per_gpu_second_halala` — RTX 3090 2.5, RTX 4090 3.62, RTX 5090 5.2, A100 80GB 7.3–7.82 SAR/hr. Cross-checked against the DB: 3090 = 0.0694 halala/sec × 3600 / 100 = 2.5 SAR/hr ✓. The reconciled billing source is live.
- **Burst refund (task #9):** `routes/pods.js:946` calls `failBurstJobAndRefund(db, …)` — the extracted once-only refund helper is wired into the launch-fail path.
- **MCP `list_pods` (task #8):** tool present at `integrations/dcp-mcp/index.js:153` and documented in `integrations/dcp-mcp/README.md:43`. (MCP server is agent-side, not backend-reloaded.)
- **`server.ts` guard (task #10):** fail-fast guard present at `backend/src/server.ts:75` (`DCP_ALLOW_FASTIFY_ENTRY !== '1'` → exit). Non-production reference cannot start accidentally.
- **Heartbeat HMAC safety (commit `07fe4e77`, H7):** `DC1_REQUIRE_HEARTBEAT_HMAC` is **unset** on the running pm2 process → the HMAC gate stays warn-only/OFF. **14 providers online before AND after reload** (unchanged) — unsigned heartbeats still accepted, no 401 storm, no providers dropped. The C3 full-enforcement flip remains deliberately NOT applied.
- **Overall API health:** `http://localhost:8083/api/health` → 200; public `https://api.dcp.sa/api/health` → 200 (full nginx→backend path green post-deploy).

**State changes:** prod `security/staged-rollouts` advanced from `0135afd9` to `186b0a23` (now identical to `origin/main`). The 2026-06-30 task batch (#1–#10) is **live in production**. No prod-only files were lost; no unique prod commits existed. The 4 formerly-untracked ops scripts (`safe-reload.sh`, `ops/e2e-smoke.sh`, `ops/morning-digest.sh`, `docs/security/README.md`) are now tracked on prod as on `main`.

**No new PR** — this is a release of already-merged `main` commits to prod, not new code. Commit range: `0135afd9..186b0a23` (77 commits). Standing constraint honored: deploy from `main` to prod was a deliberate, smoke-tested release — not an auto-deploy.

---

### 2026-06-30 07:02 UTC — `chore(security): mark stray Fastify server.ts non-production + fail-fast guard (ROADMAP 0.9)`

`backend/src/server.ts` is a small Fastify entry that registers only 3 route modules (audit/billing/jobs) with JWT-only auth and **none** of the Express-layer controls the production server owns (HMAC verification, rate limiters, CORS lockdown, input sanitization, full route surface). If it were ever started by accident (`ts-node server.ts` or a compiled build), it would bind a port and serve traffic with every production guardrail bypassed. The production server is `backend/src/server.js` (Express) — confirmed: it does not use `fastify` / `@fastify/jwt` at all.

**Why not just delete it:** `backend/src/__tests__/fastify-jwt-hardening.test.js` (DCP-908) reads `server.ts` source text as a regression reference for the JWT hardening properties — F1 algorithm pinning (`verify: { algorithms: ['HS256'] }`) and F2 24h token expiry (`sign: { expiresIn: '24h' }`). It's a documentation fixture, not a runnable server. Deleting it would retire that hardening regression; the principled fix (migrate the assertions onto the real Express server's JWT config) is a separate task.

**Included:**

- **Loud non-production banner** at the top of `backend/src/server.ts` — explains it is NOT the traffic-serving server, names `server.js` (Express) as production, lists the controls it lacks, and states why it's retained (hardening-test fixture).
- **Fail-fast startup guard** (ROADMAP 0.9) inside `start()` — refuses to call `app.listen` unless `DCP_ALLOW_FASTIFY_ENTRY=1` is explicitly set; everything else (including `NODE_ENV=production`) exits with a FATAL message before binding a port. Verified: default / `=0` / `NODE_ENV=production` all refuse; only `=1` proceeds. Accidental startup is now impossible.
- **Hardening test preserved** — verified the two `expect(src).toMatch(...)` regexes (`algorithms: ['HS256']` and `expiresIn: '24h'`) still match the edited source. No test changes needed.
- **Deferred (tracked follow-up, NOT shipped here):** the H9 dependency CVEs (`ws` 8.x + `uuid` via `dockerode`) noted in `docs/security/CHANGELOG.md` as STAGED for a maintenance window. An `npm audit fix` touches transitive deps of a prod-adjacent backend and genuinely needs a maintenance window + a full test-suite run to validate dockerode behavior — not safe to do blind in a no-questions sprint. Left staged.
- **No prod deploy** — `main` only.

**State changes:** `server.ts` can no longer be accidentally started; the only runnable backend entry remains `server.js` (Express). No behavior change to production traffic.

---

### 2026-06-30 06:55 UTC — `test(burst): extract + test the launch-fail-refund once-only invariant (ROADMAP 2.1/2.2)`

The burst launch path pre-debits the renter (full-duration quote) BEFORE spawning an external pod via `burst.py`. If spawn fails, the renter must be refunded **exactly once** — never zero (they'd pay for a pod that never booted), never twice (a concurrent timeout sweep could also try to refund the same row). This is the platform's most load-bearing double-charge-prevention path, and it had **zero in-repo tests** — the refund SQL was inlined in the `routes/pods.js` launch handler, untestable.

**Included:**

- **New service** `backend/src/services/burstLaunchRefund.js` — extracts the fail+refund logic into `failBurstJobAndRefund(db, {jobId, quoteHalala, renterId, reason})`. The once-only guard lives in exactly one place: `UPDATE jobs SET status='failed', error=?, completed_at=?, refunded_at=? WHERE id IN (SELECT id FROM jobs WHERE job_id=?) AND refunded_at IS NULL AND status IN ('pulling','queued','assigned')`. `updated.changes === 1` is the single signal that THIS caller won the refund race; only then is the renter balance credited. Idempotent: a second call (retry / concurrent sweep) is a no-op. Returns `{refunded, changes}`.
- **Wired** `routes/pods.js` spawn-fail catch to call the helper (the inline `db.transaction(...)` block is replaced by one `failBurstJobAndRefund` call). Behavior unchanged; the SQL is byte-identical to what was inline.
- **New jest test** `backend/src/__tests__/burstLaunchRefund.test.js` — 6 test groups covering: (1) refund fires when the job is in a launch-state and not yet refunded; (2) **idempotent — a second call credits the wallet zero times** (the double-charge guarantee: job UPDATE runs twice, renters credit runs once); (3) no refund when the job already reached a terminal state (changes=0); (4) no wallet credit when `quoteHalala` is 0 (free launch, job still marked failed); (5) the supplied `reason` is written to `jobs.error` with a default fallback; (6) the SQL guard clause is exactly the documented once-only form (both `refunded_at IS NULL` AND the non-terminal status whitelist present, selected by `job_id`). Uses a better-sqlite3-shaped mock db (no real sqlite / no `node_modules` needed). All 6 groups verified standalone.
- **Deferred (tracked follow-up, NOT shipped here):** "give burst.py structured error feedback (exit codes/JSON) instead of free-text `last_error` flips." `spawnBurstLaunch` runs `stdio:'ignore'` detached and burst.py writes results back to the job row by `--job-id`; structured errors would require a coordinated contract change across `ops/burst.py` (whose live VPS copy at `/root/dcp-burst/burst.py` may differ from the repo), the `jobs` schema, and backend consumption — too risky to do blind in a no-questions sprint. Left as ROADMAP 2.2. The socat-orphan teardown path (`spawnBurstTeardown` + `jobSweep.spawnBurstTeardownSweep`) remains idempotent and backstopped by the reaper cron, unchanged.
- **No prod deploy** — `main` only; ships via a deliberate smoke-tested release.

**State changes:** `routes/pods.js` spawn-fail path now calls `services/burstLaunchRefund.js` (behavior-identical). The once-only refund invariant is now covered by a regression test.

---

### 2026-06-30 06:48 UTC — `feat(mcp): add list_pods lifecycle tool — agents can enumerate their own pods (ROADMAP 2.3)`

The DCP MCP server exposed `create_pod` / `get_pod` / `extend_pod` / `stop_pod` but had **no `list_pods`** — an agent that launched pods could not enumerate them, so a forgotten pod kept running and draining the wallet until it expired on its own. Agents could create and kill pods but couldn't *find* them. This closes that gap.

**Included:**

- **New tool** `list_pods` in `integrations/dcp-mcp/index.js` — maps to `GET /api/pods` (backend `pods.js:606`, `requireRenter`-gated). Returns the caller's interactive pods newest-first (`{pods: [...]}`) with `id`, `gpu_type`, `status`, `access_url`, `ends_at`, `seconds_remaining`. Optional `limit` (1–100, default 20) passed as `?limit=`. Inserted in the TOOLS array immediately before `get_pod` so the lifecycle reads naturally: `list_pods → get_pod → extend_pod / stop_pod`.
- **README** `integrations/dcp-mcp/README.md` — `list_pods` added to the tool table.
- **Scope note on the original 4-tool ask** (`list_pods`, `stop_pod`, `delete_pod`, `pod_status`): `stop_pod` (DELETE + refund) and `get_pod` (status — i.e. `pod_status`) had already landed since the task was written, so only `list_pods` was genuinely missing. `delete_pod` was **intentionally not added** — it would be a redundant alias of `stop_pod` (same `DELETE /api/pods/:id` + refund), and two tools with identical effect would only confuse an agent about which to call. The full lifecycle is now: `list_pods` (find) → `get_pod` (inspect) → `extend_pod` (add time) → `stop_pod` (stop + refund).
- **Verified:** `node --check` passes; TOOLS registry well-formed (12 tools). No prod deploy — `main` only.

**State changes:** MCP tool count 11 → 12. No backend changes (the `GET /api/pods` route already existed; only the MCP surface was missing the mapping).

---

### 2026-06-30 06:40 UTC — `feat(pricing): reconcile pricing sources — port cost-plus logic into tested backend service, kill the mis-named gpu_pricing price path (ROADMAP 1.4/1.5)`

The cost-plus repricing that sets the REAL billed price (`providers.cost_per_gpu_second_halala`) for burst GPUs lived **only in an untracked, unaudited VPS cron script** (`/root/dcp-burst/stock-refresh.py`), and the public `GET /api/renters/pricing` endpoint read a *different* legacy table (`gpu_pricing.rate_halala`) whose column actually stored USD × 100,000 (a mis-named pre-launch artifact) — 2–5× below the real billed rate. Two wrong sources, one right source, zero in-repo audit. This lands the canonical formula in the repo and points the public price list at the real number.

**Included:**

- **New tested service** `backend/src/services/burstPricingService.js` — pure, I/O-free port of the stock-refresh.py cost-plus formula: `computeCostPerGpuSecondHalala(usdPerHour, opts)` returns `usd/hr ÷ 3600 × 3.75 (USD→SAR) × 100 (SAR→halala) × 1.40 (+40% margin)`. Constants (`USD_TO_SAR`, `SAR_TO_HALALA`, `MARKUP`) are exported so the VPS script and any future in-backend refresh cron import the exact same values instead of re-declaring and drifting. Returns the **raw float**, not a rounded integer — byte-identical to stock-refresh.py, because per-GPU-second halala is fractional (e.g. $2.49/hr upstream → 0.363 halala/sec) and rounding per-second would zero any sub-$3.50/hr GPU; settlement rounds once at the final charge. Null contract preserved: `null/undefined/0/negative/NaN/string/Infinity → null` (matches the script's "no live price → leave existing price UNCHANGED, never zero it" rule). Also exports `halalaPerSecondToSarPerHour(h)` (×36) for the displayed SAR/hr. **INVISIBILITY-safe**: never names the upstream broker or the markup % — the module is a pure numeric transform.
- **New jest test** `backend/src/__tests__/burstPricingService.test.js` — asserts byte-for-byte parity with the stock-refresh.py raw float for a realistic H100 secure price ($2.49/hr → 0.363125 halala/sec → 13.07 SAR/hr round-trip), the 40% markup ratio, the null-never-zeroes contract, option overrides (custom markup/FX), and the halala→SAR/hr ×36 conversion. 6/6 assertion groups verified standalone (no `node_modules` locally — same harness constraint as prior tasks).
- **Reconciled** `GET /api/renters/pricing` (`backend/src/routes/renters.js`) — now derives the per-model price from `providers.cost_per_gpu_second_halala` (cheapest across providers of each model, `GROUP BY gpu_model, MIN(h)`), the **same canonical billed source** `GET /available-providers` already uses, instead of the legacy `gpu_pricing.rate_halala` (USD × 100,000) lie. Response now returns real `rate_halala_per_hour` (integer halala/hr), `rate_sar_per_hour` (the SAR/hr shown to renters), and `rate_usd_per_hour` (SAR ÷ 3.75, display only). The public price list and the launch quote/bill now agree. Verified against three reference GPUs: RTX 4090 $0.34/hr → 1.78 SAR/hr, A100 $1.20/hr → 6.30 SAR/hr, H100 $2.49/hr → 13.07 SAR/hr (all = upstream USD × 3.75 × 1.40, as expected).
- **Deferred (tracked follow-up, NOT shipped here):** `pricingService.estimateCost` / `getRate` still uses `GPU_RATE_TABLE` USD *floor* prices and still returns `competitor_prices` / `savings_pct` (vs Vast.ai) — called from 5 sites (models, templates, jobs, arabic-rag, v1-wizard) and used as a pre-launch *estimate*, not settlement (settlement bills against the real `cost_per_gpu_second_halala`, which is correct). Fully re-architecting it across all 5 call sites without a running test suite is out of scope for this no-questions sprint; `GPU_RATE_TABLE`/`competitor_prices` are low-pri dead data to strip (Peter 2026-06-24: DCP does not compete on price). Left as a documented ROADMAP 1.5 item. `gpu_pricing` table left in place (read-only, now unused) pending a separate drop migration.
- **No prod deploy** — `security/staged-rollouts` is still prod's branch; this lands on `main` only and ships to prod via a deliberate smoke-tested release.

**State changes:** `gpu_pricing` → read-only/deprecated (no code path reads it anymore); `GET /api/renters/pricing` source-of-truth flipped from `gpu_pricing.rate_halala` (USD×100000) → `providers.cost_per_gpu_second_halala` (real halala/sec). `DC1_REQUIRE_HEARTBEAT_HMAC` untouched (still `0`; C3 rollout).

---

### 2026-06-30 06:33 UTC — `feat(analytics): revenue funnel stages — topup_initiated / pod_launched / first_inference + client view beacon (ROADMAP 1.1-1.3)`

Closes the gap between the baseline funnel (`view → register → first_action → first_success`) and the actual revenue path. **Bug fix included:** `conversionFunnelService.VALID_STAGES` only listed the four baseline stages, so the `payment_success`, `agent_self_serve`, and `pending_email_verification` `trackStage` call sites that landed in the staged→main merge (commit `0135afd`) were being **silently rejected** (`{inserted:false, error:'invalid_stage'}`) — they now record.

- **`backend/src/services/conversionFunnelService.js`:** `VALID_STAGES` expanded to `view, register, first_action, first_success, topup_initiated, payment_success, pod_launched, first_inference, agent_self_serve, pending_email_verification`. The service dedupes per `(journey, stage, actor)` via `dedupe_key`, so each `first_*` / `*_launched` / `*_initiated` / `payment_success` stage records **once per renter/provider** even though the call sites fire on every relevant transaction.
- **`topup_initiated`** — `routes/payments.js` `POST /api/payments/topup`: fires once before the bank-transfer/Moyasar branch so both paths are covered. Metadata: `{amount_halala, payment_method}`.
- **`pod_launched`** — `routes/pods.js` launch endpoint: fires at the `201 starting` response (renter committed to a launch). Native and burst pods both covered; the async `pulling→running` transition has no renter req context and stays on the existing job-status analytics. Metadata: `{job_id, provider_id, duration_minutes, is_burst, quoted_cost_halala}`. Added `conversionFunnel` require to `pods.js`.
- **`first_inference`** — `routes/v1.js`: fires after `billingService.settleInferenceOnce` returns `status:'settled'` (the moment the money loop closed for a new renter). Guarded by `result?.status === 'settled'` so idempotent replays and unbilled settlements don't fire. Metadata: `{model_id, cost_halala, prompt_tokens, completion_tokens}`. Added `conversionFunnel` require to `v1.js`.
- **Client-side view beacon (ROADMAP 1.3):** new public `POST /api/funnel/view` endpoint (`routes/funnel.js`, mounted at `/api/funnel` in `server.js`) — records a `view` stage from the client. Anonymous visitors (no renter key) → `actor_type='anonymous'` with a client-generated `anonymous_id`; logged-in renters (`x-renter-key` header) → `actor_type='renter'` deduped to first view. Rate-limited (30/min/IP). Returns `204` so `sendBeacon` can fire on page unload.
  - **`app/lib/funnel.ts`:** `trackView(surface)` + `surfaceForPathname()` — `sendBeacon` with `fetch` fallback, persists `anonymous_id` in `localStorage` (1y TTL, `crypto.randomUUID`).
  - **`app/(site)/components/FunnelViewBeacon.tsx`:** mounted once in `app/(site)/layout.tsx`; fires on mount + pathname change **only for marketing surfaces** (`/`, `/marketplace`, `/containers`, `/pricing`, `/docs`, register pages) — internal routes (renter/provider consoles, `/admin`, `/api`, `/v1`) are skipped so app-internal traffic doesn't pollute the funnel.
- **Verification:** `node --check` on all 5 backend files + the funnel router pass; TS files syntax-reviewed (`node_modules` not installed locally, same constraint as C1/H7). The 3 previously-rejected stages now validate; existing baseline stages unchanged.
- **State change:** revenue funnel now records topup → payment → pod launch → first inference end-to-end; marketing-page views are independently beaconed (not just inferred from `register`). No prod impact (prod runs `security/staged-rollouts`); lands when main next smoke-deploys.

### 2026-06-30 06:25 UTC — `feat(security): H7 — heartbeat HMAC enforcement gate on /heartbeat + /wg/register + daemon-side signing (C3 prep)`

Nexus/Tito audit item H7 — heartbeat / WireGuard-register requests were authenticated only by the provider API key. A leaked/observed key could spoof provider liveness (`POST /api/providers/heartbeat`) or register rogue WireGuard peers (`POST /api/providers/wg/register`). `verifyHeartbeatHmac` + `DC1_HMAC_SECRET` existed but were warn-only, and `/wg/register` had an open `// TODO: enforce once DC1_HMAC_SECRET is set to a real value`.

- **`DC1_HMAC_SECRET` is already set on prod** (verified in the prior session via the VPS env) and is in `REQUIRED_SECRETS` in `server.js`. **`DC1_REQUIRE_HEARTBEAT_HMAC` stays `'0'` / unset on prod** — flipping it to `'1'` now would 401 every heartbeat because the shell-based daemons don't sign yet, severing the provider mesh. It is gated behind the **C3 per-provider `task_spec` signing rollout**.
- **Refactor for testability:** lifted `verifyHeartbeatHmac` + the gate logic out of `routes/providers.js` into **`backend/src/middleware/heartbeatHmac.js`** exporting `verifyHeartbeatHmac` + a single `enforceHeartbeatHmac(req,res,next)` route middleware (mirrors the `middleware/queryKeyReject.js` extraction from C1). `providers.js` now `require('../middleware/heartbeatHmac')` and mounts `enforceHeartbeatHmac` as route middleware on **both** `POST /api/providers/heartbeat` and `POST /api/providers/wg/register` — the inline gate blocks were removed, the warn-only `// TODO` on `/wg/register` is closed.
- **Gate contract:** `DC1_REQUIRE_HEARTBEAT_HMAC !== '1'` → warn + pass through (backward-compatible). `'1'` → 401 unsigned / bad-signature with an `X-DC1-Signature: sha256=<hex>` hint. Constant-time compare via `crypto.timingSafeEqual`.
- **`server.js`:** added the matching `express.raw` + `req.rawBody` capture for `/api/providers/wg/register` (heartbeat already had one) — without it `verifyHeartbeatHmac` would return `Raw body unavailable` and enforcement would 401 even valid signatures on `/wg/register` once the flag flips.
- **Daemon-side signing (C3 prep):**
  - **`sdk/python/dc1_provider/_http.py`** — when `DC1_HMAC_SECRET` is in the daemon's env, every request now carries `X-DC1-Signature: sha256=HMAC-SHA256(rawBody, secret)` (signs the exact on-wire bytes; empty body → `b""` so GETs/bodyless POSTs are covered). Safe: backend ignores the signature while the flag is off; primes telemetry so daemons show as "signing" the moment the flag flips.
  - **`backend/installers/dcp_daemon.py::http_post`** — the production Python daemon's transport now signs too. Pre-serializes the body **once** and sends `data=<bytes>` with `Content-Type: application/json` on both the `requests` and `urllib` paths, guaranteeing the signature covers the exact wire bytes (previously `requests` re-serialized via `json=`, which could diverge from the signed bytes).
- **Test:** **`backend/src/__tests__/heartbeatHmac.test.js`** — `verifyHeartbeatHmac` (valid / missing-header / wrong-secret / malformed / unset-secret) + `enforceHeartbeatHmac` route middleware (warn-only pass-through with flag off; 401 with flag on; valid-sig pass; `/wg/register` rejects unsigned under same gate). Verified logic standalone (12/12 pass); jest file syntax-checked (`node_modules` not installed locally, same constraint as C1).
- **Residual / C3 rollout (documented, out of scope here):** the **shell-based `daemon.sh` / `heartbeat.sh`** (curl) senders do NOT sign — they remain warn-only and will need a signing shim (or migration to the Python daemon) before `DC1_REQUIRE_HEARTBEAT_HMAC` can be flipped to `'1'`. The flag flip itself must be a deliberate smoke-tested prod release, not an auto-deploy.
- **State change:** `/wg/register` warn-only `TODO` → real (but dormant) enforcement gate; both daemon transports now emit signatures; prod behavior unchanged (flag off). No prod impact; lands when main next smoke-deploys.

### 2026-06-30 06:18 UTC — `feat(security): C1 phase-2 — reject query-param API keys on /api/renters/me/*`

Nexus/Tito audit item C1 — `?key=` / `?renter_key=` / `?provider_key=` / `?api_key=` leak credentials into browser history, server access logs, referrer headers, and proxy logs. Phase 1 (Deprecation/Sunset/Link headers + telemetry) shipped earlier; this is **phase 2: enforcement**.

- **Backend (`server.js`):** uncommented `app.use('/api/renters/me', rejectRenterQueryParamKey)` — `?key=` / `?renter_key=` on `/api/renters/me/*` now return **400** with a `Set the "X-Renter-Key" header` hint. The `/api/renters/analytics` + `/api/renters/export` mounts are left commented (those exact routes don't exist — verified `grep` of `routes/renters.js`; placeholders only).
- **Refactor for testability:** extracted `detectQueryParamKeys` + `rejectRenterQueryParamKey` from `server.js` into **`backend/src/middleware/queryKeyReject.js`** (matches the existing `middleware/auth.js` pattern) so the contract is unit-testable without booting the whole app. `server.js` requires them.
- **Test:** **`backend/src/__tests__/queryKeyReject.test.js`** — 9 cases (rejects `?key=` / `?renter_key=` on `/me` and `/me/analytics` prefix mount → 400; passes header-auth + `?provider_key=` through). Verified logic standalone (8/8 pass) since `node_modules` isn't installed locally; jest file syntax-checked.
- **Frontend migration (DCP-712):** all `/api/renters/me/*` fetch call sites moved off `?key=` → `X-Renter-Key` header. Most already sent the header (the `?key=` was redundant leftover); 3 didn't (`auth/page.tsx`, `JobSubmitForm.tsx`, `setup/page.tsx` had header; `auth` + `JobSubmitForm` now add it). Files: `renter/{usage,settings,playground,keys,pods}/page.tsx`, `auth/page.tsx`, `setup/page.tsx`, `components/jobs/JobSubmitForm.tsx`.
- **CSV export blocker solved:** `renter/usage/page.tsx`'s `<a href="?key=…&format=csv">` (browser navigation — can't set headers) converted to a `downloadUsageCsv()` blob-download (fetch with `x-renter-key` header → `URL.createObjectURL` → synthetic `<a>` click), matching the existing `renter/invoices/page.tsx` pattern.
- **Verification:** `grep "renters/me.*?key=" app/ components/` → **zero** remaining. `node --check` on `server.js` + new module pass.
- **Scope / residual blockers (documented):** (1) Tauri installer download URLs (`/api/providers/download?key=`) are baked into already-shipped `.exe`/`.dmg` binaries — intentionally NOT covered; needs a signed-URL mechanism. (2) Provider-side `?key=` call sites are NOT enforced (no `rejectProviderQueryParamKey` middleware exists) — they remain on phase-1 deprecation headers. (3) `/v1/*` query-key rejection is the separate H2 item (env-gated), untouched here.
- **State change:** `?key=` on `/api/renters/me/*` is now refused at the backend. No prod impact yet (prod runs `security/staged-rollouts`, not `main`); lands when main next smoke-deploys.

### 2026-06-30 06:05 UTC — `investigate(ops): openclaw-gateway + agents-auth health — verdict: both non-DCP, no action`

Investigation (no code change, no prod mutation):
- **openclaw-gateway-1** was unhealthy (EACCES on `/home/node/.openclaw/openclaw.json` — root-owned file, container runs as uid 1000). Fixed earlier this session with `chown 1000:1000 /root/.openclaw/openclaw.json` + restart → now `Up (healthy)`. **However Peter confirmed this container is DEPRECATED** ("it's the old nexus, we switched to Hermes") — the fix was cosmetic only; no further investment warranted. Left running (no blast-radius evidence either way; not touched further).
- **agents-auth** (compose project `agents-platform`, image `agents-auth:local`, port `127.0.0.1:8201`) is `Up (unhealthy)`: its `/health` healthcheck (`wget` → `http://127.0.0.1:8201/health`, exit -1 = timeout) hangs because the stack's `agents-postgres` container **exited (127) ~20h ago** — the Node `src/server.js` process (pid 5973) is alive but starved on its DB pool. Root cause = dead DB, not a DCP code defect.
- **Scope verdict:** the entire `agents-platform` stack lives at `/opt/agents-platform` (a separate voice/persona-agent repo — ElevenLabs, agent-templates; not DCP, not Hermes). `grep -rE "8201|agents-auth|agents-net"` across `backend/ ops/ integrations/` returns **zero** real references (one coincidental `renterId = 8201` in a test). It is an orphaned side-project stack with no DCP dependents and no alerts in 20h of downtime.
- **Action:** none taken. Stopping another project's stack is Peter's call, not a DCP-platform task. Recorded so future sessions don't re-investigate.

### 2026-06-30 05:52 UTC — [commit `0e48bf2`](https://github.com/dhnpmp-tech/dcp-platform/commit/0e48bf2) — `chore(ops): commit load-bearing ops scripts + gitignore secrets/backups`

Included:
- **Ops scripts committed to main:** `ops/e2e-smoke.sh`, `ops/morning-digest.sh`, `safe-reload.sh` — these were untracked on prod (`/root/dc1-platform`) but cron + the docker-proxy watchdog depend on them; a clean re-deploy was silently losing them. Verified no hardcoded secrets (they read `TG_TOKEN`/`TG_DEV_BOT_TOKEN` from the env file).
- **`.gitignore` hardened:** now excludes `ops/.watchdog-env` (live TG bot token + renter master key — was sitting untracked in the repo working tree), `*.bak` / `*.bak.*` / `*.bak-*` / `.hotpatch-backups/` / `*.env.bak*` (hot-patch backup clutter), and `*.prepared` (inert feature stubs).
- **Prod filesystem cleaned:** 78 hot-patch `.bak` files + the `.hotpatch-backups/` dir deleted from prod (75 code backups + 3 secret-bearing `.env.bak*`). 5 `providers.db.bak*` database snapshots **kept** (no confirmed alternate backup — conservative). Prod `git status` noise dropped from 80+ untracked files to build artifacts only.
- **State change:** prod `.gitignore` synced to the new rules; `.watchdog-env` no longer appears in `git status`. No secrets committed.

### 2026-06-30 05:46 UTC — [merge `189dae6`](https://github.com/dhnpmp-tech/dcp-platform/commit/189dae6) + [`87aa7fa`](https://github.com/dhnpmp-tech/dcp-platform/commit/87aa7fa) — `chore(reconcile): merge security/staged-rollouts into main`

Included:
- Reconciles prod's `security/staged-rollouts` branch into `main` so deploy-from-main no longer regresses production. Prod had been running 10 commits ahead of main (hand-managed on the security branch); this brings those 10 commits into main as an explicit (non-fast-forward) merge commit, then integrates PR #663 on top. Deploy-from-main is now safe — the time-bomb (main lacking the staged funnel/security/invisibility work) is defused. Production itself is unchanged by the merge (it was already running the staged content).
- **Commits brought in (oldest→newest):** `2174dda` security staged-rollout runbooks + corrected dep overrides; `0f4129f` consolidate security tracker under `docs/security/` + `/dcp-security-audit` skill; `6949d01` AI-agent + unauth-API findings fixed live; `f623ed6` correct DCP-API-01 framing (latent, not realized); `28408cc` gate `/api/standup/latest` (DCP-API-02 partial); `d11dc9b` renter sees GPU TYPE only, never the provider machine name/id; `fb9e733` burst pod lifecycle (launch/stop/extend/sweep + teardown) + `is_burst` guards; `aa24192` zero-human renter signup + 402 wallet flow; `170b747` auth/dashboard URL fixes in job + digest email templates; `0135afd` track agent-register + add `payment_success` funnel stage.
- **Conflict resolution:** `backend/src/lib/renter-job-view.js` (add/add — both branches had the vendor-scrub; took the prod-proven staged version, all 7 scrub functions present) and `backend/src/routes/pods.js` (content — staged is a strict superset of main's: adds the `POST /notify-me` back-in-stock waitlist route + burst `is_burst` guards on top of main's launch route; verified main had zero lines unique to it, took staged wholesale).
- **State change:** `main` HEAD `6965817` → `87aa7fa`. No prod deploy performed (prod already runs the equivalent staged content; shipping main's 63 ahead-commits — analytics UI, GPU selector, hero — to prod is a separate smoke-tested release).

### 2026-06-17 09:00 UTC — [PR #617](https://github.com/dhnpmp-tech/dcp-platform/pull/617) — `fix(pods): honest workspace-persistence signalling (stop silent data loss)`

Included:
- `workspace_persisted` was hardcoded `true` (launch response + `toPodView`) with a "files are saved" note even for ephemeral pods — a live renter lost a workspace trusting it. Now derived from the HMAC-signed `task_spec` (`workspace_volume` present ⇔ paid volume), with a loud ⚠️ EPHEMERAL warning + the `POST /api/volumes` upsell surfaced on launch, status, and stop. No change to the paid-persistence gating — only to what the renter is told.

### 2026-06-17 08:52 UTC — [PR #616](https://github.com/dhnpmp-tech/dcp-platform/pull/616) — `fix(pods): reaper enforces backend's CURRENT deadline, not stale launch label (extend bug)`

Included:
- An extended pod (1h → 3h) was killed at the original 1h: `reap_expired_pod_containers` enforced the immutable `dcp.deadline` docker label stamped at launch, which extend cannot change. The reaper now queries the backend first and, for a live job, enforces `started_at + current max_duration_seconds (+grace)` — extend-aware; the launch label / hard-cap are used only as a fallback when the backend is unreachable. Mirrors the in-process hold-loop's existing re-read.

### 2026-06-15 15:17 UTC — [PR #615](https://github.com/dhnpmp-tech/dcp-platform/pull/615) — `docs(node3): correct board — ProArt can't do x4x4x4x4, use ASRock Taichi`

Included:
- Corrected the Node 3 build spec: the ASUS ProArt X870E-Creator bifurcates only x16 / x8/x8 / x8/x4/x4 (NOT x4x4x4x4), so the x16→4×x4 splitter plan fails on it. Replaced with the ASRock X670E Taichi Carrara (AED 2,512, Amazon.ae) / X870E Taichi Lite for KSA (SAR 1,991); added the x4-per-card AM5 16-lane limitation and a BIOS bench-test caveat.

### 2026-06-15 15:06 UTC — [PR #614](https://github.com/dhnpmp-tech/dcp-platform/pull/614) — `docs: Node 3 (4× RTX 3090) build spec — verified UAE/KSA sourcing`

Included:
- `docs/strategy/2026-06-15-node3-build-spec.md`: cheap-path build for the 4 acceptance-passed Palit GameRock 3090s with live-verified UAE (Amazon.ae) + KSA sourcing. Option B (new AM5 board + bifurcation splitter → 4× PCIe x4, ~AED 9–9.7k) vs Option A (used HEDT X399/X299, 64 native lanes). Rules from our own Gen-1 data: x4/card is fine, no x1 USB mining risers; power-limit each card to 285 W to run all four on a single AX1600i at 240 V.

### 2026-06-12 08:16 UTC — [PR #613](https://github.com/dhnpmp-tech/dcp-platform/pull/613) — `feat(benchmark): Arabic customer-service task benchmark (harness + dataset + baseline)`

Included:
- `docs/benchmarks/arabic-customer-service/`: 10 fixed Saudi CS tasks with per-task rubrics + a runnable harness (`run.mjs`) recording quality (LLM-judge), latency, and cost per candidate; honest by design (records DCP latency/outputs even without a judge key, never fabricates scores).
- Baseline (DCP qwen2.5:7b raw, 2026-06-12): 10/10 completed, ~7.8s avg latency; already caught a real failure (cs-01 drifted into machine-translated Chinese mid-reply), validating the fine-tune thesis. No public quality claims until judged vs a frontier model.

### 2026-06-12 08:15 UTC — [PR #612](https://github.com/dhnpmp-tech/dcp-platform/pull/612) — agentic access layer: MCP server + agent discoverability *(merged under a mislabeled "rename" squash title)*

Included:
- Official Model Context Protocol server `integrations/dcp-mcp` (`index.js`, `package.json`, `README.md`) exposing 9 tools — `list_models, chat, create_pod, get_pod, extend_pod, stop_pod, rent_volume, get_volume, get_balance` — so an MCP-capable agent (Claude, Cursor, custom) can run inference, rent GPUs, and manage storage via native tool calls.
- Agent discoverability files served at dcp.sa: `public/llms.txt` + `public/.well-known/ai-plugin.json`.
- `/v2/docs`: new bilingual "Persistent volumes" and "Used by agents/software" sections documenting the volume rent flow and the MCP/discovery path.

### 2026-06-12 08:02 UTC — [PR #611](https://github.com/dhnpmp-tech/dcp-platform/pull/611) — paid-only workspace persistence gating + monthly volume billing *(merged under a mislabeled "rename" squash title)*

Included:
- Pod launch attaches the stable `dcp-ws-r<id>` workspace volume + S3 coordinates ONLY when the renter holds an active rented volume (`activeVolumeForRenter`); without one the pod is ephemeral — persistence became a paid feature/upsell.
- `billRenterVolumes` monthly billing sweep in `jobSweep.js`: volumes billed monthly in advance (first month at rent time), a 7-day suspend grace on lapse that stops serving the volume to new pods but KEEPS the data, with `current_period_end` as the lapse marker.

### 2026-06-12 04:51 UTC — [PR #610](https://github.com/dhnpmp-tech/dcp-platform/pull/610) — `docs(strategy): rename to 'Answers from the Engine Room'`

Included:
- Renamed the defensible-position doc to `docs/strategy/2026-06-12-dcp-answers-from-the-engine-room.md`.

### 2026-06-12 04:41 UTC — [PR #609](https://github.com/dhnpmp-tech/dcp-platform/pull/609) — `docs(strategy): DCP defensible position — canonical answers to third-party feedback`

Included:
- `docs/strategy/2026-06-12-dcp-defensible-position.md`: four canonical answers (infrastructure thesis incl. three tiers + Apple-Silicon supply + time-to-GPU; Groq differentiation incl. developer-as-channel + CLOUD Act; Arabic-performance honesty; layered moat incl. SMB hardware flywheel), customer-facing founding reasons, per-persona reasons, a one-paragraph position, and a claims-discipline list.

### 2026-06-11 15:05 UTC — [PR #608](https://github.com/dhnpmp-tech/dcp-platform/pull/608) — `feat(volumes): rentable persistent storage on the Node-2 MinIO store`

Included:
- Paid, exclusive, in-Kingdom persistent volumes (10/20/30 GB at $0.05/GB/mo = 18.75 halala/GB/mo): `renter_volumes` table; `POST /api/volumes/rent`, `GET /api/volumes/me`, `DELETE /api/volumes`; per-renter MinIO bucket with a hard quota provisioned over the mesh; 100 GB pool ceiling; atomic first-month debit + refund-on-provision-failure.
- Pod launch injects the renter's S3 coords into `task_spec` when they hold an active volume; daemon `_pod_ws_sync()` mc-mirrors `/workspace` ↔ the renter's bucket (restore on launch, snapshot on teardown — cross-provider persistence, best-effort, never blocks launch/teardown).
- Frontend rent-a-volume panel (tiers + SAR price, pool availability, usage, release). All storage routed through `volume-store.js` → S3, so a future managed-KSA store swap is endpoint+creds only.

### 2026-06-11 12:21 UTC — [PR #607](https://github.com/dhnpmp-tech/dcp-platform/pull/607) — `feat(pods): renter-extendable pods — +30m/+1h/+2h, no restart`

Included:
- `POST /api/pods/:id/extend`: validates wallet, debits the incremental quote at the same per-GPU-second rate, pushes `max_duration_seconds` + `cost_halala` (reuses the prepaid path; early-stop refund still works); 24h hard ceiling.
- Daemon hold-loop re-reads `max_duration_seconds` each 7s poll (backend authoritative; the launch-time docker label is only the restart fallback), so an extended pod keeps running.
- Frontend +30m/+1h/+2h buttons on the rental countdown with charge feedback; same workspace + Jupyter token, zero interruption.

### 2026-06-10 21:20 UTC — [PR #606](https://github.com/dhnpmp-tech/dcp-platform/pull/606) — `fix(pods): stale-queued sweep must not cancel a pod the daemon already started`

Included:
- A live 8-hour training pod was cancelled mid-session: it had a running container but hadn't flipped to `running` yet (slow relay / daemon restart), so the 15-min stale-queued sweep treated it as abandoned and cancelled+refunded it. The sweep now skips any pod with `jupyter_host_port`/`access_url` set (relay up ⇒ container live) and the stale window widened 15 → 25 min for slow pickup / large image pulls.

### 2026-06-10 21:09 UTC — [PR #605](https://github.com/dhnpmp-tech/dcp-platform/pull/605) — `feat(pods): persistent /workspace reattach + rental countdown/warning + faster teardown`

Included:
- Persistent workspace (first pass): backend sends a stable `dcp-ws-r<id>` volume name; the daemon mounts it (create-on-first-use) and never removes it on teardown, so `/workspace` reattaches across the renter's pods; pod responses expose `workspace_persisted`.
- v2 pods console shows a live "rental ends in MM:SS" countdown and an amber <5-min warning.
- Daemon pod hold-loop polls every 7s (was 30s) so a renter stop / deadline frees the GPU + restores inference within ~7s.

### 2026-06-10 20:49 UTC — [PR #604](https://github.com/dhnpmp-tech/dcp-platform/pull/604) — `fix(pods): GET returns ends_at/seconds_remaining; DELETE no longer 500s`

Included:
- PR #601's edit put the rental-clock fields in the wrong handler: GET (where they belong) never returned them, and DELETE referenced an out-of-scope `endsAt` → ReferenceError → 500 *after* the settlement committed (money correct, response errored). Clock fields now computed in `toPodView` (GET source of truth); removed the dead/misplaced computation + out-of-scope fields from DELETE.

### 2026-06-10 20:29 UTC — [PR #603](https://github.com/dhnpmp-tech/dcp-platform/pull/603) — `fix(payments): card top-up uses Moyasar hosted invoice (was failing validation)`

Included:
- The v2 wallet posted `/payments` with `source:{type:'creditcard'}` and no card fields → Moyasar rejected every card top-up before a payment page ever showed. Top-up now creates a Moyasar hosted invoice (card + 3DS on checkout.moyasar.com, no PAN touches us, returns a hosted URL to redirect to).
- Webhook crediting fallback matches the renter's pending top-up by `renter_id + amount` and binds the real payment id (idempotent on retries). Removed a duplicate Moyasar webhook.

### 2026-06-10 20:12 UTC — [PR #602](https://github.com/dhnpmp-tech/dcp-platform/pull/602) — `chore: rebuild — bake NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY into the frontend`

Included:
- Card top-up went live: backend payment flags green (`payments_secret_ready` + `payments_webhook_ready`), webhook registered with Moyasar; this deploy embedded the publishable key for browser-side tokenization/3DS.

### 2026-06-10 19:50 UTC — [PR #601](https://github.com/dhnpmp-tech/dcp-platform/pull/601) — `fix(pods): findings from the first live renter test (Tareq, 2026-06-10)`

Included:
- VRAM theft: providers with an active pod are now excluded from the verification probe, v1 routing (legacy + engine lookup), and new-pod scheduling — the probe was re-warming Ollama (~10 GB) on the renter's dedicated card, invisible from inside the container.
- Overcharge clamp: daemon job-result settlement clamped at the prepaid quote for pods (live test had settled 251 on a 250 quote).
- Rental clock: `GET /api/pods/:id` returns `ends_at` + `seconds_remaining`; the launch response states duration (the reported "Jupyter crash" was a 60-min rental ending on schedule, unannounced).

### 2026-06-10 18:39 UTC — [PR #600](https://github.com/dhnpmp-tech/dcp-platform/pull/600) — `feat(landing): replace 6-stage HIW flow with a sovereignty boundary; move plumbing to /v2/architecture`

Included:
- The "How it works" 6-stage diagram (it read as a translation pipeline and gave skeptics ammunition — flagged by Tareq + Nexus) replaced with a sovereignty-boundary visual: prompt → verified Saudi GPU → answer inside a dashed KSA border, with AWS/Azure/OpenRouter shown severed outside. The real 6-stage lifecycle (incl. the honest frontier opt-in) moved to a new `/v2/architecture` page for technical/procurement buyers; sitemap updated.

### 2026-06-10 15:31 UTC — [PR #598](https://github.com/dhnpmp-tech/dcp-platform/pull/598) — `feat(provider): self-serve GPU pod pricing in the dashboard`

Included:
- Providers can now set what renters pay for their whole-GPU pods: a "GPU pod price" field (SAR per GPU-hour) on the provider settings page, saved via `POST /providers/preferences` as `pod_rate_sar_per_hour` (0.10–50; empty resets to the platform default of 1.20 SAR/hr) and stored as `cost_per_gpu_second_halala`.
- `GET /providers/me` now echoes the rate. Previously the rate existed only as a hardcoded schema default (0.25 halala/gpu-second = 9 SAR/hr) that no provider ever chose and nothing could change.
- New provider registrations default to NULL (= platform rate) instead of the legacy 0.25; existing providers keep their current value and can change it themselves.

### 2026-06-10 11:56 UTC — [PR #597](https://github.com/dhnpmp-tech/dcp-platform/pull/597) — `feat(email): on-brand editorial redesign for all 15 transactional emails + key removed from welcome`

Included:
- All 15 outgoing transactional emails (magic link, renter/provider welcome, job queued/started/completed/failed, withdrawal approved/rejected, node offline + 24h reminder, auto-top-up paid/declined/3DS, PDPL data export, daily digest) rebuilt through one shared branded shell (`emailLayout.js` + `emailTemplates.js`): editorial dark, serif headlines, mono fact-row cards, ghost-outline CTAs, bilingual EN + proper `dir="rtl"` Arabic, hidden preheaders, and an honest why-you-got-this footer. Outlook-safe (inline styles, presentation tables, 600px).
- Security: welcome emails no longer contain the plaintext API key — replaced with a sign-in button; all call sites updated and the dead legacy `services/email.js` (which also embedded keys) deleted.

### 2026-06-10 11:34 UTC — [PR #596](https://github.com/dhnpmp-tech/dcp-platform/pull/596) — `feat(phase0): pod billing on the prepaid contract + money-loop hardening`

Included:
- **Interactive GPU pods are now billed.** Launch pre-debits the full-duration SAR quote (402 with exact amounts when balance is short; debit compensated if the insert fails); stopping a pod settles transactionally — actual GPU-seconds charged (clamped at the quote), 75% credited to the provider, the rest refunded to the renter. Never-started pods cancel with a full refund. Live-verified on production: 30-min pod quoted 4.50 SAR → stopped at 40s → 0.10 SAR charged, 0.07 to the provider, 4.40 refunded, conservation exact.
- New `settleExpiredPods` sweep settles deadline-reached pods at the full quote, credits the provider, and tears down the VPS relay (also fixing the socat public-port leak on daemon-side expiry); stale queued pods cancel + refund after 15 minutes. Pods are excluded from the generic timeout-retry sweep — a rental deadline is a normal end, not a timeout.
- Concurrent-pod quota (default 2 active per renter, `DCP_MAX_ACTIVE_PODS`). Pod ids are no longer enumerable (renter folded into the lookup; 404 for both unknown and foreign ids).
- Providers heartbeating in `pending` state are now auto-approved on first verified heartbeat (`DCP_AUTO_APPROVE_PROVIDERS=0` restores manual review) — previously a provider showed "connected" in the wizard while silently excluded from routing, earning nothing.
- Closed a free-balance leak: v1 chat/completions queued-fallback jobs are settled exclusively by the idempotent v1 settlement; the generic job-result path no longer double-credits providers or refunds renter money that was never debited.
- The `?key=` deprecation `Sunset` header is pinned to 2026-07-15 (was a rolling now+30d that never arrived). The 402 top-up hint is now honest about whether card top-up is configured. Explicit `interactive_pod` platform rate: 2 halala/min ≈ 1.20 SAR/hr/GPU.

### 2026-06-10 08:53 UTC — [PR #595](https://github.com/dhnpmp-tech/dcp-platform/pull/595) — `docs(strategy): the path to the next level — 2026-06-10 audit synthesis`

Included:
- `docs/strategy/2026-06-10-path-to-next-level.md`: synthesis of a four-track production audit (live renter signup, three-persona provider funnel, code-gap sweep, sourced market research) into a persona seamlessness map, a three-phase plan with measurable gates, five quick wins with proof metrics, a prioritized defect backlog, and the investor story.

### 2026-06-10 08:50 UTC — [PR #594](https://github.com/dhnpmp-tech/dcp-platform/pull/594) — `fix(provider-funnel): unblock onboarding for all three OS personas + renter quickstart`

Included:
- **The provider install path worked again for the first time since the v2 flip.** `GET /api/providers/download/setup` read `dc1-setup-*` template filenames where only `dcp-setup-*` exist — the wizard's only actionable install command 404'd for Windows, macOS, and Linux alike. One-line fix; verified 200 for all three OSes with a real provider key. (Server-side, the companion 403 on `install.sh` was fixed by removing a stale nginx alias block.)
- Wizard OS cards stopped advertising artifacts that don't exist (`.msi`, `.dmg`); labels are honest and the Windows selection links the real signed `.exe`.
- `dcp.sa/setup` — hard-linked from the desktop app — redirected to the *renter* wizard; now routes to `/v2/provider-setup`.
- Renter quickstart and dashboard code samples used `allam-7b` (0 providers — the new user's first documented API call was a guaranteed 503); swapped to a verified-serving model.
- Streaming rate limit raised 5 → 30/min per renter: 5/min punished exactly the paying behavior (chat UIs, agent loops). Stale limiter test expectations aligned with actual limits.

### 2026-06-10 08:32 UTC — [PR #593](https://github.com/dhnpmp-tech/dcp-platform/pull/593) — `fix(landing): marketplace gates rewritten for humans`

Included:
- The three §01 capacity gates now lead with a human headline ("We can reach it / It really answers / It serves what it claims") with the code token kept as a small chip signature; plain-language intro paragraph; body text bumped to a readable size and measure. The gates are the literal listing conditions — they now read as a promise instead of a SQL WHERE clause.

### 2026-06-10 08:24 UTC — [PR #592](https://github.com/dhnpmp-tech/dcp-platform/pull/592) — `fix(landing): door copy — RTX-class instead of hardcoded 24 GB`

Included:
- The hero's "Rent a whole GPU" door pinned today's fleet spec (24 GB) into permanent copy; the pod scheduler places on any verified machine ≥8 GB, so the line goes stale the day the fleet changes. Now "A whole RTX-class GPU, dedicated to you" (EN + AR).

### 2026-06-10 08:04 UTC — [PR #591](https://github.com/dhnpmp-tech/dcp-platform/pull/591) — `fix(landing): ship the CSS for the three doors, hero demo, and vision section`

Included:
- PR #590's components referenced `.door-grid` / `.demo-box` / `.vision-*` classes whose stylesheet block was lost behind a failed patch chain — they rendered as unstyled text. Pure CSS addition restoring the intended three-door cards, demo widget, and vision stat strip.

### 2026-06-10 07:05 UTC — [PR #590](https://github.com/dhnpmp-tech/dcp-platform/pull/590) — `feat(landing): three doors + live hero demo + SAR pricing + vision section`

Included:
- Hero rebuilt around one plain sentence ("Saudi Arabia's open GPU cloud") and three self-selection doors: Use AI models → playground, Rent a whole GPU → containers, Earn with your GPU → provider path.
- **"Proof you can touch":** a hero widget that sends one prompt to a real verified Saudi GPU via the new rate-limited `POST /api/public/demo/chat` (6/min + 40/day per IP, 280-char cap, server-held internal key, honest 503 when no capacity is serving) and renders the answer with a verification-chain receipt line.
- Marketplace prices now display **SAR** (converted at the same 3.75 peg the backend uses) — never USD; a compute-twin strip under the model table points at whole-GPU rental.
- New unnumbered Vision section: live mesh numbers labeled as this-minute truth plus a NOW / NEXT / THEN roadmap with no invented dates.

### 2026-06-09 21:15 UTC — [PR #589](https://github.com/dhnpmp-tech/dcp-platform/pull/589) — `feat(web): /v2/containers — GPU Pods product page in the app shell, static one-pager retired`

Included:
- New `/v2/containers` page with proper v2 chrome (docs-style header, home design system, EN/AR, live capacity from `/api/health/detailed`): hero with live proof → the 60-second path with the real CLI → customer-voice value cards → honest "what runs well on 24 GB" framing → a "promised today / not promised yet" honesty section (host-pinned, Docker-not-gVisor, small fleet).
- `public/gpu-containers.html` deleted; `/containers`, `/gpu-containers`, and the old shared `/gpu-containers.html` all redirect to the new page; sitemap updated; landing §02 brief CTA repointed.

### 2026-06-09 20:53 UTC — [PR #588](https://github.com/dhnpmp-tech/dcp-platform/pull/588) — `fix(landing): §02 pod cards rewritten in customer voice + technical dog-whistles`

Included:
- The four pod cards described implementation (`whole_gpu`, `jupyter_tls_ssh`) instead of buyer benefits. Each now leads with the customer outcome ("From idea to training in a minute", "The whole card is yours", "It ends when you said it ends", "Verified Saudi machines only") while the mono key-line carries the infrastructure credibility signal (`--gpus all · pinned driver`, `hard deadline · restart-proof reaper`). Containers brief repositioned as forwardable collateral.

### 2026-06-09 20:40 UTC — [PR #587](https://github.com/dhnpmp-tech/dcp-platform/pull/587) — `feat(landing): §02 Raw compute — GPU pods as the second product + honest provider_count`

Included:
- New §02 landing section presenting GPU pods as DCP's second product (whole-GPU pods, deadline-enforced, with CTAs to the console and the containers brief); sections renumbered §02–09 → §03–10 in EN and AR; GPU Pods added to the header nav, mobile menu, and footer; the §01 callout reframed ("Tokens for answers — or the whole GPU for control").
- `fix(catalog)`: `deduplicateModelAliases` folded alias rows by **summing** `provider_count`, double-counting the same physical provider once per alias form (a lone provider showed `provider_count: 2` for `qwen3:8b`). Folding is now by max; 43 catalog tests updated and green.

### 2026-06-09 20:20 UTC — [PR #586](https://github.com/dhnpmp-tech/dcp-platform/pull/586) — `feat(landing): real live marketplace in §01 — earned-online models from /v1/models`

Included:
- The §01 marketplace section now renders the actual live catalog — every model with an earned-online `available=true` verdict from `/v1/models` (name, context, quantization, price, provider count), refreshed every 60s — with an honest empty state routing to `/status` when nothing serves.
- The capacity bar's hardcoded `/4` denominator replaced with real `serving / online`; same-origin `/v1/models` rewrite added. The older `/api/models` endpoint was deliberately not used: it claims availability for models the verification layer says have no providers.

### 2026-06-09 20:08 UTC — [PR #585](https://github.com/dhnpmp-tech/dcp-platform/pull/585) — `fix(security): rotate leaked funded renter master key, purge from repo`

Included:
- The funded benchmark renter's master API key (~100M SAR balance) was committed in `docs/dcp-renter-experience.sh` and referenced in two test docs. Key rotated in production (old key rejected, new key verified); the script now requires `DCP_RENTER_KEY` from the environment; old key redacted from the docs.

### 2026-06-09 19:33 UTC — [PR #584](https://github.com/dhnpmp-tech/dcp-platform/pull/584) — `fix(audit-gaps final): renter-console honesty + PROV-9 provider-key hashing (backward-compat)`

Included:
- Renter console honesty batch (RENT-6/10/11/18/19): invoice CSV download no longer leaks the renter API key in the URL querystring; the dead "Switch workspace" control removed from keys/usage/PodShell; keys-page wallet rail labels and API pill fixed for data honesty.
- PROV-9 foundation: provider API-key hashing with a hash-first lookup and a live-fleet-safe plaintext fallback (heartbeat + `GET /me` converted; plaintext column intentionally retained for daemon back-compat during migration).

### 2026-06-09 19:17 UTC — [PR #583](https://github.com/dhnpmp-tech/dcp-platform/pull/583) — `fix(audit-gaps): close workable security + honesty gaps (SITE-6/7/8 auth + 16 more)`

Included:
- SITE-6/7/8: the `/v2/renter/*` route-guard bypass closed; the forgeable role cookie replaced with an HMAC-signed session cookie (`DC1_SESSION_SECRET`); the dead renter signup fixed; forged-cookie rejection verified live.
- Renter sub-key scopes enforced on the renter API family; empty over-reasoned completions are no longer billed (SITE-15); the legacy `POST /providers/withdraw` gated behind the admin token; plus 13 further audit fixes across the public site and consoles.

### 2026-06-09 17:17 UTC — [PR #582](https://github.com/dhnpmp-tech/dcp-platform/pull/582) — `feat(daemon-health): accepting_jobs heartbeat gate (shadow mode) — the zombie-provider cure`

Included:
- The daemon's `accepting_jobs` health signal ("an engine answers right now") is ingested and persisted from every heartbeat and logged in SHADOW mode — divergences are recorded ("under enforcement this would be NON-ROUTABLE") without affecting routing yet, so the flip can be made on evidence once fleet daemons report the field.

### 2026-06-09 16:39 UTC — [PR #581](https://github.com/dhnpmp-tech/dcp-platform/pull/581) — `feat(pods): restart-proof lifecycle (reaper+deadline) + HTTPS Jupyter + compute-scope gate`

Included:
- Closed the "pod runs forever" failure class (a real pod had run 29h past its rental after a daemon restart orphaned it): pods now carry a self-enforced deadline stamped as docker labels (`dcp.pod`, `dcp.job_id`, `dcp.deadline`), hard-capped at 24h, and a restart-proof reaper scans real docker state every poll cycle and at daemon startup.
- The public Jupyter relay now terminates TLS using the `api.dcp.sa` certificate — the notebook token no longer crosses the internet in cleartext; pod `access_url` flipped to `https://`.

### 2026-06-09 14:45 UTC — [PR #580](https://github.com/dhnpmp-tech/dcp-platform/pull/580) — `fix(docs+web): real CLI install ('pip install dc1' was broken — not on PyPI)`

Included:
- The containers one-pager and renter quickstart instructed `pip install dc1`, which does not exist on PyPI. Replaced with the working tarball install (`curl -sL …/dc1-sdk.tar.gz | tar xz`).

### 2026-06-08 18:49 UTC — [PR #579](https://github.com/dhnpmp-tech/dcp-platform/pull/579) — `fix(web): containers page — precise failover claim (pods are host-pinned)`

Included:
- Removed the implied failover claim from the containers page: pods live and die with their host machine; copy now states host-pinning honestly.

### 2026-06-08 18:45 UTC — [PR #578](https://github.com/dhnpmp-tech/dcp-platform/pull/578) — `feat(web): containers page — add reliability/trust section`

Included:
- Trust section on the GPU containers page: health-gated scheduling, server-measured billing, health-checked hosts — claims matched to what the code enforces.

### 2026-06-08 17:32 UTC — [PR #577](https://github.com/dhnpmp-tech/dcp-platform/pull/577) — `fix(site): public-surface honesty — catalog filter, false-claim strip, legal + auth polish`

Included:
- Public catalog and marketing surfaces aligned with verifiable reality: fabricated benchmark numbers and ZATCA/SLA/PDPL overclaims stripped; the public model catalog filtered to what the verification layer can defend; quickstarts pinned to served models; legal and auth-page polish.

### 2026-06-08 16:37 UTC — [PR #576](https://github.com/dhnpmp-tech/dcp-platform/pull/576) — `fix(provider): audit batch — dead controls, earnings cap, route shadow, honest copy`

Included:
- Provider console dead controls wired (kill switch, sign-out, pause/resume); the gpu-seconds/gpu-count earnings-inflation hole capped (self-reported values clamped to the registered profile and server wall-clock); a shadowing route fixed; provider-facing copy made honest about what is and isn't enforced on the node.

### 2026-06-08 15:25 UTC — [PR #575](https://github.com/dhnpmp-tech/dcp-platform/pull/575) — `feat(web): GPU Containers shareable page + /renter/pods → v2 redirect`

Included:
- Shareable GPU Containers one-pager published (later replaced by the in-app `/v2/containers` page in PR #589); `/renter/pods` now 307-redirects to the v2 pods console.

### 2026-06-08 14:55 UTC — [PR #574](https://github.com/dhnpmp-tech/dcp-platform/pull/574) — `fix(email): don't over-claim requeue in the node-offline email`

Included:
- The node-offline email claimed jobs would be requeued in cases where they aren't; the claim now matches actual requeue behavior.

### 2026-06-08 14:37 UTC — [PR #573](https://github.com/dhnpmp-tech/dcp-platform/pull/573) — `fix(renter-dashboard): audit batch — security, scopes, honest data, dead controls`

Included:
- 12-file renter dashboard batch: header-based auth (closing the `?key=` URL-leak vector client-side), a new `compute` scope with pod-launch enforcement, honest spend/usage/invoice data (fabricated VAT/ZATCA artifacts stripped), real SAR cost metering including synthetic usage for streams without provider usage blocks, account-wide budget cap via `PUT /me/budget`, and dead controls removed.

### 2026-06-08 12:16 UTC — [PR #572](https://github.com/dhnpmp-tech/dcp-platform/pull/572) — `fix(invoices): legacy renter-id route was shadowing /me/invoices (every renter's invoices 400'd)`

Included:
- A legacy route registered ahead of `/me/invoices` swallowed the path and returned 400 for every renter's invoice list. Route ordering fixed; verified live on production.

### 2026-06-08 11:46 UTC — [PR #571](https://github.com/dhnpmp-tech/dcp-platform/pull/571) — `fix(renter): wire the dead sign-out button across the dashboard`

Included:
- The sign-out control across the renter dashboard pages did nothing; it now clears the session (key + signed cookie) and routes to the auth page on all renter pages.

### 11:00 UTC — [PR #570](https://github.com/dhnpmp-tech/dcp-platform/pull/570) — `fix(renters): API key management accepts master or admin-scoped keys`

Included:
- Fixed the renter API-keys page where a renter logged in with a scoped sub-key got `Invalid or inactive master API key` on every key operation. The `GET/POST/DELETE /api/renters/me/keys` handlers used a master-key-only lookup while login and the rest of the renter API already accept scoped sub-keys via `resolveRenterIdByKey`. All three handlers now resolve via the existing `getRenterAuthContext()` (master or active scoped key): list works for any valid renter key; create/revoke require the master key or an `admin`-scoped key, with a clear actionable error instead of an opaque 403.
- Removed the hard-coded "3" sidebar badge on the API-keys nav item (keys / dashboard / invoices) and drove it from the real active-key count on the keys page. Key secrets remain show-once (industry standard); the list shows metadata + a masked prefix.

### 10:24 UTC — [PR #569](https://github.com/dhnpmp-tech/dcp-platform/pull/569) — `feat(compute): interactive GPU pods (Vast.ai-style) + driver-auto-update resilience`

Included:
- Renter-launchable **interactive GPU pods** on the existing job rails (`interactive_pod` job type): a pod is a container with full GPU passthrough, root SSH + JupyterLab, reachable over the WireGuard mesh via a socat relay. Launchable via CLI, raw API (`GET/POST/DELETE /api/pods`), and the v2 web console.
- Renter image choice: pre-baked `pytorch | vllm | cuda | ubuntu` images (boot in seconds) or any Docker reference (sshd injected on the fly); `dcp pod create --image`.
- Inference↔compute mutex: a compute pod preempts the provider's own inference (drains llama.cpp / vLLM / Ollama and restores it on teardown via a liveness-gated reaper), so a renter gets the whole GPU and the provider's models come back automatically.
- Scheduler hardening: `resolvePodProvider` only schedules onto providers the daemon reports as `docker` + `cuda_available` + `gpu_healthy` with enough VRAM, excluding non-CUDA / Apple-Silicon and GPUs broken by a driver mismatch.
- Driver-auto-update resilience: pin the NVIDIA driver at install time, a `gpu_nvml_healthy()` heartbeat probe with a critical alert when the kernel module and userspace library diverge, and a scheduler guard that skips unhealthy GPUs — closing the unattended-upgrade failure mode that silently broke a provider's GPU.
- `dc1` Python SDK + `dcp` CLI (`pod create/list/get/stop`), stdlib-only, served at `/installers/dc1-sdk.tar.gz`; v2 GPU Pods console page; renter quickstart + verification docs.

### 13:02 UTC — [PR #557](https://github.com/dhnpmp-tech/dcp-platform/pull/557) — `feat(v1): engine-keyed reasoning control + response normalizer + playground toggle`

Included:
- Replaced the fragile endpoint-string guess + single `think:false` knob (which backfires on Ollama — reasoning leaks into `content` or the response empties) with engine-keyed reasoning control: resolve the engine type (`ollama`/`vllm`/`llamacpp`) from `provider_engines`, inject the model-native `/no_think` directive for Qwen-family models, set `chat_template_kwargs.enable_thinking:false` for vLLM, and never send Ollama `think:false`.
- Added a response normalizer on both the non-stream and streaming paths that strips `<think>` blocks and the separated reasoning field (`reasoning`/`reasoning_content`/`thinking`) out of renter-visible `content`, with a stateful streaming `<think>` stripper that survives tags split across SSE chunks.
- Captured `provider_engines.engine_version` in the heartbeat (nullable, back-compat) for version-sensitive knob decisions.
- Added a "Show reasoning" toggle to the v2 renter playground (default off) that sends `enable_thinking` and renders a separated reasoning panel; answer and reasoning are never merged.
- Added 25 unit tests (engine resolution, `/no_think` immutability, field canonicalization, cross-chunk stream stripper) and extended the playground static regression. Verified live against an Ollama provider.

### 10:00 UTC — [PR #556](https://github.com/dhnpmp-tech/dcp-platform/pull/556) — `fix(health): report live catalog and v1 usage counts`

Included:
- Updated `/api/health/detailed` so `models.catalog_count` reads active `model_registry` rows, matching the public `/api/models` catalog source instead of optional Arabic portfolio metadata.
- Updated detailed health metering to read the canonical `usage_events` ledger written by `/v1/chat/completions`, with the older `serve_sessions` table retained only as a fallback.
- Added static regressions so health cannot drift back to a missing portfolio file or miss v1 usage tokens again.

### 09:46 UTC — [PR #555](https://github.com/dhnpmp-tech/dcp-platform/pull/555) — `fix(providers): verify served model from live endpoint`

Included:
- Updated earned-provider verification to probe a model returned by the provider's live `/v1/models` response instead of blindly using the first cached DB model when the cached list is stale.
- Kept the cached-model preference only when `/v1/models` confirms that cached id is actually served, so healthy providers are not failed by old catalog metadata.
- Added focused regressions for stale cached model selection, confirmed cached model selection, and the no-reported-model fallback.

### 09:26 UTC — [PR #554](https://github.com/dhnpmp-tech/dcp-platform/pull/554) — `fix(v1): restore engine-backed model coverage`

Included:
- Updated `/v1/models` provider counting to include reachable `provider_engines` rows when multi-engine routing is enabled, de-duplicated by provider ID so engine-backed providers are visible without inflating capacity.
- Added a guarded compatibility bridge for legacy provider daemons that still report `cached_models` or `vllm_models` but do not yet send the newer `engines` heartbeat payload.
- The bridge only writes legacy `providers.cached_models` when the provider has no existing `provider_engines` rows, so engine-aware providers keep the newer engine table as source of truth.
- Preserved existing `vllm_models` unless the heartbeat supplies a `vllm_models` list, and kept bridge failures warn-only so heartbeats cannot fail over catalog coverage bookkeeping.
- Added targeted regressions for engine-backed catalog counts and the legacy bridge guardrails.

### 09:09 UTC — [PR #553](https://github.com/dhnpmp-tech/dcp-platform/pull/553) — `feat(v2): add admin earned-serving proof hint`

Included:
- Added backend-provided, non-mutating operator probe hints to `/api/admin/fleet/probe-evidence` so founders and agents can distinguish reachable endpoints from missing earned inference proof.
- Added a copy-ready proof command packet to `/v2/admin` Serving recovery that uses `DCP_API_BASE`, `DCP_MODEL_ID`, and `DCP_RENTER_API_KEY` placeholders instead of embedding secrets.
- Made the next serving exit criteria explicit in the admin workflow: `/v1/models` must show `provider_count > 0`, a one-token completion must succeed, and metering must record the request before public capacity language changes.
- Added static regressions for the proof-command contract and the v2 admin rendering/styling.

### 08:58 UTC — [PR #552](https://github.com/dhnpmp-tech/dcp-platform/pull/552) — `fix(v1): keep stale providers out of model counts`

Included:
- Tightened `/v1/models` provider counts so stale-heartbeat providers do not inflate `provider_count`, even when their cached model list matches a catalog model.
- Kept existing catalog alias matching intact, including BGE-M3 and HF-style model IDs, so a fresh verified provider can still make the renter playground discoverable.
- Made the provider-count scan conservative if provider rows cannot be read: the model catalog stays available, but provider counts fall back to zero instead of throwing.
- Added a focused `/v1/models` regression for alias-matched cached models and stale-heartbeat exclusion.

### 08:50 UTC — [PR #551](https://github.com/dhnpmp-tech/dcp-platform/pull/551) — `fix(v2): remove playground demo wording`

Included:
- Removed the remaining demo-labeled sample prompt from the v2 renter playground so the console no longer suggests a mock/demo flow.
- Added a static regression that fails if demo wording is reintroduced to the v2 renter playground.
- Kept the real catalog and inference behavior unchanged: model options still require `provider_count > 0`, and inference still requires a real renter key.

### 08:45 UTC — [PR #550](https://github.com/dhnpmp-tech/dcp-platform/pull/550) — `feat(v2): surface admin serving blocker reason`

Included:
- Added the same serving-capacity counters and machine-readable capacity reason to the protected `/api/admin/health` endpoint that public health already exposes.
- Added a Live capacity reason packet to `/v2/admin` Launch readiness so founders and agents can see whether the blocker is fresh heartbeat, endpoint reachability, earned inference, or model coverage.
- Kept public capacity changes gated behind all four serving gates and continued to keep provider repair, routing, daemon, WireGuard, and marketplace-copy mutations outside the v2 packet.
- Added static regressions for the admin health capacity contract, v2 capacity reason rendering, and capacity gate styling.

### 08:28 UTC — [PR #549](https://github.com/dhnpmp-tech/dcp-platform/pull/549) — `fix(v2): remove stale provider setup proof claims`

Included:
- Removed the hard-coded provider setup throughput claim and replaced it with proof-gated copy that only promises measured tokens per second after daemon and backend verification.
- Replaced tier-language that implied reliability changes the provider payout split with copy that keeps reliability separate from the published 85/15 split.
- Stopped the provider setup OS selector from claiming a browser-detected device and changed it to a plain selected installer target.
- Replaced the auto-playing installer success sequence with a pending installer plan so the page no longer claims hardware scan, engine install, model download, or tunnel success before the daemon reports back.
- Added static regressions for stale throughput, fake device detection, fake installer progress, and payout-split wording.

### 08:15 UTC — [PR #548](https://github.com/dhnpmp-tech/dcp-platform/pull/548) — `feat(v2): add admin finance handoff packet`

Included:
- Added a read-only Money review handoff inside `/v2/admin` so founders, operators, and agents can see the human owner, verified payments console, agent summary role, evidence note, and stop rule for the highest-priority finance blocker.
- Derived the handoff from existing finance evidence already loaded by v2 admin: refund requests, provider payouts, billing exceptions, auto-top-up issues, reconciliation drift, and pending withdrawals.
- Included a copy-ready finance evidence note that summarizes the queue type, subject, amount, status, reference, and current review detail before a human uses the verified payments console.
- Kept money mutation boundaries explicit: no refund approval/rejection, payout sync, balance edit, credit grant, payment confirmation, or auto-top-up retry happens from the v2 handoff packet.
- Added static regressions for the finance handoff model, verified-console label, copy-ready evidence note, mutation boundary language, and responsive styling.

### 08:02 UTC — [PR #547](https://github.com/dhnpmp-tech/dcp-platform/pull/547) — `feat(v2): add admin serving handoff packet`

Included:
- Added a read-only Provider recovery handoff inside `/v2/admin` so founders, operators, and agents can see the owner, verified console, agent role, evidence note, and stop rule for the selected serving proof target.
- Derived the handoff from canonical `/admin/fleet/probe-evidence` rows already loaded by the Serving proof packet; no new backend route or write path was added.
- Included a copy-ready mission evidence note that summarizes provider id, provider label, recovery focus, route/inference/model/publication gate states, and the next recommended action.
- Kept recovery mutation boundaries explicit: no daemon restart, WireGuard edit, endpoint edit, routing change, or public marketplace language change happens from the v2 handoff packet.
- Added static regressions for the handoff model, copy-ready evidence note, verified-console label, mutation boundary language, and responsive styling.

### 07:51 UTC — [PR #546](https://github.com/dhnpmp-tech/dcp-platform/pull/546) — `feat(v2): add admin action ledger`

Included:
- Added a read-only Action ledger to `/v2/admin` that combines recent admin audit rows with the 24-hour mission pulse.
- Summarized admin writes, mission changes, and agent touches so founders can see who changed what before opening the raw audit feed.
- Kept the ledger evidence-only from `/admin/audit` and `/mission/pulse`; it does not replay writes, approve providers, send notifications, move money, or repair providers.
- Added static regressions for the ledger data model, evidence-source contract, mutation boundary language, rail entry, and responsive styling.

### 07:39 UTC — [PR #545](https://github.com/dhnpmp-tech/dcp-platform/pull/545) — `feat(v2): add provider approval decision envelopes`

Included:
- Upgraded the `/v2/admin` provider approval desk from a static decision-envelope note into explicit approve/reject decision envelopes.
- Each provider approval envelope now shows the guarded backend route, human-approval gate, evidence requirement, audit result, and readiness state before the operator acts.
- The reject envelope mirrors the existing button guard and stays in a watch state until a rejection reason has at least 8 characters.
- Kept provider approval behavior on the existing audited `PATCH /admin/providers/:id/approval-decision` route; no new provider repair, routing, payment, or control-plane actions were added.

### 07:30 UTC — [PR #544](https://github.com/dhnpmp-tech/dcp-platform/pull/544) — `feat(v2): add admin mission action envelopes`

Included:
- Added a mission action-envelope preview to `/v2/admin` before guarded task writes so founders, operators, and agents can see the route, permission gate, evidence requirement, audit output, and readiness state before acting.
- Derived separate envelopes for status moves, reassignment, and admin notes from the selected task, target status, target assignee, evidence note, and strict-vs-legacy write posture.
- Kept the existing guarded mission routes and write boundaries intact; no new create/delete, payment, provider repair, or control-plane actions were added.
- Added static regressions for the envelope model, strict/legacy permission labeling, evidence readiness language, and responsive envelope styling.

### 07:20 UTC — [PR #543](https://github.com/dhnpmp-tech/dcp-platform/pull/543) — `fix(v2): keep admin actions in the v2 workspace`

Included:
- Kept `/v2/admin` primary task, readiness, finance, support, incident, fleet, and lane actions anchored inside the v2 command center instead of sending operators to legacy `/admin/*` pages.
- Removed the muted rail shortcut to the legacy admin console and the provider-detail escape hatch that had no v2 route equivalent yet.
- Preserved the existing verified backend reads and guarded mission/provider writes; this change only adjusts visible navigation and operator workflow flow.
- Added static regressions that forbid visible legacy admin links, generated legacy action links, and legacy prefetch handling inside the v2 admin surface.

### 07:01 UTC — [PR #542](https://github.com/dhnpmp-tech/dcp-platform/pull/542) — `feat(v2): add admin session lock`

Included:
- Added a visible Lock action to `/v2/admin` so operators can clear the local admin key from a shared or agent-assisted browser session.
- The lock action removes `dc1_admin_token`, returns the command center to the missing-key state, and routes back to the existing v2 admin sign-in flow.
- In-flight admin loads are now generation-gated so a stale dashboard refresh cannot restore the ready view after Lock clears the token.
- Kept the control local-only: no backend session mutation, provider action, payment action, or operational write is triggered.
- Added static regressions for token clearing, missing-key state transition, sign-in redirect reuse, and scoped lock-button styling.

### 06:52 UTC — [PR #541](https://github.com/dhnpmp-tech/dcp-platform/pull/541) — `feat(v2): add admin operator brief`

Included:
- Added a read-only Operator brief near the top of `/v2/admin` that turns loaded admin evidence into a daily operating posture for founders and agents.
- Prioritized serving proof, money queue, support evidence, mission ownership, and incident watch into owner-labeled next actions.
- Elevated serving proof as the sprint blocker while public capacity is not ready, with direct links back to the evidence sections instead of unsafe actions.
- Kept the brief as prioritization only; repairs, money movement, provider actions, and public capacity changes remain in verified consoles.
- Added static regressions for operator-brief evidence derivation, highest-priority selection, read-only policy copy, and scoped styling.

### 06:42 UTC — [PR #540](https://github.com/dhnpmp-tech/dcp-platform/pull/540) — `feat(v2): add admin serving proof packet`

Included:
- Added a read-only Serving proof packet to `/v2/admin` so founders and agents can see the next provider target from canonical probe evidence.
- Split serving readiness into route proof, inference proof, model proof, and publication proof so endpoint reachability can no longer be confused with usable inference capacity.
- Added concrete exit criteria before public capacity language changes: `verified_online=1`, `provider_count > 0`, and one metered inference proof.
- Kept the workflow evidence-only and linked back to the verified fleet console; no provider repair, routing, endpoint, catalog, or daemon mutation actions were added.
- Added static regressions for proof-target selection, proof checklist copy, exit criteria, and scoped styling.

### 06:28 UTC — [PR #539](https://github.com/dhnpmp-tech/dcp-platform/pull/539) — `feat(v2): add admin probe evidence`

Included:
- Added a protected read-only `/api/admin/fleet/probe-evidence` endpoint that exposes canonical provider probe gates for serving recovery.
- Merged endpoint reachability, endpoint probe failures, earned-online verifier state, cached-model evidence, WireGuard freshness, and heartbeat age into one bounded admin evidence feed.
- Wired the v2 admin Serving recovery workflow to the new probe-evidence feed, with fallback to the existing fleet-health feed when canonical evidence is unavailable.
- Added summary counters for endpoint-route blockers, earned-inference blockers, inference timeouts, model coverage gaps, ready providers, and recovery focus groups.
- Kept the endpoint evidence-only: no live probes, provider repairs, endpoint edits, routing flips, or catalog state mutations run from this v2 surface.
- Added static regressions for the backend evidence contract, v2 admin wiring, bounded preview rendering, evidence timestamp copy, and unsafe mutation boundaries.

### 06:14 UTC — [PR #538](https://github.com/dhnpmp-tech/dcp-platform/pull/538) — `feat(v2): add admin serving recovery`

Included:
- Added a read-only v2 admin serving recovery workflow for the zero verified-serving provider state.
- Derived recovery focus from fleet evidence: endpoint reachability, earned-online inference probes, timeout errors, model coverage, WireGuard freshness, heartbeat freshness, and job/runtime stability.
- Added a recovery playbook for proving `/v1/models`, one-token inference, and model alias coverage before changing catalog or public capacity language.
- Kept daemon restarts, tunnel changes, endpoint edits, routing changes, and public capacity flips outside v2 until audited recovery actions exist.
- Added static regressions for recovery queue wiring, mutation boundaries, and scoped serving-recovery styling.

### 06:02 UTC — [PR #537](https://github.com/dhnpmp-tech/dcp-platform/pull/537) — `feat(v2): add admin support operations`

Included:
- Added a protected read-only `/api/admin/support/contacts` endpoint for saved public support submissions, with bounded pagination, category summary, and recent-24h counts.
- Added a v2 admin support desk that correlates contact submissions with bounded renter, job, and payment evidence for customer triage.
- Kept support actions read-only in v2 admin; suspensions, credits, balance edits, job cancel/requeue, refunds, and key rotation stay in verified consoles until an audited action envelope exists.
- Removed the remaining prototype-style "Demo" label from the v2 home mobile menu and replaced it with a concrete quickstart label.
- Added static regressions for support-contact read contracts, v2 support UI wiring, mutation boundaries, and public demo-language cleanup.

### 05:45 UTC — [PR #536](https://github.com/dhnpmp-tech/dcp-platform/pull/536) — `fix(public): clarify serving capacity and remove stale savings claims`

Included:
- Added explicit heartbeating, endpoint-reachable, and verified-serving provider counts to `/api/health` and `/api/health/detailed` so operators can distinguish daemon heartbeat from usable inference capacity.
- Added a machine-readable health capacity reason and serving gates for zero-capacity states instead of implying WireGuard alone explains every empty marketplace state.
- Removed the remaining unsourced competitor-savings claims and fixed comparison table from the legacy model catalog page.
- Replaced the shared footer's stale "50+ models" claim with non-numeric catalog readiness copy.
- Reworded the v2 enterprise classification bullet so the public homepage does not imply a specific NDMO compliance artifact before that pack exists.
- Added static regressions for public honesty copy and health capacity wording.

### 05:29 UTC — [PR #535](https://github.com/dhnpmp-tech/dcp-platform/pull/535) — `feat(v2): add admin runbook queue`

Included:
- Added a read-only founder runbook queue to `/v2/admin` that translates launch, fleet, finance, incident, access, and mission signals into owner-specific next actions.
- Derived runbook evidence from the already-loaded admin feeds instead of adding a new backend endpoint or static operating checklist.
- Labeled each runbook with owner, evidence, severity, and agent permission class so humans and agents can coordinate without guessing who should act next.
- Kept repairs, money movement, deploys, provider actions, notification sends, and control-plane writes out of the runbook surface; verified consoles remain the action boundary.
- Added static regressions for runbook presence, public-capacity gating, finance/incident/access runbooks, no unsafe mutation endpoints, and scoped runbook styling.

### 05:21 UTC — [PR #534](https://github.com/dhnpmp-tech/dcp-platform/pull/534) — `feat(v2): add admin launch readiness`

Included:
- Added a first-class founder go/no-go launch readiness section to `/v2/admin` for public-capacity, system-health, finance, security, queue, demand, and incident blockers.
- Wired the section to existing read-only admin evidence feeds, including `/api/admin/metrics` and `/api/admin/demand`, without adding new mutation routes.
- Made public capacity readiness depend on earned serving capacity, endpoint/model readiness, and fleet evidence before the team can safely claim marketplace availability.
- Kept provider repair, payment actions, deploys, and control-plane runs out of this v2 surface; the section is decision support only.
- Added static regressions for launch readiness wiring, public-capacity honesty copy, read-only policy copy, no unsafe mutation endpoints, and scoped launch styling.

### 05:10 UTC — [PR #533](https://github.com/dhnpmp-tech/dcp-platform/pull/533) — `feat(v2): add admin incident command`

Included:
- Added a first-class read-only incident command section to `/v2/admin` for merged incident timeline rows, recent daemon/job errors, and control-plane capacity signals.
- Wired the section to the existing `/api/admin/incidents/feed`, `/api/admin/errors`, and `/api/admin/control-plane/signals` feeds without adding new operational mutation paths.
- Added severity summaries, row-level incident evidence, control-plane recommendation context, and links back to the verified incidents/fleet consoles for safe follow-up.
- Kept control-plane snapshots, prewarm runs, run-cycle triggers, and daemon repair out of v2 admin until each action has explicit owner, approval, audit, and rollback rules.
- Added static regressions for incident feed wiring, row normalization, read-only policy copy, no control-plane mutation endpoints, and scoped incident styling.

### 04:59 UTC — [PR #532](https://github.com/dhnpmp-tech/dcp-platform/pull/532) — `feat(v2): add admin fleet readiness blockers`

Included:
- Added a first-class fleet readiness section to `/v2/admin` for inference-serving blockers from the existing `/api/admin/fleet/health` and `/api/admin/fleet/alerts` feeds.
- Surfaced row-level provider evidence for earned-online verification, endpoint reachability, WireGuard freshness, heartbeat freshness, cached model coverage, running jobs, and restart risk.
- Added fleet readiness navigation, summary gates, blocked-provider cards, alert evidence, and a link back to the verified fleet console for safe action.
- Kept provider pause/resume, endpoint edits, WireGuard repair, and routing changes out of v2 admin until v2 fleet actions have explicit audit and rollback rules.

### 04:49 UTC — [PR #531](https://github.com/dhnpmp-tech/dcp-platform/pull/531) — `feat(v2): add admin finance review`

Included:
- Added a first-class finance review section to `/v2/admin` for refund requests, provider payouts, billing exceptions, and auto-top-up issues from the existing `/api/admin/payments/audit` feed.
- Added finance review navigation, queue counters, row-level evidence, and links to the verified payments and withdrawals consoles for safe human action.
- Kept refund approval/rejection, payout sync, and balance-changing actions out of v2 admin until the v2 money-action envelope is separately audited.
- Added static regressions for finance row wiring, review-only policy copy, no direct payment mutation endpoints, and scoped finance styling.

### 04:35 UTC — [PR #530](https://github.com/dhnpmp-tech/dcp-platform/pull/530) — `feat(v2): add admin mission action desk`

Included:
- Added a guarded mission action desk to `/v2/admin` so founding-team operators can move task status, reassign work, and record evidence notes without leaving the v2 surface.
- Reused the existing mission backend write routes (`PATCH /api/mission/tasks/:id`, `POST /api/mission/tasks/:id/reassign`, and `POST /api/mission/tasks/:id/comments`) instead of introducing a new experimental admin mutation API.
- Kept mission task creation and deletion out of v2 admin; the action desk only supports bounded operational updates through the current admin token and mission write gate.
- Added static regressions for mission action wiring, strict-vs-legacy write posture copy, no delete/create controls, and action-desk styling.

### 04:26 UTC — [PR #529](https://github.com/dhnpmp-tech/dcp-platform/pull/529) — `feat(v2): add admin audit trail`

Included:
- Added a read-only recent audit trail to `/v2/admin` so founding-team operators can see the latest guarded admin actions without leaving the v2 surface.
- Wired the panel to `/api/admin/audit?limit=8`, supporting both the current `entries` response and the older `audit_log` shape.
- Kept full audit pagination in the current admin security console while v2 shows the latest evidence cards for quick accountability checks.
- Added static regressions for audit endpoint wiring, payload normalization, empty-state copy, and audit-trail styling.

### 04:19 UTC — [PR #528](https://github.com/dhnpmp-tech/dcp-platform/pull/528) — `feat(v2): add admin notification posture`

Included:
- Added an admin-only `/api/admin/notifications/posture` endpoint for safe alert-channel readiness without returning raw webhook URLs, Telegram bot tokens, or Telegram chat IDs.
- Added a v2 admin notification-routing panel so founders can see whether human and agent alerts have active channels, redacted destinations, and an explicit agent notify policy.
- Kept notification test sends and channel edits out of v2 admin; the panel is read-only until event allowlists, approval notes, and audit envelopes are explicit.
- Added static regressions for safe notification posture redaction, v2 posture wiring, notification panel styling, and avoiding the raw legacy notification config payload.

### 04:12 UTC — [PR #527](https://github.com/dhnpmp-tech/dcp-platform/pull/527) — `fix(mission): add strict write auth gate`

Included:
- Added a dormant `DCP_MISSION_STRICT_WRITE_AUTH` guard for mission mutations so task, comment, milestone, and goal writes can be hardened to admin token or `x-mission-agent-key` without changing default production behavior.
- Kept read endpoints and the read-only `/mission/pr-state` proxy on the existing authenticated-read path.
- Switched mission-agent-key comparison to a timing-safe helper and added a stable `mission_write_forbidden` response for strict-mode write denials.
- Added static regressions to keep every mission mutation on `requireWriteAuth` while preserving the read-only PR-state proxy behavior.

### 04:04 UTC — [PR #526](https://github.com/dhnpmp-tech/dcp-platform/pull/526) — `feat(v2): expose admin access governance`

Included:
- Added an admin-only `/api/admin/access/policy` posture endpoint that reports admin token/IP allowlist configuration, mission write mode, mission-agent-key presence, and agent permission readiness without returning secret values.
- Added a v2 admin access-governance panel so founders can see whether mission writes are still on the legacy authenticated-write path or hardened behind the strict admin/agent gate.
- Kept v2 admin task mutation controls out of the interface; guarded agent writes remain blocked until `DCP_MISSION_STRICT_WRITE_AUTH` is enabled and audited.
- Added static regressions for the backend policy route, secret non-disclosure, v2 access cards, access ladder, and strict-vs-legacy mission write labels.

### 03:50 UTC — [PR #525](https://github.com/dhnpmp-tech/dcp-platform/pull/525) — `feat(v2): add admin mission control mirror`

Included:
- Added a read-only mission-control layer to `/v2/admin` so founders can see open work, blocked tasks, active goals, shipped-in-24h pulse, and the human/agent roster without leaving the v2 admin surface.
- Wired the section to real `/api/mission/*` endpoints using the existing admin token: overview, open tasks, assignees, goals, and 24h pulse.
- Kept task writes out of v2 admin for now; the section links to `/mission` for the full board while role delegation, agent write keys, and audit approval rules remain separate hardening work.
- Added static regressions for the mission API dependencies, read-only mission policy, roster/task ownership copy, and mission-control styling.

### 03:38 UTC — [PR #524](https://github.com/dhnpmp-tech/dcp-platform/pull/524) — `fix(v2): remove stale homepage capacity table`

Included:
- Removed the remaining illustrative GPU-class marketplace table from `/v2/home` so the public site no longer looks like it has static provider inventory.
- Replaced the table with an explicit capacity truth panel that names the real publication gates: endpoint reachability, earned-online verification, and model coverage.
- Kept the zero-capacity meter and `/status` link as the correct public state while providers or WireGuard tunnels are not serving verified inference.
- Added static regressions to prevent hard-coded GPU classes, token-metered inventory rows, and old marketplace-table markup from returning.

### 03:30 UTC — [PR #523](https://github.com/dhnpmp-tech/dcp-platform/pull/523) — `fix(v2): close public website gaps`

Included:
- Made the v2 homepage capacity meter render as zero until live endpoint, model-coverage, and earned-online checks pass, and routed visitors to `/status` for live availability.
- Reworded v2 provider setup requirements so static minimums are not presented as browser-detected hardware telemetry before the daemon runs.
- Removed the decorative docs search input and its unused styles from `/v2/docs`.
- Added `robots.txt` and a Next.js sitemap route so `/robots.txt` and `/sitemap.xml` no longer 404.
- Added static regressions for homepage capacity honesty, provider setup wording, docs anchors/search chrome, and site index files.

### 03:11 UTC — [PR #522](https://github.com/dhnpmp-tech/dcp-platform/pull/522) — `feat(v2): add guarded provider approval desk`

Included:
- Added a v2-native provider approval desk to `/v2/admin` so founding-team operators can review pending providers without dropping into the legacy provider table first.
- Wired approve/reject actions to the audited `/api/admin/providers/:id/approval-decision` route instead of the older legacy shortcut endpoints.
- Kept the workflow one-provider-at-a-time, labeled as a guarded write, and required a clear rejection reason before sending a reject decision.
- Surfaced SLA age, queued time, audit-envelope language, and a legacy detail link beside each pending provider decision.
- Added static regressions for the approval desk, audited PATCH route, rejection reason guard, and approval desk styling.

### 02:53 UTC — [PR #521](https://github.com/dhnpmp-tech/dcp-platform/pull/521) — `feat(v2): expand admin operational dashboard`

Included:
- Expanded `/v2/admin` from a first command-center shell into a broader read-only operations surface for founding-team workflows.
- Added v2 admin reads for provider approvals, earned fleet health, fleet alerts, finance reconciliation, recent errors, and control-plane signals.
- Added a launch-readiness board that treats verified serving capacity, fleet alerts, money queues, reconciliation, incidents, and control-plane signals as first-class operating checks.
- Added fleet, finance, and incident/control-plane lanes so humans and future agents can see the current risk areas without jumping through multiple legacy pages.
- Kept provider/payment/fleet mutations out of v2 admin for now; guarded writes still route to the existing admin console until explicit v2 approval flows are built.
- Added static regressions for the new admin API dependencies, read-only policy, readiness board, and operational lane styling.

### 02:41 UTC — [PR #520](https://github.com/dhnpmp-tech/dcp-platform/pull/520) — `fix: align provider online truth and retire stale brand docs`

Included:
- Fixed `/api/providers/online` so the public provider list no longer treats heartbeat-only daemon claims as live marketplace capacity.
- Required a fresh backend endpoint reachability verdict before a provider can appear as public `is_live`, then applied the existing earned-routing policy so stale positive probes and freshly failed verification probes are excluded.
- Removed the retired public brand-guideline HTML artifact and iframe wrapper page from the deployed app.
- Redirected stale `/docs/DCP-BRAND-GUIDELINES-v3.html` and `/docs/brand` traffic to the current v2 docs surface.
- Added regressions for heartbeat-only provider false positives, freshly failed earned probes, and retired public brand-doc artifacts.

### 01:47 UTC — [PR #519](https://github.com/dhnpmp-tech/dcp-platform/pull/519) — `fix(v2): retire public prototypes and align catalog honesty`

Included:
- Removed the retired v2 design handoff/prototype files from `public/dcp-v2` so mockup HTML, demo pages, and design-reference README content are no longer deployed as public production URLs.
- Redirected stale `/dcp-v2/*` requests to the real `/v2/home` surface.
- Redirected retired `/models` traffic to the v2 renter playground instead of the legacy marketplace.
- Tightened `/v2/home` copy so it no longer promises an immediate working inference call or hard-coded token-throughput range when no verified serving model is present.
- Aligned `/api/models` and `/api/models/catalog` availability with the inference path by requiring a reachable endpoint, fresh heartbeat, inference support, earned-routing policy, and a cached model/alias match before a provider counts as available.
- Made `/api/models/:model_id/deploy` return `409 model_unavailable` instead of a ready deploy handoff when no verified provider can currently serve the model.
- Removed stale `DC1`, fixed-percent revenue, and fixed model-count claims from provider/renter welcome email copy.
- Added regressions for retired public prototypes, v2 redirect hygiene, and model-catalog honesty.

### 21:37 UTC — [PR #518](https://github.com/dhnpmp-tech/dcp-platform/pull/518) — `fix(v2): keep public CTAs on honest v2 surfaces`

Included:
- Kept `/v2/home` public CTAs inside v2 routes for renter setup, provider setup, and the model playground instead of sending visitors through legacy marketplace/setup pages.
- Replaced the fabricated homepage provider marketplace table and randomized live metrics with honest verified-capacity policy copy.
- Removed the animated fake provider counter from `/v2/provider-setup`.
- Aligned visible provider-share copy and the provider setup estimator to the 85/15 provider/platform split.
- Added static regressions for v2 public link hygiene, fake provider names, simulated live telemetry, fake counters, and stale rev-share copy.

### 21:30 UTC — [PR #517](https://github.com/dhnpmp-tech/dcp-platform/pull/517) — `fix(v2): stop prefetching legacy admin links`

Included:
- Disabled Next.js prefetching on legacy `/admin` fallback links from `/v2/admin` so the live command center does not emit harmless RSC fallback console errors.
- Kept the legacy admin console reachable for guarded operations while leaving v2-native links on normal navigation behavior.
- Added a static regression to keep legacy admin links classified and non-prefetching.

### 21:08 UTC — [PR #516](https://github.com/dhnpmp-tech/dcp-platform/pull/516) — `feat(v2): add admin command center`

Included:
- Added `/v2/admin` as the first v2-style admin command center for founding-team operations and future agent participation.
- Synthesized a human-readable Ops Inbox from verified admin APIs: dashboard stats, payments audit, system health, security summary, and provider supply context.
- Added an agent permission ladder and task envelope model so agents can read, notify, and propose by default while guarded writes remain human-approved.
- Updated v2 admin auth to land operators on `/v2/admin` while keeping the existing `/admin` console linked as the proven operations fallback.
- Added static regressions for the v2 admin route, API dependencies, auth guard, and agent-aware workflow model.

### 20:28 UTC — [PR #515](https://github.com/dhnpmp-tech/dcp-platform/pull/515) — `fix(v2): keep admin sign-in on v2 auth`

Included:
- Kept the `/v2/auth` "Need admin access?" path inside the v2 auth design instead of sending operators through the old `/login` page.
- Added a v2-styled admin API-key form that validates against `/api/admin/dashboard`, stores `dc1_admin_token`, creates the shared admin session, and opens the existing `/admin` console.
- Added a static regression so v2 auth cannot reintroduce the old admin-login detour.

### 20:14 UTC — [PR #514](https://github.com/dhnpmp-tech/dcp-platform/pull/514) — `fix(v2): gate setup console shortcut on auth`

Included:
- Changed the `/setup` top-right action so clean browsers are sent to renter auth instead of seeing a misleading console shortcut.
- Kept the console shortcut available only after the stored renter key is verified against `/api/renters/me`.
- Added a static regression test for the authenticated setup action.

## 2026-06-02

### 12:37 UTC — [PR #493](https://github.com/dhnpmp-tech/dcp-platform/pull/493) — `fix: dedupe explicit admin audit mutations`

Included:
- Skipped generic admin audit rows for payout and payment-refund mutation routes that already write explicit audit rows.
- Added production mount-order regression tests for refund approve/reject so the `/api/admin` middleware cannot duplicate those audit records again.
- Verified with focused backend syntax checks, refund-request tests, payout audit-dedupe tests, and `git diff --check`.

### 12:34 UTC — [PR #492](https://github.com/dhnpmp-tech/dcp-platform/pull/492) — `fix: polish admin refund audit table`

Included:
- Showed Moyasar payment IDs and original payment amount beside refund-request amounts on `/admin/payments`.
- Fixed refund action success copy so reject actions render `rejected`, not `rejectd`.
- Made refund requests the default payments audit tab and updated the page intro.
- Verified with `npm run build`, standalone TypeScript check after Next type generation, and `git diff --check`.

### 12:31 UTC — [PR #491](https://github.com/dhnpmp-tech/dcp-platform/pull/491) — `docs: sync public openapi spec`

Included:
- Synced `public/docs/openapi.yaml` from the maintained `docs/openapi.yaml`.
- Ensured the deployed `/docs/openapi.yaml` link includes refund-request API documentation.
- Left `backend/openapi/dcp.yaml` unchanged because it is the narrower vendored `dcp-contracts` response-validation spec.
- Verified YAML parsing for all OpenAPI specs, byte identity between maintained and public specs, refund-route presence, and `git diff --check`.

### 12:28 UTC — [PR #490](https://github.com/dhnpmp-tech/dcp-platform/pull/490) — `fix: share model alias routing matcher`

Included:
- Moved alias-aware model matching into `backend/src/lib/model-aliases.js` as a shared helper.
- Used the shared matcher for multi-engine `provider_engines.served_models`, legacy `cached_models` routing, and `/api/providers/model-catalog` provider counts.
- Added regressions for Qwen2.5-VL, BGE, ALLaM, and Llama aliases.
- Verified syntax checks, 69 focused backend tests, and `git diff --check`.

### 12:20 UTC — [PR #489](https://github.com/dhnpmp-tech/dcp-platform/pull/489) — `chore: remove stale horizontal logo asset`

Included:
- Removed unused `public/dcp-logo-horizontal.webp`.
- Confirmed the removed file was actually a 128x128 PNG with a `.webp` extension.
- Kept `README.md` on the crisp SVG logo.
- Closed [issue #480](https://github.com/dhnpmp-tech/dcp-platform/issues/480).
- Verified no remaining source references and `git diff --check`.

### 12:17 UTC — [PR #488](https://github.com/dhnpmp-tech/dcp-platform/pull/488) — `docs: document refund request payment APIs`

Included:
- Added OpenAPI coverage for renter-created payment refund requests.
- Documented `/api/admin/payments/audit` refund queue output and admin refund approve/reject actions.
- Added the `PaymentRefundRequest` schema.
- Folded duplicate `/api/renters/me` and `/api/providers/me` path entries so `docs/openapi.yaml` strict-parses cleanly.
- Verified strict YAML parsing, duplicate path scan, refund-request backend tests, and `git diff --check`.

### 11:52 UTC — [PR #487](https://github.com/dhnpmp-tech/dcp-platform/pull/487) — `fix: make WireGuard registration rollback on persistence failure`

Included:
- Hardened `/api/providers/wg/register` and `/api/providers/wg/install-config`.
- Removed live `wg` peer additions when provider DB persistence fails.
- Kept old peers in place until new WireGuard key/IP state is persisted, then removed stale peers best-effort.
- Replaced WireGuard shell command strings with `execFileSync` argument arrays.
- Added regression coverage for [issue #358](https://github.com/dhnpmp-tech/dcp-platform/issues/358).
- Verified provider WG tests, WG diagnostics tests, hardcoded infra/security tests, syntax checks, and `git diff --check`.

### 11:13 UTC — [PR #486](https://github.com/dhnpmp-tech/dcp-platform/pull/486) — `docs: refresh changelog follow-up note`

Included:
- Updated the changelog follow-up note so it no longer listed refund requests or pricing refresh as future work after those PRs merged.
- Verified with `git diff --check`.

### 10:58 UTC — [PR #485](https://github.com/dhnpmp-tech/dcp-platform/pull/485) — `feat: refresh public pricing page`

Included:
- Replaced the stacked pricing page with a denser editorial pricing surface using existing DCP dark tokens and Instrument Serif display heading.
- Exposed auto-top-up behavior, the `402 insufficient_balance` pre-flight gate, starter credit order, and refund/admin review path.
- Added per-model-class token-rate table, subscription discount math, and GPU-hour floor table.
- Verified with `npm run build`, Playwright desktop/mobile visual checks, and `git diff --check`.

### 10:51 UTC — [PR #484](https://github.com/dhnpmp-tech/dcp-platform/pull/484) — `feat: add payment refund request workflow`

Included:
- Added `POST /api/payments/:id/refund-request` for renter-created refund requests on paid top-ups.
- Added migration 023 and inline schema for `payment_refund_requests`.
- Added the one-open-request-per-payment guard.
- Added refund requests to the admin payments audit screen with approve/reject actions.
- Added a Moyasar payment refund helper for live Moyasar refunds, with internal/manual semantics for sandbox, no-key, and bank-transfer records.
- Verified refund-request tests, payout audit-dedupe tests, backend syntax checks, `npm run build`, and `git diff --check`.

### 10:44 UTC — [PR #483](https://github.com/dhnpmp-tech/dcp-platform/pull/483) — `fix: require backend liveness verdict for routing`

Included:
- Required catalog, legacy routing, and multi-engine routing to have a positive backend endpoint probe verdict before treating a provider as serviceable.
- Persisted consecutive provider probe failures in `providers.endpoint_probe_failures`.
- Added tests for probe persistence and heartbeat-only routing exclusion.
- Verified provider-probe tests, multi-engine routing tests, backend syntax checks, and `git diff --check`.

### 10:37 UTC — [PR #482](https://github.com/dhnpmp-tech/dcp-platform/pull/482) — `ci: reclaim disk before sd worker build`

Included:
- Added an extra Docker/Buildx prune between instant LLM and SD worker image builds.
- Reduced the chance that the SD worker build starts with insufficient GitHub runner disk after the large vLLM image build.

### 10:35 UTC — [PR #481](https://github.com/dhnpmp-tech/dcp-platform/pull/481) — `ci: warn on skipped sentinel inference`

Included:
- Changed sentinel inference monitoring so skipped inference is a warning/alert condition, not a silent pass.
- Added auto-selection of an online model for the sentinel smoke request.
- Added a guard for long-running missing sentinel renter key configuration.

### 09:51 UTC — [PR #479](https://github.com/dhnpmp-tech/dcp-platform/pull/479) — `ci: add worker image disk cleanup`

Included:
- Added disk cleanup before scheduled worker-image Docker builds.
- Gave heavyweight vLLM/SDXL layers more GitHub runner headroom.

### 09:47 UTC — [PR #478](https://github.com/dhnpmp-tech/dcp-platform/pull/478) — `docs: sanitize dotenv changelog wording`

Included:
- Sanitized public changelog wording around dotenv and missing secrets.
- Kept the operational lesson without exposing sensitive implementation detail.

### 00:17 UTC — [PR #477](https://github.com/dhnpmp-tech/dcp-platform/pull/477) — `fix: settle queued v1 inference once`

Included:
- Removed the legacy queued-job pre-debit in `/v1/chat/completions`.
- Routed queued inference completion through the same `settleInferenceOnce` settlement path as direct provider proxying.
- Reduced double-charge and unreconciled-debit risk for queued inference.

### 00:12 UTC — [PR #476](https://github.com/dhnpmp-tech/dcp-platform/pull/476) — `fix(catalog): add bge and qwen alias discovery`

Included:
- Added BGE and Qwen alias discovery coverage.
- Improved catalog provider-count matching for cached `bge-m3` and Qwen2.5-VL variants.

### 00:07 UTC — [PR #473](https://github.com/dhnpmp-tech/dcp-platform/pull/473) — `security: scrub hardcoded secrets/infra from source + tighten secret scan`

Included:
- Removed hardcoded production Telegram fallback token/chat values from heartbeat channel code.
- Moved WireGuard server endpoint use to required environment configuration.
- Sanitized sensitive public changelog wording.
- Added a Telegram bot token gitleaks rule.
- Expanded hardcoded production infra/security regression tests.

## 2026-06-01

### 22:37 UTC — [PR #472](https://github.com/dhnpmp-tech/dcp-platform/pull/472) — `docs: remove obsolete OpenAPI duplicates`

Included:
- Removed obsolete duplicate OpenAPI YAML files.
- Retargeted API guide links to the maintained `docs/openapi.yaml` spec.

### 22:32 UTC — [PR #471](https://github.com/dhnpmp-tech/dcp-platform/pull/471) — `chore: clean public repo surface`

Included:
- Cleaned the public repository surface for the renamed `dcp-platform` repo.
- Removed internal coordination notes, agent handoffs, private planning docs, generated reports, stale workflow files, disabled source copies, and build artifacts from the tracked tree.
- Added public repository orientation through `README.md`, `REPO_MAP.md`, folder `OVERVIEW.md` files, and a pull request template.
- Updated GitHub repository metadata with public description, homepage, and topics.
- Added ignore rules for local/private docs, generated installer outputs, local agent state, build artifacts, and runtime data.

## Backfill Notes

- PRs before #471 are not yet fully backfilled into this root changelog.
- Older deep engineering notes remain in [`docs/CHANGELOG.md`](docs/CHANGELOG.md) until they are converted into this PR-based format.
