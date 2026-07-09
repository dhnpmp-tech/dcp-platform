'use strict';

if (!process.env.DC1_DB_PATH) process.env.DC1_DB_PATH = ':memory:';
if (!process.env.DC1_ADMIN_TOKEN) process.env.DC1_ADMIN_TOKEN = 'test-admin-token-jest';
if (!process.env.DISABLE_RATE_LIMIT) process.env.DISABLE_RATE_LIMIT = '1';

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const express = require('express');

const ADMIN_TOKEN = process.env.DC1_ADMIN_TOKEN;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', require('../../src/routes/admin'));
  return app;
}

describe('GET /api/admin/live-acceptance-gates', () => {
  const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-live-gates-evidence-'));
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-live-gates-output-'));
  let app;

  beforeAll(() => {
    process.env.DCP_LIVE_ACCEPTANCE_EVIDENCE_DIR = evidenceDir;
    process.env.DCP_LIVE_ACCEPTANCE_STATUS_OUTPUT_DIR = outputDir;
    fs.writeFileSync(path.join(evidenceDir, 'dcp-agent-reconciliation-latest.json'), JSON.stringify({
      generated_at: '2026-07-09T18:54:00.000Z',
      verdict: 'BLOCKED',
      maintenance_required: true,
      failure: {
        code: 'DCP_AGENT_RECONCILIATION_MAINTENANCE_REQUIRED',
        details: {
          blockers: ['maintenance_window_required'],
        },
      },
    }, null, 2));
    app = createApp();
  });

  afterAll(() => {
    delete process.env.DCP_LIVE_ACCEPTANCE_EVIDENCE_DIR;
    delete process.env.DCP_LIVE_ACCEPTANCE_STATUS_OUTPUT_DIR;
    fs.rmSync(evidenceDir, { recursive: true, force: true });
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  test('requires admin auth', async () => {
    const res = await request(app).get('/api/admin/live-acceptance-gates');

    expect(res.status).toBe(401);
  });

  test('returns the read-only live acceptance packet with latest evidence', async () => {
    const res = await request(app)
      .get('/api/admin/live-acceptance-gates')
      .set('x-admin-token', ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.contract).toBe('dcp.live_acceptance_gate_status.v1');
    expect(res.body.verdict).toBe('PASS');
    expect(res.body.mode).toBe('ci_safe_status_packet');
    expect(res.body.summary).toMatchObject({
      total: 8,
      blocked: 8,
      command_available: 8,
      capability_claim_allowed: 0,
      latest_evidence_found: 1,
    });
    expect(res.body.gates.find((gate) => gate.id === 'dcp_agent_reconciliation')).toMatchObject({
      acceptance_state: 'blocked_maintenance_window',
      capability_claim_allowed: false,
      latest_evidence: {
        found: true,
        verdict: 'BLOCKED',
        failure_code: 'DCP_AGENT_RECONCILIATION_MAINTENANCE_REQUIRED',
        blockers: expect.arrayContaining(['maintenance_window_required']),
      },
    });
    expect(fs.readdirSync(outputDir)).toEqual([]);
  });
});
