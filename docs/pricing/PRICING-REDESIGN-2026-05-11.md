# DCP Pricing Redesign — Spec
**Status**: Draft, 2026-05-11
**Owner**: dcp-dev
**Drives**: PR (a) `/v1/chat/completions` per-token billing, PR (b) marketplace deploy modal unit fix

---

## TL;DR

DCP currently bills per-minute on every model in the catalog. That is the worst-of-both-worlds unit: too granular for renters who think in tokens (OpenRouter/Together model), too imprecise for compute renters who think in GPU-hours (Vast/RunPod model).

This spec replaces that with a **two-axis** scheme:

| Surface | Billing unit | Rationale |
|---|---|---|
| `POST /v1/chat/completions` and `/v1/embeddings` (the inference API) | **per million tokens**, input + output separately | Matches OpenRouter/Together/OpenAI mental model |
| `POST /api/jobs/from-template` (marketplace "Deploy a model" button) | **per million tokens**, with a `min_duration_minutes=60` floor for displayed monthly cost | A deploy is conceptually access to a model, not GPU rental |
| `POST /api/jobs` for training / batch / Jupyter / SD-server | **per GPU-hour** | Renter is reserving compute, not making requests |
| Provider settlement | **70% of renter spend on either axis** | Standard marketplace take rate |

The catalog's `default_price_halala_per_min` column is replaced by `price_in_halala_per_1m_tok` and `price_out_halala_per_1m_tok` (inference) plus an existing GPU-hour rate table (training/batch already implemented in `config/pricing.js`).

---

## Why we're moving off per-minute

**1. Tareq's screenshot.** The marketplace quoted `ALLaM 7B Arabic` at **27.00 SAR/hr**. The user-facing question: "where did 27 come from?" Answer: `model_registry.default_price_halala_per_min = 45` × 60 / 100. **A renter cannot rationalize this number against any competitor.** OpenRouter shows them `$0.15 per 1M output tokens`. They cannot multiply their way from 27 SAR/hr to a budget estimate without first guessing token throughput.

**2. The 27 SAR/hr is a flat tier number, not a market-derived value.** 13+ models in the catalog all share `default_price_halala_per_min ∈ {45, 60, 80}` regardless of model size, family, or actual cost-to-serve. Symptom: every consumer-GPU model surfaces at either 27 or 36 or 48 SAR/hr, with no relationship to the model's economics.

**3. Cost-plus is impossible per-minute across mixed provider types.**
   - Saudi hobbyist on owned RTX 3090: electricity cost ~$0.05/hr.
   - Saudi reseller on RunPod-rented A100: rental cost $1.89/hr.
   - **A single per-minute rate can be cost-plus on one but not both.** Per-token shifts the question from "what does this hardware cost per hour?" to "what is this *output* worth?", which is the right question.

**4. Token billing aligns with the ELM thesis** (`project_elm_strategy.md`). Long-tail expert models serving N small requests over a day need pay-per-call economics, not GPU reservation economics.

---

## What changes in the data model

### `model_registry` (today)

```
default_price_halala_per_min  INTEGER  -- single number, applied per-minute
```

### `model_registry` (proposed)

```
price_in_halala_per_1m_tok    INTEGER  -- input cost per 1M tokens, in halala
price_out_halala_per_1m_tok   INTEGER  -- output cost per 1M tokens, in halala
billing_unit                  TEXT     -- 'per_million_tokens' | 'per_minute' (legacy, default new=per_million_tokens)
-- default_price_halala_per_min stays as a fallback for legacy callers, deprecation in 90 days
```

Migration:
- `008_pricing_per_token.sql` — adds the three columns.
- `009_seed_pricing_per_token.sql` — seeds values from the tier table below.

### `providers` (today)

```
price_per_min_halala  INTEGER  -- per-minute override, set by provider
```

### `providers` (proposed — additive only)

```
price_in_halala_per_1m_tok_override   INTEGER  -- nullable, falls back to model_registry
price_out_halala_per_1m_tok_override  INTEGER  -- nullable, falls back to model_registry
provider_type                          TEXT     -- 'owned' | 'rented' — drives eligibility filters
```

### `jobs` (today)

