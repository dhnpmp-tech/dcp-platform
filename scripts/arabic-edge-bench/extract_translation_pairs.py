#!/usr/bin/env python3
"""
Extract English↔Arabic translation pairs from app/lib/i18n.tsx.

Output: datasets/translation.jsonl with {"key", "en", "ar"} per line.
Filters: skip identical strings, drop > 200 chars, dedupe by en.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
I18N_FILE = ROOT / "app" / "lib" / "i18n.tsx"
OUT_FILE = Path(__file__).parent / "datasets" / "translation.jsonl"

PAIR_RE = re.compile(r"\s*'([a-zA-Z0-9_.]+)':\s*'((?:\\'|[^'])+)',?")


def parse_block(text: str, lang: str) -> dict[str, str]:
    """Return {key: value} for the section matching `<lang>: {` ... `}`."""
    start = text.find(f"{lang}: {{")
    if start < 0:
        return {}
    depth = 0
    end = start
    for i, ch in enumerate(text[start:], start=start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
    body = text[start:end]
    out: dict[str, str] = {}
    for m in PAIR_RE.finditer(body):
        out[m.group(1)] = m.group(2).replace("\\'", "'")
    return out


def main() -> int:
    text = I18N_FILE.read_text(encoding="utf-8")
    en = parse_block(text, "en")
    ar = parse_block(text, "ar")
    if not en or not ar:
        print(f"failed to parse en={len(en)} ar={len(ar)}", file=sys.stderr)
        return 1

    pairs: list[dict] = []
    seen_en: set[str] = set()
    for key, en_val in en.items():
        ar_val = ar.get(key)
        if not ar_val:
            continue
        if en_val == ar_val:
            continue
        if len(en_val) > 200 or len(ar_val) > 200:
            continue
        if en_val in seen_en:
            continue
        seen_en.add(en_val)
        pairs.append({"key": key, "en": en_val, "ar": ar_val})

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with OUT_FILE.open("w", encoding="utf-8") as fh:
        for p in pairs:
            fh.write(json.dumps(p, ensure_ascii=False) + "\n")

    print(f"wrote {len(pairs)} pairs to {OUT_FILE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
