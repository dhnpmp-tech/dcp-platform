'use strict';

// routes/anthropic.js — renter-facing Anthropic Messages surface (dcp launcher).
//
//   POST /anthropic/v1/messages — Anthropic-format inference for coding agents
//   (Claude Code via ANTHROPIC_BASE_URL=https://api.dcp.sa/anthropic).
//
// Auth = renter key, the SAME middleware /v1/chat/completions uses. Routing =
// provider_engines → a provider's vLLM native /v1/messages over the WG mesh.
//
// NOTE: /api/agent/gateway/v1/messages (Nexus's brain, provider-key-gated,
// fixed upstreams) is a SEPARATE surface. Do not merge the two — different
// callers, different auth, different routing.

const express = require('express');
const crypto = require('crypto');
const { Readable } = require('stream');
const db = require('../db');
const v1 = require('./v1');
const billingService = require('../services/billingService');
const { forwardAnthropic } = require('../lib/anthropic-proxy');

const { requireAuth, lookupProviderEnginesForModel } = v1.shared;

const router = express.Router();

// Errors use the Anthropic error envelope so Claude Code renders them sanely.
function anthropicError(res, status, type, message) {
  return res.status(status).json({ type: 'error', error: { type, message } });
}

const PROXY_TIMEOUT_MS = 120000;

// ── Billing ─────────────────────────────────────────────────────────────────
// Rates come from the shared coding-model catalog (lib/coding-models.js) so
// what GET /v1/coding/models advertises is exactly what settlement charges.
// Settlement itself goes through the SAME single money path as
// /v1/chat/completions (settleInferenceOnce: idempotent billing_attempts row,
// sub-credit drain, PAYG debit, 75/25 provider split, usage_events).
const { IN_RATE_HALALA_PER_1M, OUT_RATE_HALALA_PER_1M } = require('../lib/coding-models');

function rawDb() {
  return db._db || db;
}

// Pre-flight cost estimate (mirrors /v1/chat/completions). Input ~ chars/4
// across messages + system + tools; output = requested max_tokens. Used to
// gate BEFORE serving so a near-zero-balance renter can't obtain inference the
// settlement debit (rowcount-guarded, throws post-response) would never bill.
function estimateRequestCostHalala(body) {
  let chars = 0;
  const add = (v) => { chars += typeof v === 'string' ? v.length : JSON.stringify(v || '').length; };
  for (const m of (Array.isArray(body?.messages) ? body.messages : [])) add(m?.content);
  if (body?.system) add(body.system);
  if (body?.tools) add(body.tools);
  const promptTokens = Math.ceil(chars / 4);
  const maxTokens = Math.max(1, Math.min(Number(body?.max_tokens) || 1024, 200000));
  return billingService.estimateInferenceCost({
    promptTokens,
    maxCompletionTokens: maxTokens,
    inRateHalalaPer1m: IN_RATE_HALALA_PER_1M,
    outRateHalalaPer1m: OUT_RATE_HALALA_PER_1M,
  });
}

function settleAnthropicUsage({ requestId, renterId, providerId, modelId, usage }) {
  const promptTokens = Math.max(0, Number(usage?.input_tokens) || 0);
  const completionTokens = Math.max(0, Number(usage?.output_tokens) || 0);
  const promptCostHalala = (promptTokens * IN_RATE_HALALA_PER_1M) / 1e6;
  const completionCostHalala = (completionTokens * OUT_RATE_HALALA_PER_1M) / 1e6;
  const costHalala = Math.max(1, Math.ceil(promptCostHalala + completionCostHalala));
  try {
    billingService.settleInferenceOnce(rawDb(), {
      requestId,
      renterId,
      providerId: providerId || null,
      costHalala,
      modelId,
      usageEventRow: {
        promptTokens,
        completionTokens,
        promptCostHalala: Math.ceil(promptCostHalala),
        completionCostHalala: Math.ceil(completionCostHalala),
        inRateHalalaPer1m: IN_RATE_HALALA_PER_1M,
        outRateHalalaPer1m: OUT_RATE_HALALA_PER_1M,
        source: 'anthropic/messages',
      },
      jobRow: null,
    });
  } catch (err) {
    // Never let a settlement error break an already-delivered response, but do
    // NOT silently swallow it. The pre-flight gate blocks under-balance
    // requests; reaching here means a concurrent request drained the balance
    // between gate and settle (TOCTOU) — record it distinctly as UNBILLED so
    // it's reconcilable, not lost.
    if (err instanceof billingService.InsufficientBalanceError) {
      console.error('[anthropic] UNBILLED — balance drained mid-request (TOCTOU); response already delivered', {
        request_id: requestId, renter_id: renterId, cost_halala: costHalala,
      });
    } else {
      console.error('[anthropic] settleInferenceOnce failed — ledger/balance drift', {
        request_id: requestId, renter_id: renterId, msg: err && err.message,
      });
    }
  }
}