```
cost_halala  INTEGER  -- estimated cost at submission
```

### `jobs` (proposed)

```
cost_halala              INTEGER  -- estimated cost at submission (unchanged)
prompt_tokens_billed     INTEGER  -- actual tokens charged after run
completion_tokens_billed INTEGER  -- actual tokens charged after run
final_cost_halala        INTEGER  -- actual cost after run (may differ from estimate)
```

### New table: `usage_events`

```sql
CREATE TABLE usage_events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  renter_id         INTEGER NOT NULL,
  provider_id       INTEGER NOT NULL,
  job_id            TEXT,
  model_id          TEXT NOT NULL,
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cost_halala       INTEGER NOT NULL DEFAULT 0,
  provider_payout_halala INTEGER NOT NULL DEFAULT 0,
  dcp_take_halala   INTEGER NOT NULL DEFAULT 0,
  occurred_at       TEXT NOT NULL,
  request_id        TEXT,
  idempotency_key   TEXT,
  UNIQUE(idempotency_key)
);
CREATE INDEX idx_usage_events_renter_time ON usage_events (renter_id, occurred_at);
CREATE INDEX idx_usage_events_provider_time ON usage_events (provider_id, occurred_at);
```

Every billable inference call writes one row. Idempotency key prevents double-billing on retries.

---

## Proposed rate card

All in **halala per 1M tokens**. 100 halala = 1 SAR. 3.75 SAR ≈ 1 USD.

| Tier | Param range | Examples | Input | Output |
|---|---|---|---|---|
| **Embeddings / reranker** | n/a | BGE-M3, BGE-reranker | 8 halala (≈$0.02) | n/a |
| **Small (S)** | ≤9B | Llama 3.1 8B, Qwen 3 4B/8B, Phi-3, Mistral 7B, ALLaM 7B, Falcon H1 7B | 30 halala (≈$0.08) | 60 halala (≈$0.15) |
| **Mid (M)** | 10–30B | Qwen 3 14B, GLM-4 9B, Gemma 3 27B, DeepSeek R1 Distill 7B | 80 halala (≈$0.20) | 150 halala (≈$0.40) |
| **Large (L)** | 30–70B | Qwen 3 30B-A3B, DeepSeek R1, Gemma 4 31B | 260 halala (≈$0.70) | 940 halala (≈$2.50) |
| **XL** | 70B+ (post-launch) | Llama 3.3 70B, DeepSeek V4 | TBD | TBD |

Anchors *(verified 2026-05-11 from OpenRouter + Together AI pricing pages)*:
- OpenRouter Qwen 3.5 9B: $0.04 in / $0.15 out per 1M.
- Together Llama 3 8B Lite: $0.10 / $0.10.
- Together Qwen 2.5 7B Turbo: $0.30 / $0.30.
- Together DeepSeek R1: $3.00 / $7.00.

DCP positions **at OpenRouter's median**, not floor — we win on PDPL + in-kingdom + provider economics, not on being cheapest.

### Per-GPU-hour rate (training/batch/Jupyter)

This already exists in `config/pricing.js` as `GPU_RATE_TABLE`. Keep it. Document it:

| GPU class | DCP rate (SAR/hr) | Vast.ai approx | RunPod approx | Source |
|---|---|---|---|---|
| RTX 3060 Ti 8GB | 3 | 1.5 | 2.5 | owned-hardware bias |
| RTX 3090 24GB | 4 | 3 | 4–5 | |
| RTX 4090 24GB | 7 | 5 | 7–10 | |
| A5000 24GB | 9 | 6 | 10 | |
| A6000 48GB | 14 | 10 | 18 | |
| A100 40GB | 18 | 14 | 22 | |
| A100 80GB | 22 | 18 | 28 | |
| H100 80GB | 35 | 28 | 50 | matches Together $3.99/hr × 3.75 USD→SAR + tax |

---

## Provider settlement

**Renter pays X. DCP keeps 30%. Provider gets 70%.**

Single number, applied to both axes. No tiered take rates — that's a future optimization, not a launch concern.

### Unit economics — does each provider type clear?

*Assumes 100 tokens/sec sustained output for a 7B-class model on consumer hardware.*

