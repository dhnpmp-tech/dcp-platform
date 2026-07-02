// DCP Agent Gateway — single proxy point for every brain that runs on
// a provider's machine. Provider's Hermes config sets the brain base
// URL to api.dcp.sa/api/agent/gateway and uses its DCP_PROVIDER_KEY for
// auth — the upstream provider's API key (MiniMax / Anthropic / future
// in-house model) lives ONLY on this VPS, never on a provider machine.
//
// Two surfaces:
//   POST /v1/messages         — Anthropic Messages format (Hermes built-in
//                               `minimax` and `claude` providers post here)
//   POST /chat/completions    — OpenAI chat-completions format (older
//                               clients, the original gateway shape)
//
// Routing is intentionally pluggable so we can swap brains or add a
// task-complexity classifier later (e.g. send reasoning tasks to Claude
// Opus, chat to MiniMax) without touching call-sites.

const express = require('express');
const https = require('https');
const router = express.Router();

// ── CORS — Tauri desktop, browser, Hermes ──────────────────────────────
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Provider-Key, anthropic-version, x-api-key'
  );
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── DCP-API-01 mitigation: per-IP rate limit + provider-key presence gate ──
// Legit callers are provider Hermes brains that send DCP_PROVIDER_KEY
// (Authorization/x-provider-key/x-api-key). Nexus does NOT use this gateway.
// Keyless calls = denial-of-wallet abuse (observed exhausting the upstream
// Token Plan). Enforcement gated by env so it can be flipped instantly.
const rateLimit = require('express-rate-limit');
router.use(rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', detail: 'agent-gateway: too many requests' },
}));
const GATEWAY_REQUIRE_KEY = process.env.DC1_GATEWAY_REQUIRE_KEY === '1';
router.use((req, res, next) => {
  if (req.path === '/health') return next();
  const hasKey = !!(req.headers['x-provider-key'] || req.headers['authorization'] || req.headers['x-api-key']);
  if (!hasKey) {
    console.warn(`[agent-gateway] KEYLESS ${GATEWAY_REQUIRE_KEY ? 'BLOCKED' : 'WARN'} ip=${req.ip} path=${req.path} ua=${String(req.headers['user-agent']||'').slice(0,40)}`);
    if (GATEWAY_REQUIRE_KEY) return res.status(401).json({ error: 'unauthorized', detail: 'agent-gateway requires a provider key' });
  }
  next();
});

// ── Upstream registry ────────────────────────────────────────────────
// Add new brains here. Each upstream may expose an Anthropic-format
// endpoint, an OpenAI-format endpoint, or both — leave fields blank
// for a surface the upstream doesn't speak. Auth is described by the
// header name, prefix, and the env var that holds the key on this VPS.
const UPSTREAMS = {
  minimax: {
    anthropic_url: 'https://api.minimax.io/anthropic/v1/messages',
    openai_url:    'https://api.minimax.io/v1/text/chatcompletion_v2',
    key_env:       'MINIMAX_AGENT_KEY',
    auth_header:   'Authorization',
    auth_prefix:   'Bearer ',
    default_model: 'MiniMax-M2.7-highspeed',
  },
  anthropic: {
    anthropic_url: 'https://api.anthropic.com/v1/messages',
    openai_url:    null,
    key_env:       'ANTHROPIC_API_KEY',
    auth_header:   'x-api-key',
    auth_prefix:   '',
    default_model: 'claude-sonnet-4-6',
  },
  // Drop a new entry here to make a new brain available — no other
  // code changes needed:
  //
  // openrouter:  { ... },
  // dcp_inhouse: { anthropic_url: 'http://10.8.0.1:8000/v1/messages', ... },
};

// ── Routing — which upstream serves which kind of task ─────────────
// Today: everything goes to the default. Tomorrow: classify the
// incoming request (e.g. by message length, system-prompt keywords,
// or an explicit `x-route` hint) and dispatch by complexity.
const ROUTING = {
  default: { upstream: 'minimax' },
  // Examples kept in source as design notes — uncomment when wired:
  //
  // reasoning: { upstream: 'anthropic', model: 'claude-opus-4-7' },
  // coding:    { upstream: 'anthropic', model: 'claude-sonnet-4-6' },
};

function resolveRoute(req) {
  // Future: read req.headers['x-route'], inspect req.body.messages,
  // or classify by token count. For now, allow an explicit override
  // header and otherwise default everything.
  const explicit = (req.headers['x-route'] || '').toString().trim();
  if (explicit && ROUTING[explicit]) return ROUTING[explicit];
  return ROUTING.default;
}

