# Tareq Trial and On-Demand Pricing Plan - 2026-07-07

This plan distills Tareq's trial/on-demand request and maps it to the current DCP
codebase. It intentionally separates confirmed requirements from open product
decisions.

## Confirmed Requirements

Supply must be treated as three backend-visible tiers:

- `dcp_owned`
- `provider`
- `on_demand`

Trial/free behavior:

- Trial accounts get 2 hours free total lifetime.
- Free trial time can be used only on `dcp_owned` and `provider` supply.
- `on_demand` pods are blocked for trial accounts by default.
- On-demand access requires prepaid credit.
- A SAR 10 deposit should unlock on-demand pods costing up to 10 SAR/hour for
  1 hour, subject to final semantics.
- Payment for on-demand is always prepaid.
- No minimum deposit should be introduced unless explicitly approved.
- Renter-facing balance should be presented as "Credit", not primarily as SAR.
- SAR equivalents belong in withdrawal/accounting contexts.

Do not ship:

- Deposit incentives or larger-deposit bonuses without Peter's signoff.
- A subscription-tier interpretation unless Peter/Tareq explicitly choose it.
- Any cloud-vendor leak in renter UI or APIs.

## Current Code Reality

Pod launch:

- `backend/src/routes/pods.js` already pre-debits pod quote and refunds unused time.
- Burst/on-demand launch failures already refund exactly once.
- Auto-pick currently avoids burst providers by default.
- Explicit provider or GPU-type launch can reach burst/on-demand rows.

Provider discovery:

- `backend/src/routes/renters.js` returns renter-safe provider views.
- It has internal `on_demand`/`discovery_source` concepts for burst rows, but the
  frontend intentionally avoids reading `on_demand`.

Wallet:

- `app/(site)/renter/wallet/page.tsx` currently speaks in wallet/SAR terms.
- API responses expose halala/SAR fields for accounting.

Trial:

- `POST /api/renters/agent-register` currently grants 20 SAR starter credit via
  `trial_grant_halala = 2000`.
- That is not the same as "2 lifetime hours on non-on-demand supply".
- Existing aggregate balance does not reliably distinguish free/trial credit from
  paid credit.

Schema:

- Production has `providers.is_burst`, but no explicit `providers.supply_tier`.
- Production has `renters.trial_grant_halala`, but no explicit lifetime trial
  seconds counter.
- Local SQLite data was stale during audit; production schema must drive migration
  design.

## Recommended Architecture

### 1. Add Backend Supply-Tier Source of Truth

Introduce a backend-visible provider supply tier, either as a real column or a
central classifier.

Preferred durable version:

- Add `providers.supply_tier TEXT` with allowed values:
  - `dcp_owned`
  - `provider`
  - `on_demand`
- Backfill:
  - `on_demand` where `providers.is_burst = 1`
  - `dcp_owned` for known DCP-operated nodes
  - `provider` for community/native provider machines

Status as of PR #764:

- `providers.supply_tier` is added to fresh and upgraded SQLite schemas.
- `on_demand` is backfilled for `is_burst=1` rows.
- native rows default to `provider`.
- `DCP_OWNED_PROVIDER_IDS` can mark reviewed DCP-operated native rows.
- `is_burst=1` still wins over a bad explicit tier so on-demand capacity cannot
  accidentally bypass paid-credit checks.

Short-term fallback if migration risk is too high:

- Centralize `getProviderSupplyTier(provider)` in backend code.
- Derive `on_demand` from `is_burst = 1`.
- Keep `dcp_owned` vs `provider` behind a reviewed allowlist until schema lands.

Do not expose `supply_tier` directly to renters unless product explicitly wants it.
Backend policy can know a provider is on-demand while UI continues saying "DCP
capacity" or "available GPU".

### 2. Separate Paid Credit From Free Trial Entitlement

The on-demand gate needs to know whether the renter has paid credit, not just
whether aggregate balance is positive.

Preferred durable version:

