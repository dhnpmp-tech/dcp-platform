const express = require('express');
const crypto = require('crypto');
const { vllmCompleteLimiter, vllmStreamLimiter } = require('../middleware/rateLimiter');
const db = require('../db');
const { recordOpenRouterUsage } = require('../services/openrouterSettlementService');
const { looksLikeProviderKey } = require('../middleware/auth');

const router = express.Router();

const WAIT_TIMEOUT_MS = 300 * 1000;
const WAIT_POLL_MS = 1500;
const PROVIDER_HEARTBEAT_STALE_MS = 10 * 60 * 1000;
const TERMINAL_FAILURE_STATUSES = new Set(['failed', 'cancelled', 'permanently_failed', 'timed_out']);

function flattenRunParams(params) {
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  return params.reduce((acc, p) => (Array.isArray(p) ? acc.concat(p) : acc.concat([p])), []);
}

function runStatement(sql, ...params) {
  return db.prepare(sql).run(...flattenRunParams(params));
}

function persistServeSessionMetering({
  jobId,
  providerId,
  modelId,
  nowIso,
  totalTokens,
  billedHalala,
}) {
  const safeNow = normalizeString(nowIso, { maxLen: 64 }) || new Date().toISOString();
  const safeTotalTokens = toFiniteInt(totalTokens, { min: 0, max: 1000000000 }) || 0;
  const safeBilledHalala = toFiniteInt(billedHalala, { min: 0, max: 1000000000 }) || 0;

  // Single-statement upsert so metering remains durable even if the session row
  // was never created during job submission.
  const expiresAt = new Date(Date.parse(safeNow) + 3600000).toISOString();
  runStatement(
    `INSERT INTO serve_sessions (
      id, job_id, provider_id, model, port, status, started_at, expires_at,
      total_inferences, total_tokens, total_billed_halala, last_inference_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 0, 'serving', ?, ?, 1, ?, ?, ?, ?, ?)
    ON CONFLICT(job_id) DO UPDATE SET
      total_inferences = COALESCE(serve_sessions.total_inferences, 0) + 1,
      total_tokens = COALESCE(serve_sessions.total_tokens, 0) + excluded.total_tokens,
      total_billed_halala = COALESCE(serve_sessions.total_billed_halala, 0) + excluded.total_billed_halala,
      last_inference_at = excluded.last_inference_at,
      updated_at = excluded.updated_at,
      provider_id = COALESCE(serve_sessions.provider_id, excluded.provider_id),
      model = COALESCE(NULLIF(serve_sessions.model, ''), excluded.model),
      status = COALESCE(serve_sessions.status, 'serving'),
      expires_at = COALESCE(serve_sessions.expires_at, excluded.expires_at)`,
    `session-${jobId}`,
    jobId,
    providerId != null ? providerId : null,
    modelId,
    safeNow,
    expiresAt,
    safeTotalTokens,
    safeBilledHalala,
    safeNow,
    safeNow,
    safeNow
  );
}

function normalizeString(value, { maxLen = 500, trim = true } = {}) {
  if (typeof value !== 'string') return null;
  const next = trim ? value.trim() : value;
  if (!next) return null;
  return next.slice(0, maxLen);
}

function toFiniteNumber(value, { min = null, max = null } = {}) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  if (min != null && num < min) return null;
  if (max != null && num > max) return null;
  return num;
}

function toFiniteInt(value, { min = null, max = null } = {}) {
  const num = toFiniteNumber(value, { min, max });
  if (num == null || !Number.isInteger(num)) return null;
  return num;
}

function getRenterKey(req) {
  const header = normalizeString(req.headers['x-renter-key'], { maxLen: 128, trim: false });
  const query = normalizeString(req.query.key, { maxLen: 128, trim: false });
  // Accept Authorization: Bearer dcp_<token> as an alternative to x-renter-key
  const authHeader = req.headers['authorization'];
  if (!header && !query && typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(dcp_[A-Za-z0-9]+)$/i);
    if (match) return match[1];
  }
  return header || query || null;
}

function requireRenter(req, res, next) {
  const key = getRenterKey(req);
  if (!key) return res.status(401).json({ error: 'Renter API key required (?key= or x-renter-key)' });

  // H1 — reject provider-prefixed keys on a renter-only path.
  if (looksLikeProviderKey(key)) {
    return res.status(401).json({ error: 'Wrong key type: provider key cannot be used on renter endpoint', code: 'wrong_key_type' });
  }

  // Sprint 25 Gap 2: check scoped sub-keys first (renter_api_keys table)
  const now = new Date().toISOString();
  const scopedKey = db.get(
    `SELECT k.id, k.renter_id, k.scopes, k.expires_at, k.revoked_at,
            r.id AS r_id, r.api_key, r.balance_halala, r.status
     FROM renter_api_keys k
     JOIN renters r ON r.id = k.renter_id
     WHERE k.key = ? AND r.status = 'active' AND k.revoked_at IS NULL`,
    key
  );

  if (scopedKey) {
    if (scopedKey.expires_at && scopedKey.expires_at < now) {
      return res.status(403).json({ error: 'API key has expired' });
    }
    let scopes = [];
    try { scopes = JSON.parse(scopedKey.scopes || '[]'); } catch (_) {}
    if (!scopes.includes('inference') && !scopes.includes('admin')) {
      return res.status(403).json({ error: 'API key does not have inference scope' });
    }
    // Touch last_used_at (best-effort, non-blocking)
    try {
      db.prepare('UPDATE renter_api_keys SET last_used_at = ? WHERE id = ?').run(now, scopedKey.id);
    } catch (_) {}
    req.renter = { id: scopedKey.r_id, api_key: scopedKey.api_key, balance_halala: scopedKey.balance_halala, status: scopedKey.status };
    req.renterKey = key;
    req.renterKeyScopes = scopes;
    req.renterAuth = {
      key_type: 'scoped_key',
      renter_api_key_id: scopedKey.id,
      scopes,
    };
    return next();
  }

  // Fall back to master key (renters.api_key) — full access
  const renter = db.get(
    'SELECT id, api_key, balance_halala, status FROM renters WHERE api_key = ? AND status = ?',
    key,
    'active'
  );
  if (!renter) return res.status(403).json({ error: 'Invalid or inactive renter API key' });

  req.renter = renter;
  req.renterKey = key;
  req.renterKeyScopes = ['admin'];
  req.renterAuth = {
    key_type: 'master_key',
    renter_api_key_id: null,
    scopes: ['admin'],
  };
  return next();
}

