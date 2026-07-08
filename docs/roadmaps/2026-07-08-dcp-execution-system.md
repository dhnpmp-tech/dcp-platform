# DCP Product Execution System - 2026-07-08

Timestamp: 2026-07-08 03:31 UTC / 07:31 +04.

Related audit:

- `docs/architecture/2026-07-08-pods-inference-fireworks-gap-audit.md`
- `docs/strategy/2026-07-08-fireworks-tinker-product-roadmap.md`

## Purpose

This document turns the Fireworks/Tinker gap audit into an execution loop. The
goal is not to create more plans; the goal is to make every audit finding become
a small PR with tests, deploy evidence, smoke evidence, and a next improvement
decision.

The loop applies to:

- Frontend roadmap.
- Backend roadmap.
- Inference roadmap.
- POT/PODS infrastructure roadmap.
- LoRA roadmap.

## Operating Loop

Every product improvement follows the same loop:

1. **Select one finding.**
   - Source must be an audit doc, roadmap item, Telegram founder request, live
     production issue, or test failure.
   - Record the source in the PR body.
2. **Define a narrow slice.**
   - One behavior or one documentable contract per PR.
   - Avoid mixing frontend redesign, billing logic, and deployment operations in
     one change unless they are inseparable.
3. **Write the acceptance gate first.**
   - Unit test, static test, smoke script, screenshot requirement, or explicit
     manual verification command.
   - For docs-only changes, `git diff --check` plus link/path verification is
     enough.
4. **Build.**
   - Use existing repo patterns and existing services/routes.
   - Do not invent a new product surface if a route, template, or dashboard
     already exists.
5. **Verify locally.**
   - Run the lane-specific test set below.
   - Record exact commands in the PR body and changelog.
6. **Push and open PR.**
   - Update `CHANGELOG.md` and `docs/CHANGELOG.md`.
   - Use PR number, date, timestamp, and concrete changelog.
7. **Wait for GitHub checks.**
   - Required baseline: Next.js build, secret scan, Vercel status.
   - Add lane-specific checks where relevant.
8. **Merge and deploy.**
   - Fast-forward local `main`.
   - Push `main:security/staged-rollouts`.
   - Pull VPS2 `security/staged-rollouts` with `--ff-only`.
   - Reload PM2 only when runtime code/config changed.
9. **Smoke production.**
   - API health and public site checks are minimum.
   - Lane-specific smoke evidence is required for behavior changes.
10. **Feed findings back.**
    - If a smoke fails, open/fix the next smallest PR.
    - If a manual step remains, write it into the relevant roadmap as a named
      follow-up.

## Common Build and Deploy Gates

### Gate Status Semantics

Every roadmap item must end in one of these states:

- **Passed:** the acceptance command ran and produced evidence.
- **Blocked:** the command exists, but a required external input is absent
  (funded renter key, live GPU capacity, active portable volume, provider-host
  shell, maintenance window, or production credential). Record the missing
  input and do not count the product capability as live.
- **Failed:** the command ran and exposed a defect. The next PR must be a fix,
  rollback, or smaller reproducer before adding new product claims.
- **Deferred:** the item is not next in the audit order and has no active PR.

Blocked live proofs are acceptable only when the repo contains the repeatable
command and the roadmap names the exact missing external input.

### Pre-PR Gate

Run before every PR:

```bash
git status --short --branch
git diff --check
```

For code changes, also run the relevant lane gate below.

### GitHub Gate

Required before merge:

- Next.js build passes.
- Secret scan passes.
- Vercel preview/deploy status is success.
- Any added targeted tests pass.

### Deploy Gate

After merge:

```bash
git switch main
git pull --ff-only origin main
git push origin main:security/staged-rollouts
ssh root@76.13.179.86 'cd /root/dc1-platform && git pull --ff-only origin security/staged-rollouts'
```

Runtime reload rules:

- **Docs-only:** no PM2 reload.
- **Frontend-only:** no VPS PM2 reload; verify Vercel production.
- **Backend runtime code:** reload `dc1-provider-onboarding` through the existing
  safe reload path after checking active pods/jobs.