function authHeadersFor(upstreamName) {
  const u = UPSTREAMS[upstreamName];
  const key = (process.env[u.key_env] || '').trim();
  if (!key) return {};
  return { [u.auth_header]: u.auth_prefix + key };
}

// ── Thinking-mode handling ───────────────────────────────────────────
// Upstream models in the thinking family (Qwen3, MiniMax-M2.7, QwQ,
// DeepSeek-R1) emit their entire output budget into a <think>…</think>
// block by default. Without an explicit "disable thinking" flag, the
// visible content is empty — caller sees `choices[0].message.content`
// as "" and rightfully calls it broken (see Tareq Node 2 incident
// 2026-05-13). Detection by model-name pattern, case-insensitive.
const THINKING_MODEL_PATTERNS = [
  /^qwen3[-_.]/i,
  /^qwq[-_.]/i,
  /^deepseek[-_.]?r1[-_.]/i,
  /^minimax[-_.]?m2\.7[-_.]/i,
];

function isThinkingModel(model) {
  if (!model || typeof model !== 'string') return false;
  return THINKING_MODEL_PATTERNS.some((re) => re.test(model));
}

// Mutate-and-return: inject chat_template_kwargs.enable_thinking=false
// for thinking-family models. Renter can opt back in by setting
// `enable_thinking: true` in the request body (we leave it alone).
// Used on the OpenAI/vLLM-compatible path.
function injectDisableThinking(body, model) {
  if (!isThinkingModel(model)) return body;
  const ctk = body.chat_template_kwargs || {};
  if (body.enable_thinking === true) return body;
  if (ctk.enable_thinking === true) return body;
  body.chat_template_kwargs = { ...ctk, enable_thinking: false };
  return body;
}

// Anthropic-format equivalent. The Anthropic Messages spec uses a
// top-level `thinking` field: `{type:"enabled",budget_tokens:N}` or
// `{type:"disabled"}`. MiniMax's Anthropic-compatible surface honors
// this — `chat_template_kwargs` is ignored on the Anthropic path
// (vLLM-only). This is the actual fix for Tareq Node 2's
// "Empty response from model" via Hermes (which uses
// transport="anthropic_messages").
function injectAnthropicDisableThinking(body, model) {
  if (!isThinkingModel(model)) return body;
  // Renter opt-in: explicit thinking={type:"enabled",...} passes through.
  if (body.thinking && body.thinking.type === 'enabled') return body;
  body.thinking = { type: 'disabled' };
  return body;
}

// Belt-and-suspenders: strip <think>…</think> from response content
// even when the disable flag was injected. Catches models that ignore
// the flag and older Ollama paths that use the `/no_think` prefix.
const THINK_BLOCK_RE = /<think>[\s\S]*?<\/think>\s*/gi;

function stripThinkBlocks(content) {
  if (typeof content !== 'string') return content;
  if (!content.includes('<think>')) return content;
  return content.replace(THINK_BLOCK_RE, '').trimStart();
}

function stripThinkFromResponse(json) {
  if (!json || !Array.isArray(json.choices)) return json;
  for (const choice of json.choices) {
    if (!choice || !choice.message) continue;
    const msg = choice.message;
    if (typeof msg.content === 'string') {
      msg.content = stripThinkBlocks(msg.content);
    }
    // Some OpenAI-compatible thinking-mode servers return reasoning in
    // a separate `reasoning_content` field and leave `content` empty.
    // If content is empty/null and reasoning_content is non-empty,
    // promote it so callers that read `choices[0].message.content`
    // (Hermes, anthropic-sdk-shim, etc.) don't see ""/null.
    const contentEmpty =
      msg.content == null ||
      (typeof msg.content === 'string' && msg.content.trim() === '');
    if (
      contentEmpty &&
      typeof msg.reasoning_content === 'string' &&
      msg.reasoning_content.trim() !== ''
    ) {
      msg.content = stripThinkBlocks(msg.reasoning_content).trim();
    }
  }
  return json;
}