function parseComputeTypes(raw) {
  if (!raw) return new Set(['inference', 'training', 'rendering']);
  if (Array.isArray(raw)) {
    return new Set(raw.map((value) => String(value).toLowerCase()));
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.map((value) => String(value).toLowerCase()));
    }
  } catch (_) {
    // ignore
  }
  return new Set(String(raw).split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function resolveProviderVramMb(provider) {
  const candidates = [
    provider.vram_mb,
    provider.gpu_vram_mb,
    provider.gpu_vram_mib,
    provider.vram_gb != null ? Number(provider.vram_gb) * 1024 : null,
  ];
  for (const candidate of candidates) {
    const value = toFiniteInt(candidate, { min: 0, max: 1024 * 1024 });
    if (value != null) return value;
  }
  return 0;
}

function estimatePromptFromMessages(messages) {
  return messages
    .map((message) => {
      const role = normalizeString(message?.role, { maxLen: 30 }) || 'user';
      const content = normalizeString(message?.content, { maxLen: 20000, trim: false }) || '';
      return `${role}: ${content}`;
    })
    .join('\n');
}

function approximateTokenCount(text) {
  if (!text) return 0;
  const chunks = String(text).trim().split(/\s+/).filter(Boolean);
  return Math.max(1, Math.ceil(chunks.length * 1.3));
}

function splitStreamText(text) {
  const parts = String(text || '').split(/(\s+)/).filter((chunk) => chunk.length > 0);
  if (parts.length === 0) return [''];
  return parts;
}

function parseStructuredJobResult(resultText) {
  if (!resultText || typeof resultText !== 'string') return null;
  const match = resultText.match(/DC1_RESULT_JSON:({[\s\S]+})\s*$/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (_) {
    return null;
  }
}

function extractCompletionText(job) {
  const resultText = typeof job.result === 'string' ? job.result : '';
  const structured = parseStructuredJobResult(resultText);

  if (structured && structured.type === 'tool_call') {
    const toolCall = structured.tool_call;
    return {
      text: '',
      completion_tokens: toFiniteInt(structured.tokens_generated, { min: 0, max: 1000000 }) || null,
      tool_call: toolCall,
      structured,
    };
  }

  if (structured && structured.type === 'text') {
    const responseText = normalizeString(structured.response, { maxLen: 100000, trim: false }) || '';
    return {
      text: responseText,
      completion_tokens: toFiniteInt(structured.tokens_generated, { min: 0, max: 1000000 }) || null,
      structured,
    };
  }

  if (structured && Array.isArray(structured.choices)) {
    const messageText = normalizeString(structured.choices?.[0]?.message?.content, { maxLen: 100000, trim: false }) || '';
    return { text: messageText, completion_tokens: null, structured };
  }

  return {
    text: normalizeString(resultText, { maxLen: 100000, trim: false }) || '',
    completion_tokens: null,
    structured: null,
  };
}

function resolveModelRequirements(modelId) {
  const record = db.get(
    `SELECT model_id, display_name, min_gpu_vram_gb, default_price_halala_per_min
     FROM model_registry
     WHERE model_id = ? AND is_active = 1`,
    modelId
  );

  const minVramGb = toFiniteInt(record?.min_gpu_vram_gb, { min: 0, max: 1024 }) || 16;
  const fallbackRatePerMinute = toFiniteInt(record?.default_price_halala_per_min, { min: 1, max: 100000 }) || 20;

  return {
    model_id: record?.model_id || modelId,
    display_name: record?.display_name || modelId,
    min_vram_gb: minVramGb,
    fallback_rate_halala_per_min: fallbackRatePerMinute,
  };
}

function getCapableProviders(minVramMb) {
  const providers = db.all(
    `SELECT p.id, p.status, p.is_paused, p.last_heartbeat, p.supported_compute_types,
            p.vram_mb, p.gpu_vram_mb, p.gpu_vram_mib, p.vram_gb,
            p.vllm_endpoint_url,
            t.gpu_util_pct
     FROM providers p
     LEFT JOIN (
       SELECT t2.provider_id, t2.gpu_util_pct
       FROM provider_gpu_telemetry t2
       INNER JOIN (
         SELECT provider_id, MAX(recorded_at) AS max_at
         FROM provider_gpu_telemetry GROUP BY provider_id
       ) m ON m.provider_id = t2.provider_id AND m.max_at = t2.recorded_at
     ) t ON t.provider_id = p.id
     WHERE p.status = 'online' AND COALESCE(p.is_paused, 0) = 0 AND p.deleted_at IS NULL`
  );

  const nowMs = Date.now();
  const capable = [];
  for (const provider of providers) {
    const heartbeatMs = provider.last_heartbeat ? Date.parse(provider.last_heartbeat) : NaN;
    if (Number.isFinite(heartbeatMs) && (nowMs - heartbeatMs) > PROVIDER_HEARTBEAT_STALE_MS) continue;

    const computeTypes = parseComputeTypes(provider.supported_compute_types);
    if (!computeTypes.has('inference')) continue;

    const providerVramMb = resolveProviderVramMb(provider);
    if (providerVramMb < minVramMb) continue;

    capable.push(provider);
  }

  return capable;
}

function getCapableProviderCount(minVramMb) {
  return getCapableProviders(minVramMb).length;
}

function hasValidProviderEndpoint(provider) {
  const endpoint = normalizeString(provider?.vllm_endpoint_url, { maxLen: 2000 });
  return endpoint != null && /^https?:\/\//i.test(endpoint);
}

function getValidatedBackupProviders({ assignedProviderId, minVramMb, limit = 2 }) {
  const capable = getCapableProviders(minVramMb)
    .filter((provider) => provider.id !== assignedProviderId)
    .filter((provider) => hasValidProviderEndpoint(provider));

  capable.sort((a, b) => (a.gpu_util_pct ?? 0) - (b.gpu_util_pct ?? 0));
  return capable.slice(0, Math.max(0, Number(limit) || 0));
}

// Pick best available provider by lowest GPU utilization (DCP-907 job assignment queue)
function assignProvider(minVramMb) {
  const capable = getCapableProviders(minVramMb);
  if (capable.length === 0) return null;
  // Sort ascending by gpu_util_pct (nulls treated as 0 — prefer providers that haven't reported util)
  capable.sort((a, b) => (a.gpu_util_pct ?? 0) - (b.gpu_util_pct ?? 0));
  return capable[0];
}


// DCP-922: Proxy an inference request to a provider's vLLM endpoint.
// Returns { text, promptTokens, completionTokens } on success or { proxyError, detail } on failure.
const PROXY_TIMEOUT_BASE_MS = 30000;
const PROXY_TIMEOUT_PER_TOKEN_MS = 150;
const PROXY_TIMEOUT_MAX_MS = 300000;
async function proxyToProviderEndpoint({ endpointUrl, modelId, messages, maxTokens, temperature }) {
  const url = `${endpointUrl}/v1/chat/completions`;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelId, messages, max_tokens: maxTokens, temperature, stream: false }),
      signal: AbortSignal.timeout(Math.min(PROXY_TIMEOUT_BASE_MS + (maxTokens || 0) * PROXY_TIMEOUT_PER_TOKEN_MS, PROXY_TIMEOUT_MAX_MS)),
    });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? 'timeout' : 'connection_refused';
    return { proxyError: reason, detail: err.message };
  }
  if (!response.ok) {
    return { proxyError: `provider_http_${response.status}`, detail: `Provider returned ${response.status}` };
  }
  let body;
  try { body = await response.json(); } catch (_) {
    return { proxyError: 'invalid_response', detail: 'Provider returned non-JSON body' };
  }
  const text = body?.choices?.[0]?.message?.content || '';
  const usage = body?.usage || {};
  const promptTokens = toFiniteInt(usage.prompt_tokens, { min: 0, max: 1000000000 });
  const completionTokens = toFiniteInt(usage.completion_tokens, { min: 0, max: 1000000000 });
  const totalTokens = toFiniteInt(usage.total_tokens, { min: 0, max: 1000000000 });

  // Handle provider usage shape drift without dropping metering writes.
  const resolvedPromptTokens = promptTokens != null ? promptTokens : 0;
  const resolvedCompletionTokens = completionTokens != null
    ? completionTokens
    : (totalTokens != null ? Math.max(0, totalTokens - resolvedPromptTokens) : approximateTokenCount(text));

  return {
    text,
    promptTokens: resolvedPromptTokens,
    completionTokens: resolvedCompletionTokens,
  };
}

