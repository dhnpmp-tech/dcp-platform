'use strict';

const Database = require('better-sqlite3');
const express = require('express');
const request = require('supertest');
const {
  ensureAdapterRegistrySchema,
  createAdapter,
} = require('../services/adapterRegistry');
const {
  attachDeploymentLoadProof,
  createAdapterDeployment,
  ensureAdapterDeploymentSchema,
  getAdapterDeployment,
} = require('../services/adapterDeploymentLifecycle');
const {
  ADAPTER_ENDPOINT_SMOKE_STATUS_DISABLED_VERSION,
  buildAdapterEndpointSmokeStatusDisabledResponse,
} = require('../services/adapterEndpointSmokeReadiness');
const { createAdaptersRouter } = require('../routes/adapters');

function makeDb() {
  const raw = new Database(':memory:');
  raw.exec(`
    CREATE TABLE renters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      api_key TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT
    )
  `);
  raw.prepare(`
    INSERT INTO renters (id, name, email, api_key, status, created_at)
    VALUES (1, 'Renter One', 'one@example.com', 'rk-one', 'active', ?),
           (2, 'Renter Two', 'two@example.com', 'rk-two', 'active', ?)
  `).run(new Date().toISOString(), new Date().toISOString());
  ensureAdapterRegistrySchema(raw);
  ensureAdapterDeploymentSchema(raw);
  return raw;
}

function buildApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/adapters', createAdaptersRouter({
    db,
    requireRenter: (req, res, next) => {
      const renterId = Number(req.header('x-test-renter-id') || 1);
      if (renterId === 0) return res.status(401).json({ error: 'Renter API key required' });
      req.renter = { id: renterId };
      return next();
    },
  }));
  return app;
}

function adapterInput(overrides = {}) {
  return {
    adapter_id: 'adpt_smokestatus',
    name: 'Endpoint Smoke Status Adapter',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    storage_key: 'adapters/r1/endpoint-smoke-status/adapter.safetensors',
    checksum_sha256: 'a'.repeat(64),
    rank: 16,
    metadata: { recipe: 'qlora-sft' },
    status: 'ready',
    ...overrides,
  };
}

function createPendingDeployment(db) {
  createAdapter(db, 1, adapterInput());
  return createAdapterDeployment(db, 1, {
    deployment_id: 'adpl_smokestatus',
    adapter_id: 'adpt_smokestatus',
    endpoint_id: 'endpoint-smoke-status-prod',
  });
}

function createRunningDeployment(db) {
  createPendingDeployment(db);
  return attachDeploymentLoadProof(db, 1, 'adpl_smokestatus', {
    loaded: true,
    deployment_id: 'adpl_smokestatus',
    adapter_id: 'adpt_smokestatus',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    mode: 'single_adapter_live_merge',
    endpoint_id: 'endpoint-smoke-status-prod',
    artifact_checksum_sha256: 'a'.repeat(64),
    provider_id: 'provider-smoke-status-1',
    loaded_at: '2026-07-09T08:45:00.000Z',
  });
}

describe('adapter endpoint smoke disabled status contract', () => {
  test('builds a no-record status response for a strict load-proof deployment', () => {
    const response = buildAdapterEndpointSmokeStatusDisabledResponse({
      deployment: createRunningDeployment(makeDb()),
    }, new Date('2026-07-09T08:45:00.000Z'));

    expect(response).toMatchObject({
      object: 'adapter_endpoint_smoke_status_disabled',
      version: ADAPTER_ENDPOINT_SMOKE_STATUS_DISABLED_VERSION,
      generated_at: '2026-07-09T08:45:00.000Z',
      deployment_id: 'adpl_smokestatus',
      adapter_id: 'adpt_smokestatus',
      endpoint_id: 'endpoint-smoke-status-prod',
      endpoint_smoke_status_endpoint_live: true,
      endpoint_smoke_recording_enabled: false,
      endpoint_smoke_recorded: false,
      latest_smoke_result: null,
      smoke_history: [],
      denial_code: 'adapter_endpoint_smoke_status_unrecorded',
      readiness: {
        strict_load_proof_match: true,
        recording_can_start: false,
      },
      claim_guards: {
        renter_auth_required: true,
        renter_owner_scope_enforced: true,
        disabled_status_endpoint_live: true,
        returns_recorded_smoke: false,
        records_smoke_result: false,
        routes_adapter_traffic: false,
        records_usage_event: false,
        enables_adapter_billing: false,
      },
    });
    expect(response.readiness.missing_before_recording).not.toContain('strict_load_proof_match');
  });

  test('route is owner scoped and returns read-only no-record status', async () => {
    const db = makeDb();
    const app = buildApp(db);
    createRunningDeployment(db);
    const before = getAdapterDeployment(db, 1, 'adpl_smokestatus');

    const res = await request(app)
      .get('/api/adapters/adpt_smokestatus/deployments/adpl_smokestatus/endpoint-smoke')
      .set('x-test-renter-id', '1');
    const after = getAdapterDeployment(db, 1, 'adpl_smokestatus');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      object: 'adapter_endpoint_smoke_status_disabled',
      version: ADAPTER_ENDPOINT_SMOKE_STATUS_DISABLED_VERSION,
      deployment_id: 'adpl_smokestatus',
      endpoint_smoke_status_endpoint_live: true,
      endpoint_smoke_recording_enabled: false,
      endpoint_smoke_recorded: false,
      latest_smoke_result: null,
      readiness: {
        strict_load_proof_match: true,
      },
    });
    expect(after).toEqual(before);
  });

  test('status route reports missing load proof while preserving ownership checks', async () => {
    const db = makeDb();
    const app = buildApp(db);
    createPendingDeployment(db);

    const pending = await request(app)
      .get('/api/adapters/adpt_smokestatus/deployments/adpl_smokestatus/endpoint-smoke')
      .set('x-test-renter-id', '1');
    const otherRenter = await request(app)
      .get('/api/adapters/adpt_smokestatus/deployments/adpl_smokestatus/endpoint-smoke')
      .set('x-test-renter-id', '2');
    const unauthenticated = await request(app)
      .get('/api/adapters/adpt_smokestatus/deployments/adpl_smokestatus/endpoint-smoke')
      .set('x-test-renter-id', '0');

    expect(pending.status).toBe(200);
    expect(pending.body).toMatchObject({
      endpoint_smoke_recording_enabled: false,
      endpoint_smoke_recorded: false,
      readiness: {
        strict_load_proof_match: false,
        missing_before_recording: expect.arrayContaining(['strict_load_proof_match']),
      },
      claim_guards: {
        records_smoke_result: false,
        records_usage_event: false,
        mutates_balance: false,
      },
    });
    expect(otherRenter.status).toBe(404);
    expect(unauthenticated.status).toBe(401);
  });
});
