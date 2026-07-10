#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ensureInferenceSmokePrincipal } = require('./ensure-inference-smoke-principal');
const {
  buildUrl,
  normalizeBaseUrl,
  redactSecret,
} = require('./anthropic-sse-live-proof');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'openai-sse-live-proof';

function toStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function makeSha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function requestText(baseUrl, route, options = {}) {
  const startedAt = Date.now();
  const response = await fetchWithTimeout(buildUrl(baseUrl, route), {
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body,
  }, options.timeoutMs || 120000);
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    elapsed_ms: Date.now() - startedAt,
    text,
    json: parseJson(text),
    headers: {
      'content-type': response.headers.get('content-type'),
      'x-request-id': response.headers.get('x-request-id'),
    },
  };
}

function detectOpenAiSse(text) {
  const source = String(text || '');
  const events = [];
  const modelIds = new Set();
  let chunkCount = 0;
  let deltaCount = 0;
  let finishCount = 0;
  let sawDone = false;
  let sawError = false;

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('event:')) {
      events.push(line.slice('event:'.length).trim());
      continue;
    }
    if (!line.startsWith('data:')) continue;
    const data = line.slice('data:'.length).trim();
    if (data === '[DONE]') {
      sawDone = true;
      continue;
    }
    const json = parseJson(data);
    if (!json) continue;
    chunkCount += 1;
    if (json.error) sawError = true;
    if (typeof json.model === 'string') modelIds.add(json.model);
    const choices = Array.isArray(json.choices) ? json.choices : [];
    for (const choice of choices) {
      const delta = choice && typeof choice === 'object' ? choice.delta : null;
      if (delta && typeof delta === 'object' && Object.keys(delta).length > 0) {
        deltaCount += 1;
      }
      if (choice && choice.finish_reason) finishCount += 1;
    }
  }

  return {
    frame_count: source.split(/\n\n+/).filter((frame) => frame.trim()).length,
    events,
    chunk_count: chunkCount,
    delta_count: deltaCount,
    finish_count: finishCount,
    model_ids: [...modelIds],
    saw_delta: deltaCount > 0,
    saw_done: sawDone,
    saw_error: sawError,
    valid: deltaCount > 0 && sawDone && !sawError,
  };
}