function buildRuntimeDiagnostics({ modelId, minVramGb, jobId = null }) {
  const minVramMb = toFiniteInt(minVramGb, { min: 0, max: 1024 }) != null ? Number(minVramGb) * 1024 : 0;
  return {
    model_id: modelId || null,
    min_vram_gb: Number(minVramGb || 0),
    capable_providers: getCapableProviderCount(minVramMb),
    queued_vllm_jobs: getNoProviderQueueDepth(),
    provider_heartbeat_stale_ms: PROVIDER_HEARTBEAT_STALE_MS,
    wait_timeout_ms: WAIT_TIMEOUT_MS,
    job_id: jobId,
  };
}

function logVllmDegradation(event, diagnostics, details = {}) {
  const payload = {
    event,
    diagnostics,
    details,
    ts: new Date().toISOString(),
  };
  console.warn(`[vllm:${event}] ${JSON.stringify(payload)}`);
}

function getNoProviderQueueDepth() {
  const row = db.get(
    `SELECT COUNT(*) AS count
     FROM jobs
     WHERE status IN ('queued', 'pending', 'running')
       AND (
         job_type = 'vllm'
         OR container_spec LIKE '%"image_type":"vllm-serve"%'
       )`
  );
  return Number(row?.count || 0);
}

function buildTaskScript({ model, messages, tools, toolChoice, maxTokens, temperature }) {
  const escapedModel = JSON.stringify(model);
  const escapedMessages = JSON.stringify(messages);
  const escapedTools = tools ? JSON.stringify(tools) : 'null';
  const escapedToolChoice = JSON.stringify(toolChoice || 'auto');

  return [
    '#!/usr/bin/env python3',
    'import json',
    'import time',
    'import re',
    'import torch',
    'from transformers import AutoTokenizer, AutoModelForCausalLM',
    '',
    `model_id = ${escapedModel}`,
    `messages = ${escapedMessages}`,
    `tools = ${escapedTools}`,
    `tool_choice = ${escapedToolChoice}`,
    `max_tokens = ${maxTokens}`,
    `temperature = ${temperature}`,
    '',
    't0 = time.time()',
    'device = "cuda" if torch.cuda.is_available() else "cpu"',
    'dtype = torch.float16 if device == "cuda" else torch.float32',
    '',
    'tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)',
    'if tokenizer.pad_token is None:',
    '    tokenizer.pad_token = tokenizer.eos_token',
    'model = AutoModelForCausalLM.from_pretrained(',
    '    model_id,',
    '    torch_dtype=dtype,',
    '    device_map="auto" if device == "cuda" else None,',
    '    trust_remote_code=True',
    ')',
    '',
    'tool_call = None',
    'if tools:',
    '    try:',
    '        apply_fn = getattr(tokenizer, "apply_chat_template", None)',
    '        if apply_fn:',
    '            kwargs = {"messages": messages, "tokenize": False, "add_generation_prompt": True}',
    '            if tools:',
    '                kwargs["tools"] = tools',
    '            if tool_choice and tool_choice != "auto":',
    '                kwargs["tool_choice"] = tool_choice',
    '            formatted = apply_fn(**kwargs)',
    '        else:',
    '            formatted = "\\n".join(f"{m[\'role\'].capitalize()}: {m[\'content\']}" for m in messages) + "\\nAssistant:"',
    '    except Exception as e:',
    '        formatted = "\\n".join(f"{m[\'role\'].capitalize()}: {m[\'content\']}" for m in messages) + "\\nAssistant:"',
    'else:',
    '    try:',
    '        formatted = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)',
    '    except Exception:',
    '        formatted = "\\n".join(f"{m[\'role\'].capitalize()}: {m[\'content\']}" for m in messages) + "\\nAssistant:"',
    '',
    'inputs = tokenizer(formatted, return_tensors="pt").to(device)',
    'input_len = inputs["input_ids"].shape[1]',
    'with torch.no_grad():',
    '    output = model.generate(',
    '        **inputs,',
    '        max_new_tokens=max_tokens,',
    '        temperature=temperature,',
    '        do_sample=temperature > 0,',
    '        top_p=0.9,',
    '        repetition_penalty=1.1,',
    '        pad_token_id=tokenizer.eos_token_id',
    '    )',
    '',
    'gen_ids = output[0][input_len:]',
    'response = tokenizer.decode(gen_ids, skip_special_tokens=True).strip()',
    '',
    'if tools and "\\ntool_calls" in response or "tool_calls" in response:',
    '    try:',
    '        import ast',
    '        tc_match = re.search(r\'tool_calls\\s*=\\s*\\[\\s*\\{[^\\}]+\\}\\s*\\]\', response, re.DOTALL)',
    '        if tc_match:',
    '            func_match = re.search(r"\'name\'\\s*:\\s*[\'\"]([^\'\"]+)[\'\"]", tc_match.group())',
    '            args_match = re.search(r"\'arguments\'\\s*:\\s*[\'\"]([^\'\"]+)[\'\"]", tc_match.group())',
    '            if func_match and args_match:',
    '                tool_call = {',
    '                    "name": func_match.group(1),',
    '                    "arguments": args_match.group(1),',
    '                }',
    '    except Exception:',
    '        pass',
    '',
    'result = {',
    '    "type": "text" if not tool_call else "tool_call",',
    '    "model": model_id,',
    '    "messages": messages,',
    '    "response": response,',
    '    "tool_call": tool_call,',
    '    "tokens_generated": int(len(gen_ids)),',
    '    "total_time_s": round(time.time() - t0, 3),',
    '}',
    'print("DC1_RESULT_JSON:" + json.dumps(result))',
    '',
  ].join('\n');
}

