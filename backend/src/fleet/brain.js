// Fleet brain — LLM triage, woken per-incident by the watcher.
// Stateless per wake: gets a tight context packet, returns a structured
// decision. It NEVER touches a node — the actuator's code allowlist is the
// only path to effects, so a hallucinated action degrades to a proposal.
//
// Two interchangeable backends (env-selected):
//   1. OpenAI-compatible (DCP_FLEET_BRAIN_BASE_URL) — e.g. the in-Kingdom
//      Bonsai model on Node 2 (llama.cpp /v1/chat/completions). Dogfoods DCP
//      inference; no external key needed. This is the current stopgap until
//      Node 3 is onboarded.
//   2. Anthropic (ANTHROPIC_API_KEY) — claude-* via the SDK. Highest
//      reliability; use when a node-hosted brain would be a circular
//      dependency at fleet scale.
//
// Either way the brain is OPTIONAL: with neither configured the watcher runs
// deterministic-only, and critical recovery (start_daemon) never depends on
// it — so a slow/down brain loses only the diagnosis narrative, not the fix.

let AnthropicSdk = null;
try {
    AnthropicSdk = require('@anthropic-ai/sdk'); // lazy: absent on CI/hosts is fine
} catch (_) { /* Anthropic backend unavailable */ }

const BASE_URL = process.env.DCP_FLEET_BRAIN_BASE_URL || '';
const MODEL = process.env.DCP_FLEET_BRAIN_MODEL || (BASE_URL ? 'ternary-bonsai-27b' : 'claude-opus-4-7');
// Reasoning models (Bonsai) spend a lot of tokens thinking before the answer —
// budget generously so the JSON isn't truncated by the chain-of-thought.
const MAX_TOKENS = Number(process.env.DCP_FLEET_BRAIN_MAX_TOKENS || 2048);
// A slow brain must never wedge the watcher tick. Recovery already fired
// deterministically before this call, so timing out just drops the diagnosis.
// Bonsai (Q2 27B reasoning model) observed ~28s per decision — 45s gives
// headroom without frequent false timeouts. A hosted model (Claude) is far
// faster; drop this when switching backends.
const TIMEOUT_MS = Number(process.env.DCP_FLEET_BRAIN_TIMEOUT_MS || 45_000);

const ALLOWED_ACTIONS = ['start_daemon', 'retry_download', 'expire_stuck_lease', 'propose', 'none'];

const DECISION_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['diagnosis', 'action', 'message'],
    properties: {
        diagnosis: { type: 'string', description: 'Most likely root cause, one short paragraph.' },
        action: { type: 'string', enum: ALLOWED_ACTIONS },
        proposed_action: { type: 'string', description: 'When action=propose: the human-readable action being proposed.' },
        message: { type: 'string', description: 'One-paragraph operator-facing summary for the alert channel.' },
    },
};

const SYSTEM_PROMPT =
    'You are the DCP fleet triage brain. You diagnose provider-node incidents on a GPU marketplace. ' +
    'You can ONLY act through the given allowlist; anything else must be action="propose". ' +
    'Be conservative: security quarantines (miner_quarantine) are never auto-cleared. ' +
    'host_unreachable cannot be fixed remotely — diagnose and set action="none" or "propose". ' +
    'Respond with ONLY a JSON object: {"diagnosis": string, "action": one of ' +
    JSON.stringify(ALLOWED_ACTIONS) + ', "proposed_action"?: string, "message": string}. No prose, no markdown.';

function backend() {
    if (BASE_URL) return 'openai';
    if (AnthropicSdk && process.env.ANTHROPIC_API_KEY) return 'anthropic';
    return null;
}

function isEnabled() {
    return backend() !== null;
}

// Robustly pull the decision object out of model text. Reasoning models may
// wrap it in prose or ```json fences; take the first balanced {...} block and
// validate the action enum. Returns null on anything unparseable.
function parseDecision(text) {
    if (!text || typeof text !== 'string') return null;
    let candidate = text.trim();
    const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) candidate = fence[1].trim();
    if (candidate[0] !== '{') {
        const start = candidate.indexOf('{');
        const end = candidate.lastIndexOf('}');
        if (start === -1 || end <= start) return null;
        candidate = candidate.slice(start, end + 1);
    }
    let obj;
    try { obj = JSON.parse(candidate); } catch { return null; }
    if (!obj || typeof obj !== 'object') return null;
    if (!ALLOWED_ACTIONS.includes(obj.action)) obj.action = 'propose'; // out-of-enum degrades to propose
    if (typeof obj.diagnosis !== 'string') obj.diagnosis = '';
    if (typeof obj.message !== 'string') obj.message = obj.diagnosis;
    return obj;
}

function buildPacket(incident, context) {
    return {
        incident: {
            rule: incident.rule,
            severity: incident.severity,
            summary: incident.summary,
            count: incident.count,
            first_seen: incident.first_seen,
        },
        provider: context.provider,
        recent_incidents: context.recentIncidents,
        allowlist: ['start_daemon', 'retry_download', 'expire_stuck_lease'],
    };
}

async function decideOpenAI(packet) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (process.env.DCP_FLEET_BRAIN_API_KEY) {
            headers.Authorization = `Bearer ${process.env.DCP_FLEET_BRAIN_API_KEY}`;
        }
        const res = await fetch(`${BASE_URL.replace(/\/$/, '')}/chat/completions`, {
            method: 'POST',
            headers,
            signal: controller.signal,
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: JSON.stringify(packet) },
                ],
                temperature: 0.2,
                max_tokens: MAX_TOKENS,
            }),
        });
        if (!res.ok) {
            console.warn(`[fleet/brain] openai backend HTTP ${res.status}`);
            return null;
        }
        const data = await res.json();
        // Reasoning models return the answer in message.content (chain-of-thought
        // stays in message.reasoning_content, which we deliberately ignore).
        const text = data?.choices?.[0]?.message?.content || '';
        return parseDecision(text);
    } finally {
        clearTimeout(timer);
    }
}

async function decideAnthropic(packet) {
    const client = new AnthropicSdk({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: 'adaptive' },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(packet) }],
        output_config: { format: { type: 'json_schema', schema: DECISION_SCHEMA } },
    });
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return parseDecision(text);
}

// incident: row from fleet_incidents + rule hit; context: provider snapshot
// + recent incidents. Returns a decision object or null (disabled/failed).
async function decide(incident, context) {
    const which = backend();
    if (!which) return null;
    const packet = buildPacket(incident, context);
    try {
        return which === 'openai' ? await decideOpenAI(packet) : await decideAnthropic(packet);
    } catch (e) {
        console.warn('[fleet/brain] decide failed:', e.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : e.message);
        return null;
    }
}

module.exports = { decide, isEnabled, backend, parseDecision, DECISION_SCHEMA, MODEL, BASE_URL };
