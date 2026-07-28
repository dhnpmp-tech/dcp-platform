// Fleet watcher — deterministic, always-on, no LLM in the loop.
// Every tick: snapshot providers + liveness → run rules → upsert fleet
// state → dedup incidents → alert / auto-recover / wake brain.
//
// Design: docs/superpowers/specs/2026-07-26-provider-fleet-agent-design.md
// The watcher is the cheap layer; the brain is woken only on NEW incidents.

const rules = require('./rules');
const actuator = require('./actuator');
const brain = require('./brain');

// Deterministic rule→action map: these fire WITHOUT the brain. The brain
// adds diagnosis on top; its absence must never block recovery.
const AUTO_BY_RULE = {
    daemon_down_host_alive: 'start_daemon',
};

function snapshotProviders(db) {
    // One row per provider with liveness + oldest active pending task folded in.
    return db.prepare(`
        SELECT p.id AS provider_id, p.status, p.is_paused, p.deleted_at,
               p.last_heartbeat, p.gpu_model AS gpu_name, p.daemon_version,
               l.updated_at AS last_beacon_at,
               t.created_at AS oldest_active_task_at,
               t.id AS oldest_active_task_id,
               t.task_type AS oldest_active_task_type
          FROM providers p
          LEFT JOIN provider_agent_liveness l ON l.provider_id = p.id
          LEFT JOIN (
                SELECT provider_id, id, task_type, created_at,
                       ROW_NUMBER() OVER (PARTITION BY provider_id ORDER BY created_at ASC) AS rn
                  FROM pending_provider_tasks
                 WHERE status = 'in_progress'
          ) t ON t.provider_id = p.id AND t.rn = 1
         WHERE p.deleted_at IS NULL
    `).all();
}

function upsertFleetState(db, p, openIncidents, nowIso) {
    db.prepare(`
        INSERT INTO provider_fleet_state (provider_id, last_heartbeat, last_beacon_at, status, daemon_version, gpu_name, open_incidents, updated_at)
        VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(provider_id) DO UPDATE SET
            last_heartbeat = excluded.last_heartbeat,
            last_beacon_at = excluded.last_beacon_at,
            status = excluded.status,
            daemon_version = excluded.daemon_version,
            gpu_name = excluded.gpu_name,
            open_incidents = excluded.open_incidents,
            updated_at = excluded.updated_at
    `).run(p.provider_id, p.last_heartbeat, p.last_beacon_at, p.status, p.daemon_version, p.gpu_name, openIncidents, nowIso);
}

// Returns { row, isNew } — bumps count on an existing open incident.
function recordIncident(db, providerId, hit, nowIso) {
    const existing = db.prepare(
        `SELECT * FROM fleet_incidents WHERE dedup_key = ? AND state = 'open'`
    ).get(hit.dedupKey);
    if (existing) {
        db.prepare(`UPDATE fleet_incidents SET count = count + 1, last_seen = ? WHERE id = ?`)
            .run(nowIso, existing.id);
        return { row: { ...existing, count: existing.count + 1, last_seen: nowIso }, isNew: false };
    }
    const info = db.prepare(`
        INSERT INTO fleet_incidents (provider_id, rule, severity, summary, dedup_key, state, count, first_seen, last_seen)
        VALUES (?,?,?,?,?, 'open', 1, ?, ?)
    `).run(providerId, hit.rule, hit.severity, hit.summary, hit.dedupKey, nowIso, nowIso);
    const row = db.prepare(`SELECT * FROM fleet_incidents WHERE id = ?`).get(info.lastInsertRowid);
    return { row, isNew: true };
}

function resolveStaleIncidents(db, providerId, activeDedupKeys, nowIso) {
    const open = db.prepare(
        `SELECT id, dedup_key FROM fleet_incidents WHERE provider_id = ? AND state = 'open'`
    ).all(providerId);
    for (const inc of open) {
        if (!activeDedupKeys.has(inc.dedup_key)) {
            db.prepare(`UPDATE fleet_incidents SET state = 'resolved', resolved_at = ? WHERE id = ?`)
                .run(nowIso, inc.id);
        }
    }
}

async function handleNewIncident(db, provider, hit, incidentRow, { sendAlert }) {
    // 1. Alert (severity-gated).
    if (hit.severity !== 'info' && typeof sendAlert === 'function') {
        sendAlert('fleet_incident',
            `🛰 FLEET ${hit.severity.toUpperCase()}\nProvider ${provider.provider_id} (${provider.gpu_name || 'gpu?'})\nRule: ${hit.rule}\n${hit.summary}`
        ).catch((e) => console.error('[fleet/watcher] alert send failed:', e.message));
    }

    // 2. Deterministic auto-recovery (never blocked on the brain).
    const autoAction = AUTO_BY_RULE[hit.rule];
    let actionResult = null;
    if (autoAction) {
        actionResult = actuator.execute(db, {
            action: autoAction,
            providerId: provider.provider_id,
            source: 'watcher',
            diagnosis: hit.summary,
        });
        db.prepare(`UPDATE fleet_incidents SET action_taken = ? WHERE id = ?`)
            .run(`${autoAction}:${actionResult.mode}`, incidentRow.id);
    }

    // 3. Brain triage (optional, additive).
    if (brain.isEnabled()) {
        const recentIncidents = db.prepare(
            `SELECT rule, severity, state, first_seen FROM fleet_incidents
              WHERE provider_id = ? ORDER BY last_seen DESC LIMIT 10`
        ).all(provider.provider_id);
        const decision = await brain.decide(incidentRow, { provider, recentIncidents });
        if (decision) {
            db.prepare(`UPDATE fleet_incidents SET brain_decision_json = ? WHERE id = ?`)
                .run(JSON.stringify(decision).slice(0, 8000), incidentRow.id);
            if (decision.action === 'propose') {
                actuator.propose(db, {
                    action: decision.proposed_action || 'triage',
                    providerId: provider.provider_id,
                    diagnosis: decision.diagnosis,
                    source: 'brain',
                }, 'brain proposal');
            } else if (decision.action !== 'none' && decision.action !== autoAction) {
                const r = actuator.execute(db, {
                    action: decision.action,
                    providerId: provider.provider_id,
                    diagnosis: decision.diagnosis,
                    source: 'brain',
                });
                db.prepare(`UPDATE fleet_incidents SET action_taken = COALESCE(action_taken || ' + ', '') || ? WHERE id = ?`)
                    .run(`${decision.action}:${r.mode}`, incidentRow.id);
            }
        }
    }
    return actionResult;
}

// One watcher tick. `deps` allows tests to inject { nowMs, sendAlert }.
async function tick(db, deps = {}) {
    const nowMs = deps.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const sendAlert = deps.sendAlert;
    const providers = snapshotProviders(db);
    const stats = { providers: providers.length, incidents: 0, newIncidents: 0 };

    for (const p of providers) {
        const hits = rules.evaluateProvider(p, nowMs);
        const activeKeys = new Set(hits.map((h) => h.dedupKey));
        resolveStaleIncidents(db, p.provider_id, activeKeys, nowIso);
        upsertFleetState(db, p, hits.length, nowIso);
        for (const hit of hits) {
            stats.incidents += 1;
            const { row, isNew } = recordIncident(db, p.provider_id, hit, nowIso);
            if (isNew) {
                stats.newIncidents += 1;
                try {
                    await handleNewIncident(db, p, hit, row, { sendAlert });
                } catch (e) {
                    console.error('[fleet/watcher] incident handling failed:', e.message);
                }
            }
        }
    }
    return stats;
}

module.exports = { tick, snapshotProviders, AUTO_BY_RULE };