function estimateDurationMinutes(maxTokens) {
  const approxTokensPerMinute = 350;
  return Math.max(1, Math.ceil(maxTokens / approxTokensPerMinute));
}

function resolveTokenRateHalala(modelId) {
  const row = db.get(
    'SELECT token_rate_halala FROM cost_rates WHERE model = ? AND is_active = 1',
    modelId
  ) || db.get(
    'SELECT token_rate_halala FROM cost_rates WHERE model = ? AND is_active = 1',
    '__default__'
  );
  return toFiniteInt(row?.token_rate_halala, { min: 0, max: 1_000_000_000 }) || 1;
}

function extractRequestId(req) {
  return normalizeString(
    req.headers['idempotency-key']
      || req.headers['x-request-id']
      || req.headers['x-correlation-id'],
    { maxLen: 200, trim: true }
  ) || `vllmreq_${crypto.randomUUID()}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForJobCompletion(jobId, diagnosticsContext = {}) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const job = db.get('SELECT * FROM jobs WHERE id = ?', jobId);
    if (!job) return { error: { status: 404, body: { error: 'Job not found after submission' } } };

    const status = String(job.status || '').toLowerCase();
    if (status === 'completed') {
      return { job };
    }

    if (TERMINAL_FAILURE_STATUSES.has(status)) {
      const diagnostics = buildRuntimeDiagnostics({
        modelId: diagnosticsContext.modelId,
        minVramGb: diagnosticsContext.minVramGb,
        jobId: job.job_id,
      });
      logVllmDegradation('terminal_failure', diagnostics, {
        status: job.status,
        error: job.error || null,
      });
      return {
        error: {
          status: 502,
          body: {
            error: 'inference_failed',
            job_id: job.job_id,
            status: job.status,
            details: job.error || null,
            diagnostics,
          },
        },
      };
    }

    await sleep(WAIT_POLL_MS);
  }

  return {
    error: {
      status: 504,
      body: {
        error: 'timeout',
        message: 'Inference did not complete within 300 seconds',
        diagnostics: buildRuntimeDiagnostics({
          modelId: diagnosticsContext.modelId,
          minVramGb: diagnosticsContext.minVramGb,
          jobId: diagnosticsContext.jobId || null,
        }),
      },
    },
  };
}

function buildOpenAiResponse({ job, model, text, promptTokens, completionTokens, toolCall = null }) {
  const completionId = `chatcmpl-${job.job_id}`;
  const completion = completionTokens != null ? completionTokens : approximateTokenCount(text);
  const total = promptTokens + completion;

  const message = { role: 'assistant' };
  if (toolCall) {
    const toolCallId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    message.content = '';
    message.tool_calls = [{
      id: toolCallId,
      type: 'function',
      function: {
        name: toolCall.name || '',
        arguments: toolCall.arguments || '{}',
      },
    }];
  } else {
    message.content = text;
  }

  return {
    id: completionId,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: toolCall ? 'tool_calls' : 'stop',
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completion,
      total_tokens: total,
    },
    cost_halala: Number(job.actual_cost_halala ?? job.cost_halala ?? 0),
  };
}

function prepareMessages(messagesRaw, tools = null) {
  if (!Array.isArray(messagesRaw) || messagesRaw.length === 0) {
    return { error: 'messages must be a non-empty array' };
  }

  const messages = [];
  for (const entry of messagesRaw.slice(0, 100)) {
    const role = normalizeString(entry?.role, { maxLen: 20 }) || 'user';
    const content = normalizeString(entry?.content, { maxLen: 20000, trim: false });
    const toolCallId = normalizeString(entry?.tool_call_id, { maxLen: 64 });
    const toolCalls = entry?.tool_calls;

    if (toolCallId) {
      messages.push({
        role: 'tool',
        content: content || '',
        tool_call_id: toolCallId,
      });
      continue;
    }

    if (toolCalls && Array.isArray(toolCalls)) {
      for (const tc of toolCalls.slice(0, 10)) {
        const func = tc?.function || {};
        const tcId = normalizeString(tc?.id, { maxLen: 64 }) || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const funcName = normalizeString(func?.name, { maxLen: 256 });
        const funcArgs = normalizeString(func?.arguments, { maxLen: 10000, trim: false }) || '{}';
        if (funcName) {
          messages.push({
            role: 'assistant',
            content: content || '',
            tool_calls: [{
              id: tcId,
              type: 'function',
              function: {
                name: funcName,
                arguments: funcArgs,
              },
            }],
          });
        }
      }
      continue;
    }

    if (content) {
      messages.push({ role: role.toLowerCase(), content });
    }
  }

  if (messages.length === 0) {
    return { error: 'messages must include at least one non-empty content string' };
  }

  return { value: messages };
}

async function submitAndAwait(req) {
  const model = normalizeString(req.body?.model, { maxLen: 200 });
  if (!model) return { error: { status: 400, body: { error: 'model is required' } } };

  const tools = req.body?.tools;
  const toolChoice = req.body?.tool_choice;
  const hasTools = Array.isArray(tools) && tools.length > 0;

  const preparedMessages = prepareMessages(req.body?.messages, hasTools ? tools : null);
  if (preparedMessages.error) {
    return { error: { status: 400, body: { error: preparedMessages.error } } };
  }

  const maxTokens = toFiniteInt(req.body?.max_tokens, { min: 1, max: 8192 }) || 512;
  const temperature = toFiniteNumber(req.body?.temperature, { min: 0, max: 2 }) ?? 0.7;

  const modelReq = resolveModelRequirements(model);
  const minVramMb = modelReq.min_vram_gb * 1024;
  // Assign provider upfront (DCP-907 job assignment queue — lowest GPU utilization wins)
  const assignedProvider = assignProvider(minVramMb);
  if (!assignedProvider) {
    const diagnostics = buildRuntimeDiagnostics({
      modelId: modelReq.model_id,
      minVramGb: modelReq.min_vram_gb,
      jobId: null,
    });
    logVllmDegradation('no_capacity', diagnostics, {
      renter_id: req.renter?.id || null,
      route: req.originalUrl || '/api/vllm/complete',
    });
    return {
      error: {
        status: 503,
        body: {
          error: 'no_capacity',
          message: 'No online providers currently satisfy this model GPU requirement',
          diagnostics,
        },
      },
    };
  }

  const messages = preparedMessages.value;
  const mergedPrompt = estimatePromptFromMessages(messages);
  const promptTokens = approximateTokenCount(mergedPrompt);
  const durationMinutes = estimateDurationMinutes(maxTokens);
  const estimatedCostHalala = Math.max(1, Math.round(durationMinutes * modelReq.fallback_rate_halala_per_min));
  const tokenRateHalala = resolveTokenRateHalala(modelReq.model_id);
  const meteringRequestId = extractRequestId(req);
  let usagePersisted = false;

  if (Number(req.renter.balance_halala || 0) < estimatedCostHalala) {
    return {
      error: {
        status: 402,
        body: {
          error: 'Insufficient balance',
          balance_halala: Number(req.renter.balance_halala || 0),
          required_halala: estimatedCostHalala,
          shortfall_halala: estimatedCostHalala - Number(req.renter.balance_halala || 0),
        },
      },
    };
  }

  const now = new Date().toISOString();
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const containerSpec = {
    image_type: 'vllm-serve',
    image: 'dcp/vllm-serve:latest',
    model_id: modelReq.model_id,
    vram_required_mb: minVramMb,
    gpu_count: 1,
    compute_type: 'inference',
  };

  const taskSpec = buildTaskScript({
    model: modelReq.model_id,
    messages,
    tools: hasTools ? tools : null,
    toolChoice,
    maxTokens,
    temperature,
  });

  const createJobTx = db._db.transaction(() => {
    const debit = db.prepare(
      'UPDATE renters SET balance_halala = balance_halala - ?, updated_at = ? WHERE id = ? AND balance_halala >= ?'
    ).run(estimatedCostHalala, now, req.renter.id, estimatedCostHalala);
    if (!debit || debit.changes !== 1) {
      throw new Error('INSUFFICIENT_BALANCE_OR_CONCURRENT_UPDATE');
    }

    const jobInsert = db.prepare(
      `INSERT INTO jobs (
        job_id,
        provider_id,
        renter_id,
        job_type,
        model,
        status,
        submitted_at,
        duration_minutes,
        cost_halala,
        gpu_requirements,
        container_spec,
        task_spec,
        max_duration_seconds,
        notes,
        created_at,
        updated_at,
        priority
      ) VALUES (?, ?, ?, 'vllm', ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      jobId,
      assignedProvider.id,  // DCP-907: assign to the lowest-utilization capable provider
      req.renter.id,
      modelReq.model_id,
      now,
      durationMinutes,
      estimatedCostHalala,
      JSON.stringify({ min_vram_gb: modelReq.min_vram_gb }),
      JSON.stringify(containerSpec),
      taskSpec,
      300,
      'vllm:direct-completion',
      now,
      now,
      8
    );

    // Create serve_sessions record for metering (Sprint 25 Gap 1)
    // provider_id is now set at job creation (DCP-907 job assignment queue)
    const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour expiry
    try {
      db.prepare(
        `INSERT INTO serve_sessions (
          id, job_id, provider_id, model, port, status, started_at, expires_at,
          total_inferences, total_tokens, total_billed_halala, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 0, 'serving', ?, ?, 0, 0, 0, ?, ?)`
      ).run(
        `session-${jobId}`,
        jobId,
        assignedProvider.id,  // DCP-907: set provider_id immediately at session creation
        modelReq.model_id,
        now,
        expiresAt,
        now,
        now
      );
    } catch (_) {
      // Non-fatal — serve_sessions creation failure should not block job creation
    }

    return jobInsert;
  });

  let insert;
  try {
    insert = createJobTx();
  } catch (error) {
    if (String(error?.message || '').includes('INSUFFICIENT_BALANCE_OR_CONCURRENT_UPDATE')) {
      return {
        error: {
          status: 402,
          body: {
            error: 'Insufficient balance',
            balance_halala: Number(req.renter.balance_halala || 0),
            required_halala: estimatedCostHalala,
            shortfall_halala: Math.max(0, estimatedCostHalala - Number(req.renter.balance_halala || 0)),
          },
        },
      };
    }
    throw error;
  }

  const persistUsageOnce = ({
    providerForUsage = null,
    providerResponseId = null,
    promptTokensValue = 0,
    completionTokensValue = 0,
  }) => {
    if (usagePersisted) return;
    const cleanPrompt = toFiniteInt(promptTokensValue, { min: 0, max: 1_000_000_000 }) || 0;
    const cleanCompletion = toFiniteInt(completionTokensValue, { min: 0, max: 1_000_000_000 }) || 0;
    const cleanTotal = cleanPrompt + cleanCompletion;
    const cleanCostHalala = Math.max(1, cleanTotal * tokenRateHalala);
    try {
      recordOpenRouterUsage(db._db || db, {
        requestId: meteringRequestId,
        providerResponseId: normalizeString(providerResponseId, { maxLen: 200 }),
        jobId,
        requestPath: normalizeString(req.path || req.originalUrl || '/api/vllm/complete', { maxLen: 160 }),
        renterApiKeyId: req.renterAuth?.renter_api_key_id || null,
        renterKeyType: req.renterAuth?.key_type || 'master_key',
        tokenRateHalala,
        renterId: req.renter.id,
        providerId: providerForUsage?.id || assignedProvider.id || null,
        model: modelReq.model_id,
        source: 'api_vllm',
        promptTokens: cleanPrompt,
        completionTokens: cleanCompletion,
        totalTokens: cleanTotal,
        costHalala: cleanCostHalala,
        currency: 'SAR',
      });
    } catch (error) {
      console.error('[vllm] usage ledger persist failed:', error?.message || error);
    }
    usagePersisted = true;
  };


  // DCP-922: If the selected provider has a registered vLLM endpoint, proxy directly.
  // Try primary provider + up to 2 fallback providers before giving up.
  if (hasValidProviderEndpoint(assignedProvider)) {
    const proxyMessages = preparedMessages.value;
    const fallbackCandidates = [
      assignedProvider,
      ...getValidatedBackupProviders({
        assignedProviderId: assignedProvider.id,
        minVramMb,
        limit: 2,
      }),
    ];

    let lastProxyError = null;
    for (const candidate of fallbackCandidates) {
      if (!hasValidProviderEndpoint(candidate)) continue;
      const proxyResult = await proxyToProviderEndpoint({
        endpointUrl: candidate.vllm_endpoint_url,
        modelId: modelReq.model_id,
        messages: proxyMessages,
        maxTokens,
        temperature,
      });

      if (proxyResult.proxyError) {
        console.warn(`[vllm/proxy] provider #${candidate.id} failed: ${proxyResult.proxyError}`);
        lastProxyError = proxyResult.proxyError;
        continue;
      }

      const proxyPromptTokens = toFiniteInt(proxyResult.promptTokens, { min: 0, max: 1000000000 }) || 0;
      const proxyCompletionTokens = toFiniteInt(proxyResult.completionTokens, { min: 0, max: 1000000000 })
        || approximateTokenCount(proxyResult.text);
      const totalTokens = proxyPromptTokens + proxyCompletionTokens;
      const nowProxy = new Date().toISOString();
      try {
        runStatement(
          'UPDATE jobs SET status = ?, prompt_tokens = ?, completion_tokens = ?, result_text = ?, updated_at = ? WHERE job_id = ?',
          'completed', proxyPromptTokens, proxyCompletionTokens, proxyResult.text, nowProxy, jobId
        );
      } catch (_) { /* non-fatal */ }
      try {
        persistServeSessionMetering({
          jobId,
          providerId: candidate.id,
          modelId: modelReq.model_id,
          nowIso: nowProxy,
          totalTokens,
          billedHalala: Math.max(1, totalTokens * tokenRateHalala),
        });
      } catch (_) { /* non-fatal */ }
      persistUsageOnce({
        providerForUsage: candidate,
        providerResponseId: `chatcmpl-${jobId}`,
        promptTokensValue: proxyPromptTokens,
        completionTokensValue: proxyCompletionTokens,
      });

      return {
        payload: buildOpenAiResponse({
          job: { result_text: proxyResult.text },
          model: modelReq.model_id,
          text: proxyResult.text,
          promptTokens: proxyPromptTokens,
          completionTokens: proxyCompletionTokens,
        }),
        text: proxyResult.text,
      };
    }

    const diagProxy = buildRuntimeDiagnostics({ modelId: modelReq.model_id, minVramGb: modelReq.min_vram_gb, jobId });
    logVllmDegradation('proxy_all_failed', diagProxy, { last_error: lastProxyError });
    return {
      error: {
        status: 503,
        body: { error: 'no_providers_available', message: 'All provider endpoints failed', last_error: lastProxyError, diagnostics: diagProxy },
      },
    };
  }

  // Legacy path: provider has no vllm_endpoint_url — fall back to job polling
  const waitResult = await waitForJobCompletion(insert.lastInsertRowid, {
    modelId: modelReq.model_id,
    minVramGb: modelReq.min_vram_gb,
    jobId,
  });
  if (waitResult.error) {
    return waitResult;
  }

  const completedJob = waitResult.job;
  const extracted = extractCompletionText(completedJob);

  // Persist actual token counts for billing traceability (Sprint 25 Gap 1)
  const actualCompletionTokens = extracted.completion_tokens != null
    ? extracted.completion_tokens
    : approximateTokenCount(extracted.text);
  const totalTokensActual = promptTokens + actualCompletionTokens;

  try {
    runStatement(
      'UPDATE jobs SET prompt_tokens = ?, completion_tokens = ?, updated_at = ? WHERE job_id = ?',
      promptTokens,
      actualCompletionTokens,
      now,
      jobId
    );
  } catch (_) {
    // Non-fatal — token write-back failure must not block the inference response
  }

  persistUsageOnce({
    providerForUsage: assignedProvider,
    providerResponseId: `chatcmpl-${jobId}`,
    promptTokensValue: promptTokens,
    completionTokensValue: actualCompletionTokens,
  });

  // Update serve_sessions metering (Sprint 25 Gap 1 — per-token billing)
  try {
    // Get token rate for this model
    const rateRecord = db.get(
      'SELECT token_rate_halala FROM cost_rates WHERE model = ? AND is_active = 1',
      modelReq.model_id
    ) || db.get(
      'SELECT token_rate_halala FROM cost_rates WHERE model = ? AND is_active = 1',
      '__default__'
    );

    const tokenRateHalala = rateRecord?.token_rate_halala || 1;
    const inferenceCostHalala = Math.max(1, totalTokensActual * tokenRateHalala);

    // Update serve_sessions with metering data
    persistServeSessionMetering({
      jobId,
      providerId: assignedProvider.id,
      modelId: modelReq.model_id,
      nowIso: now,
      totalTokens: totalTokensActual,
      billedHalala: inferenceCostHalala,
    });
  } catch (_) {
    // Non-fatal — metering update failure must not block the inference response
    // (billing audit will catch missing serve_sessions updates)
  }

  const responsePayload = buildOpenAiResponse({
    job: completedJob,
    model: modelReq.model_id,
    text: extracted.text,
    promptTokens,
    completionTokens: extracted.completion_tokens,
    toolCall: extracted.tool_call || null,
  });

  return {
    payload: responsePayload,
    text: extracted.text,
  };
}

