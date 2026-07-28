// Fleet brain — LLM triage, woken per-incident by the watcher.
// Stateless per wake: gets a tight context packet, returns a structured
// decision. It NEVER touches a node — the actuator's code allowlist is the
// only path to effects, so a hallucinated action degrades to a proposal.
//
// Env-gated: without ANTHROPIC_API_KEY the watcher still runs; deterministic
// rule→action mappings (start_daemon) work without the brain.

let AnthropicSdk = null;
try {
    // Lazy so CI / hosts without the dependency still load the watcher.
    AnthropicSdk = require('@anthropic-ai/sdk');
} catch (_) { /* brain disabled */ }

const MODEL = process.env.DCP_FLEET_BRAIN_MODEL || 'claude-opus-4-7';

const DECISION_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['diagnosis', 'action', 'message'],
    properties: {
        diagnosis: { type: 'string', description: 'Most likely root cause, one short paragraph.' },
        action: {
            type: 'string',
            enum: ['start_daemon', 'retry_download', 'expire_stuck_lease', 'propose', 'none'],
            description: 'Allowlisted auto action, "propose" for anything else, "none" to only record the diagnosis.',
        },
        proposed_action: { type: 'string', description: 'When action=propose: the human-readable action being proposed.' },
        message: { type: 'string', description: 'One-paragraph operator-facing summary for the alert channel.' },
    },
};

function isEnabled() {
    return Boolean(AnthropicSdk && process.env.ANTHROPIC_API_KEY);
}

// incident: row from fleet_incidents + rule hit; context: provider snapshot
// + recent incidents. Returns a decision object or null (disabled/failed).
async function decide(incident, context) {
    if (!isEnabled()) return null;
    const client = new AnthropicSdk({ apiKey: process.env.ANTHROPIC_API_KEY });

    const packet = {
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

    try {
        const response = await client.messages.create({
            model: MODEL,
            max_tokens: 2048,
            thinking: { type: 'adaptive' },
            system:
                'You are the DCP fleet triage brain. You diagnose provider-node incidents on a GPU marketplace. ' +
                'You can ONLY act through the given allowlist; anything else must be action="propose". ' +
                'Be conservative: security quarantines (miner_quarantine) are never auto-cleared. ' +
                'host_unreachable cannot be fixed remotely — diagnose and set action="none" or "propose". ' +
                'Respond with the structured decision only.',
            messages: [{ role: 'user', content: JSON.stringify(packet) }],
            output_config: { format: { type: 'json_schema', schema: DECISION_SCHEMA } },
        });
        const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
        return JSON.parse(text);
    } catch (e) {
        console.warn('[fleet/brain] decide failed:', e.message);
        return null;
    }
}

module.exports = { decide, isEnabled, DECISION_SCHEMA, MODEL };