// Extract the last usage object from a tail of Anthropic SSE text. Usage
// arrives on message_start (input_tokens) and message_delta (final counts) —
// the LAST usage seen wins per field.
function extractStreamUsage(sseTail) {
  const usage = { input_tokens: 0, output_tokens: 0 };
  for (const line of sseTail.split('\n')) {
    if (!line.startsWith('data: ') || !line.includes('"usage"')) continue;
    try {
      const obj = JSON.parse(line.slice(6));
      const u = obj.usage || (obj.message && obj.message.usage);
      if (!u) continue;
      if (u.input_tokens != null) usage.input_tokens = Number(u.input_tokens) || usage.input_tokens;
      if (u.output_tokens != null) usage.output_tokens = Number(u.output_tokens) || usage.output_tokens;
    } catch (_) { /* partial frame in the tail — skip */ }
  }
  return usage;
}

const STREAM_TAIL_CAP = 65536; // usage frames arrive at stream end

// Claude Code injects `role:"system"` entries INSIDE messages[]; the Anthropic
// spec (and vLLM's strict implementation) only allows user|assistant there,
// with system prompts in the top-level `system` field. Hoist them. Pure
// spec-normalization — never rewrites user/assistant/tool content.
function hoistSystemMessages(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (!messages.some((m) => m && m.role === 'system')) return body;
  const systemParts = [];
  if (typeof body.system === 'string' && body.system) systemParts.push(body.system);
  else if (Array.isArray(body.system)) {
    for (const b of body.system) systemParts.push(typeof b === 'string' ? b : (b && b.text) || '');
  }
  const kept = [];
  for (const m of messages) {
    if (m && m.role === 'system') {
      const text = typeof m.content === 'string'
        ? m.content
        : (Array.isArray(m.content) ? m.content.map((b) => (b && b.text) || '').join('\n') : '');
      if (text) systemParts.push(text);
    } else {
      kept.push(m);
    }
  }
  return { ...body, system: systemParts.join('\n\n'), messages: kept };
}