// GET /v1/models
// OpenAI-compatible model list endpoint.
router.get('/models', (req, res) => {
  try {
    const models = db.all(
      `SELECT
         m.model_id,
         m.display_name,
         m.family,
         m.created_at,
         m.vram_gb,
         m.quantization,
         m.context_window,
         m.use_cases,
         m.min_gpu_vram_gb,
         COUNT(p.id) AS providers_online,
         COALESCE(
           ROUND(AVG(COALESCE(p.price_per_min_halala, m.default_price_halala_per_min)) / 100.0, 2),
           ROUND(m.default_price_halala_per_min / 100.0, 2)
         ) AS avg_price_sar_per_min
       FROM model_registry m
       LEFT JOIN providers p
         ON p.status = 'online'
        AND COALESCE(
              p.vram_gb,
              CAST(ROUND(COALESCE(p.gpu_vram_mb, p.gpu_vram_mib, 0) / 1024.0) AS INTEGER),
              0
            ) >= m.min_gpu_vram_gb
       WHERE m.is_active = 1
       GROUP BY m.id
       ORDER BY m.display_name ASC`
    );

    const payload = models.map((row) => {
      let useCases = [];
      try {
        const parsed = JSON.parse(row.use_cases || '[]');
        useCases = Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        useCases = [];
      }

      const providersOnline = Number(row.providers_online || 0);
      const avgSarPerMin = Number(row.avg_price_sar_per_min || 0);
      const createdTs = row.created_at ? Math.floor(new Date(row.created_at).getTime() / 1000) : Math.floor(Date.now() / 1000);

      return {
        id: row.model_id,
        object: 'model',
        created: createdTs,
        owned_by: row.family || 'dcp-platform',
        permission: [],
        root: row.model_id,
        parent: null,
      };
    });

    return res.json({ object: 'list', data: payload });
  } catch (error) {
    console.error('vLLM model registry error:', error);
    return res.status(500).json({ error: 'Failed to fetch vLLM model registry' });
  }
});