#### Owned RTX 3090, Small-tier model

- Throughput: 100 tok/s → 360k tok/hr output × 60 halala/1M = **21.6 halala/hr renter spend**
- Provider gets 70% = **15.1 halala/hr ≈ 0.15 SAR/hr revenue**
- Electricity at 350W × 0.18 SAR/kWh = **0.063 SAR/hr**
- **Net margin: ~2.4× over electricity.** Works, but tight at low utilization.
- At 30M tok/day sustained = **4.5 SAR/day revenue per provider.** That's $1.20/day USD. Saudi hobbyist with the GPU already sunk is fine with this; it's not a Mada salary.

#### Owned RTX 4090, Mid-tier model

- Throughput: 60 tok/s on 14B-class → 216k tok/hr × 150 halala/1M = **32.4 halala/hr**
- Provider gets 70% = **22.7 halala/hr ≈ 0.23 SAR/hr.**
- Electricity at 450W × 0.18 = **0.081 SAR/hr.**
- **Net margin: ~2.8×.** Same shape.

#### Rented A100 80GB on RunPod ($1.89/hr ≈ 7.1 SAR/hr), Mid-tier

- Throughput: 200 tok/s → 720k tok/hr × 150 halala/1M = **108 halala/hr**
- Provider gets 70% = **75.6 halala/hr ≈ 0.76 SAR/hr.**
- Rental cost: **7.1 SAR/hr.**
- **Net: −6.3 SAR/hr. Provider LOSES money** unless throughput is 10× higher (>2000 tok/s, which is not realistic for a single 14B model on one A100 without aggressive batching).

#### Rented A100 80GB, Large-tier with batching

- Throughput: 500 tok/s batched, 100% output-heavy → 1.8M tok/hr × 940 halala/1M = **1692 halala/hr ≈ 16.9 SAR/hr**
- Provider gets 70% = **11.8 SAR/hr.**
- Rental: **7.1 SAR/hr.**
- **Net: +4.7 SAR/hr.** Works.

### Conclusion: provider type drives model eligibility

- **`provider_type='owned'`** providers eligible for **all** tiers.
- **`provider_type='rented'`** providers only eligible for **Large** inference OR **per-GPU-hour** bookings. The marketplace filter must enforce this; the deploy modal must hide rented providers from Small/Mid model deploys.

This is the cleanest reading of "build a system that makes sense for us, renters, and providers": **the only way to make all three economics work simultaneously is to recognize that rented providers don't have a place in the small-model long-tail at any per-token price the renter will pay.** Today we're papering over that with flat 27 SAR/hr quotes; the right answer is to acknowledge it in the data model.

---

## Implementation plan

### Phase 1 — Database + spec (this PR, today)

1. Migration `008_pricing_per_token.sql` — adds the three columns to `model_registry`, two override columns + `provider_type` to `providers`, three result columns to `jobs`.
2. Migration `009_seed_pricing_per_token.sql` — seeds the rate card above.
3. This spec, version-controlled at `docs/pricing/PRICING-REDESIGN-2026-05-11.md`.
4. Migration `010_usage_events.sql` — creates `usage_events`.

### Phase 2 — Marketplace UI fix (PR b, today/tomorrow)

`app/renter/models/page.tsx` lines 217–222 (deploy modal "Estimated Rate"):

- Replace `priceHr.toFixed(2)} SAR/hr` with **two side-by-side numbers**:
  - "Input: 0.30 SAR / 1M tokens"
  - "Output: 0.60 SAR / 1M tokens"
- Add small-print: "≈ X SAR for a typical 1000-call workday" (use a configurable conversion assumption; default 2k in / 600 out per call).
- The `priceHr` calculation in `getPriceHr()` should pull from the new `price_in_halala_per_1m_tok` / `price_out_halala_per_1m_tok` and surface both. The legacy `avg_price_sar_per_min` path stays as a fallback for ≤30 days.

### Phase 3 — /v1 token billing (PR a, ~1–2 days)

In `backend/src/routes/v1.js`:

