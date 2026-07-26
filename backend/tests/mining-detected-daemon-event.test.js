'use strict';

/**
 * task_a74c15efb7a0 — Host mining_detected side-effects on daemon-event.
 *
 * POST /api/providers/daemon-event with event_type=mining_detected must:
 *   1. insert daemon_events row
 *   2. quarantine provider (is_paused=1, status=flagged)
 *   3. auto-create mission_tasks row with external_id mining_detected:provider:<id>
 *   4. dedupe mission task within 24h on second event
 */

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key-stub';
process.env.NODE_ENV = 'test';
process.env.DISABLE_RATE_LIMIT = '1';

const request = require('supertest');
const express = require('express');
const db = require('../src/db');

// notifications.sendAlert is fire-and-forget; stub to avoid network
jest.mock('../src/services/notifications', () => ({
  sendAlert: jest.fn(async () => true),
  notifyProvider: jest.fn(async () => true),
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/providers', require('../src/routes/providers'));
  return app;
}

const app = createApp();

function clean() {
  const safe = (t) => { try { db.prepare(`DELETE FROM ${t}`).run(); } catch (_) {} };
  try { db.prepare('PRAGMA foreign_keys = OFF').run(); } catch (_) {}
  for (const t of [
    'daemon_events', 'provider_status_log', 'mission_task_comments',
    'mission_tasks', 'providers',
  ]) safe(t);
  try { db.prepare('PRAGMA foreign_keys = ON').run(); } catch (_) {}
}

function insertProvider(overrides = {}) {
  const apiKey = overrides.api_key || `dcp-provider-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const name = overrides.name || 'MinerTestProvider';
  const status = overrides.status || 'online';
  // Minimal insert — schema has many columns with defaults
  const info = db.prepare(`
    INSERT INTO providers (name, email, gpu_model, os, api_key, status, is_paused, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))
  `).run(
    name,
    overrides.email || `miner-${Date.now()}@dc1.test`,
    overrides.gpu_model || 'RTX 3090',
    overrides.os || 'Linux',
    apiKey,
    status,
  );
  const id = info.lastInsertRowid;
  return { id, apiKey, name };
}

describe('daemon-event mining_detected (task_a74c15efb7a0)', () => {
  beforeEach(() => clean());

  test('quarantines provider + creates mission task with external_id', async () => {
    const p = insertProvider();
    const details = 'host_miner_guard reason=periodic findings=1 killed=[1234] host_proc:known_miner_pattern pid=1234 cmd=xmrig';

    const res = await request(app)
      .post('/api/providers/daemon-event')
      .send({
        api_key: p.apiKey,
        event_type: 'mining_detected',
        severity: 'critical',
        hostname: 'node-lab-1',
        details,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.event_type).toBe('mining_detected');
    expect(res.body.provider_id).toBe(p.id);

    const prov = db.prepare('SELECT is_paused, status FROM providers WHERE id = ?').get(p.id);
    expect(prov.is_paused).toBe(1);
    expect(prov.status).toBe('flagged');

    const evt = db.prepare(
      `SELECT event_type, severity, details FROM daemon_events WHERE provider_id = ? AND event_type = 'mining_detected'`
    ).get(p.id);
    expect(evt).toBeTruthy();
    expect(evt.severity).toBe('critical');
    expect(String(evt.details)).toContain('xmrig');

    const externalId = `mining_detected:provider:${p.id}`;
    const task = db.prepare(
      `SELECT id, title, status, priority, tier, source, external_id, created_by
       FROM mission_tasks WHERE external_id = ?`
    ).get(externalId);
    expect(task).toBeTruthy();
    expect(task.status).toBe('todo');
    expect(task.priority).toBe('p0');
    expect(task.tier).toBe('critical');
    expect(task.source).toBe('security');
    expect(task.created_by).toBeNull();
    expect(String(task.title)).toMatch(/HOST MINER/i);
  });

  test('dedupes mission task within 24h on second mining_detected', async () => {
    const p = insertProvider();
    const externalId = `mining_detected:provider:${p.id}`;
    const payload = {
      api_key: p.apiKey,
      event_type: 'mining_detected',
      severity: 'critical',
      hostname: 'node-lab-1',
      details: 'finding round 1',
    };

    const r1 = await request(app).post('/api/providers/daemon-event').send(payload);
    expect(r1.status).toBe(200);

    const r2 = await request(app).post('/api/providers/daemon-event').send({
      ...payload,
      details: 'finding round 2',
    });
    expect(r2.status).toBe(200);

    const tasks = db.prepare(
      `SELECT id FROM mission_tasks WHERE external_id = ?`
    ).all(externalId);
    expect(tasks.length).toBe(1);

    // provider stays quarantined
    const prov = db.prepare('SELECT is_paused, status FROM providers WHERE id = ?').get(p.id);
    expect(prov.is_paused).toBe(1);
    expect(prov.status).toBe('flagged');

    // two daemon_events rows still logged
    const evts = db.prepare(
      `SELECT id FROM daemon_events WHERE provider_id = ? AND event_type = 'mining_detected'`
    ).all(p.id);
    expect(evts.length).toBe(2);
  });

  test('does not quarantine on non-mining daemon events', async () => {
    const p = insertProvider({ status: 'online' });
    const res = await request(app)
      .post('/api/providers/daemon-event')
      .send({
        api_key: p.apiKey,
        event_type: 'job_completed',
        severity: 'info',
        details: 'ok',
      });
    expect(res.status).toBe(200);
    const prov = db.prepare('SELECT is_paused, status FROM providers WHERE id = ?').get(p.id);
    expect(prov.is_paused).toBe(0);
    expect(prov.status).toBe('online');
    const tasks = db.prepare(
      `SELECT id FROM mission_tasks WHERE external_id = ?`
    ).all(`mining_detected:provider:${p.id}`);
    expect(tasks.length).toBe(0);
  });
});
