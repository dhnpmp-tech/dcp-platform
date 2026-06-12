# Arabic Customer-Service Benchmark

A small, honest, runnable benchmark for the one claim DCP needs to back when a reviewer says *"open Arabic models disappoint versus GPT-4o/Claude."*

## The claim under test

DCP does **not** claim to beat frontier models on open-ended Arabic chat. It claims that for a **narrow, high-volume Saudi task** — here, customer service — a smaller model can be *good enough at the task* while being far cheaper and fully in-Kingdom, and that a **fine-tuned** model closes the remaining gap. This benchmark is how we prove (or disprove) that with numbers instead of adjectives.

## What it measures

For each candidate model, across 10 fixed Saudi customer-service tasks (`tasks.jsonl` — order status, refunds, an angry complaint, dialect, escalation, billing dispute, etc.):

- **Quality** — scored 1–5 by an LLM judge against each task's own rubric (anonymized outputs). The rubric checks task-completion and Saudi-appropriate tone, not general eloquence.
- **Latency** — real end-to-end ms per response.
- **Cost** — token usage (× the published per-token rate).

It is **honest by construction**: it never fabricates scores. With no judge key it still runs the DCP side and records latency + raw outputs for review; scores only appear when a judge model is configured.

## How to run

```bash
# DCP side only (latency + outputs; no scores without a judge):
DCP_API_KEY=dcp-renter-... DCP_MODEL=qwen2.5:7b node run.mjs > results.json

# Full comparison (adds the frontier candidate AND enables judge scoring):
DCP_API_KEY=dcp-renter-... OPENAI_API_KEY=sk-... FRONTIER_MODEL=gpt-4o node run.mjs > results.json
```

## First baseline — DCP `qwen2.5:7b`, raw (un-fine-tuned), run 2026-06-12

| metric | value |
|---|---|
| tasks completed | 10 / 10 |
| avg latency | ~7.8 s (range 2.3–18.8 s; single-stream, current consumer hardware) |
| quality score | not yet scored — no frontier/judge key in this run |

**The honest headline finding:** on task `cs-01` (order status), the raw `qwen2.5:7b` **drifted out of Arabic into machine-translated Chinese mid-reply** — an unusable response. Other tasks (e.g. `cs-02` refund) produced acceptable Saudi-toned Arabic. So the un-tuned general 7B is **not production-grade for Arabic customer service** — exactly the weakness the external reviewer named.

**Why this is the result we want, not a problem:** it validates the strategy instead of contradicting it. DCP's position is *not* "raw small open models are great at Arabic" — it's "raw open models disappoint, which is why the product is **fine-tuning + the harness**, not a menu of base models." This benchmark gives us (a) a concrete, reproducible baseline, (b) a failure mode to fix (language drift — addressable with a system-prompt guard, a language-locked decoding setting, or a fine-tune), and (c) the exact instrument to show the delta once a fine-tuned model is served.

## Next steps (to turn this into a slide)

1. Run with `OPENAI_API_KEY` to get judge scores + the frontier comparator (quality, latency, cost side by side). Needs a frontier key — not in this repo.
2. Add the language-drift guard and a fine-tuned Arabic CS model as a third candidate; publish the before/after.
3. Stamp each run with a date and keep `results.json` snapshots here as the evidence trail.

> Discipline (per the positioning doc): we make **no public Arabic-quality claims** until this benchmark has judge scores against a frontier model on these tasks. Today we publish latency and the honest baseline finding above — nothing more.
