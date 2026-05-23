# Arabic-edge benchmark

Hardware-grounded benchmark for picking which Arabic LLMs DCP should host
on consumer-tier GPUs (24GB 3090s / 3060 Tis) for the three edge workloads
Tareq scoped on 2026-05-21:

1. **Translation** — EN↔AR for renter-facing surfaces (UI, docs, errors).
2. **Prompt rewriting** — clean up vague renter prompts before forwarding to
   the central brain (Qwen 3.7-Max / Claude / Codex).
3. **Classification** — decide whether a request can be handled locally on
   the edge node or must escalate.

The benchmark answers "which model wins per task on a 3090?" with real
numbers, not vibes.

## What ships in this directory

```
arabic-edge-bench/
├── README.md                       # this file
├── models.yaml                     # candidate models + quant + runner config
├── datasets/
│   ├── translation.jsonl           # 200 EN↔AR pairs (extracted from app/lib/i18n.tsx)
│   ├── prompt_rewrite.jsonl        # 100 deliberately vague renter prompts
│   └── classification.jsonl        # 500 labeled prompts (5 classes × 100)
├── extract_translation_pairs.py    # regenerate translation set from i18n.tsx
├── generate_classification.py      # regenerate classification set
├── bench.py                        # main harness, OpenAI-compat client
├── aggregate_results.py            # merge per-model JSON → comparison table
└── results/                        # populated after each run
```

## Datasets

| File | N | Source |
|------|---|--------|
| `translation.jsonl` | 200 | Stratified sample of `app/lib/i18n.tsx` EN↔AR pairs across 40 key prefixes |
| `prompt_rewrite.jsonl` | 100 | Curated terse / ambiguous renter prompts with `expected_traits` |
| `classification.jsonl` | 500 | 100 each of {translate, rewrite, chat, reasoning, code}, mixed AR/EN/Arabizi |

## Models

See `models.yaml` for the candidate set. Suggested first batch (4 models,
fast turnaround on one 3090):

1. `falcon-h1-arabic-7b` — current OALL SOTA claim, mamba kernel risk
2. `allam-7b` — Saudi sovereign signal, bulletproof Llama-2 tooling
3. `fanar-1-9b` — Gemma-2 base, most mature inference path
4. `qwen2.5-7b` — generic baseline (real users prefer this in production)

Then expand to Jais-2-8B, Falcon-H1-3B, Cohere R7B Arabic (CC-BY-NC =
internal eval only), Nile-Chat-12B.

## How to run

### Prereqs on Node 2

```bash
# vLLM (preferred for non-Mamba models)
pip install vllm

# llama.cpp (fallback for custom arch / Mamba quirks)
git clone https://github.com/ggerganov/llama.cpp /opt/llama.cpp
cd /opt/llama.cpp && make LLAMA_CUDA=1 -j$(nproc)
```

### Per-model run

```bash
# 1. Start the model on an OpenAI-compat port
#    (one model at a time on a single 24GB card; rerun for each)

#    Option A: vLLM
python -m vllm.entrypoints.openai.api_server \
  --host 127.0.0.1 --port 8000 \
  --model tiiuae/Falcon-H1-7B-Arabic-Instruct \
  --quantization awq_marlin --max-model-len 8192 \
  --served-model-name falcon-h1-ar-7b

#    Option B: llama.cpp
./llama-server -m /models/falcon-h1-arabic-7b.Q4_K_M.gguf \
  --host 127.0.0.1 --port 8000 -c 8192 \
  --api-server-name falcon-h1-ar-7b

# 2. Run the benchmark (in another shell)
python bench.py \
  --endpoint http://127.0.0.1:8000/v1 \
  --model falcon-h1-ar-7b \
  --out results/falcon-h1-ar-7b.json \
  --workers 4

# 3. After all models are done, aggregate
python aggregate_results.py results/
```

### With a judge LM for rewrite quality

The rewrite eval will fall back to substring matching of expected traits
without a judge. Better: give it a Claude Sonnet or GPT-5 endpoint to
score each rewrite 0-10.

```bash
python bench.py \
  --endpoint http://127.0.0.1:8000/v1 \
  --model falcon-h1-ar-7b \
  --judge-endpoint https://api.anthropic.com/v1 \
  --judge-model claude-sonnet-4-6 \
  --judge-key $ANTHROPIC_API_KEY \
  --out results/falcon-h1-ar-7b.json
```

### Smoke test (5 items per eval, no judge)

```bash
python bench.py \
  --endpoint http://127.0.0.1:8000/v1 --model <served-name> \
  --limit-translation 5 --limit-rewrite 5 --limit-classify 5 \
  --out results/smoke.json
```

## What we measure (and why)

| Axis | Metric | Why it matters |
|------|--------|----------------|
| Translation quality | sentence BLEU + ChrF-6 (both directions) | ChrF handles Arabic morphology better than BLEU alone |
| Rewrite quality | Judge-LM 0-10 score | No ground truth; need a stronger model as oracle |
| Classification | Accuracy + per-class precision/recall | The router can't afford 30% false routing |
| Throughput | median tok/s (completion-only) | $/M-tok back-of-envelope depends on this |
| Latency | p50 / p95 ms per call | Edge has to be < 500ms p95 to feel snappy |
| Errors | count of HTTP failures + parse failures | Service stability indicator |

## What's deliberately NOT measured (yet)

- **VRAM usage** during inference — Tareq, please log `nvidia-smi --query-gpu=memory.used,memory.total --format=csv` snapshots while bench runs and attach to the result JSON. Will fold into v0.2.
- **Cold-start time** for model load — measure once per model with `time` and add to the model row manually.
- **Long-context performance** (>4k tokens) — none of these tasks need it; will add when Arabic-RAG is in scope.
- **ArabicMMLU / OALL** — academic benchmarks; we care about commercial workload performance instead.

## Result reproducibility

- All datasets pin a seed (`random.seed(42)`) and are checked in.
- BLEU/ChrF implementations are no-dep so no version drift.
- Bench script writes the full per-item output so anyone can re-score later.

## Open questions / TBD before declaring "done"

1. Confirm vLLM has Falcon-H1 Mamba kernel support on RTX 3090 (Ampere).
   If not, fall back to llama.cpp for both Falcon-H1 variants.
2. Confirm Jais-2-8B HF id once Inception ships it (we have a placeholder).
3. Decide whether to use Claude Sonnet 4.6 or Opus 4.7 as the judge LM
   (Sonnet is fine for ranking; Opus gives sharper rewrite scoring).
4. Add a "code-switching robustness" mini-eval — prompts that mix AR + EN
   mid-sentence. We have a few in classification.jsonl already.

## Why this is short / opinionated

This is a "pick a model in a week" benchmark, not a research paper. We
already have today's audit numbers; this is hardware-grounded
disambiguation between the 4-8 candidates that *might* fit DCP's edge
workload. If a model wins all 3 axes by a clear margin, ship it. If two
models trade wins per task, route per task (cheap on the same 3090 if Q4
quantized).