1. After `proxyToProviderEndpoint` returns, parse `usage.prompt_tokens` and `usage.completion_tokens` from the upstream response.
2. Look up the model's `price_in_halala_per_1m_tok` and `price_out_halala_per_1m_tok` (or provider override).
3. Compute `cost_halala = ceil((prompt_tokens × price_in + completion_tokens × price_out) / 1_000_000)`.
4. Open transaction:
   - `UPDATE renters SET balance_halala = balance_halala - ?`
   - `INSERT INTO usage_events ...` with idempotency key derived from request_id.
5. Return the same response to the renter, with an additional header `x-dcp-cost-halala`.
6. Provider payout = `ceil(cost_halala × 0.70)` written into `provider_payout_halala`. Settles into a payout queue, not balance.

Tests required:
- Negative balance pre-check (reject with 402 before proxying).
- Idempotent re-charging on retry.
- Round-trip of `usage` field across SSE streams (currently the gateway pipes bytes — need to inspect the closing chunk).

### Phase 4 — Provider type tagging (PR d, separate)

1. Tauri installer sets `provider_type` based on a question or auto-detect (cloud GPU vendor IP range).
2. Marketplace `/api/models` filter excludes rented providers from Small/Mid tiers.
3. Provider dashboard shows their current type + which tiers they're eligible for.

### Out of scope

- Spot vs reserved pricing
- Volume discounts
- Renter pre-paid commitments
- Provider-set pricing premiums (e.g. "I serve ALLaM faster, I want 1.5× rate")

These are all real, none are launch-blocking.

---

## Migration timeline

- **D+0 (today)**: Spec lands, migrations 008/009/010 land. No user-visible change yet.
- **D+1**: Marketplace UI shows per-1M-token prices, with a "(legacy rate: X SAR/hr)" annotation for the first week. PR b ships.
- **D+3**: Per-token billing live on `/v1/*`. PR a ships behind feature flag `BILLING_PER_TOKEN_ENABLED`. Existing per-minute billing on `POST /api/jobs` remains the default for now.
- **D+7**: Flag flipped to true in prod. Per-minute billing on inference paths deprecated.
- **D+30**: `default_price_halala_per_min` column dropped from `model_registry`.

---

## Open questions to resolve before PR (a) merges

1. **SSE token usage**: does our existing vLLM proxy capture `usage` in the final SSE chunk? Need to verify against the v1.js code path — earlier today we saw the gateway just pipes bytes for the Anthropic format. If usage isn't surfaced in the proxied response, we need to add a parser.
2. **Tokenizer mismatch on embeddings**: BGE-M3 doesn't use chat-style tokens. Bill by **request size in bytes/1024** instead? Or treat any embedding call as a flat ¼ halala?
3. **Image generation models** (SDXL, ControlNet): not tokens. Likely separate axis = **per image** at fixed price. Add to spec when those models matter again.
4. **Provider auto-detection of `provider_type`**: a Saudi hobbyist installing on bare metal at home → `owned`. Same hobbyist installing in a RunPod pod → `rented`. Need a heuristic (IP geolocation? VM detection? installer prompt?).

---

## Anti-goals (things I explicitly chose NOT to do)

- **Single per-second billing across everything.** Too granular, hides margin loss.
- **Vast.ai-style provider-set bidding.** Adds market liquidity but breaks transparent rate cards renters can comparison-shop. Defer.
- **Cost-plus model with provider self-reporting their basis.** Open to gaming. Stick with revenue-share.
- **Per-token billing on training jobs.** Tokens aren't the unit consumed; GPU-time is. Keep per-hour for training.

---

## Comparable structures (verified anchors)

| Platform | Inference unit | Compute unit | Provider take | Source |
|---|---|---|---|---|
| OpenRouter | per 1M tokens | n/a (aggregator) | ~5–10% | their public pricing |
| Together AI | per 1M tokens | per GPU-hour | n/a (single-vendor) | verified above |
| Vast.ai | n/a | per GPU-hour | ~70% | their docs |
| RunPod | per token + per GPU-hour | per GPU-hour | n/a | verified above |
| Anthropic / OpenAI | per 1M tokens | n/a | n/a | their pricing pages |

DCP is the **only** platform that needs both axes simultaneously (we're both a model aggregator AND a compute marketplace). Hence the dual-axis design.