// POST /v1/complete
// Legacy text completions endpoint — unified stream flag routes internally
router.post('/complete', vllmCompleteLimiter, requireRenter, async (req, res) => {
  const shouldStream = req.body?.stream === true || req.body?.stream === 'true';
  if (shouldStream) {
    let cancelled = false;
    req.on('close', () => { cancelled = true; });
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.flushHeaders) res.flushHeaders();
    try {
      const result = await submitAndAwait(req);
      if (cancelled) return res.end();
      if (result.error) {
        res.write(`data: ${JSON.stringify({ error: result.error.body })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      }
      const chunks = splitStreamText(result.text);
      const completionId = result.payload.id || `chatcmpl-${crypto.randomBytes(8).toString('hex')}`;
      for (const part of chunks) {
        if (cancelled) return res.end();
        const payload = {
          id: completionId,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: result.payload.model,
          choices: [{ index: 0, delta: { content: part }, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
      const finalPayload = {
        id: completionId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: result.payload.model,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: result.payload.usage,
        cost_halala: result.payload.cost_halala,
      };
      res.write(`data: ${JSON.stringify(finalPayload)}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    } catch (error) {
      console.error('vLLM complete stream error:', error);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'vLLM streaming failed' });
      }
      try {
        res.write(`data: ${JSON.stringify({ error: 'vLLM streaming failed' })}\n\n`);
        res.write('data: [DONE]\n\n');
      } catch (_) {}
      return res.end();
    }
  }
  try {
    const result = await submitAndAwait(req);
    if (result.error) {
      return res.status(result.error.status).json(result.error.body);
    }
    return res.json(result.payload);
  } catch (error) {
    console.error('vLLM complete error:', error);
    return res.status(500).json({ error: 'vLLM completion failed' });
  }
});