- Add a credit-source concept:
  - paid credit
  - trial/free credit
  - promotional/manual credit if needed
- Enforce on-demand against paid available credit.
- Track lifetime free trial usage in seconds, not SAR, because the requirement is
  "2 hours" and prices vary by GPU.

Possible data model:

- `renters.trial_free_seconds_total DEFAULT 7200`
- `renters.trial_free_seconds_used DEFAULT 0`
- `renter_credit_ledger.source IN ('paid', 'trial', 'promo', 'refund', ...)`

If avoiding broader ledger work in the first slice:

- Use historical top-ups or payment records as the "has paid credit" signal.
- Keep a clear TODO to replace it with ledger-derived paid available credit.

Status as of PR #764:

- the backend gate uses paid/refunded payment history as the paid-credit signal.
- existing on-demand pod commitments are subtracted from paid credit available.
- explicit `supply_tier='on_demand'` commitments now count, not just legacy
  `is_burst=1` commitments.
- lifetime trial-seconds accounting remains a future product/schema slice.

### 3. Gate Pod Launch in One Backend Place

Policy should run after provider/GPU resolution and before debit/job creation:

1. Resolve provider and compute quote.
2. Determine backend supply tier.
3. Determine renter trial state and paid-credit state.
4. If `supply_tier = on_demand` and renter lacks paid credit, return HTTP 402:
   - `code: ON_DEMAND_REQUIRES_PREPAID_CREDIT`
   - include required credit/deposit guidance.
5. If `supply_tier != on_demand`, allow trial time until lifetime free seconds
   are exhausted.
6. After free trial time is exhausted, require credit for all pod launches.

Keep existing prepaid debit/refund mechanics. The new policy should decide whether
a launch is allowed and which credit bucket pays for it; it should not reimplement
pod settlement.

Status as of PR #764:

- `POST /api/pods` already calls the centralized policy after provider
  resolution and before prepaid debit/job creation.
- on-demand failures return structured HTTP 402 with
  `on_demand_requires_prepaid_credit`.
- launch, stop, failure-refund, and extend billing mechanics remain unchanged.

### 4. Treat the SAR 10 Rule as a Product Gate

Interpretation needing confirmation:

- A SAR 10 deposit unlocks on-demand pods only when the pod's hourly rate is
  <= 10 SAR/hour and the requested duration is <= 60 minutes.
- More expensive GPUs remain blocked unless the user has enough prepaid credit for
  the actual quote.

This means a SAR 10 deposit could unlock GPUs such as RTX 4090/L40S/A100-class
rows depending on live prices, but not H100/H200/B200-class rows if their rates
exceed 10 SAR/hour.

### 5. Update Renter-Facing Language

Frontend changes:

- Rename wallet/balance primary label to "Credit".
- Avoid showing SAR as the main balance unit in renter flows.
- Keep SAR visible in:
  - top-up amount selection
  - receipts/payment confirmation
  - withdrawal/payout/accounting views
- In pod launch UI, show on-demand restrictions without saying the provider is
  external cloud or exposing a vendor.

Possible copy:

- "Add credit to launch this GPU."
- "Trial credit covers DCP and community GPUs. This GPU requires prepaid credit."

Status as of PR #768:

- Dashboard, playground, usage, invoices, keys, settings, wallet sidebars, shared
  balance/spending cards, low-credit notifications, and insufficient-balance
  redeploy CTAs now use credit-first funding language.
- The add-credit modal reads as a payment-backed credit request flow.
- SAR remains visible for top-up amounts, spend, invoices, payment transfer, and
  accounting contexts.
- `/renter/pods` now handles the structured HTTP 402 launch response from the
  backend gate and renders "Credit required" guidance with available credit,
  required credit, requested duration, and hourly rate facts when supplied.
- The pod-launch block keeps vendor/on-demand internals hidden; renters see
  trial-credit coverage and Add credit guidance instead of supply-tier details.
- Backend `PaymentRequiredError`, generic pod-launch 402, and pod-extend 402 copy
  now also speak in available/required credit and Add credit terms while keeping
  stable `insufficient_balance` machine codes and SAR/halala accounting fields.