- **Ops cron/script:** copy/install only the touched script, then `bash -n` and a
  dry run where possible.
- **Provider daemon/image:** never assume VPS deploy is enough; verify on a GPU
  provider host.

### Production Smoke Gate

Minimum for every merge:

```bash
curl -fsS https://api.dcp.sa/api/health
curl -fsSI https://dcp.sa
```

Behavior changes need lane-specific smoke evidence.

Before merging a backend/inference/POT/LoRA proof slice, run
`npm run proof:local-roadmap` when feasible. It does not replace live gates; it
packages the CI-safe gates and explicitly reports the live proof commands that
remain blocked by credentials, provider GPU hosts, or serving capacity.

### Current Proof Command Map

| Audit gate | Command | Required external input | Current acceptance state |
|---|---|---|---|
| CI-safe local roadmap suite | `npm run proof:local-roadmap` | none | Runs all CI-safe gates below and reports excluded live gates |
| Build/product route integrity | `npm run build` | none | Required for frontend/runtime PRs |
| Workspace-to-pod wiring contract | `npm run workspace-pods:verify-contracts` | none | CI-safe gate available |
| Workspace upload -> pod -> `/workspace` visibility | `DCP_WORKSPACE_POD_ALLOW_LAUNCH=1 npm run proof:workspace-pod` | funded renter key, active portable volume, launchable GPU capacity | Command available; blocked until live credentials/capacity are supplied |
| Pod image contract | `npm run pod-images:verify-contracts` | none | CI-safe gate available |
| LoRA fat image provider-host imports | `npm run proof:lora-pod-image` | provider GPU host with Docker, NVIDIA Container Toolkit, and built `dcp-compute:lora` | Command available; blocked until run on a provider GPU host |
| LoRA training lifecycle contract | `npm run proof:lora-training-contract` | none | CI-safe gate available; GPU-host artifact proof still blocked |
| Provider Nsight evidence contract | `npm run provider:nsight:verify` | none for mock contract; provider GPU host for real proof | Contract gate available; GPU-host proof remains blocked |
| Template catalog validity | `npm run templates:validate` | none | Required for pod/template/LoRA template PRs |
| Anthropic agent-path SSE | `DCP_ANTHROPIC_PROOF_ALLOW_LIVE=1 npm run proof:anthropic-sse` | funded inference smoke principal and compatible vLLM provider capacity | Command available; blocked until live credentials/capacity are supplied |
| Prompt-cache measurement contract | `npm run proof:prompt-cache-contract` | none | CI-safe gate available; provider KV-cache and discount settlement proof still blocked |
| Batch inference lifecycle contract | `npm run proof:batch-inference-contract` | none | CI-safe gate available; live provider execution and discounted settlement smoke still blocked |
| Adapter deployment lifecycle contract | `npm run proof:adapter-deployment-contract` | none | CI-safe gate available; live vLLM load and billing smoke still blocked |
| API health | `curl -fsS https://api.dcp.sa/api/health` | production network | Required after every deploy |
| Model catalog health | `curl -fsS https://api.dcp.sa/v1/models` | production network | Required after inference/model/catalog changes |
| Anthropic route host sanity | `curl -sS -o /tmp/dcp-anthropic-unauth.json -w '%{http_code}\n' -X POST https://api.dcp.sa/anthropic/v1/messages -H 'content-type: application/json' -d '{}'` | production network; no secret required | Expected unauthenticated result is HTTP 401 |

Live proof commands must not print or commit secrets. Their JSON/Markdown
reports belong under `docs/reports/reliability` only when the run is intentional
and useful for handoff.

## Audit Technical Order of Operations

This is the current no-skips order derived from the Fireworks/Tinker gap audit.
Each item should become one or more narrow PRs, with the proof command promoted
before or with the feature change.

1. **Repo parity and deploy hygiene**
   - Gate: local `main`, `origin/main`, `origin/security/staged-rollouts`, and
     VPS2 `security/staged-rollouts` point to the same commit after each merge.
   - Open item: reconcile `dcp-agent` in a controlled maintenance window.
