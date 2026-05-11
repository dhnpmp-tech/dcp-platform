# Resume notes — 2026-05-11 battery emergency

Stopped mid-Phase-C copy trim at 6% battery. Picking up:

## Done today (all shipped to main, deployed)

- PR #357–367 merged. See `gh pr list --state merged --limit 12`.
- **PR #366** — CI: `Payout Dependency Security Gate` was failing on every PR
  since 2026-05-09. Root cause: critical `protobufjs <7.5.5` (RCE) +
  moderate `ip-address` via `express-rate-limit`. `npm audit fix`
  resolved both (lockfile-only bumps, no `package.json` change). Now 0
  vulns at the high/critical level.
- **PR #367** — billing rewire: migrations 010 (`usage_events` ledger) +
  011 (per-1M input/output rates on `model_registry`). 48 models seeded
  with rates per the spec tier table. `computeUsageCostBreakdown`
  rewired to bill input and output separately at their own per-1M rates,
  backward-compatible with the legacy `tokenRateHalala` single-rate
  fallback. Migrations applied on prod, backend reloaded, smoke OK.
- Earlier today: PR #359/363/364/365 (pull-on-demand), #360 (pricing
  spec + UI), #361/362 (inference-only homepage + energy strip).

## What still needs to be done (resume here)

### Phase C — copy trim continues
Branch `feat/inference-only-phase-c` exists locally (no unpushed changes
right now — the OnboardingWizard.tsx edit was reverted to avoid a
half-applied type narrowing). Targets:

1. `app/components/OnboardingWizard.tsx` — change `UseCase` from
   `arabic-ai | llm-inference | training | scientific-compute |
   image-generation` to `arabic-ai | llm-inference | embeddings-rag |
   tools-agents`. Must update ALL THREE in lockstep or TS fails:
   - The `UseCase` type union (line 9)
   - The `RECOMMENDATIONS: Record<UseCase, RecommendedTemplate[]>`
     object (around line 29) — replace `training`, `scientific-compute`,
     `image-generation` entries with `embeddings-rag` + `tools-agents`
     entries
   - The `USE_CASES: UseCaseOption[]` array (around line 203) — same
     swap

2. `app/marketplace/templates/page.tsx` and
   `app/renter/marketplace/templates/page.tsx` — these list deploy
   templates. Currently include LoRA fine-tune, SDXL, Jupyter, scientific
   compute. Trim to inference templates only (Arabic RAG, embeddings,
   LLM chat, vision).

3. `app/docs/models/page.tsx` — references training/fine-tune. Rewrite
   for inference-only positioning.

### Phase D — email templates
`backend/src/services/emailService.js` — Arabic + English email templates
for job-queued / job-started / job-completed / job-failed / welcome /
magic-link. Many still mention "training jobs", "container jobs". Rewrite
for inference-only language. Also includes `الـ daemon` mixed-script tells
flagged by the original AUDIT-2026-05-10-arabic-copy.md.

### Pull-on-demand still untested end-to-end
- Backend writes pull tasks (PR #363 verified live).
- Agent reads + executes pull tasks (dcp-agent PR #8 merged but not
  rolled out to any provider box).
- Need a Linux provider running the updated `scripts/heartbeat.sh`
  before the warming state can actually complete.

### Stale tasks list to clean
`#6 dcp-agent + dcp-desktop audits (next wave)` and
`#4 Verify Claude Autofix on PR #352` are still pending — both
backlog items that haven't been touched today.

## Critical gotcha for resume

The pull-on-demand backend is **live and will quote ETAs**, but no
provider can act on the tasks yet. If a real renter triggers a warming
state today, they'll see "warming on peter-macbook — ETA 12 min" and
nothing will ever happen. Two mitigations:
1. Disable the warming branch via a feature flag until at least one
   Linux provider runs the new `heartbeat.sh`, OR
2. Roll out the new heartbeat.sh to peter-macbook (this Mac) — but
   peter-macbook runs the Tauri provider, not the bash heartbeat.

Recommend (1) for safety until a Linux provider runs the new agent.

## Battery saved at 6%. Resume from `feat/inference-only-phase-c` branch.