Status as of PR #875:

- `/renter/pods` makes the current answer visible before launch: trial credit
  covers DCP/community capacity, while high-demand capacity requires paid credit.
- The UI still hides supplier tier, vendor, provider id, and machine identity.
- Workspace staging is now a compact Stage 1 with collapsed/grouped files, so
  renters with many files can reach Stage 2 without scrolling through the full
  file list.
- Stage 2 now has a prominent selected-compute summary, making it clear whether
  the launch is using auto-pick or a specific GPU type.

## Open Questions Before Shipping

1. After 2 free hours are used and no paid credit exists, is the account fully
   locked from pods until credit is added? Recommended answer: yes.
2. Is the model credit-only, or should subscription tier also unlock on-demand?
   Recommended answer: credit-only for v1.
3. Is the SAR 10 rule strictly "up to 10 SAR/hour for up to 1 hour"?
4. Should paid credit be consumed before trial time, or trial time before paid
   credit on non-on-demand GPUs? Recommended answer: consume trial first unless
   user explicitly chooses otherwise.
5. Which native providers are `dcp_owned` today? This must be a reviewed list,
   not guessed from display names.
6. What is the refund policy for paid credit deposits? Recommended answer: follow
   the existing escrow/refund/top-up policy and do not create a special SAR 10
   refund path.

## Implementation Slices

### Slice 1 - Read-Only Policy Audit

- Confirm production schema and migrations.
- List native providers and decide initial `dcp_owned` backfill.
- Add tests that describe desired gating outcomes before changing behavior.

### Slice 2 - Supply-Tier and Credit-State Backend

- Add migration or central classifier for supply tier.
- Add helper functions:
  - `getProviderSupplyTier(provider)`
  - `getRenterPaidCreditState(renterId)`
  - `getRenterTrialUsageState(renterId)`
- Add policy tests for:
  - trial user on DCP-owned GPU
  - trial user on community provider GPU
  - trial user on on-demand GPU with no paid credit
  - paid user on on-demand GPU
  - exhausted trial user with no credit

### Slice 3 - Pod Launch Gate

- Call the policy helper inside `POST /api/pods`.
- Return structured 402 errors for blocked launches.
- Preserve existing quote, debit, launch, failure-refund, stop-refund, and extend
  behavior.

### Slice 4 - Frontend Wallet and Pod UX

- Rename renter-facing balance to "Credit".
- Update pod launch error handling for the new 402 codes.
- Keep vendor/on-demand internals hidden.
- Add focused UI tests or static regressions for copy and API contract.

Status as of PR #768:

- Credit-first renter copy started in PR #765 and structured pod-launch 402
  handling landed in PR #767.
- Visual evidence exists for `/renter/pods` with a signed renter session and a
  mocked `on_demand_requires_prepaid_credit` response.
- Backend 402 messages and OpenAPI examples were aligned with the same
  credit-first language in PR #768.

### Slice 5 - Production Rollout

- Deploy backend first with gates off or in log-only mode if feasible.
- Verify read-only provider classification on production.
- Enable policy.
- Smoke:
  - trial non-on-demand launch allowed
  - trial on-demand launch blocked
  - paid-credit on-demand launch allowed
  - early stop refund still works
  - wallet shows Credit language

## Files Likely Touched

Backend:

- `backend/src/routes/pods.js`
- `backend/src/routes/renters.js`
- `backend/src/services/creditService.js`
- `backend/src/services/burstPricingService.js`
- `backend/migrations/*`
- Backend tests under `backend/test*` or existing route/static regression tests.

Frontend:

- `app/(site)/renter/pods/page.tsx`
- `app/(site)/renter/wallet/page.tsx`
- Related renter navigation/sidebar components if "Wallet" appears there.

Docs/contracts:

- `docs/openapi.yaml` if response contracts change.
- DCP contracts repo if shared billing/credit semantics are duplicated there.
