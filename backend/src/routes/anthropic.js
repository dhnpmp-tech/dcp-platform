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
const { Readable } = require('stream');
const v1 = require('./v1');
const { forwardAnthropic } = require('../lib/anthropic-proxy');

const { requireAuth, lookupProviderEnginesForModel } = v1.shared;

const router = express.Router();

// Errors use the Anthropic error envelope so Claude Code renders them sanely.
function anthropicError(res, status, type, message) {
  return res.status(status).json({ type: 'error', error: { type, message } });
}

const PROXY_TIMEOUT_MS = 120000;

router.post('/v1/messages', requireAuth, async (req, res) => {
  const model = typeof req.body?.model === 'string' ? req.body.model.trim() : '';
  if (!model) {
    return anthropicError(res, 400, 'invalid_request_error', '`model` is required');
  }
  if (!Array.isArray(req.body?.messages) || req.body.messages.length === 0) {
    return anthropicError(res, 400, 'invalid_request_error', '`messages` must be a non-empty array');
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

  let upstream;
  try {
    upstream = await forwardAnthropic({
      engineBaseUrl: provider._selectedEngine.base_url,
      body: req.body,
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
    nodeStream.on('end', done);
    res.on('close', () => { nodeStream.destroy(); done(); });
    nodeStream.pipe(res);
    return;
  }

  // ── Non-streaming — relay the upstream JSON unchanged ───────────────────
  try {
    const json = await response.json();
    res.status(response.status).json(json);
  } catch (err) {
    console.error('[anthropic] upstream returned non-JSON:', err && err.message);
    if (!res.headersSent) {
      anthropicError(res, 502, 'api_error', 'Upstream provider returned an invalid response.');
    }
  } finally {
    done();
  }
});

module.exports = router;
