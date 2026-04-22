# DCP-465: Messaging Rewrite + First Content Batch

Date: 2026-03-21 (UTC)  
Owner: Copywriter / Content Strategist

## Scope and guardrails
- Benefit-led, credible copy for DCP's current product.
- No fabricated pricing.
- No bare-metal claims.
- No unsupported claims (only container-based GPU compute, daemon onboarding, prepay billing, SAR/halala model).

## 1) Homepage value-prop rewrite draft

### Hero
- Eyebrow:
  - `Container-ready GPU compute for Saudi builders`
- H1:
  - `Run AI workloads in minutes. Scale when you are ready.`
- Subhead:
  - `Start in the browser with Playground, then move to Docker-based jobs through the API. Prepay in SAR, track usage, and settle on actual runtime.`
- Primary CTA:
  - `Start as a Renter`
- Secondary CTA:
  - `Become a Provider`
- Tertiary text link:
  - `Read Quickstart`

### Proof strip (under hero)
- `Prepay billing in SAR (halala)`
- `Container-based job execution`
- `Provider earnings split: 75% provider / 25% platform`
- `API + dashboard workflows`

### Two-path module copy
- Card 1 title:
  - `Playground (Fast Start)`
- Card 1 body:
  - `Run GPU workloads from the browser before moving to container automation.`
- Card 1 CTA:
  - `Open Playground`
- Card 2 title:
  - `Container Jobs (Scale Path)`
- Card 2 body:
  - `Bring your Docker image and automate jobs through API-first workflows.`
- Card 2 CTA:
  - `View API Docs`

### Billing explainer module
- Title:
  - `How billing works`
- Body:
  - `You prepay an estimated amount before a job starts. Final cost is calculated from actual usage, and unused balance is returned automatically.`
- Supporting bullets:
  - `Currency: SAR (halala)`
  - `Estimate shown before run`
  - `Settlement after completion`

### Final CTA band
- Title:
  - `Ship faster with a clear path from first run to production workflows`
- Body:
  - `Use the browser for speed, then move to container jobs when your team needs repeatability.`
- Primary CTA:
  - `Create Renter Account`
- Secondary CTA:
  - `Read Provider Guide`

## 2) Feature copy rewrite (benefit-led)

### Current-to-proposed direction
- Feature: `Playground`
- Proposed headline: `From idea to first validated workload in one session`
  - Proposed body: `Use the web interface to submit jobs quickly, validate output, and iterate before automating.`
- Feature: `Container Jobs`
  - Proposed headline: `Bring your Docker workflow without retooling`
  - Proposed body: `Package workloads as containers and run them through DCP job APIs for consistent execution patterns.`
- Feature: `Provider Network`
  - Proposed headline: `Access live GPU supply without long commitments`
  - Proposed body: `Browse available providers and submit workloads based on your runtime needs.`
- Feature: `Provider Earnings`
  - Proposed headline: `Turn idle NVIDIA GPUs into SAR`
  - Proposed body: `Install the daemon, receive jobs, and track earnings from completed workloads.`
- Feature: `Usage Transparency`
  - Proposed headline: `Know your estimate before launch`
  - Proposed body: `Review estimated spend upfront and settle on actual runtime with automatic balance reconciliation.`
- Feature: `Docs + API`
  - Proposed headline: `Move from dashboard usage to repeatable integration`
  - Proposed body: `Use quickstart guides and API references to standardize how your team submits and tracks jobs.`

## 3) Content outlines (3)

### A) Blog outline: "Playground to Production: A Practical DCP Workflow"
- Audience:
  - Saudi startups and product teams testing AI features.
- Goal:
  - Show the low-friction path from browser experimentation to API/container execution.
- Structure:
  - `Problem`: teams lose time jumping directly into infra work.
  - `Step 1`: run your first workload in Playground.
  - `Step 2`: capture parameters and expected outputs.
  - `Step 3`: move to Docker job submission.
  - `Step 4`: operational checklist (cost estimate, retries, monitoring links).
  - `Close`: choose renter path and start with quickstart.
- CTA:
  - `Start in Playground, then open the Quickstart API steps.`

### B) Technical explainer outline: "How DCP Billing Works (Estimate, Hold, Settlement)"
- Audience:
  - Technical buyers, founders, and finance-aware engineering leads.
- Goal:
  - Reduce purchase hesitation by explaining prepay and post-run settlement clearly.
- Structure:
  - `Model`: SAR + halala basics.
  - `Before run`: estimate and balance check.
  - `During run`: usage tracking at runtime.
  - `After run`: final settlement and unused return.
  - `Provider economics`: 75/25 split context.
  - `FAQ`: common misunderstandings.
- CTA:
  - `Review estimate flow in docs before your first paid job.`

### C) Onboarding guide outline: "Provider Setup: First Earnings in 30 Minutes"
- Audience:
  - GPU owners and small compute operators.
- Goal:
  - Increase provider conversion by reducing setup anxiety.
- Structure:
  - `Requirements`: supported NVIDIA GPU + OS prerequisites.
  - `Registration`: profile and API key flow.
  - `Install`: daemon install and first heartbeat.
  - `Verify`: machine visible + ready for jobs.
  - `Operate`: pause/resume and uptime habits.
  - `Earnings`: how completed jobs map to balance.
- CTA:
  - `Complete registration and run daemon health check.`

## 4) Editorial style guide (DCP web/docs)

### Messaging pillars
- `Clarity over hype`: explain exact user benefit and next action.
- `Proof over promise`: use implementation-backed claims only.
- `Path-based UX copy`: always show the next step (Playground or Container Jobs; Provider onboarding or dashboard).

### Voice and tone
- Clear, direct, and technical-friendly.
- Confident without superlatives.
- Avoid vague adjectives (`best`, `revolutionary`, `unlimited`, `instant scale`).

### Claim safety rules
- Allowed:
  - `container-based workloads`
  - `prepay estimate and settlement`
  - `75/25 platform split`
  - `API and dashboard workflows`
- Do not claim:
  - bare-metal provisioning
  - guaranteed savings versus named competitors
  - guaranteed earnings or utilization
  - unsupported compliance certifications

### CTA rules
- Primary CTA starts with an action verb (`Start`, `Create`, `Open`, `View`).
- Secondary CTA reduces risk (`Read docs`, `See how billing works`).
- Avoid ambiguous CTA labels (`Learn More`) unless paired with specific destination text.

### Lexicon
- Prefer:
  - `rent GPUs`, `earn with GPUs`, `container jobs`, `prepay estimate`, `actual runtime settlement`.
- Avoid legacy/internal phrasing:
  - `DC1`, `raw VPS`, `bare metal`.

## Suggested file-level implementation map
- Homepage: `app/page.tsx`
- Header/Footer labels: `app/components/layout/Header.tsx`, `app/components/layout/Footer.tsx`
- Renter quickstart copy touchpoints: `app/docs/page.tsx`, `app/docs/quickstart/page.tsx`
- Provider conversion/supporting copy: `app/earn/page.tsx`, `app/setup/page.tsx`