2. **Proof harnesses before claims**
   - Gate: every remaining manual live acceptance step has a repo command,
     artifact path, and blocked/pass/fail status.
   - Current commands: workspace-pod proof and Anthropic SSE proof are available.
3. **POT/PODS workspace and image hardening**
   - Gate: `workspace-pods:verify-contracts`, `proof:workspace-pod`,
     `pod-images:verify-contracts`, and `proof:lora-pod-image`.
   - Acceptance does not close until a GPU provider host proves `/workspace`
     file visibility and LoRA stack imports without long `pip install`.
4. **Inference streaming and catalog hardening**
   - Gate: targeted v1/model catalog tests, `/v1/models` production smoke, and
     `proof:anthropic-sse` for agent-path streaming.
   - Advanced claims stay gated until a funded live proof report exists.
5. **Prompt-cache and batch economics**
   - Gate: `proof:prompt-cache-contract`, `proof:batch-inference-contract`,
     readiness contracts, settlement tests, result-artifact proof, and
     no-discount/no-execution claim guards until measured billing proof exists.
6. **LoRA dataset, training, and artifact proof**
   - Gate: `templates:validate`, `proof:lora-training-contract`, dataset
     validate-only tests, fixed-recipe SFT worker proof, adapter artifact
     checksum, and model-card manifest.
   - Public wording remains "metadata/readiness" until GPU artifact proof runs.
7. **Adapter deployment and dedicated endpoints**
   - Gate: `proof:adapter-deployment-contract`, deployment intent, vLLM adapter
     load proof, endpoint smoke, and inference billing proof for adapter
     traffic.
   - Route traffic remains disabled until proof matches deployment id, adapter
     id, base model, mode, and artifact checksum.
8. **Product packaging**
   - Gate: public pages, renter dashboards, pricing, playground, docs, and
     `llms.txt` all derive from or link to shipped contracts.
   - Product copy must say "coming next" for every gate that is blocked.

## Lane Gates

### Frontend

Use when changing public pages, renter/provider dashboards, pricing, playground,
workspace, pod UX, fine-tuning UX, or docs-rendered pages.

Build/tests:

```bash
npm run build
git diff --check
```

Extra verification:

- Browser check for every touched route.
- Desktop and mobile viewport screenshots for visible UX changes.
- Confirm public copy does not overclaim model quality, availability, LoRA
  serving, prompt caching, batch discounts, or Tinker compatibility.

Production smoke:

- Vercel production status success for the merge commit.
- `https://dcp.sa` returns HTTP 200.
- Touched route returns HTTP 200.

### Backend

Use when changing Express routes, services, database migrations, billing,
provider state, auth, workspace, pod lifecycle, templates, or OpenAPI contracts.

Build/tests:

```bash
cd backend
npm test -- --runInBand --forceExit
```

For narrow changes, use the smallest targeted Jest files plus any static route
regression that covers the behavior. Money/routing changes must not ship on
`git diff --check` alone.

Extra verification:

- Confirm migrations are additive and idempotent.
- Confirm OpenAPI/docs if response shapes change.
- Confirm rollback path before VPS deploy.

Production smoke:

- `/api/health` is 200.
- `/v1/models` is 200 if routing/model/catalog code changed.
- `ops/e2e-smoke.sh` or equivalent probes pass when inference/pod code changed.

### Inference

Use when changing `/v1`, Anthropic compatibility, provider engines, vLLM proxy,
model catalog, pricing, billing settlement, prompt cache, batch, routers, or
eval/benchmark surfaces.

Build/tests:

```bash
cd backend
npm run native:ensure:better-sqlite3
npx jest src/__tests__/v1-models.test.js src/__tests__/v1-metering-ledger.test.js src/__tests__/v1-rate-limiter-selection.test.js --runInBand --forceExit
```

Adjust the target list when the touched code has a more specific test.

Required design gates before behavior PRs:

- Per-model pricing metadata has one source of truth.
- Prompt-cache accounting measures before discounting.
- Batch inference is async, idempotent, and resumable.
- Streaming routes preserve byte/SSE semantics and do not buffer.
- Provider routing does not advertise unreachable models.

Production smoke:

```bash
curl -fsS https://api.dcp.sa/v1/models
```

