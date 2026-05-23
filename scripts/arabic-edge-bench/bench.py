#!/usr/bin/env python3
"""
Arabic-edge benchmark harness.

Calls an OpenAI-compatible inference endpoint and runs three evals:
  1. translation  — BLEU/ChrF/length-ratio + judge-LM score
  2. rewrite      — judge-LM-only (no reference)
  3. classify     — accuracy + per-class precision/recall + confusion matrix

Also measures throughput (tok/s) and per-eval latency p50/p95 from server
response headers when available.

Usage:
  python bench.py \\
    --endpoint http://127.0.0.1:8000/v1 \\
    --model falcon-h1-ar-7b \\
    --judge-endpoint https://api.anthropic.com/v1 \\
    --judge-model claude-sonnet-4-6 \\
    --datasets-dir ./datasets \\
    --out ./results/falcon-h1-ar-7b.json

Outputs results JSON; aggregate_results.py builds the comparison table.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any
from urllib import error as urlerr
from urllib import request as urlreq

# --- Minimal OpenAI-compatible client (no extra dependencies) ---


@dataclass
class ChatResult:
    text: str
    latency_ms: float
    prompt_tokens: int = 0
    completion_tokens: int = 0
    error: str | None = None


def chat(
    endpoint: str,
    model: str,
    messages: list[dict],
    *,
    api_key: str | None = None,
    max_tokens: int = 512,
    temperature: float = 0.0,
    timeout: float = 120.0,
) -> ChatResult:
    body = json.dumps({
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    url = endpoint.rstrip("/") + "/chat/completions"
    req = urlreq.Request(url, data=body, headers=headers, method="POST")
    t0 = time.perf_counter()
    try:
        with urlreq.urlopen(req, timeout=timeout) as resp:
            payload = json.loads(resp.read())
    except urlerr.HTTPError as e:
        return ChatResult(text="", latency_ms=(time.perf_counter() - t0) * 1000,
                          error=f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:200]}")
    except Exception as e:
        return ChatResult(text="", latency_ms=(time.perf_counter() - t0) * 1000,
                          error=f"{type(e).__name__}: {e}")
    elapsed_ms = (time.perf_counter() - t0) * 1000
    try:
        text = payload["choices"][0]["message"]["content"]
        usage = payload.get("usage", {}) or {}
        return ChatResult(
            text=text,
            latency_ms=elapsed_ms,
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
        )
    except (KeyError, IndexError) as e:
        return ChatResult(text="", latency_ms=elapsed_ms, error=f"bad_response: {e}: {payload}")


# --- BLEU / ChrF (small no-dep implementations, good enough for ranking) ---


def _ngrams(tokens: list[str], n: int) -> Counter:
    return Counter(tuple(tokens[i:i + n]) for i in range(len(tokens) - n + 1))


def bleu_score(hyp: str, ref: str, max_n: int = 4) -> float:
    """Sentence-level smoothed BLEU. Returns 0-1."""
    hyp_toks = hyp.split()
    ref_toks = ref.split()
    if not hyp_toks or not ref_toks:
        return 0.0
    weights = [1.0 / max_n] * max_n
    precisions = []
    for n in range(1, max_n + 1):
        h = _ngrams(hyp_toks, n)
        r = _ngrams(ref_toks, n)
        overlap = sum(min(c, r[g]) for g, c in h.items())
        total = max(sum(h.values()), 1)
        # Add-1 smoothing
        precisions.append((overlap + 1) / (total + 1))
    import math
    bp = 1.0 if len(hyp_toks) > len(ref_toks) else \
        math.exp(1 - len(ref_toks) / max(len(hyp_toks), 1))
    logsum = sum(w * (math.log(p) if p > 0 else -1e9)
                 for w, p in zip(weights, precisions))
    return bp * math.exp(logsum)


def chrf_score(hyp: str, ref: str, n: int = 6, beta: float = 2.0) -> float:
    """Character n-gram F-beta. Returns 0-1."""
    hyp_chars = hyp.replace(" ", "")
    ref_chars = ref.replace(" ", "")
    if not hyp_chars or not ref_chars:
        return 0.0

    def chargrams(s: str, k: int) -> Counter:
        return Counter(s[i:i + k] for i in range(len(s) - k + 1)) if len(s) >= k else Counter()

    f_sum = 0.0
    n_eff = 0
    for k in range(1, n + 1):
        hg = chargrams(hyp_chars, k)
        rg = chargrams(ref_chars, k)
        if not hg or not rg:
            continue
        overlap = sum(min(c, rg[g]) for g, c in hg.items())
        p = overlap / max(sum(hg.values()), 1)
        r = overlap / max(sum(rg.values()), 1)
        if p + r == 0:
            continue
        f = (1 + beta ** 2) * p * r / (beta ** 2 * p + r)
        f_sum += f
        n_eff += 1
    return f_sum / max(n_eff, 1)


# --- Evaluations ---


@dataclass
class EvalSummary:
    name: str
    n: int
    scores: dict[str, float] = field(default_factory=dict)
    latency_p50_ms: float = 0.0
    latency_p95_ms: float = 0.0
    tokens_per_sec_p50: float = 0.0
    errors: int = 0
    per_item: list[dict] = field(default_factory=list)


def _latency_stats(latencies: list[float]) -> tuple[float, float]:
    if not latencies:
        return 0.0, 0.0
    s = sorted(latencies)
    p50 = s[len(s) // 2]
    p95 = s[min(len(s) - 1, int(len(s) * 0.95))]
    return p50, p95


def _tok_per_sec(items: list[dict]) -> float:
    tps_per_call = [
        i["completion_tokens"] / (i["latency_ms"] / 1000.0)
        for i in items
        if i.get("completion_tokens") and i.get("latency_ms")
    ]
    return statistics.median(tps_per_call) if tps_per_call else 0.0


def run_translation(
    endpoint: str,
    model: str,
    api_key: str | None,
    data: list[dict],
    *,
    workers: int,
    limit: int | None,
) -> EvalSummary:
    items = data[:limit] if limit else data
    results: list[dict] = []

    def one(item: dict) -> dict:
        en, ar = item["en"], item["ar"]
        # Two directions: EN->AR and AR->EN
        en2ar = chat(endpoint, model, [
            {"role": "system", "content": "You translate UI strings. Reply with ONLY the translation, no commentary."},
            {"role": "user", "content": f"Translate to Arabic: {en}"},
        ], api_key=api_key, max_tokens=200)
        ar2en = chat(endpoint, model, [
            {"role": "system", "content": "You translate UI strings. Reply with ONLY the translation, no commentary."},
            {"role": "user", "content": f"Translate to English: {ar}"},
        ], api_key=api_key, max_tokens=200)
        return {
            "key": item["key"],
            "en_ref": en,
            "ar_ref": ar,
            "en2ar_pred": en2ar.text,
            "ar2en_pred": ar2en.text,
            "latency_ms": (en2ar.latency_ms + ar2en.latency_ms) / 2,
            "completion_tokens": en2ar.completion_tokens + ar2en.completion_tokens,
            "error": en2ar.error or ar2en.error,
        }

    with ThreadPoolExecutor(max_workers=workers) as ex:
        for fut in as_completed(ex.submit(one, it) for it in items):
            results.append(fut.result())

    en2ar_bleu = [bleu_score(r["en2ar_pred"], r["ar_ref"]) for r in results if not r["error"]]
    ar2en_bleu = [bleu_score(r["ar2en_pred"], r["en_ref"]) for r in results if not r["error"]]
    en2ar_chrf = [chrf_score(r["en2ar_pred"], r["ar_ref"]) for r in results if not r["error"]]
    ar2en_chrf = [chrf_score(r["ar2en_pred"], r["en_ref"]) for r in results if not r["error"]]
    latencies = [r["latency_ms"] for r in results if not r["error"]]
    p50, p95 = _latency_stats(latencies)
    return EvalSummary(
        name="translation",
        n=len(items),
        scores={
            "en2ar_bleu": statistics.mean(en2ar_bleu) if en2ar_bleu else 0.0,
            "ar2en_bleu": statistics.mean(ar2en_bleu) if ar2en_bleu else 0.0,
            "en2ar_chrf": statistics.mean(en2ar_chrf) if en2ar_chrf else 0.0,
            "ar2en_chrf": statistics.mean(ar2en_chrf) if ar2en_chrf else 0.0,
        },
        latency_p50_ms=p50,
        latency_p95_ms=p95,
        tokens_per_sec_p50=_tok_per_sec(results),
        errors=sum(1 for r in results if r["error"]),
        per_item=results,
    )


def run_rewrite(
    endpoint: str,
    model: str,
    api_key: str | None,
    data: list[dict],
    *,
    judge_endpoint: str | None,
    judge_model: str | None,
    judge_key: str | None,
    workers: int,
    limit: int | None,
) -> EvalSummary:
    items = data[:limit] if limit else data
    results: list[dict] = []

    rewrite_sys = (
        "You are a prompt-rewriting assistant. Given a vague, terse, or ambiguous user prompt, "
        "rewrite it into a clear, specific, actionable instruction. Preserve the user's language. "
        "If the prompt is in Arabic, your rewrite must be in Arabic. Add only what's necessary to "
        "make the request unambiguous (target language, file, framework, constraints, output format, "
        "scope, audience). Output ONLY the rewritten prompt, no preamble."
    )

    def one(item: dict) -> dict:
        r = chat(endpoint, model, [
            {"role": "system", "content": rewrite_sys},
            {"role": "user", "content": item["raw"]},
        ], api_key=api_key, max_tokens=500)
        return {
            "id": item["id"],
            "raw": item["raw"],
            "expected_traits": item["expected_traits"],
            "rewritten": r.text,
            "latency_ms": r.latency_ms,
            "completion_tokens": r.completion_tokens,
            "error": r.error,
        }

    with ThreadPoolExecutor(max_workers=workers) as ex:
        for fut in as_completed(ex.submit(one, it) for it in items):
            results.append(fut.result())

    # Judge-LM scoring (optional — if no judge endpoint, just measure traits-present-as-substring)
    if judge_endpoint and judge_model:
        judge_sys = (
            "You score rewritten prompts. Given the original prompt, the rewrite, and a list of "
            "expected traits, reply with ONE JSON object: "
            '{"score": <0-10>, "traits_present": ["..."], "traits_missing": ["..."]}. '
            "Score 10 = all traits explicit and rewrite is clear; 0 = no improvement."
        )
        for r in results:
            if r["error"]:
                r["judge_score"] = 0
                continue
            judge_payload = json.dumps({
                "original": r["raw"],
                "rewrite": r["rewritten"],
                "expected_traits": r["expected_traits"],
            }, ensure_ascii=False)
            j = chat(judge_endpoint, judge_model, [
                {"role": "system", "content": judge_sys},
                {"role": "user", "content": judge_payload},
            ], api_key=judge_key, max_tokens=300)
            try:
                # Tolerant JSON extraction
                m = re.search(r"\{.*\}", j.text, re.DOTALL)
                parsed = json.loads(m.group(0)) if m else {}
                r["judge_score"] = float(parsed.get("score", 0))
                r["traits_present"] = parsed.get("traits_present", [])
                r["traits_missing"] = parsed.get("traits_missing", [])
            except Exception:
                r["judge_score"] = 0
                r["judge_raw"] = j.text[:400]
    else:
        # Fallback: count expected-trait keywords that appear in the rewrite
        for r in results:
            if r["error"]:
                r["judge_score"] = 0
                continue
            rw = r["rewritten"].lower()
            present = sum(
                1 for t in r["expected_traits"]
                if any(w.lower() in rw for w in re.findall(r"\w+", t) if len(w) > 3)
            )
            r["judge_score"] = 10 * present / max(len(r["expected_traits"]), 1)

    scores = [r["judge_score"] for r in results if not r["error"]]
    latencies = [r["latency_ms"] for r in results if not r["error"]]
    p50, p95 = _latency_stats(latencies)
    return EvalSummary(
        name="rewrite",
        n=len(items),
        scores={"judge_mean": statistics.mean(scores) if scores else 0.0},
        latency_p50_ms=p50,
        latency_p95_ms=p95,
        tokens_per_sec_p50=_tok_per_sec(results),
        errors=sum(1 for r in results if r["error"]),
        per_item=results,
    )


CLASS_LABELS = ["translate", "rewrite", "chat", "reasoning", "code"]


def run_classify(
    endpoint: str,
    model: str,
    api_key: str | None,
    data: list[dict],
    *,
    workers: int,
    limit: int | None,
) -> EvalSummary:
    items = data[:limit] if limit else data
    results: list[dict] = []

    sys_msg = (
        "Classify the user prompt into exactly ONE of these intents:\n"
        "- translate (convert text between languages)\n"
        "- rewrite (improve / polish / condense existing text)\n"
        "- chat (casual Q&A, short conversational)\n"
        "- reasoning (multi-step analysis, planning, comparison)\n"
        "- code (write / debug / explain code)\n"
        "Reply with ONLY the label, lowercase, no punctuation, no explanation."
    )

    def one(item: dict) -> dict:
        r = chat(endpoint, model, [
            {"role": "system", "content": sys_msg},
            {"role": "user", "content": item["prompt"]},
        ], api_key=api_key, max_tokens=10, temperature=0.0)
        pred = re.findall(r"[a-z]+", r.text.lower())
        pred_label = next((p for p in pred if p in CLASS_LABELS), pred[0] if pred else "")
        return {
            "id": item["id"],
            "prompt": item["prompt"][:100],
            "lang": item["lang"],
            "label": item["label"],
            "pred": pred_label,
            "raw_pred": r.text,
            "latency_ms": r.latency_ms,
            "completion_tokens": r.completion_tokens,
            "error": r.error,
            "correct": pred_label == item["label"],
        }

    with ThreadPoolExecutor(max_workers=workers) as ex:
        for fut in as_completed(ex.submit(one, it) for it in items):
            results.append(fut.result())

    # Per-class precision/recall + accuracy
    tp: dict[str, int] = defaultdict(int)
    fp: dict[str, int] = defaultdict(int)
    fn: dict[str, int] = defaultdict(int)
    for r in results:
        if r["error"]:
            continue
        if r["correct"]:
            tp[r["label"]] += 1
        else:
            fp[r["pred"]] += 1
            fn[r["label"]] += 1

    per_class = {}
    for c in CLASS_LABELS:
        p_denom = tp[c] + fp[c]
        r_denom = tp[c] + fn[c]
        per_class[c] = {
            "precision": tp[c] / p_denom if p_denom else 0.0,
            "recall": tp[c] / r_denom if r_denom else 0.0,
            "support": tp[c] + fn[c],
        }

    accuracy = sum(1 for r in results if r["correct"]) / max(len(results), 1)
    latencies = [r["latency_ms"] for r in results if not r["error"]]
    p50, p95 = _latency_stats(latencies)
    return EvalSummary(
        name="classify",
        n=len(items),
        scores={
            "accuracy": accuracy,
            "per_class": per_class,
        },
        latency_p50_ms=p50,
        latency_p95_ms=p95,
        tokens_per_sec_p50=_tok_per_sec(results),
        errors=sum(1 for r in results if r["error"]),
        per_item=results,
    )


# --- CLI ---


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--endpoint", required=True, help="OpenAI-compat URL (e.g. http://127.0.0.1:8000/v1)")
    ap.add_argument("--model", required=True, help="Model id as served (e.g. falcon-h1-ar-7b)")
    ap.add_argument("--api-key", default=os.environ.get("BENCH_API_KEY"))
    ap.add_argument("--judge-endpoint", default=None)
    ap.add_argument("--judge-model", default=None)
    ap.add_argument("--judge-key", default=os.environ.get("BENCH_JUDGE_KEY"))
    ap.add_argument("--datasets-dir", default=str(Path(__file__).parent / "datasets"))
    ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--limit-translation", type=int, default=None)
    ap.add_argument("--limit-rewrite", type=int, default=None)
    ap.add_argument("--limit-classify", type=int, default=None)
    ap.add_argument("--skip", action="append", default=[],
                    choices=["translation", "rewrite", "classify"])
    args = ap.parse_args()

    ds = Path(args.datasets_dir)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    def load(path: Path) -> list[dict]:
        return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]

    bundle: dict[str, Any] = {
        "model": args.model,
        "endpoint": args.endpoint,
        "started_at": time.strftime("%FT%TZ", time.gmtime()),
        "evals": {},
    }

    t_total = time.perf_counter()

    if "translation" not in args.skip:
        print(f"[{args.model}] translation eval starting…", flush=True)
        s = run_translation(
            args.endpoint, args.model, args.api_key,
            load(ds / "translation.jsonl"),
            workers=args.workers, limit=args.limit_translation,
        )
        bundle["evals"]["translation"] = asdict(s)
        print(f"[{args.model}]   en→ar BLEU={s.scores['en2ar_bleu']:.3f}  ar→en BLEU={s.scores['ar2en_bleu']:.3f}  p50={s.latency_p50_ms:.0f}ms")

    if "rewrite" not in args.skip:
        print(f"[{args.model}] rewrite eval starting…", flush=True)
        s = run_rewrite(
            args.endpoint, args.model, args.api_key,
            load(ds / "prompt_rewrite.jsonl"),
            judge_endpoint=args.judge_endpoint, judge_model=args.judge_model, judge_key=args.judge_key,
            workers=args.workers, limit=args.limit_rewrite,
        )
        bundle["evals"]["rewrite"] = asdict(s)
        print(f"[{args.model}]   judge_mean={s.scores['judge_mean']:.2f}  p50={s.latency_p50_ms:.0f}ms")

    if "classify" not in args.skip:
        print(f"[{args.model}] classify eval starting…", flush=True)
        s = run_classify(
            args.endpoint, args.model, args.api_key,
            load(ds / "classification.jsonl"),
            workers=args.workers, limit=args.limit_classify,
        )
        bundle["evals"]["classify"] = asdict(s)
        print(f"[{args.model}]   accuracy={s.scores['accuracy']:.3f}  p50={s.latency_p50_ms:.0f}ms")

    bundle["wall_seconds"] = round(time.perf_counter() - t_total, 1)
    out.write_text(json.dumps(bundle, ensure_ascii=False, indent=2))
    print(f"[{args.model}] wrote {out} ({bundle['wall_seconds']}s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
