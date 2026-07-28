const { evaluateProvider } = require('../fleet/rules');

const NOW = Date.parse('2026-07-28T12:00:00Z');
const min = (n) => new Date(NOW - n * 60 * 1000).toISOString();
const day = (n) => new Date(NOW - n * 24 * 3600 * 1000).toISOString();

const base = { provider_id: 1, status: 'online', is_paused: 0, deleted_at: null };

describe('fleet rules', () => {
    test('healthy provider produces no incidents', () => {
        expect(evaluateProvider({ ...base, last_heartbeat: min(1), last_beacon_at: min(1) }, NOW)).toEqual([]);
    });

    test('daemon silent + beacon fresh → daemon_down_host_alive with start_daemon hint', () => {
        const hits = evaluateProvider({ ...base, last_heartbeat: min(20), last_beacon_at: min(1) }, NOW);
        expect(hits.map((h) => h.rule)).toEqual(['daemon_down_host_alive']);
        expect(hits[0].suggestedAction).toEqual({ action: 'start_daemon', channel: 'beacon' });
        expect(hits[0].severity).toBe('critical');
    });

    test('daemon silent + beacon silent → host_unreachable, no auto action', () => {
        const hits = evaluateProvider({ ...base, last_heartbeat: min(20), last_beacon_at: min(20) }, NOW);
        expect(hits.map((h) => h.rule)).toEqual(['host_unreachable']);
        expect(hits[0].suggestedAction).toBeNull();
    });

    test('graveyard rows (silent > 7 days) never fire heartbeat rules', () => {
        const hits = evaluateProvider({ ...base, last_heartbeat: day(30), last_beacon_at: null }, NOW);
        expect(hits.filter((h) => h.rule !== 'miner_quarantine')).toEqual([]);
    });

    test('missing heartbeat entirely (never seen) does not fire', () => {
        expect(evaluateProvider({ ...base, last_heartbeat: null, last_beacon_at: null }, NOW)).toEqual([]);
    });

    test('flagged provider fires miner_quarantine even while heartbeating', () => {
        const hits = evaluateProvider({ ...base, status: 'flagged', last_heartbeat: min(1), last_beacon_at: min(1) }, NOW);
        expect(hits.map((h) => h.rule)).toEqual(['miner_quarantine']);
        expect(hits[0].suggestedAction).toBeNull();
    });

    test('flagged provider still fires even when paused (quarantine set is_paused=1)', () => {
        const hits = evaluateProvider({ ...base, status: 'flagged', is_paused: 1, last_heartbeat: min(1), last_beacon_at: min(1) }, NOW);
        expect(hits.map((h) => h.rule)).toContain('miner_quarantine');
    });

    test('paused non-flagged provider is skipped', () => {
        expect(evaluateProvider({ ...base, is_paused: 1, last_heartbeat: min(60), last_beacon_at: min(1) }, NOW)).toEqual([]);
    });

    test('deleted provider is skipped', () => {
        expect(evaluateProvider({ ...base, deleted_at: min(60), last_heartbeat: min(60), last_beacon_at: min(1) }, NOW)).toEqual([]);
    });

    test('in_progress task older than 60m fires download_stuck', () => {
        const hits = evaluateProvider({
            ...base, last_heartbeat: min(1), last_beacon_at: min(1),
            oldest_active_task_at: min(90), oldest_active_task_id: 7, oldest_active_task_type: 'pull_model',
        }, NOW);
        expect(hits.map((h) => h.rule)).toEqual(['download_stuck']);
        expect(hits[0].severity).toBe('warning');
    });

    test('recent in_progress task does not fire', () => {
        const hits = evaluateProvider({
            ...base, last_heartbeat: min(1), last_beacon_at: min(1),
            oldest_active_task_at: min(10), oldest_active_task_id: 7, oldest_active_task_type: 'pull_model',
        }, NOW);
        expect(hits).toEqual([]);
    });

    test('dedup keys are stable per provider+rule', () => {
        const a = evaluateProvider({ ...base, last_heartbeat: min(20), last_beacon_at: min(1) }, NOW)[0];
        const b = evaluateProvider({ ...base, last_heartbeat: min(25), last_beacon_at: min(2) }, NOW + 60000)[0];
        expect(a.dedupKey).toBe(b.dedupKey);
    });
});