// POST /v1/chat/completions
// OpenAI-compatible unified endpoint — checks req.body.stream to route internally
router.post('/chat/completions', vllmCompleteLimiter, requireRenter, async (req, res) => {
  const shouldStream = req.body?.stream === true || req.body?.stream === 'true';
  if (shouldStream) {
    let cancelled = false;
    req.on('close', () => { cancelled = true; });
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.flushHeaders) res.flushHeaders();
    try {
      const result = await submitAndAwait(req);
      if (cancelled) return res.end();
      if (result.error) {
        res.write(`data: ${JSON.stringify({ error: result.error.body })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      }
      const chunks = splitStreamText(result.text);
      const completionId = result.payload.id || `chatcmpl-${crypto.randomBytes(8).toString('hex')}`;
      for (const part of chunks) {
        if (cancelled) return res.end();
        const payload = {
          id: completionId,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: result.payload.model,
          choices: [{ index: 0, delta: { content: part }, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
      const finalPayload = {
        id: completionId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: result.payload.model,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: result.payload.usage,
        cost_halala: result.payload.cost_halala,
      };
      res.write(`data: ${JSON.stringify(finalPayload)}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    } catch (error) {
      console.error('vLLM chat/completions stream error:', error);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'vLLM streaming failed' });
      }
      try {
        res.write(`data: ${JSON.stringify({ error: 'vLLM streaming failed' })}\n\n`);
        res.write('data: [DONE]\n\n');
      } catch (_) {}
      return res.end();
    }
  }
  try {
    const result = await submitAndAwait(req);
    if (result.error) {
      return res.status(result.error.status).json(result.error.body);
    }
    return res.json(result.payload);
  } catch (error) {
    console.error('vLLM chat/completions error:', error);
    return res.status(500).json({ error: 'vLLM completion failed' });
  }
});

