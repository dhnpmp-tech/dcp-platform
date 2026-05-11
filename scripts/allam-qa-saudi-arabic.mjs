#!/usr/bin/env node
/**
 * allam-qa-saudi-arabic.mjs
 *
 * Runs ALLaM 7B (local Ollama) over a list of {key, en, ar} triples and
 * asks it to (a) rate the AR string for native Saudi register quality and
 * (b) propose a rewrite if needed.
 *
 * Usage:
 *   node scripts/allam-qa-saudi-arabic.mjs --keys landing.hero_badge,landing.hero_desc
 *   node scripts/allam-qa-saudi-arabic.mjs --pattern '^landing\.' --limit 30
 *
 * Output: JSON to stdout, one line per key:
 *   {key, en, ar_original, score (1-5), issues: [...], ar_suggested}
 *
 * Strict rules baked into the prompt:
 *  - DO NOT translate brand names (DCP, GPU, OpenAI, PDPL, API, ALLaM, JAIS, etc).
 *  - DO NOT change line-break or interpolation markers like {n}, {model}, \n.
 *  - DO preserve tone (marketing landing strings stay punchy; legal stays formal).
 *  - Output JSON only — no preamble.
 */

import fs from 'fs';
import { parseArgs } from 'util';
import { setTimeout as sleep } from 'timers/promises';

const I18N_PATH = '/Users/pp/DC1-Platform/dc1-platform/app/lib/i18n.tsx';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/generate';
const MODEL = 'allam-7b';

const { values } = parseArgs({
  options: {
    keys: { type: 'string' },
    pattern: { type: 'string' },
    limit: { type: 'string' },
    'dry-run': { type: 'boolean' },
  },
});

// Parse i18n.tsx — naïve but works because the file is well-formed
function loadI18n() {
  const src = fs.readFileSync(I18N_PATH, 'utf8');
  // We expect two large `{ ... }` blocks under en: and ar:. Capture each
  // 'key': 'value' line; classify by line number against the AR block start.
  const lines = src.split('\n');
  const arStart = lines.findIndex((l) => /\bar:\s*{/.test(l));
  const enEntries = new Map();
  const arEntries = new Map();
  const re = /^\s*'([a-zA-Z0-9_.-]+)'\s*:\s*'((?:[^'\\]|\\.)*)'/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;
    const [, key, raw] = m;
    const val = raw.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    if (i < arStart) enEntries.set(key, val);
    else arEntries.set(key, val);
  }
  return { enEntries, arEntries };
}

function buildPrompt({ key, en, ar }) {
  return `أنت مدقق لغوي محترف للنصوص العربية الموجهة للسوق السعودي.

السياق: هذا النص يظهر على موقع منصة "DCP" — سوق إلكتروني لخدمات الحوسبة السحابية للذكاء الاصطناعي في المملكة العربية السعودية.

المفتاح التقني: ${key}
النص الإنجليزي الأصلي: ${en}
النص العربي الحالي: ${ar}

مهمتك: قيّم النص العربي الحالي من 1 إلى 5 حسب:
- مدى ملاءمته للجمهور السعودي المهني (وليس العربي الفصيح العام أو الترجمة الحرفية)
- خلوّه من علامات الترجمة الآلية
- اتساق المصطلحات التقنية (يُفضّل ترك مصطلحات مثل GPU وAPI وPDPL والعلامات التجارية بالإنجليزية)
- الحفاظ على رموز التنسيق مثل {n} و\\n إن وُجدت

أعد إجابتك بصيغة JSON صارمة فقط (دون أي نص قبلها أو بعدها):
{"score": <1-5>, "issues": [<string>, ...], "ar_suggested": "<النص المُحسَّن، أو نفس النص الأصلي إن كان جيداً>"}

قواعد صارمة:
- لا تترجم: DCP, GPU, API, OpenAI, ALLaM, JAIS, BGE, Falcon, Qwen, PDPL, vLLM, RAG.
- لا تُغيّر أي placeholder مثل {n}, {model}, {count} ولا أي رمز \\n.
- إن كان النص جيداً (4 أو 5)، اجعل ar_suggested مطابقاً للنص الأصلي حرفياً.`;
}

async function judgeOne({ key, en, ar }) {
  const prompt = buildPrompt({ key, en, ar });
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.2, top_p: 0.9, num_ctx: 4096 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama returned ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const out = String(data.response || '').trim();
  // First JSON object only (model often appends prose after the closing brace).
  // Greedy-then-trim: take everything from first { to a balanced close.
  let jsonRaw = null;
  const firstBrace = out.indexOf('{');
  if (firstBrace !== -1) {
    let depth = 0;
    for (let i = firstBrace; i < out.length; i++) {
      if (out[i] === '{') depth++;
      else if (out[i] === '}') {
        depth--;
        if (depth === 0) { jsonRaw = out.slice(firstBrace, i + 1); break; }
      }
    }
  }
  if (!jsonRaw) {
    return { key, en, ar_original: ar, score: 0, issues: ['parse_error_no_brace'], ar_suggested: ar, raw: out };
  }
  // ALLaM occasionally emits Arabic comma (U+060C) and Arabic-Indic digits in JSON.
  const normalized = jsonRaw
    .replace(/،/g, ',')                          // Arabic comma → ASCII
    .replace(/[\u0660-\u0669]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 0x30)); // ٠-٩ → 0-9
  try {
    const parsed = JSON.parse(normalized);
    return {
      key,
      en,
      ar_original: ar,
      score: Number(parsed.score) || 0,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      ar_suggested: typeof parsed.ar_suggested === 'string' ? parsed.ar_suggested : ar,
    };
  } catch (e) {
    return { key, en, ar_original: ar, score: 0, issues: ['json_invalid: ' + e.message], ar_suggested: ar, raw: out };
  }
}

async function main() {
  const { enEntries, arEntries } = loadI18n();

  let targetKeys = [];
  if (values.keys) {
    targetKeys = values.keys.split(',').map((k) => k.trim()).filter(Boolean);
  } else if (values.pattern) {
    const re = new RegExp(values.pattern);
    for (const k of arEntries.keys()) if (re.test(k)) targetKeys.push(k);
  } else {
    throw new Error('must pass --keys k1,k2,... or --pattern <regex>');
  }
  const limit = values.limit ? parseInt(values.limit, 10) : targetKeys.length;
  targetKeys = targetKeys.slice(0, limit);

  process.stderr.write(`[allam-qa] judging ${targetKeys.length} keys with model=${MODEL}\n`);
  const startedAt = Date.now();

  for (const key of targetKeys) {
    const ar = arEntries.get(key);
    const en = enEntries.get(key);
    if (!ar || !en) {
      console.log(JSON.stringify({ key, error: 'missing en or ar' }));
      continue;
    }
    if (values['dry-run']) {
      console.log(JSON.stringify({ key, en, ar }));
      continue;
    }
    try {
      const result = await judgeOne({ key, en, ar });
      console.log(JSON.stringify(result));
    } catch (e) {
      console.log(JSON.stringify({ key, error: e.message }));
    }
    await sleep(50); // gentle pacing
  }

  process.stderr.write(`[allam-qa] done in ${Math.round((Date.now() - startedAt) / 1000)}s\n`);
}

main().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n`);
  process.exit(1);
});