// Anthropic-format response sanitizer. The Messages API can return
// content blocks of type `thinking` / `redacted_thinking` alongside
// `text` / `tool_use`. Hermes' minimax overlay reads
// `content[0].text` and reports the call as broken when only thinking
// blocks come back. Strategy:
//   1) Filter out thinking/redacted_thinking blocks (caller didn't ask
//      for them — we injected thinking:{type:"disabled"} but some
//      upstreams emit them anyway).
//   2) If, after filtering, no text/tool_use blocks remain, synthesize
//      a single text block from the (now-stripped) thinking content so
//      the caller always sees something usable rather than ""/null.
function sanitizeAnthropicContent(json) {
  if (!json || !Array.isArray(json.content)) return json;
  const stripped = [];
  let salvageText = '';
  for (const block of json.content) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'thinking' || block.type === 'redacted_thinking') {
      if (typeof block.thinking === 'string' && block.thinking.trim()) {
        salvageText += (salvageText ? '\n\n' : '') + block.thinking.trim();
      }
      continue;
    }
    if (block.type === 'text' && typeof block.text === 'string') {
      block.text = stripThinkBlocks(block.text);
    }
    stripped.push(block);
  }
  const hasUsableBlock = stripped.some(
    (b) =>
      (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) ||
      b.type === 'tool_use'
  );
  if (!hasUsableBlock && salvageText) {
    stripped.push({ type: 'text', text: salvageText });
  }
  json.content = stripped;
  return json;
}

function proxyJson(targetUrl, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(targetUrl);
    const req = https.request(
      {
        method: 'POST',
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + (u.search || ''),
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...extraHeaders,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString();
          let parsed = null;
          try { parsed = JSON.parse(text); } catch (_) { /* keep raw */ }
          resolve({ status: res.statusCode, json: parsed, raw: parsed ? null : text });
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Stream-pipe upstream's SSE response straight through to the client.
// We deliberately do NOT JSON-buffer here — Hermes (and any other
// OpenAI-SDK / Anthropic-SDK consumer) calling with `stream: true`
// requires text/event-stream chunked back as it arrives. The earlier
// gateway code only had proxyJson, which buffered the full body and
// returned application/json — that's what produced "Empty response"
// on Tareq Node 2: the SDK saw JSON instead of SSE and accumulated
// zero deltas into `message.content`.
function proxyStream(targetUrl, body, extraHeaders, res, transformSse = null) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(targetUrl);
    const upReq = https.request(
      {
        method: 'POST',
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + (u.search || ''),
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          Accept: 'text/event-stream',
          ...extraHeaders,
        },
      },
      (upRes) => {
        // Mirror status + headers (content-type matters most so the
        // SDK switches into stream-parse mode).
        const passHeaders = {};
        const ct = upRes.headers['content-type'];
        if (ct) passHeaders['Content-Type'] = ct;
        const cc = upRes.headers['cache-control'];
        if (cc) passHeaders['Cache-Control'] = cc;
        // Disable proxy buffering for nginx-fronted deployments.
        passHeaders['X-Accel-Buffering'] = 'no';
        res.writeHead(upRes.statusCode || 502, passHeaders);
        let bytes = 0;
        if (transformSse) {
          // Buffer chunks at the event boundary (blank-line separated),
          // run each through the transformer, and re-emit. This is what
          // lets us swap `thinking` deltas → `text` deltas on the
          // Anthropic Messages path without breaking the streaming
          // contract — the client still gets SSE byte-by-byte; we just
          // rewrite the JSON inside each `data: …` line as it goes by.
          let carry = '';
          upRes.setEncoding('utf8');
          upRes.on('data', (chunk) => {
            bytes += Buffer.byteLength(chunk, 'utf8');
            carry += chunk;
            let nl;
            while ((nl = carry.indexOf('\n\n')) !== -1) {
              const event = carry.slice(0, nl + 2);
              carry = carry.slice(nl + 2);
              const out = transformSse(event);
              if (out) res.write(out);
            }
          });
          upRes.on('end', () => {
            if (carry) {
              const out = transformSse(carry);
              if (out) res.write(out);
            }
            res.end();
            resolve({ status: upRes.statusCode, bytes });
          });
        } else {
          upRes.on('data', (chunk) => {
            bytes += chunk.length;
            res.write(chunk);
          });
          upRes.on('end', () => {
            res.end();
            resolve({ status: upRes.statusCode, bytes });
          });
        }
        upRes.on('error', (err) => {
          try { res.end(); } catch (_) {}
          reject(err);
        });
      }
    );
    upReq.on('error', reject);
    upReq.write(data);
    upReq.end();
  });
}