For behavior changes, run one real low-cost inference request using an approved
smoke renter key and record the request id or response status in the PR/deploy
handoff. Do not paste secrets.

Anthropic-compatible behavior changes also require:

```bash
DCP_ANTHROPIC_PROOF_ALLOW_LIVE=1 npm run proof:anthropic-sse
```

If the funded smoke principal or compatible vLLM provider capacity is missing,
mark the gate **Blocked** with the missing input and keep any product claim
behind an explicit proof gate.

### POT/PODS Infrastructure

Use when changing interactive pods, workspace, volumes, burst/on-demand launch,
provider preemption, templates, pod images, Nsight profiling, or GPU provider
quality scoring.

Build/tests:

```bash
cd backend
npx jest src/__tests__/podAccessPolicy.test.js tests/pods-billing.test.js --runInBand --forceExit
```

Add route-specific tests for workspace, volumes, pod extend/stop/refund, or
image/template changes as needed.

Required gates:

- Launch quote/debit/refund path remains once-only.
- On-demand/burst still requires paid available credit.
- Trial/free credit cannot spill into third-party GPU cost.
- Workspace tier is truthful: ephemeral, same-provider, or portable.
- Provider identity/vendor internals are not leaked to renters.

Production smoke:

- For backend-only pod policy changes, health plus targeted API smoke is enough.
- For pod lifecycle changes, run a controlled pod launch/stop/refund on approved
  low-cost capacity and record:
  - pod id
  - GPU type
  - launch status
  - stop status
  - charged/refunded halala
  - workspace tier

GPU/image smoke:

- Must be verified on a provider GPU host, not only on laptop/VPS.
- Fat image gate: a fresh pod imports `torch`, `transformers`, `peft`,
  `accelerate`, `datasets`, and `bitsandbytes` without a long pip install.
- LoRA fat-image proof: run `npm run proof:lora-pod-image` on a GPU provider
  host after building `dcp-compute:lora`; archive the generated JSON/Markdown
  evidence from `docs/reports/reliability`.
- Workspace gate: run
  `DCP_WORKSPACE_POD_ALLOW_LAUNCH=1 npm run proof:workspace-pod` with a funded
  renter key, active portable volume, and launchable GPU capacity. If any input
  is missing, record the gate as **Blocked** rather than accepted.

### LoRA

Use when changing LoRA/QLoRA templates, training jobs, dataset validation,
adapter registry, adapter upload, adapter deployment, multi-LoRA, live merge,
or Tinker-style workflows.

Build/tests:

```bash
cd backend
npm run templates:validate
```

Add tests for any new adapter registry or training/deploy API.

Required gates:

- Start with fixed-recipe SFT, not RL/DPO/full-parameter training.
- Dataset format and size are validated before launching GPU work.
- Adapter artifacts have owner, base model, checksum, rank, storage key, and
  status.
- Adapter deployment cannot route traffic until the serving backend confirms it
  loaded the adapter.
- CI-safe deploy lifecycle proof: run
  `npm run proof:adapter-deployment-contract` to verify public deployment
  requests stay non-routing, mismatched load proof stays degraded, and only
  matching adapter/base-model load proof allows route traffic.
- Public copy says what is live now and what is coming next.

Production smoke:

- Phase 0: template validates and dry-run output is stable.
- Phase 1: controlled 3090-class pod produces an adapter artifact.
- Phase 2: adapter is loaded into a DCP endpoint and billed through inference.
- Phase 3: multi-LoRA serves more than one adapter on one base model with
  documented throughput/latency.

## Evidence Packet Template

Every deploy handoff should include:

```md
## PR / Commit

## Changed Behavior

## Tests Run

## GitHub Checks

## Deploy Target

## Production Smoke

## Findings

## Next Improvement
```

## Improvement Rules

- A failed smoke creates a fix PR or a documented rollback, not a vague note.
- A new product claim requires either a production endpoint, a benchmark, or an
  explicit "not live yet" label.
- Repeated manual verification should become a script.
- Repeated script output should become a dashboard or report.
- If a finding touches money, routing, provider safety, or credentials, it is
  P0/P1 until proven otherwise.
