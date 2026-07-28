// Fleet watcher pm2 entrypoint (process: dcp-fleet-watcher).
// Deliberately its own process: a watcher crash must not take down mission
// dispatch, and vice versa.

const db = require('../db');
const { tick } = require('./watcher');
const { sendAlert } = require('../services/notifications');
const { isDryRun, liveProviders } = require('./actuator');

const INTERVAL_MS = Number(process.env.DCP_FLEET_TICK_MS || 30_000);
let running = false;
let stopped = false;

async function loop() {
    if (running || stopped) return;
    running = true;
    try {
        const stats = await tick(db, { sendAlert });
        if (stats.newIncidents > 0) {
            console.log(`[fleet] tick: ${stats.providers} providers, ${stats.incidents} active, ${stats.newIncidents} new`);
        }
    } catch (e) {
        console.error('[fleet] tick failed:', e.stack || e);
    } finally {
        running = false;
    }
}

console.log(
    `[fleet] watcher starting — interval ${INTERVAL_MS}ms, dry-run=${isDryRun()}, live providers=[${[...liveProviders()].join(',') || 'none'}]`
);
const timer = setInterval(loop, INTERVAL_MS);
loop();

process.on('SIGTERM', () => { stopped = true; clearInterval(timer); process.exit(0); });
process.on('SIGINT', () => { stopped = true; clearInterval(timer); process.exit(0); });
