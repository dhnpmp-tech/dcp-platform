#!/usr/bin/env python3
"""
Generate the classification dataset — 500 labeled prompts across 5 intents.

Labels:
  translate  — convert text between languages
  rewrite    — improve/polish/condense existing text
  chat       — short conversational replies, casual Q&A, no heavy reasoning
  reasoning  — multi-step analysis, planning, evaluation
  code       — write, debug, explain, or modify code

Output: datasets/classification.jsonl with {"id", "prompt", "label", "lang"}.

The generator interleaves Arabic, English, mixed-language, and Arabizi
samples so a tested model has to handle script switches.
"""
import json
import random
from pathlib import Path

random.seed(42)

OUT = Path(__file__).parent / "datasets" / "classification.jsonl"

TEMPLATES: dict[str, list[tuple[str, str]]] = {
    "translate": [
        ("en", "Translate the following sentence into Arabic: {x}"),
        ("ar", "ترجم هذه الجملة إلى الإنجليزية: {x}"),
        ("en", "What's '{x}' in MSA?"),
        ("ar", "وش معنى '{x}' بالعربي الفصحى؟"),
        ("en", "Convert to Egyptian dialect: {x}"),
        ("ar", "حول هالعبارة لعربي خليجي: {x}"),
        ("en", "I need this in 5 languages: {x}"),
        ("ar", "ابي ترجمة احترافية للمصطلح '{x}' في سياق طبي"),
        ("mixed", "translate {x} ل العربية"),
        ("en", "Give me the Arabic equivalent of '{x}'"),
    ],
    "rewrite": [
        ("en", "Rewrite this paragraph to sound more formal: {x}"),
        ("en", "Shorten this to one sentence: {x}"),
        ("ar", "أعد صياغة هذه الفقرة بأسلوب أكثر احترافية: {x}"),
        ("ar", "اختصر هذا النص في جملة واحدة: {x}"),
        ("en", "Make this email more polite: {x}"),
        ("ar", "حسّن نبرة هذا البريد الإلكتروني: {x}"),
        ("en", "Polish this LinkedIn post: {x}"),
        ("ar", "صحح الأخطاء النحوية في النص: {x}"),
        ("en", "Improve clarity: {x}"),
        ("ar", "اجعل هذه الفقرة أوضح وأبسط: {x}"),
    ],
    "chat": [
        ("en", "{x}"),
        ("ar", "{x}"),
        ("en", "What time is it in {x}?"),
        ("ar", "كم الساعة في {x}؟"),
        ("en", "Tell me a joke about {x}"),
        ("ar", "احكي لي نكتة عن {x}"),
        ("en", "What do you think about {x}?"),
        ("ar", "إيش رأيك في {x}؟"),
        ("en", "Quick question — is {x} open today?"),
        ("ar", "سؤال سريع: هل {x} مفتوح اليوم؟"),
    ],
    "reasoning": [
        ("en", "Compare {x} and explain which is better and why, considering 3 dimensions."),
        ("en", "If {x}, what would be the second- and third-order consequences?"),
        ("ar", "حلل {x} وبيّن المخاطر والفرص في 5 نقاط."),
        ("en", "Build me a step-by-step plan to {x}, including risks at each step."),
        ("ar", "خطط بالتفصيل: كيف أحقق {x} خلال 90 يوم؟"),
        ("en", "Estimate the cost of {x} given {y} and explain assumptions."),
        ("en", "Diagnose why {x} might be happening — list hypotheses ranked by likelihood."),
        ("ar", "ضع استراتيجية مفصلة لـ {x} مع مراعاة القيود المالية."),
        ("en", "Argue both sides of {x} and pick the stronger position."),
        ("ar", "قارن بين {x} و {y} من حيث التكلفة والجودة والوقت."),
    ],
    "code": [
        ("en", "Write a Python function that {x}."),
        ("en", "Why does this code fail: ```{x}```"),
        ("ar", "اكتب لي دالة بـ {x}"),
        ("en", "Refactor this to be async: {x}"),
        ("en", "Add type hints to: {x}"),
        ("en", "Convert this {x} to {y}."),
        ("ar", "صحح الكود التالي: {x}"),
        ("en", "Optimize this SQL: {x}"),
        ("en", "Add tests for: {x}"),
        ("ar", "اشرح لي وش يسوي هالكود: {x}"),
    ],
}

FILLERS = {
    "translate": [
        "Hello, how are you?", "data center", "the meeting starts at 3pm",
        "I love rainy days", "free shipping", "GPU compute marketplace",
        "the quick brown fox", "see you tomorrow", "thank you for your patience",
        "subscription expired", "two-factor authentication", "happy birthday",
    ],
    "rewrite": [
        "We talked and decided to maybe do the thing next week",
        "I hope this email finds you well I wanted to reach out about",
        "The product is good but could be better in some areas like UX",
        "Dear sir/madam I would like to apply for the position",
        "Synergize cross-functional verticals to leverage core competencies",
        "Hi just checking in on the status of the deliverable",
    ],
    "chat": [
        "Riyadh", "the new Star Wars", "AI", "the weather",
        "the World Cup", "your favorite color", "Saudi food",
        "DCP", "the new coffee shop", "today's news",
        "GPU prices", "Vision 2030", "Ramadan timings",
    ],
    "reasoning": [
        "Falcon-H1-Arabic-7B vs Jais-2-8B",
        "AWS vs DigitalOcean for a small startup",
        "buying a GPU vs renting one",
        "we lost 40% of our renters last week",
        "expanding to UAE before KSA market saturation",
        "the LLM gateway has p95=2.3s and p50=0.4s",
        "should we acquire or build the recommender engine",
        "the on-call alert fires every 2 hours but no incident",
        "هل نوسع للسوق المصري قبل الإماراتي",
        "rolling out the new pricing model to existing customers",
    ],
    "code": [
        "computes the cosine similarity of two vectors",
        "TypeError: 'NoneType' object is not subscriptable on line 47",
        "Python async function that reads from Redis with retry",
        "validates a Saudi national ID with checksum",
        "SELECT * FROM users WHERE created_at > now() - interval '7 days'",
        "implement debouncing in vanilla JS",
        "fix the off-by-one in this loop: for i in range(1, len(arr))",
        "إعطني دالة JavaScript لتشكيل النص العربي",
        "convert this Python class to TypeScript",
        "explain what this regex matches: ^(?=.*[a-z])(?=.*[A-Z]).{8,}$",
    ],
}

PER_LABEL = 100
out = []
counter = 0
for label, tmpls in TEMPLATES.items():
    fillers = FILLERS[label]
    for _ in range(PER_LABEL):
        lang, tmpl = random.choice(tmpls)
        x = random.choice(fillers)
        y = random.choice(fillers) if "{y}" in tmpl else None
        prompt = tmpl.replace("{x}", x)
        if y:
            prompt = prompt.replace("{y}", y)
        counter += 1
        out.append({
            "id": f"clf_{counter:04d}",
            "prompt": prompt,
            "label": label,
            "lang": lang,
        })

random.shuffle(out)

OUT.parent.mkdir(parents=True, exist_ok=True)
with OUT.open("w", encoding="utf-8") as fh:
    for o in out:
        fh.write(json.dumps(o, ensure_ascii=False) + "\n")

print(f"wrote {len(out)} prompts to {OUT}")
print("Label distribution:")
counts: dict[str, int] = {}
for o in out:
    counts[o["label"]] = counts.get(o["label"], 0) + 1
for k, v in sorted(counts.items()):
    print(f"  {k}: {v}")