// Transform a single Anthropic SSE event so that `thinking` content
// blocks read as `text` content blocks to the downstream client.
// Reasoning (Nexus 2026-05-14 lockup): MiniMax-on-Anthropic ignores
// `thinking:{type:"disabled"}` and emits content_block events of type
// `thinking` / `thinking_delta`. Anthropic-SDK clients that only iterate
// text deltas see zero usable content → agent loop wedges, no reply.
// Rewriting in flight is cleaner than buffering the entire stream.
//
// Anthropic spec events we touch:
//   content_block_start with content_block.type === 'thinking'
//     → flip type to 'text', rename `thinking`→`text` (with empty
//       string default)
//   content_block_delta with delta.type === 'thinking_delta'
//     → flip type to 'text_delta', rename `thinking`→`text`
//   redacted_thinking blocks → dropped entirely (no usable text to
//     recover; emitting an empty text block would confuse stop_reason)
// All other event types pass through untouched.
function transformAnthropicStreamEvent(eventText) {
  if (!eventText) return eventText;
  // Each event is one or more lines like `event: …\ndata: …\n\n`.
  // We only need to rewrite the `data:` JSON line(s).
  const lines = eventText.split('\n');
  let droppedBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trimStart();
    if (!payload || payload === '[DONE]') continue;
    let obj;
    try { obj = JSON.parse(payload); } catch (_) { continue; }
    if (!obj || typeof obj !== 'object') continue;
    if (obj.type === 'content_block_start' && obj.content_block) {
      const blk = obj.content_block;
      if (blk.type === 'thinking') {
        blk.type = 'text';
        const t = typeof blk.thinking === 'string' ? blk.thinking : '';
        delete blk.thinking;
        blk.text = t;
      } else if (blk.type === 'redacted_thinking') {
        droppedBlock = true;
      }
    } else if (obj.type === 'content_block_delta' && obj.delta) {
      if (obj.delta.type === 'thinking_delta') {
        const t = typeof obj.delta.thinking === 'string' ? obj.delta.thinking : '';
        obj.delta = { type: 'text_delta', text: t };
      } else if (obj.delta.type === 'redacted_thinking_delta') {
        droppedBlock = true;
      }
    } else if (obj.type === 'content_block_stop' && droppedBlock) {
      // Suppress the stop for a redacted_thinking block we dropped.
      droppedBlock = false;
      return '';
    }
    lines[i] = 'data: ' + JSON.stringify(obj);
  }
  return lines.join('\n');
}

function shortKey(req) {
  const raw =
    req.headers['x-provider-key'] ||
    req.headers['authorization'] ||
    req.headers['x-api-key'] ||
    '';
  return String(raw).slice(0, 16);
}

// ── Anthropic-format handler ──────────────────────────────────────────
// Hermes' built-in `minimax` overlay uses transport="anthropic_messages"
// and posts here. Same handler will serve any future Anthropic-format
// client (Claude SDK, anthropic-vendored MCP servers, etc.).
router.post('/v1/messages', async (req, res) => {
  const route = resolveRoute(req);
  const upstream = UPSTREAMS[route.upstream];
  if (!upstream || !upstream.anthropic_url) {
    return res.status(502).json({
      error: 'upstream_no_anthropic_surface',
      upstream: route.upstream,
    });
  }
  const model = route.model || req.body?.model || upstream.default_model;
  const ts = new Date().toISOString();
  const msgs = Array.isArray(req.body?.messages) ? req.body.messages.length : 0;
  console.log(
    `[agent-gateway/anthropic] ${ts} provider=${shortKey(req)} ` +
    `upstream=${route.upstream} model=${model} msgs=${msgs}`
  );
  try {
    // Pass-through body (preserves stream, tools, tool_choice, etc.)
    // with surgical edits only — never rebuild from scratch, that's
    // what dropped `stream:true` and broke Hermes.
    const body = { ...req.body, model };
    injectAnthropicDisableThinking(body, model);
    injectDisableThinking(body, model);
    const extraHeaders = {
      ...authHeadersFor(route.upstream),
      'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
    };
    const isStreaming = body.stream === true;
    if (isStreaming) {
      // Pipe SSE with on-the-fly transformation: thinking deltas →
      // text deltas. MiniMax-on-Anthropic ignores our thinking:disabled
      // request and emits thinking content_blocks anyway. Without this
      // transformation, Anthropic-SDK clients that only consume text
      // deltas see zero usable content and their agent loop wedges
      // (Nexus 2026-05-14 lockup root cause).
      const result = await proxyStream(
        upstream.anthropic_url, body, extraHeaders, res,
        transformAnthropicStreamEvent,
      );
      console.log(
        `[agent-gateway/anthropic] DONE-STREAM provider=${shortKey(req)} ` +
        `bytes=${result.bytes} status=${result.status}`
      );
      return;
    }
    const result = await proxyJson(upstream.anthropic_url, body, extraHeaders);
    // Filter thinking/redacted_thinking blocks and synthesize a text
    // block from salvaged thinking content if no usable block remains.
    sanitizeAnthropicContent(result.json);
    if (result.status >= 400) {
      console.warn(
        `[agent-gateway/anthropic] upstream=${route.upstream} status=${result.status} ` +
        `body=${(result.raw || JSON.stringify(result.json)).slice(0, 240)}`
      );
    } else {
      const usage = result.json?.usage || {};
      console.log(
        `[agent-gateway/anthropic] DONE provider=${shortKey(req)} ` +
        `in=${usage.input_tokens || 0} out=${usage.output_tokens || 0}`
      );
    }
    res.status(result.status).json(result.json || { error: 'upstream_text', raw: result.raw });
  } catch (err) {
    console.error(`[agent-gateway/anthropic] ERROR: ${err.message}`);
    if (!res.headersSent) {
      res.status(502).json({ error: 'gateway_failed', detail: err.message });
    } else {
      try { res.end(); } catch (_) {}
    }
  }
});

