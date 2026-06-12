#!/usr/bin/env node
/**
 * Arabic customer-service task benchmark — DCP vs a frontier API.
 *
 * The claim DCP needs to back: for a NARROW Saudi task (customer service),
 * a smaller model served on DCP is good enough at the task while being far
 * cheaper and fully in-Kingdom — even if a frontier model wins general chat.
 * This harness measures that on a fixed task set: quality (LLM-judge on a
 * task-specific rubric), latency, and cost, for each candidate model.
 *
 * Honest by design:
 *  - It runs each candidate, records real latency + output.
 *  - Quality is scored 1–5 against each task's own rubric by a JUDGE model
 *    (default: the frontier model, if a key is given), on anonymized outputs.
 *  - If no frontier/judge key is provided, it still runs the DCP side and
 *    records latency + outputs for manual review — it never fabricates scores.
 *
 * Env:
 *   DCP_API_KEY        renter Bearer key (required for the DCP candidate)
 *   DCP_MODEL          DCP model id (default: qwen2.5:7b)
 *   DCP_API_BASE       default https://api.dcp.sa
 *   OPENAI_API_KEY     optional — enables the frontier candidate + the judge
 *   FRONTIER_MODEL     default gpt-4o
 *   JUDGE_MODEL        default = FRONTIER_MODEL
 *
 * Run:  node run.mjs > results.json
 */
import { readFileSync } from 'node:fs';

const DCP_BASE = (process.env.DCP_API_BASE || 'https://api.dcp.sa').replace(/\/$/, '');
const DCP_KEY = process.env.DCP_API_KEY || '';
const DCP_MODEL = process.env.DCP_MODEL || 'qwen2.5:7b';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const FRONTIER_MODEL = process.env.FRONTIER_MODEL || 'gpt-4o';
const JUDGE_MODEL = process.env.JUDGE_MODEL || FRONTIER_MODEL;

const SYS = 'أنت موظف خدمة عملاء سعودي محترف. رد بإيجاز وبلهجة مناسبة للعميل.';

async function chat(base, key, model, messages, extraHeaders = {}) {
  const t0 = Date.now();
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...extraHeaders },
    body: JSON.stringify({ model, messages, max_tokens: 400, temperature: 0.4 }),
  });
  const ms = Date.now() - t0;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `HTTP ${res.status}`);
  return { text: data?.choices?.[0]?.message?.content ?? '', usage: data?.usage ?? null, latency_ms: ms };
}

async function judge(task, output) {
  if (!OPENAI_KEY) return null;
  const rubric = task.rubric.map((r, i) => `${i + 1}. ${r}`).join('\n');
  const messages = [
    { role: 'system', content: 'You are a strict bilingual (Arabic/English) evaluator of Saudi customer-service replies. Score 1-5 (5=excellent) for how well the reply satisfies the rubric. Respond as JSON only: {"score": N, "reason": "..."}.' },
    { role: 'user', content: `Customer message (Arabic):\n${task.prompt}\n\nRubric:\n${rubric}\n\nReply to evaluate:\n${output}\n\nScore the reply 1-5 against the rubric. JSON only.` },
  ];
  try {
    const r = await chat('https://api.openai.com', OPENAI_KEY, JUDGE_MODEL, messages);
    const m = r.text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : { score: null, reason: r.text.slice(0, 160) };
  } catch (e) {
    return { score: null, reason: `judge failed: ${e.message}` };
  }
}

async function runCandidate(name, base, key, model, tasks, headers) {
  const rows = [];
  for (const task of tasks) {
    try {
      const r = await chat(base, key, model, [
        { role: 'system', content: SYS },
        { role: 'user', content: task.prompt },
      ], headers);
      const verdict = await judge(task, r.text);
      rows.push({ id: task.id, type: task.type, latency_ms: r.latency_ms, usage: r.usage, score: verdict?.score ?? null, judge_reason: verdict?.reason ?? null, output: r.text });
      process.stderr.write(`  ${name} ${task.id}: ${r.latency_ms}ms score=${verdict?.score ?? '—'}\n`);
    } catch (e) {
      rows.push({ id: task.id, type: task.type, error: e.message });
      process.stderr.write(`  ${name} ${task.id}: ERROR ${e.message}\n`);
    }
  }
  const ok = rows.filter((x) => !x.error);
  const scored = ok.filter((x) => typeof x.score === 'number');
  return {
    candidate: name, model,
    tasks_run: rows.length, tasks_ok: ok.length,
    avg_latency_ms: ok.length ? Math.round(ok.reduce((s, x) => s + x.latency_ms, 0) / ok.length) : null,
    avg_score: scored.length ? Number((scored.reduce((s, x) => s + x.score, 0) / scored.length).toFixed(2)) : null,
    scored_count: scored.length,
    rows,
  };
}

const tasks = readFileSync(new URL('./tasks.jsonl', import.meta.url), 'utf8')
  .trim().split('\n').map((l) => JSON.parse(l));

const out = { generated_note: 'stamp date externally', dataset: 'arabic-customer-service', n_tasks: tasks.length, candidates: [] };

if (!DCP_KEY) {
  process.stderr.write('DCP_API_KEY not set — cannot run the DCP candidate.\n');
} else {
  process.stderr.write(`DCP candidate: ${DCP_MODEL}\n`);
  out.candidates.push(await runCandidate('dcp', DCP_BASE, DCP_KEY, DCP_MODEL, tasks, { 'x-renter-key': DCP_KEY }));
}
if (OPENAI_KEY) {
  process.stderr.write(`Frontier candidate: ${FRONTIER_MODEL}\n`);
  out.candidates.push(await runCandidate('frontier', 'https://api.openai.com', OPENAI_KEY, FRONTIER_MODEL, tasks, {}));
} else {
  process.stderr.write('OPENAI_API_KEY not set — skipping frontier candidate + judge scoring (latency/outputs still captured).\n');
}

console.log(JSON.stringify(out, null, 2));
