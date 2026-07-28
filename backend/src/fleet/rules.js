// Fleet watcher anomaly rules — PURE functions, no I/O, no clock reads.
// Every rule takes a provider snapshot + `nowMs` and returns an incident
// descriptor or null. The watcher owns persistence, dedup, and actions.
//
// Design: docs/superpowers/specs/2026-07-26-provider-fleet-agent-design.md
// (section 4). Severity drives comms; `suggestedAction` is only a hint —
// the actuator's allowlist is the real gate.

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const HEARTBEAT_GAP_MIN_MS = 10 * MIN;
// Rows silent longer than this are graveyard registrations, not incidents.
// The providerHealth log noise ("missed check 22821/3") is what happens
// without this gate.
const GRAVEYARD_MS = 7 * DAY;
const BEACON_FRESH_MS = 5 * MIN;
const DOWNLOAD_STUCK_MS = 60 * MIN;

function ageMs(iso, nowMs) {
    if (!iso) return Infinity;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? nowMs - t : Infinity;
}

// Daemon heartbeat stopped, but the host's liveness beacon (independent
// cron) is still reporting: the box is up, only the daemon is down. This is
// the July 26-28 Node 2 incident — auto-recoverable via the beacon channel.
function daemonDownHostAlive(p, nowMs) {
    const hbAge = ageMs(p.last_heartbeat, nowMs);
    const beaconAge = ageMs(p.last_beacon_at, nowMs);
    if (hbAge < HEARTBEAT_GAP_MIN_MS || hbAge > GRAVEYARD_MS) return null;
    if (beaconAge > BEACON_FRESH_MS) return null;
    return {
        rule: 'daemon_down_host_alive',
        severity: 'critical',
        summary: `daemon silent ${Math.round(hbAge / MIN)}m but liveness beacon fresh (${Math.round(beaconAge / MIN)}m) — daemon died or was stopped and never restarted`,
        dedupKey: `daemon_down_host_alive:${p.provider_id}`,
        suggestedAction: { action: 'start_daemon', channel: 'beacon' },
    };
}

// Both daemon and beacon silent: host-level outage (power, network, crash).
// Nothing we can reach — alert + brain triage only.
function hostUnreachable(p, nowMs) {
    const hbAge = ageMs(p.last_heartbeat, nowMs);
    const beaconAge = ageMs(p.last_beacon_at, nowMs);
    if (hbAge < HEARTBEAT_GAP_MIN_MS || hbAge > GRAVEYARD_MS) return null;
    if (beaconAge <= BEACON_FRESH_MS) return null; // daemonDownHostAlive owns this
    return {
        rule: 'host_unreachable',
        severity: 'critical',
        summary: `no daemon heartbeat for ${Math.round(hbAge / MIN)}m and no liveness beacon — host offline (power/network/crash)`,
        dedupKey: `host_unreachable:${p.provider_id}`,
        suggestedAction: null,
    };
}

// Provider quarantined by the mining handler (status is sticky since
// 2026-07-27). Any action here is propose-only.
function minerQuarantine(p) {
    if (p.status !== 'flagged' && p.status !== 'suspended') return null;
    return {
        rule: 'miner_quarantine',
        severity: 'critical',
        summary: `provider status=${p.status} (security quarantine) — needs human/Claude review before any un-flag`,
        dedupKey: `miner_quarantine:${p.provider_id}`,
        suggestedAction: null,
    };
}

// A pull-on-demand / download task sitting in_progress too long.
function downloadStuck(p, nowMs) {
    if (!p.oldest_active_task_at) return null;
    const age = ageMs(p.oldest_active_task_at, nowMs);
    if (age < DOWNLOAD_STUCK_MS) return null;
    return {
        rule: 'download_stuck',
        severity: 'warning',
        summary: `provider task '${p.oldest_active_task_type || 'unknown'}' active for ${Math.round(age / HOUR * 10) / 10}h without completing`,
        dedupKey: `download_stuck:${p.provider_id}:${p.oldest_active_task_id || 'na'}`,
        suggestedAction: null, // retry decision goes through the brain/propose path
    };
}

const RULES = [daemonDownHostAlive, hostUnreachable, minerQuarantine, downloadStuck];

// Evaluate all rules for one provider snapshot. Snapshot shape:
// { provider_id, status, is_paused, deleted_at, last_heartbeat,
//   last_beacon_at, oldest_active_task_at?, oldest_active_task_id?,
//   oldest_active_task_type? }
function evaluateProvider(p, nowMs) {
    if (!p || p.deleted_at) return [];
    if (p.is_paused && p.status !== 'flagged' && p.status !== 'suspended') return [];
    const out = [];
    for (const rule of RULES) {
        const hit = rule(p, nowMs);
        if (hit) out.push(hit);
    }
    return out;
}

module.exports = {
    evaluateProvider,
    HEARTBEAT_GAP_MIN_MS,
    GRAVEYARD_MS,
    BEACON_FRESH_MS,
    DOWNLOAD_STUCK_MS,
};
