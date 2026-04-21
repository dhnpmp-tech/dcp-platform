# Pricing Audit & Normalization Proposal

**Status:** proposal — no live rates changed.
**Owner:** Peter to decide which changes land.
**Context:** Tito's external audit flagged a "~133× pricing spread" across
DCP's model catalog and suggested tiers were out of whack. This doc
reconstructs where that number comes from, separates legitimate spread
from confusing presentation, and proposes a narrow set of changes.

---

## TL;DR

1. The **real** per-unit spreads are tight:
   - GPU hourly rates: 27.5× (H200 $2.45/hr → RTX 3080 $0.089/hr) — *this
     spread is correct* and tracks the hardware cost curve.
   - Per-token model rates: **2.2×** (10–22 halala / 1M tokens).
   - Job-type rates: **2.5×** (6–15 halala/min).
   - Pricing-class multiplier: 1.33× (economy ↔ priority).
2. The **133× number** surfaces when a renter compares an enterprise
   H200 time-billed task against an entry RTX-3080 throughput-billed task
   — they are genuinely different products and should not be compared at
   the pricing page.
3. The real customer-facing problem is **presentation**, not rates:
   `/v1/models` currently emits both a `pricing.usd_per_minute` and three
   `pricing.usd_per_1m_input/output_tokens` fields that are set to the
   same value. That collapse makes the per-token rates look miscalibrated.
4. Proposal: fix the presentation, add a simple "estimated cost for your
   workload" helper, do **not** change base rates. Strategic brief rates
   stay in force.

---

## Current pricing layers

### 1. GPU hourly base rate (`backend/src/config/pricing.js`)

| GPU | DCP $/hr | Vast.ai | RunPod | AWS | Tier |
|---|---|---|---|---|---|
| H200 | 2.450 | 4.50 | 5.49 | 8.00 | enterprise |
| H100 | 1.890 | 2.50 | 3.49 | 5.67 | enterprise |
| A100 | 1.200 | 1.89 | 2.29 | 3.06 | high |
| RTX 4090 | 0.267 | 0.350 | 0.440 | 0.750 | standard |
| RTX 4080 | 0.178 | 0.230 | 0.290 | 0.500 | standard |
| RTX 3090 | 0.134 | 0.200 | 0.240 | 0.400 | standard |
| RTX 3080 | 0.089 | 0.130 | 0.160 | 0.280 | entry |

**Spread**: 2.450 / 0.089 = **27.5×**. This is legitimate — H200 hardware
is ~30× more expensive to operate than RTX 3080 (raw GPU cost, memory
bandwidth, power, cooling). DCP undercuts every competitor at every tier
by 20–51%. Leave alone.

### 2. Per-token model rate (`cost_rates` table, `backend/src/db.js`)

| Model | halala / 1M tokens | $/1M tokens @ SAR 3.75 |
|---|---|---|
| `mistralai/Mistral-7B-Instruct-v0.2` | 22 | 0.0587 |
| `meta-llama/Meta-Llama-3-8B-Instruct` | 19 | 0.0507 |
| `__default__` | 19 | 0.0507 |
| `microsoft/Phi-3-mini-4k-instruct` | 17 | 0.0453 |
| `google/gemma-2b-it` | 15 | 0.0400 |
| `TinyLlama/TinyLlama-1.1B-Chat-v1.0` | 10 | 0.0267 |

**Spread**: 22 / 10 = **2.2×**. Also legitimate — larger models genuinely
cost more to serve.

### 3. Job-type rate (`JOB_TYPE_RATES_HALALA_PER_MIN`)

| Job type | halala/min | $/hr |
|---|---|---|
| `rag-pipeline` | 15 | 0.667 |
| `rendering` / `image_generation` | 10 | 0.444 |
| `llm-inference` / `vllm_serve` | 9 | 0.400 |
| `training` / `custom_container` | 7 | 0.311 |
| `default` | 6 | 0.267 |

**Spread**: 15 / 6 = **2.5×**. Kept for legacy job submissions that don't
specify a GPU. Reasonable.

### 4. Pricing-class multiplier

| Class | Multiplier |
|---|---|
| priority | 1.20 |
| standard | 1.00 |
| economy | 0.90 |

Spread: 1.33×. Deliberately small.

### 5. Storage / bandwidth (flat)

