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
function injectDisableThinking(body, model) {
  if (!isThinkingModel(model)) return body;
  const ctk = body.chat_template_kwargs || {};
  // Renter opt-in: explicit `enable_thinking: true` at top-level OR in
  // chat_template_kwargs passes through untouched.
  if (body.enable_thinking === true) return body;
  if (ctk.enable_thinking === true) return body;
  body.chat_template_kwargs = { ...ctk, enable_thinking: false };
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
    if (choice && choice.message && typeof choice.message.content === 'string') {
      choice.message.content = stripThinkBlocks(choice.message.content);
    }
  }
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
    const body = { ...req.body, model };
    injectDisableThinking(body, model);
    const result = await proxyJson(upstream.anthropic_url, body, {
      ...authHeadersFor(route.upstream),
      'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
    });
    // Anthropic-format responses use `content` blocks (text/tool_use);
    // strip <think> from any text block too.
    if (result.json && Array.isArray(result.json.content)) {
      for (const block of result.json.content) {
        if (block && block.type === 'text' && typeof block.text === 'string') {
          block.text = stripThinkBlocks(block.text);
        }
      }
    }
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
    res.status(502).json({ error: 'gateway_failed', detail: err.message });
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
    const body = {
      model,
      messages: req.body.messages,
      max_tokens: req.body.max_tokens || 4096,
      temperature: req.body.temperature ?? 0.7,
    };
    // Renter opt-in passes through; otherwise injected for thinking models.
    if (req.body.enable_thinking !== undefined) body.enable_thinking = req.body.enable_thinking;
    if (req.body.chat_template_kwargs) body.chat_template_kwargs = req.body.chat_template_kwargs;
    injectDisableThinking(body, model);
    const result = await proxyJson(upstream.openai_url, body, authHeadersFor(route.upstream));
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
    res.status(502).json({ error: 'gateway_failed', detail: err.message });
  }
});

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    default_upstream: ROUTING.default.upstream,
    available_upstreams: Object.keys(UPSTREAMS),
    available_routes: Object.keys(ROUTING),
  });
});

module.exports = router;
// Internal helpers exported for unit tests (see
// __tests__/agent-gateway-thinking-mode.test.js). Not used by app code.
module.exports.__test__ = {
  isThinkingModel,
  injectDisableThinking,
  stripThinkBlocks,
  stripThinkFromResponse,
};
