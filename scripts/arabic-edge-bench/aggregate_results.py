#!/usr/bin/env python3
"""Aggregate per-model bench.py outputs into a single comparison table."""
import argparse
import json
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("results_dir", default="./results", nargs="?")
    ap.add_argument("--out", default="./results/_summary.md")
    args = ap.parse_args()

    rdir = Path(args.results_dir)
    rows: list[dict] = []
    for p in sorted(rdir.glob("*.json")):
        if p.name.startswith("_"):
            continue
        try:
            data = json.loads(p.read_text())
        except Exception as e:
            print(f"skip {p}: {e}")
            continue
        evals = data.get("evals", {})
        t = evals.get("translation", {}).get("scores", {})
        rw = evals.get("rewrite", {}).get("scores", {})
        cf = evals.get("classify", {}).get("scores", {})
        rows.append({
            "model": data["model"],
            "trans_en2ar_bleu": t.get("en2ar_bleu", 0),
            "trans_ar2en_bleu": t.get("ar2en_bleu", 0),
            "trans_en2ar_chrf": t.get("en2ar_chrf", 0),
            "trans_ar2en_chrf": t.get("ar2en_chrf", 0),
            "rewrite_judge": rw.get("judge_mean", 0),
            "classify_acc": cf.get("accuracy", 0),
            "trans_p50_ms": evals.get("translation", {}).get("latency_p50_ms", 0),
            "trans_p95_ms": evals.get("translation", {}).get("latency_p95_ms", 0),
            "tok_per_sec": evals.get("translation", {}).get("tokens_per_sec_p50", 0),
            "errors": sum(e.get("errors", 0) for e in evals.values()),
            "wall_s": data.get("wall_seconds", 0),
        })

    if not rows:
        print("no results found")
        return 1

    headers = ["model", "en→ar BLEU", "ar→en BLEU", "en→ar ChrF", "ar→en ChrF",
               "rewrite/10", "classify acc", "p50 ms", "p95 ms", "tok/s", "errors", "wall s"]
    fields = ["model", "trans_en2ar_bleu", "trans_ar2en_bleu", "trans_en2ar_chrf", "trans_ar2en_chrf",
              "rewrite_judge", "classify_acc", "trans_p50_ms", "trans_p95_ms", "tok_per_sec",
              "errors", "wall_s"]

    def fmt(v, key):
        if key == "model":
            return str(v)
        if key in ("errors", "wall_s", "trans_p50_ms", "trans_p95_ms", "tok_per_sec"):
            return f"{v:.0f}" if isinstance(v, (int, float)) else str(v)
        if isinstance(v, (int, float)):
            return f"{v:.3f}"
        return str(v)

    md_rows = ["| " + " | ".join(headers) + " |",
               "|" + "|".join(["---"] * len(headers)) + "|"]
    for r in rows:
        md_rows.append("| " + " | ".join(fmt(r[f], f) for f in fields) + " |")

    out = Path(args.out)
    out.write_text("\n".join(md_rows) + "\n")
    print("\n".join(md_rows))
    print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