router.post('/v1/messages', requireAuth, async (req, res) => {
  const model = typeof req.body?.model === 'string' ? req.body.model.trim() : '';
  if (!model) {
    return anthropicError(res, 400, 'invalid_request_error', '`model` is required');
  }
  if (!Array.isArray(req.body?.messages) || req.body.messages.length === 0) {
    return anthropicError(res, 400, 'invalid_request_error', '`messages` must be a non-empty array');
  }

  // Balance pre-flight — estimate the REAL cost (input + max_tokens) and reject
  // before serving if the renter can't cover it. A fixed 1-halala estimate let
  // a near-zero-balance renter get inference for free (settlement debits are
  // rowcount-guarded and throw post-response). Mirrors /v1/chat/completions.
  const estimateHalala = estimateRequestCostHalala(req.body);
  const gate = billingService.checkBalanceGate(rawDb(), req.renter.id, estimateHalala);
  if (!gate.ok) {
    return anthropicError(
      res, 402, 'permission_error',
      `Insufficient balance for this request (need ~${(estimateHalala / 100).toFixed(2)} SAR, ` +
      `available ${(Number(gate.totalAvailableHalala || 0) / 100).toFixed(2)} SAR). ` +
      'Top up at https://dcp.sa/renter/wallet and retry.'
    );
  }

  // Only vLLM engines implement the native Anthropic protocol.
  const candidates = lookupProviderEnginesForModel(model)
    .filter((p) => p._selectedEngine && p._selectedEngine.engine_type === 'vllm');
  if (candidates.length === 0) {
    return anthropicError(
      res, 503, 'overloaded_error',
      `No provider is currently serving model "${model}" on a compatible engine. ` +
      'Pick a model from GET /v1/coding/models or retry shortly.'
    );
  }
  const provider = candidates[0];
  const requestId = `anthro-${crypto.randomUUID()}`;

  let upstream;
  try {
    upstream = await forwardAnthropic({
      engineBaseUrl: provider._selectedEngine.base_url,
      body: hoistSystemMessages(req.body),
      headers: req.headers,
      timeoutMs: PROXY_TIMEOUT_MS,
    });
  } catch (err) {
    console.error('[anthropic] upstream unreachable:', err && err.message);
    return anthropicError(res, 502, 'api_error', 'Upstream provider is unreachable. Please retry.');
  }

  const { response, done } = upstream;

  // ── Streaming (SSE) — pipe byte-for-byte, never buffer ──────────────────
  // Claude Code requires SSE; a buffering gateway breaks it. Frames pass
  // through untouched so tool_use / input_json_delta blocks can't be
  // corrupted by re-serialization. Header set mirrors the proven
  // /v1/chat/completions streaming path (incl. X-Accel-Buffering for nginx).
  if (req.body?.stream === true && response.ok && response.body) {
    res.status(response.status);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.flushHeaders) res.flushHeaders();

    const nodeStream = Readable.fromWeb(response.body);
    // Side-tap the tail so completed streams can settle from the final
    // usage frame — the pipe to the client stays byte-for-byte untouched.
    let sseTail = '';
    let settledStream = false;
    nodeStream.on('data', (chunk) => {
      sseTail = (sseTail + chunk.toString('utf8')).slice(-STREAM_TAIL_CAP);
    });
    nodeStream.on('error', (err) => {
      // Headers are flushed — emit a terminal Anthropic error event on the
      // open stream instead of throwing (mirrors v1.js mid-stream handling).
      console.error('[anthropic] upstream stream error:', err && err.message);
      try {
        res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Upstream stream failed' } })}\n\n`);
      } catch (_) { /* client already gone */ }
      res.end();
      done();
    });
    nodeStream.on('end', () => {
      if (!settledStream) {
        settledStream = true;
        settleAnthropicUsage({
          requestId,
          renterId: req.renter.id,
          providerId: provider.id,
          modelId: model,
          usage: extractStreamUsage(sseTail),
        });
      }
      done();
    });
    res.on('close', () => { nodeStream.destroy(); done(); });
    nodeStream.pipe(res);
    return;
  }

  // ── Non-streaming — relay the upstream JSON unchanged, then settle ──────
  try {
    const json = await response.json();
    res.status(response.status).json(json);
    if (response.ok && json && json.usage) {
      settleAnthropicUsage({
        requestId,
        renterId: req.renter.id,
        providerId: provider.id,
        modelId: model,
        usage: json.usage,
      });
    }
  } catch (err) {
    console.error('[anthropic] upstream returned non-JSON:', err && err.message);
    if (!res.headersSent) {
      anthropicError(res, 502, 'api_error', 'Upstream provider returned an invalid response.');
    }
  } finally {
    done();
  }
});

// ── POST /anthropic/v1/messages/count_tokens ───────────────────────────────
// Claude Code calls this for context accounting; absence degrades to local
// estimation client-side, but serving it keeps token displays sane. Local
// chars/4 estimate — no provider round-trip for a metadata call.
router.post('/v1/messages/count_tokens', requireAuth, (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  let chars = 0;
  for (const m of messages) {
    chars += typeof m?.content === 'string'
      ? m.content.length
      : JSON.stringify(m?.content || '').length;
  }
  if (req.body?.system) chars += JSON.stringify(req.body.system).length;
  if (req.body?.tools) chars += JSON.stringify(req.body.tools).length;
  return res.json({ input_tokens: Math.max(1, Math.ceil(chars / 4)) });
});

module.exports = router;