// POST /api/vllm/complete/stream?key=
router.post('/complete/stream', vllmStreamLimiter, requireRenter, async (req, res) => {
  let cancelled = false;
  req.on('close', () => { cancelled = true; });

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.flushHeaders) res.flushHeaders();

    const result = await submitAndAwait(req);
    if (cancelled) return res.end();
    if (result.error) {
      res.write(`data: ${JSON.stringify({ error: result.error.body })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    const chunks = splitStreamText(result.text);
    const completionId = result.payload.id || `chatcmpl-${crypto.randomBytes(8).toString('hex')}`;

    for (const part of chunks) {
      if (cancelled) return res.end();
      const payload = {
        id: completionId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: result.payload.model,
        choices: [{ index: 0, delta: { content: part }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }

    const finalPayload = {
      id: completionId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: result.payload.model,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: result.payload.usage,
      cost_halala: result.payload.cost_halala,
    };
    res.write(`data: ${JSON.stringify(finalPayload)}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  } catch (error) {
    console.error('vLLM stream error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'vLLM streaming failed' });
    }
    try {
      res.write(`data: ${JSON.stringify({ error: 'vLLM streaming failed' })}\n\n`);
      res.write('data: [DONE]\n\n');
    } catch (_) {
      // no-op
    }
    return res.end();
  }
});

module.exports = router;
