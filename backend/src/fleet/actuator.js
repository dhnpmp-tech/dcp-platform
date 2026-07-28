// Fleet actuator — the ONLY component that turns decisions into effects.
// The allowlist is CODE, not a prompt: the brain cannot act outside it even
// if it hallucinates an action. Everything else becomes a Mission Control
// proposal for human/Claude review.
//
// Safety model (design doc section 4):
//   auto    — allowlisted, reversible, bounded. Executed here (unless dry-run).
//   propose — anything else. Filed as a mission task, never executed.
//
// Dry-run: DCP_FLEET_DRYRUN defaults ON. Live execution only for provider
// ids listed in DCP_FLEET_LIVE_PROVIDERS (comma-separated) — staged rollout,
// Node 2 first.

const crypto = require('crypto');

// action → how it reaches the node. 'beacon' rides the liveness-beacon ack
// (works when the daemon is dead); 'pending_task' rides the daemon HMAC
// channel (needs a live daemon); 'db' is backend-only.
// NOTE: pending_provider_tasks.task_type has a CHECK constraint
// (pull_model|unload_model|noop) — only actions expressible in that vocabulary
// can use the pending_task channel. antiminer_sweep stays propose-only until
// the daemon task vocabulary grows.
const ALLOWLIST = {
    start_daemon: { channel: 'beacon' },
    retry_download: { channel: 'pending_task', taskType: 'pull_model' },
    expire_stuck_lease: { channel: 'db' },
};

function isDryRun() {
    return process.env.DCP_FLEET_DRYRUN !== '0';
}

function liveProviders() {
    return new Set(
        String(process.env.DCP_FLEET_LIVE_PROVIDERS || '')
            .split(',').map((s) => s.trim()).filter(Boolean).map(Number)
    );
}

function newTaskId() {
    return 'task_' + crypto.randomBytes(6).toString('hex');
}

// decision: { action, providerId, params?, diagnosis?, source }
// Returns { executed, mode: 'auto'|'propose'|'dry_run'|'rejected', detail }
function execute(db, decision) {
    const { action, providerId } = decision || {};
    if (!action || !providerId) return { executed: false, mode: 'rejected', detail: 'missing action/providerId' };

    const spec = ALLOWLIST[action];
    if (!spec) {
        // Out-of-allowlist → propose, never execute.
        propose(db, decision, `action '${action}' is not allowlisted`);
        return { executed: false, mode: 'propose', detail: `non-allowlisted action '${action}' filed as mission task` };
    }

    if (isDryRun() && !liveProviders().has(Number(providerId))) {
        console.log(`[fleet/actuator] DRY-RUN would ${action} provider ${providerId}`);
        return { executed: false, mode: 'dry_run', detail: `dry-run: would ${action}` };
    }

    const nowIso = new Date().toISOString();
    switch (spec.channel) {
        case 'beacon':
            db.prepare(
                `UPDATE provider_agent_liveness SET recover_action = ? WHERE provider_id = ?`
            ).run(action, providerId);
            // No liveness row yet (beacon never reached us) → nothing to ride on.
            return { executed: true, mode: 'auto', detail: `recover_action=${action} queued on beacon ack` };
        case 'pending_task':
            db.prepare(
                `INSERT INTO pending_provider_tasks (provider_id, task_type, params_json, status, created_at)
                 VALUES (?, ?, ?, 'queued', ?)`
            ).run(providerId, spec.taskType, JSON.stringify(decision.params || {}), nowIso);
            return { executed: true, mode: 'auto', detail: `queued ${spec.taskType} pending task` };
        case 'db':
            db.prepare(
                `UPDATE pending_provider_tasks SET status = 'failed', updated_at = ?
                 WHERE provider_id = ? AND status = 'in_progress' AND created_at < ?`
            ).run(nowIso, providerId, decision.params?.olderThan || nowIso);
            return { executed: true, mode: 'auto', detail: 'expired stuck in_progress tasks' };
        default:
            return { executed: false, mode: 'rejected', detail: `unknown channel ${spec.channel}` };
    }
}

// File a Mission Control task instead of acting.
function propose(db, decision, reason) {
    const id = newTaskId();
    const title = `[fleet] ${decision.action || 'triage'} — provider ${decision.providerId}`;
    const body = [
        `Fleet ${decision.source || 'watcher'} proposal (NOT executed): ${reason}`,
        decision.diagnosis ? `\nDiagnosis: ${String(decision.diagnosis).slice(0, 1500)}` : '',
        decision.params ? `\nParams: ${JSON.stringify(decision.params).slice(0, 500)}` : '',
    ].join('');
    try {
        db.prepare(
            `INSERT INTO mission_tasks (id, title, description, status, priority, source, external_id, created_at, updated_at)
             VALUES (?, ?, ?, 'todo', 'p1', 'agent', ?, datetime('now'), datetime('now'))`
        ).run(id, title.slice(0, 200), body.slice(0, 4000), `fleet:${decision.providerId}:${decision.action || 'triage'}`);
    } catch (e) {
        // UNIQUE-ish dedup by external_id is not enforced; a failed insert
        // must never take the watcher down.
        console.warn('[fleet/actuator] propose failed:', e.message);
    }
    return id;
}

module.exports = { execute, propose, ALLOWLIST, isDryRun, liveProviders };
