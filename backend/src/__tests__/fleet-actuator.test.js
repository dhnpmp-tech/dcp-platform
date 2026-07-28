const Database = require('better-sqlite3');
const actuator = require('../fleet/actuator');

function makeDb() {
    const db = new Database(':memory:');
    db.exec(`
        CREATE TABLE provider_agent_liveness (provider_id INTEGER PRIMARY KEY, agent TEXT, recover_action TEXT);
        CREATE TABLE pending_provider_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER, task_type TEXT
                CHECK (task_type IN ('pull_model','unload_model','noop')),
            params_json TEXT, status TEXT DEFAULT 'queued', created_at TEXT);
        CREATE TABLE mission_tasks (id TEXT PRIMARY KEY, title TEXT, description TEXT,
            status TEXT, priority TEXT, source TEXT, external_id TEXT, created_at TEXT, updated_at TEXT);
    `);
    db.prepare(`INSERT INTO provider_agent_liveness (provider_id, agent) VALUES (42, 'hermes')`).run();
    return db;
}

describe('fleet actuator', () => {
    const OLD_ENV = { ...process.env };
    afterEach(() => { process.env = { ...OLD_ENV }; });

    test('dry-run (default) executes nothing', () => {
        delete process.env.DCP_FLEET_DRYRUN;
        delete process.env.DCP_FLEET_LIVE_PROVIDERS;
        const db = makeDb();
        const r = actuator.execute(db, { action: 'start_daemon', providerId: 42 });
        expect(r.mode).toBe('dry_run');
        expect(db.prepare('SELECT recover_action FROM provider_agent_liveness WHERE provider_id=42').get().recover_action).toBeNull();
    });

    test('live-listed provider executes start_daemon via beacon channel', () => {
        process.env.DCP_FLEET_LIVE_PROVIDERS = '42';
        const db = makeDb();
        const r = actuator.execute(db, { action: 'start_daemon', providerId: 42 });
        expect(r.mode).toBe('auto');
        expect(db.prepare('SELECT recover_action FROM provider_agent_liveness WHERE provider_id=42').get().recover_action).toBe('start_daemon');
    });

    test('DCP_FLEET_DRYRUN=0 goes fully live', () => {
        process.env.DCP_FLEET_DRYRUN = '0';
        const db = makeDb();
        const r = actuator.execute(db, { action: 'start_daemon', providerId: 42 });
        expect(r.mode).toBe('auto');
    });

    test('non-allowlisted action is NEVER executed — becomes a mission proposal', () => {
        process.env.DCP_FLEET_DRYRUN = '0';
        const db = makeDb();
        const r = actuator.execute(db, { action: 'reboot_host', providerId: 42, diagnosis: 'x' });
        expect(r.executed).toBe(false);
        expect(r.mode).toBe('propose');
        const task = db.prepare(`SELECT * FROM mission_tasks`).get();
        expect(task.title).toContain('reboot_host');
        expect(task.status).toBe('todo');
        // and absolutely nothing touched the node channels
        expect(db.prepare('SELECT recover_action FROM provider_agent_liveness WHERE provider_id=42').get().recover_action).toBeNull();
        expect(db.prepare('SELECT COUNT(*) c FROM pending_provider_tasks').get().c).toBe(0);
    });

    test('retry_download rides the pending_task channel with pull_model type', () => {
        process.env.DCP_FLEET_DRYRUN = '0';
        const db = makeDb();
        const r = actuator.execute(db, { action: 'retry_download', providerId: 42, params: { model: 'qwen3' } });
        expect(r.mode).toBe('auto');
        const row = db.prepare('SELECT * FROM pending_provider_tasks').get();
        expect(row.task_type).toBe('pull_model');
        expect(JSON.parse(row.params_json)).toEqual({ model: 'qwen3' });
    });

    test('missing action or provider is rejected outright', () => {
        const db = makeDb();
        expect(actuator.execute(db, { action: 'start_daemon' }).mode).toBe('rejected');
        expect(actuator.execute(db, { providerId: 42 }).mode).toBe('rejected');
    });
});
