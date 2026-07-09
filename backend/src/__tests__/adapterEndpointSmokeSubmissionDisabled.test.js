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
  ADAPTER_ENDPOINT_SMOKE_SUBMISSION_DISABLED_VERSION,
  buildAdapterEndpointSmokeDisabledResponse,
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
    adapter_id: 'adpt_smokeroute',
    name: 'Endpoint Smoke Adapter',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    storage_key: 'adapters/r1/endpoint-smoke/adapter.safetensors',
    checksum_sha256: 'e'.repeat(64),
    rank: 16,
    metadata: { recipe: 'qlora-sft' },
    status: 'ready',
    ...overrides,
  };
}

function createRunningDeployment(db) {
  createAdapter(db, 1, adapterInput());
  createAdapterDeployment(db, 1, {
    deployment_id: 'adpl_smokeroute',
    adapter_id: 'adpt_smokeroute',
    endpoint_id: 'endpoint-smoke-prod',
  });
  return attachDeploymentLoadProof(db, 1, 'adpl_smokeroute', {
    loaded: true,
    deployment_id: 'adpl_smokeroute',
    adapter_id: 'adpt_smokeroute',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    mode: 'single_adapter_live_merge',
    endpoint_id: 'endpoint-smoke-prod',
    artifact_checksum_sha256: 'e'.repeat(64),
    provider_id: 'provider-smoke-1',
    loaded_at: '2026-07-09T08:30:00.000Z',
  });
}

function smokeResult(overrides = {}) {
  return {
    renter_id: 1,
    deployment_id: 'adpl_smokeroute',
    adapter_id: 'adpt_smokeroute',
    endpoint_id: 'endpoint-smoke-prod',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    artifact_checksum_sha256: 'e'.repeat(64),
    provider_id: 'provider-smoke-1',
    request_id: 'req-endpoint-smoke-1',
    status_code: 200,
    latency_ms: 940,
    response_checksum_sha256: 'f'.repeat(64),
    prompt_tokens: 30,
    completion_tokens: 10,
    total_tokens: 40,
    finish_reason: 'stop',
    adapter_trace: {
      routed_through_adapter: true,
      deployment_id: 'adpl_smokeroute',
      adapter_id: 'adpt_smokeroute',
      endpoint_id: 'endpoint-smoke-prod',
      artifact_checksum_sha256: 'e'.repeat(64),
    },
    ...overrides,
  };
}

describe('adapter endpoint smoke disabled submission contract', () => {
  test('builds a disabled response without exposing raw prompt or response fields', () => {
    const response = buildAdapterEndpointSmokeDisabledResponse({
      deployment: createRunningDeployment(makeDb()),
      funded_smoke_principal: true,
      smoke_result: {
        ...smokeResult(),
        raw_prompt: 'do not echo prompt',
        raw_response: 'do not echo response',
      },
    }, new Date('2026-07-09T08:30:00.000Z'));
    const serialized = JSON.stringify(response);

    expect(response).toMatchObject({
      object: 'adapter_endpoint_smoke_submission_disabled',
      version: ADAPTER_ENDPOINT_SMOKE_SUBMISSION_DISABLED_VERSION,
      generated_at: '2026-07-09T08:30:00.000Z',
      deployment_id: 'adpl_smokeroute',
      adapter_id: 'adpt_smokeroute',
      endpoint_id: 'endpoint-smoke-prod',
      endpoint_smoke_submission_live: false,
      endpoint_smoke_recording_enabled: false,
      recorded: false,
      would_record_if_enabled: true,
      denial_code: 'adapter_endpoint_smoke_disabled',
      claim_guards: {
        renter_auth_required: true,
        renter_owner_scope_enforced: true,
        disabled_submission_endpoint_live: true,
        records_smoke_result: false,
        routes_adapter_traffic: false,
        records_usage_event: false,
        enables_adapter_billing: false,
      },
    });
    expect(serialized).not.toContain('do not echo');
  });

  test('route is renter scoped and refuses to record complete smoke while disabled', async () => {
    const db = makeDb();
    const app = buildApp(db);
    createRunningDeployment(db);
    const before = getAdapterDeployment(db, 1, 'adpl_smokeroute');

    const res = await request(app)
      .post('/api/adapters/adpt_smokeroute/deployments/adpl_smokeroute/endpoint-smoke')
      .set('x-test-renter-id', '1')
      .send({
        funded_smoke_principal: true,
        smoke_result: smokeResult({
          raw_prompt: 'secret prompt body',
          raw_response: 'secret response body',
        }),
      });
    const after = getAdapterDeployment(db, 1, 'adpl_smokeroute');

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      object: 'adapter_endpoint_smoke_submission_disabled',
      version: ADAPTER_ENDPOINT_SMOKE_SUBMISSION_DISABLED_VERSION,
      deployment_id: 'adpl_smokeroute',
      endpoint_smoke_submission_live: false,
      endpoint_smoke_recording_enabled: false,
      recorded: false,
      would_record_if_enabled: true,
      denial_code: 'adapter_endpoint_smoke_disabled',
      evaluation: {
        would_pass_if_enabled: true,
        blockers: [],
      },
    });
    expect(JSON.stringify(res.body)).not.toContain('secret prompt body');
    expect(JSON.stringify(res.body)).not.toContain('secret response body');
    expect(after).toEqual(before);
  });

  test('route rejects malformed smoke payloads and preserves renter ownership', async () => {
    const db = makeDb();
    const app = buildApp(db);
    createRunningDeployment(db);

    const invalid = await request(app)
      .post('/api/adapters/adpt_smokeroute/deployments/adpl_smokeroute/endpoint-smoke')
      .set('x-test-renter-id', '1')
      .send({ funded_smoke_principal: true });
    const otherRenter = await request(app)
      .post('/api/adapters/adpt_smokeroute/deployments/adpl_smokeroute/endpoint-smoke')
      .set('x-test-renter-id', '2')
      .send({ funded_smoke_principal: true, smoke_result: smokeResult() });
    const unauthenticated = await request(app)
      .post('/api/adapters/adpt_smokeroute/deployments/adpl_smokeroute/endpoint-smoke')
      .set('x-test-renter-id', '0')
      .send({ funded_smoke_principal: true, smoke_result: smokeResult() });

    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('invalid_endpoint_smoke_result');
    expect(otherRenter.status).toBe(404);
    expect(unauthenticated.status).toBe(401);
  });

  test('route reports request blockers without recording partial smoke evidence', async () => {
    const db = makeDb();
    const app = buildApp(db);
    createRunningDeployment(db);

    const res = await request(app)
      .post('/api/adapters/adpt_smokeroute/deployments/adpl_smokeroute/endpoint-smoke')
      .set('x-test-renter-id', '1')
      .send({
        funded_smoke_principal: true,
        smoke_result: smokeResult({ endpoint_id: 'wrong-endpoint' }),
      });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      recorded: false,
      would_record_if_enabled: false,
      denial_code: 'adapter_endpoint_smoke_request_required',
      evaluation: {
        blockers: ['smoke_request_attribution'],
      },
      claim_guards: {
        records_smoke_result: false,
        records_usage_event: false,
        mutates_balance: false,
      },
    });
  });
});
