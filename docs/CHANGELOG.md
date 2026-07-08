# DCP Changelog

## [Unreleased]

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
