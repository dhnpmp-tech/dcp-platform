# Codex Development Process - 2026-07-07

This process is for coordinated DCP development when one agent focuses on backend
and another focuses on frontend/product surface.

## Operating Principles

- Start from repo identity and parity: local, GitHub, and production VPS should be
  intentionally synchronized before money/routing work.
- Keep backend money/routing changes narrow and heavily tested.
- Keep frontend changes honest: no vendor leaks, no fake availability, no copy
  that over-promises model quality, pricing, or capacity.
- Prefer small PRs with one behavioral claim each.
- Document product ambiguities before filling them in with code.

## Suggested Agent Split

Backend lane:

- Database schema and migrations.
- Provider supply-tier classifier.
- Trial/paid credit policy.
- Pod launch gates, prepaid debit/refund behavior, and backend tests.
- Production/VPS smoke verification.

Frontend lane:

- Renter pods UI state and blocked-launch handling.
- Wallet/Credit language.
- Marketing/docs pages such as `/models/allam` and `/lora-fine-tuning`.
- Visual QA across desktop/mobile.

Shared lane:

- API response contracts.
- Error code names and user-facing copy.
- Rollout checklist and smoke scripts.

## PR Order for Tareq Trial Pricing

1. Backend policy tests and schema/classifier prep.
2. Backend pod launch gate.
3. Frontend Credit language and launch-block handling.
4. Production smoke and docs update.

Do not start with frontend-only gating. The backend must be the source of truth
for on-demand access, trial exhaustion, and paid-credit eligibility.

## PR Order for LoRA/Fireworks Work

1. Fat pod image design and build verification plan.
2. Template/image changes for `dcp-compute:pytorch`.
3. Big-GPU paid-credit restrictions.
4. `/models/allam` and `/lora-fine-tuning` English/Arabic pages.
5. Benchmark fork and honest Fireworks comparison.
6. Adapter upload/deploy dashboard and `dcpconnect` research only after the core
   pod/trial gates are safe.

## Required Checks by Change Type

Backend money/routing:

- Run targeted backend tests.
- Run any static route regression tests touching pod launch or billing.
- Review OpenAPI/contracts if response shapes change.
- Verify the production schema before writing migrations.
- Include rollback notes.

Frontend renter UI:

- Run lint/build or the repo's closest available frontend check.
- Use browser verification on the actual route.
- Check desktop and mobile viewport.
- Confirm copy does not leak vendor or cloud-provider internals.

Docs/marketing:

- Verify claims against current product capability.
- Avoid claiming "one env var" compatibility, "better than Opus", or always-on
  LoRA serving until the code exists.
- Include Arabic/Saudi sovereignty claims only where supportable.

Template/provider image changes:

- Do not treat laptop or VPS image builds as sufficient.
- Verify on a provider GPU host.
- Gate: fresh pod can import `transformers`, `peft`, `accelerate`, and related
  LoRA stack quickly.

## Daily Start Checklist

1. `git status --short --branch`
2. `git fetch --all --prune`
3. Confirm local `HEAD` equals intended GitHub branch head.
4. If backend work: confirm VPS checkout head and production health.
5. Read current handover docs and Telegram-forwarded decisions.
6. Decide one slice and write its acceptance test before implementation when
   feasible.

## Daily End Checklist

1. Summarize changed files and behavior.
2. Run and record relevant tests.
3. Record any untested area explicitly.
4. Note product decisions still pending.
5. If deployed, record GitHub SHA, VPS SHA, endpoint smoke results, and rollback
   path.

## Handoff Template

Use this shape when handing work between backend/frontend agents:

```md
## Objective

## Current SHA / Branch

## Product Decision Status

## Backend Contract

## Frontend Work Needed

## Tests Run

## Not Tested / Risks

## Next Safe Step
```

## First Recommended Slice

For the current Tareq request, start with backend read-only policy tests and the
supply-tier classifier. That gives the frontend a stable contract and prevents
the UI from becoming the only guardrail around on-demand spend.
