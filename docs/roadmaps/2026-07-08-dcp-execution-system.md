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