function classifyFailure(code, message, details = {}) {
  const actions = {
    LIVE_PROOF_NOT_ENABLED: 'Set DCP_OPENAI_SSE_PROOF_ALLOW_LIVE=1 only when you intend to run a billed OpenAI-compatible streaming request.',
    SMOKE_PRINCIPAL_FAILED: 'Run backend/tests/ensure-inference-smoke-principal.js and confirm the scoped key has inference scope and balance.',
    OPENAI_ROUTE_FAILED: 'Check renter auth, compatible vLLM provider engines, model id, and /v1/chat/completions route health.',
    OPENAI_SSE_CONTRACT_FAILED: 'Ensure /v1/chat/completions preserves text/event-stream and emits OpenAI-compatible delta frames plus data: [DONE].',
  };
  return {
    code,
    severity: 'blocking',
    message,
    action: actions[code] || 'Inspect the proof report and backend/provider logs.',
    details,
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# OpenAI SSE Live Proof Report');
  lines.push('');
  lines.push(`- generated_at: \`${report.generated_at}\``);
  lines.push(`- verdict: **${report.verdict}**`);
  lines.push(`- base_url: \`${report.base_url}\``);
  lines.push(`- model: \`${report.model}\``);
  lines.push(`- smoke_principal: renter_id=\`${report.principal.renter_id || ''}\` key_hint=\`${report.principal.key_hint || ''}\``);
  lines.push(`- command: \`${report.command}\``);
  lines.push('');
  lines.push('## Probe Summary');
  lines.push('');
  lines.push('| step | status | elapsed_ms | request_id | notes |');
  lines.push('|---|---:|---:|---|---|');
  for (const [step, probe] of Object.entries(report.probes)) {
    lines.push(`| ${step} | ${probe.status ?? ''} | ${probe.elapsed_ms ?? ''} | ${probe.request_id || ''} | ${String(probe.notes || '').replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  lines.push('## SSE Contract');
  lines.push('');
  lines.push(`- frame_count: \`${report.sse.frame_count}\``);
  lines.push(`- chunk_count: \`${report.sse.chunk_count}\``);
  lines.push(`- delta_count: \`${report.sse.delta_count}\``);
  lines.push(`- finish_count: \`${report.sse.finish_count}\``);
  lines.push(`- saw_delta: \`${report.sse.saw_delta}\``);
  lines.push(`- saw_done: \`${report.sse.saw_done}\``);
  lines.push('');
  if (report.failure) {
    lines.push('## Failure Classification');
    lines.push('');
    lines.push(`- code: \`${report.failure.code}\``);
    lines.push(`- action: ${report.failure.action}`);
    lines.push('');
  }
  lines.push('## Artifacts');
  lines.push('');
  lines.push(`- json: \`${report.artifacts.json}\``);
  lines.push(`- markdown: \`${report.artifacts.markdown}\``);
  lines.push(`- log: \`${report.artifacts.log}\``);
  lines.push(`- latest_json: \`${report.artifacts.latest_json}\``);
  lines.push(`- latest_markdown: \`${report.artifacts.latest_markdown}\``);
  lines.push(`- latest_log: \`${report.artifacts.latest_log}\``);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function writeReport(report, outputDir, transcript) {
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = toStamp();
  const jsonPath = path.join(outputDir, `${PROOF_PREFIX}-${stamp}.json`);
  const markdownPath = path.join(outputDir, `${PROOF_PREFIX}-${stamp}.md`);
  const logPath = path.join(outputDir, `${PROOF_PREFIX}-${stamp}.log`);
  const latestJsonPath = path.join(outputDir, `${PROOF_PREFIX}-latest.json`);
  const latestMarkdownPath = path.join(outputDir, `${PROOF_PREFIX}-latest.md`);
  const latestLogPath = path.join(outputDir, `${PROOF_PREFIX}-latest.log`);
  report.artifacts = {
    json: path.relative(REPO_ROOT, jsonPath),
    markdown: path.relative(REPO_ROOT, markdownPath),
    log: path.relative(REPO_ROOT, logPath),
    latest_json: path.relative(REPO_ROOT, latestJsonPath),
    latest_markdown: path.relative(REPO_ROOT, latestMarkdownPath),
    latest_log: path.relative(REPO_ROOT, latestLogPath),
  };
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownPath, buildMarkdown(report));
  fs.writeFileSync(logPath, `${transcript.join('\n')}\n`);
  fs.copyFileSync(jsonPath, latestJsonPath);
  fs.copyFileSync(markdownPath, latestMarkdownPath);
  fs.copyFileSync(logPath, latestLogPath);
}

async function run(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const model = String(options.model || process.env.DCP_OPENAI_SSE_PROOF_MODEL || process.env.DCP_SMOKE_MODEL || 'allam-2-7b').trim();
  const outputDir = path.resolve(options.outputDir || process.env.DCP_OPENAI_SSE_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const transcript = [];
  const report = {
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    base_url: baseUrl,
    model,
    command: 'DCP_OPENAI_SSE_PROOF_ALLOW_LIVE=1 npm run proof:openai-sse',
    principal: {},
    probes: {},
    sse: {
      frame_count: 0,
      events: [],
      chunk_count: 0,
      delta_count: 0,
      finish_count: 0,
      model_ids: [],
      saw_delta: false,
      saw_done: false,
      saw_error: false,
      valid: false,
    },
    failure: null,
    artifacts: {},
  };
  const log = (line) => transcript.push(`${new Date().toISOString()} ${line}`);

  try {
    if (process.env.DCP_OPENAI_SSE_PROOF_ALLOW_LIVE !== '1' && options.allowLive !== true) {
      throw Object.assign(new Error('Live OpenAI-compatible SSE proof is disabled by default'), {
        code: 'LIVE_PROOF_NOT_ENABLED',
      });
    }

    log(`start base_url=${baseUrl} model=${model}`);
    let principal;
    try {
      principal = await ensureInferenceSmokePrincipal({ baseUrl });
    } catch (error) {
      throw Object.assign(new Error(error.message || 'Failed to create smoke principal'), {
        code: 'SMOKE_PRINCIPAL_FAILED',
        details: error.details || null,
      });
    }
    report.principal = {
      renter_id: principal.renterId,
      renter_email: principal.renterEmail,
      key_hint: redactSecret(principal.inferenceKey),
      scoped_key_id: principal.inferenceKeyId,
      scoped_key_label: principal.inferenceKeyLabel,
      scoped_key_expires_at: principal.inferenceKeyExpiresAt,
      balance_halala: principal.balanceHalala,
    };
    log(`principal renter_id=${principal.renterId} key_hint=${report.principal.key_hint}`);

    const payload = {
      model,
      max_tokens: Number.parseInt(process.env.DCP_OPENAI_SSE_PROOF_MAX_TOKENS || '32', 10),
      stream: true,
      messages: [
        { role: 'user', content: 'Reply briefly with DCP_OPENAI_SSE_OK.' },
      ],
    };
    const proof = await requestText(baseUrl, '/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${principal.inferenceKey}`,
        'x-renter-key': principal.inferenceKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      timeoutMs: Number.parseInt(process.env.DCP_OPENAI_SSE_PROOF_TIMEOUT_MS || '120000', 10),
    });
    const contentType = String(proof.headers['content-type'] || '');
    const sse = detectOpenAiSse(proof.text);
    report.sse = sse;
    report.probes.openai_chat_completions_stream = {
      status: proof.status,
      elapsed_ms: proof.elapsed_ms,
      request_id: proof.headers['x-request-id'] || null,
      response_hash: makeSha256(proof.text),
      content_type: contentType,
      notes: `frames=${sse.frame_count} chunks=${sse.chunk_count} deltas=${sse.delta_count} done=${sse.saw_done}`,
      error_message: proof.ok ? null : (proof.json?.error?.message || proof.text.slice(0, 240) || null),
    };
    if (!proof.ok) {
      throw Object.assign(new Error(`OpenAI chat completions stream failed with HTTP ${proof.status}`), {
        code: 'OPENAI_ROUTE_FAILED',
        details: report.probes.openai_chat_completions_stream,
      });
    }
    if (!contentType.includes('text/event-stream') || !sse.valid) {
      throw Object.assign(new Error('OpenAI SSE contract did not emit expected stream frames'), {
        code: 'OPENAI_SSE_CONTRACT_FAILED',
        details: {
          content_type: contentType,
          sse,
        },
      });
    }

    report.verdict = 'PASS';
    return { report, exitCode: 0, transcript };
  } catch (error) {
    report.failure = classifyFailure(error.code || 'OPENAI_SSE_PROOF_FAILED', error.message, error.details || null);
    return {
      report,
      exitCode: error.code === 'LIVE_PROOF_NOT_ENABLED' ? 2 : 1,
      transcript,
    };
  } finally {
    writeReport(report, outputDir, transcript);
  }
}

async function main() {
  const { report, exitCode } = await run();
  process.stdout.write(`${JSON.stringify({
    verdict: report.verdict,
    model: report.model,
    failure: report.failure ? report.failure.code : null,
    artifacts: report.artifacts,
  }, null, 2)}\n`);
  process.exitCode = exitCode;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      verdict: 'error',
      code: error.code || 'OPENAI_SSE_PROOF_ERROR',
      message: error.message,
    }, null, 2)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildUrl,
  classifyFailure,
  detectOpenAiSse,
  normalizeBaseUrl,
  redactSecret,
  run,
};