// ── OpenAI-format handler — preserved for older callers ──────────────
router.post('/chat/completions', async (req, res) => {
  const route = resolveRoute(req);
  const upstream = UPSTREAMS[route.upstream];
  if (!upstream || !upstream.openai_url) {
    return res.status(502).json({
      error: 'upstream_no_openai_surface',
      upstream: route.upstream,
    });
  }
  const model = route.model || req.body?.model || upstream.default_model;
  const ts = new Date().toISOString();
  const msgs = Array.isArray(req.body?.messages) ? req.body.messages.length : 0;
  console.log(
    `[agent-gateway/openai] ${ts} provider=${shortKey(req)} ` +
    `upstream=${route.upstream} model=${model} msgs=${msgs}`
  );
  try {
    // Pass-through body (preserves stream, tools, tool_choice, stream_options,
    // top_p, presence/frequency_penalty, response_format, seed, etc.) with
    // surgical edits only. The previous code rebuilt the body from just
    // {model, messages, max_tokens, temperature} which silently DROPPED
    // `stream:true` from Hermes — root cause of Tareq Node 2 "Empty response".
    const body = { ...req.body, model };
    if (body.max_tokens === undefined) body.max_tokens = 4096;
    if (body.temperature === undefined) body.temperature = 0.7;
    injectDisableThinking(body, model);
    const extraHeaders = authHeadersFor(route.upstream);
    const isStreaming = body.stream === true;
    if (isStreaming) {
      // Pipe SSE through. We could in principle parse SSE deltas and
      // strip <think>...</think> across chunks, but in practice we've
      // injected enable_thinking=false and the renter SDKs strip
      // client-side. Trade: real-time tokens > server-side think strip.
      const result = await proxyStream(upstream.openai_url, body, extraHeaders, res);
      console.log(
        `[agent-gateway/openai] DONE-STREAM provider=${shortKey(req)} ` +
        `bytes=${result.bytes} status=${result.status}`
      );
      return;
    }
    const result = await proxyJson(upstream.openai_url, body, extraHeaders);
    stripThinkFromResponse(result.json);
    if (result.status >= 400) {
      console.warn(
        `[agent-gateway/openai] upstream=${route.upstream} status=${result.status} ` +
        `body=${(result.raw || JSON.stringify(result.json)).slice(0, 240)}`
      );
    } else {
      const usage = result.json?.usage || {};
      console.log(
        `[agent-gateway/openai] DONE provider=${shortKey(req)} ` +
        `in=${usage.prompt_tokens || 0} out=${usage.completion_tokens || 0}`
      );
    }
    res.status(result.status).json(result.json || { error: 'upstream_text', raw: result.raw });
  } catch (err) {
    console.error(`[agent-gateway/openai] ERROR: ${err.message}`);
    if (!res.headersSent) {
      res.status(502).json({ error: 'gateway_failed', detail: err.message });
    } else {
      try { res.end(); } catch (_) {}
    }
  }
});

router.get('/health', (req, res) => {
  // OSINT-01: unauthenticated. Return liveness ONLY — do not disclose upstream
  // topology (which paid brains we run: minimax/anthropic/…) or route names to
  // anonymous callers. Was leaking default_upstream/available_upstreams/routes.
  res.json({ status: 'ok' });
});

module.exports = router;
// Internal helpers exported for unit tests (see
// __tests__/agent-gateway-thinking-mode.test.js). Not used by app code.
module.exports.__test__ = {
  isThinkingModel,
  injectDisableThinking,
  injectAnthropicDisableThinking,
  stripThinkBlocks,
  stripThinkFromResponse,
  sanitizeAnthropicContent,
  transformAnthropicStreamEvent,
};