| Item | Rate |
|---|---|
| Storage | 50 halala/GB/month ($0.13) |
| Bandwidth | 10 halala/GB ($0.027) |

---

## Where does "133×" come from?

Two ways a comparison can balloon to ~133×:

1. **Time-billed vs throughput-billed comparison.** An H200 priority task
   at 2.45 × 1.20 = $2.94/hr, compared to the smallest model's per-token
   rate applied to a TinyLlama task running on an RTX 3080 fraction —
   the *effective* per-hour cost for a light job could look like $0.02.
   Ratio: ~147×. But this is comparing apples (dedicated enterprise GPU
   time) to oranges (tokenized inference on a shared small GPU).

2. **Display artifact in `/v1/models`.** Look at
   `src/lib/model-catalog-contract.js:79–83`:

   ```js
   pricing: {
     usd_per_minute: usdPerMinute,
     usd_per_1m_input_tokens: usdPerMinute,
     usd_per_1m_output_tokens: usdPerMinute,
   }
   ```

   Same number displayed under three different labels. If an external
   observer (like Tito) plots this, the rate appears once as "per minute"
   (~$0.05/min → $3/hr) and once as "per 1M tokens" (also ~$0.05/1M,
   which is literally 60× cheaper than per-minute if you treat them as
   the same unit). The relative mis-labeling creates the illusion of a
   huge spread.

**This is a documentation bug, not a pricing bug.**

---

## Proposal

Three narrowly-scoped changes, two in code (safe), one in data (Peter
decides).

### A. Fix the `/v1/models` `pricing` field *(ships safely)*

In `src/lib/model-catalog-contract.js`:

- Compute `usd_per_minute` and `usd_per_1m_tokens` as separate values.
- `usd_per_minute` stays as today (from `default_price_halala_per_min`).
- `usd_per_1m_input_tokens` / `usd_per_1m_output_tokens` pull from the
  `cost_rates` table lookup (same source the settlement code uses), so
  the OpenRouter-compat API is honest about which axis bills which.

This eliminates the visual 133× illusion immediately.

### B. Add `pricing_explanation` helper to `/v1/models` *(ships safely)*

Include a short string per model explaining the active billing axis:

```json
"pricing_explanation": "Billed per 1M tokens (OpenAI-compatible); GPU time allocated from Saudi RTX 4090 pool"
```

This surfaces the correct mental model for renters and makes audits
easier.

### C. Revisit `__default__` token rate *(Peter decides)*

Current `__default__ = 19 halala / 1M tokens` is fine for 7-8B models,
but the catalog now lists 30B MoE and 35B models that should charge
more. Options:

1. Leave flat and accept a small margin compression on big models
   (simplest).
2. Add size-based default tiers: 4B→15, 8B→19, 14B→24, 30B+→32.
3. Require explicit `cost_rates` entries for every new model and raise
   `__default__` to prevent accidental zero-margin listings.

Recommend option 2 — aligns with existing per-model entries, modest
admin overhead, roughly preserves the 23-51% undercut versus Vast.ai.

---

## Non-changes

- **No GPU base rates change.** The strategic brief rates remain the
  floor. We already undercut Vast.ai by 20-51% at every tier.
- **No pricing-class multipliers change.** 0.90 / 1.00 / 1.20 is a clean
  scale that renters understand.
- **Storage and bandwidth stay flat.** Small revenue share; complex
  tiering here would confuse more than it helps.

---

## Implementation plan (if Peter approves A + B)

New file: `backend/src/lib/pricing-view.js` — pure helpers that derive
the various display fields from a single source of truth
(`config/pricing.js` + `cost_rates` DB rows).

Modify: `backend/src/lib/model-catalog-contract.js` to consume the
helper.

Tests: `backend/tests/catalog/pricing-view.test.js` covering the
separation between per-minute and per-1M-token rates, and the
`pricing_explanation` string.

Effort: ~3 hours implementation + test. No live rates touched.

---

## Open question for Peter

Should we publish a "how DCP pricing works" page on `dcp.sa/pricing`
that walks through these layers plainly? Current marketing hand-waves
"Saudi energy arbitrage = cheap" which is true but doesn't help a
procurement team actually evaluate us. A clear public doc would:

- Cut support load (questions about why a job cost X).
- Differentiate from competitors whose pricing is actively
  adversarial.
- Support investor conversations (cost+margin visibility is a pitch
  slide).

Would need copy + legal review before publish.
