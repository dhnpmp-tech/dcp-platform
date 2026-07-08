'use strict';

const Database = require('better-sqlite3');
const express = require('express');
const request = require('supertest');
const {
  ensureAdapterRegistrySchema,
  createAdapter,
} = require('../services/adapterRegistry');
const {
  ensureAdapterDeploymentSchema,
  createAdapterDeployment,
  attachDeploymentLoadProof,
  listAdapterDeployments,
  getAdapterDeployment,
} = require('../services/adapterDeploymentLifecycle');
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

function adapterInput(overrides = {}) {
  return {
    adapter_id: 'adpt_deployready',
    name: 'Arabic Support Adapter',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    storage_key: 'adapters/r1/arabic-support/adapter.safetensors',
    checksum_sha256: 'c'.repeat(64),
    rank: 16,
    metadata: {
      recipe: 'qlora-sft',
      train_rows: 1200,
    },
    status: 'ready',
    ...overrides,
  };
}

function buildApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/adapters', createAdaptersRouter({
    db,
    requireRenter: (req, _res, next) => {
      req.renter = { id: Number(req.header('x-test-renter-id') || 1) };
      next();
    },
  }));
  return app;
}

describe('adapter deployment lifecycle service', () => {
  test('schema creation is idempotent and records lifecycle columns', () => {
    const db = makeDb();

    expect(() => ensureAdapterDeploymentSchema(db)).not.toThrow();
    const columns = db.prepare('PRAGMA table_info(adapter_deployments)').all().map((row) => row.name);

    expect(columns).toEqual(expect.arrayContaining([
      'deployment_id',
      'renter_id',
      'adapter_id',
      'base_model',
      'mode',
      'endpoint_id',
      'status',
      'route_traffic',
      'serving_load_proof_json',
      'failure_reason',
      'created_at',
      'updated_at',
      'started_at',
      'stopped_at',
    ]));
  });

  test('creates pending deployment records for ready adapters without routing traffic', () => {
    const db = makeDb();
    createAdapter(db, 1, adapterInput());

    const deployment = createAdapterDeployment(db, 1, {
      deployment_id: 'adpl_ready001',
      adapter_id: 'adpt_deployready',
      endpoint_id: 'arabic-support-prod',
      serving_load_proof: {
        loaded: true,
        adapter_id: 'adpt_deployready',
        base_model: 'meta-llama/Llama-3.1-8B-Instruct',
      },
    });

    expect(deployment).toMatchObject({
      deployment_id: 'adpl_ready001',
      renter_id: 1,
      adapter_id: 'adpt_deployready',
      status: 'pending',
      route_traffic: false,
      serving_load_proof: null,
      failure_reason: null,
    });
    expect(listAdapterDeployments(db, 1, 'adpt_deployready').deployments.map((row) => row.deployment_id)).toEqual(['adpl_ready001']);
  });

  test('requires adapter ownership and ready status before deployment request', () => {
    const db = makeDb();
    createAdapter(db, 1, adapterInput({ adapter_id: 'adpt_registered', status: 'registered' }));
    createAdapter(db, 2, adapterInput({
      adapter_id: 'adpt_otheruser',
      storage_key: 'adapters/r2/other/adapter.safetensors',
    }));

    expect(() => createAdapterDeployment(db, 1, {
      adapter_id: 'adpt_registered',
    })).toThrow(/must be ready/);

    expect(() => createAdapterDeployment(db, 1, {
      adapter_id: 'adpt_otheruser',
    })).toThrow(/not found/);
  });

  test('matching load proof is the only path to running route traffic', () => {
    const db = makeDb();
    createAdapter(db, 1, adapterInput());
    createAdapter(db, 1, adapterInput({
      adapter_id: 'adpt_secondready',
      storage_key: 'adapters/r1/second/adapter.safetensors',
      checksum_sha256: 'd'.repeat(64),
    }));
    createAdapterDeployment(db, 1, {
      deployment_id: 'adpl_proof001',
      adapter_id: 'adpt_deployready',
      endpoint_id: 'arabic-support-prod',
    });

    const mismatched = attachDeploymentLoadProof(db, 1, 'adpl_proof001', {
      loaded: true,
      adapter_id: 'adpt_secondready',
      base_model: 'meta-llama/Llama-3.1-8B-Instruct',
      loaded_at: '2026-07-08T06:30:00.000Z',
      provider_id: 'provider-1',
    });
    expect(mismatched).toMatchObject({
      status: 'degraded',
      route_traffic: false,
      failure_reason: 'serving_load_proof_mismatch',
    });

    const verified = attachDeploymentLoadProof(db, 1, 'adpl_proof001', {
      loaded: true,
      adapter_id: 'adpt_deployready',
      base_model: 'meta-llama/Llama-3.1-8B-Instruct',
      loaded_at: '2026-07-08T06:31:00.000Z',
      provider_id: 'provider-1',
    });
    expect(verified).toMatchObject({
      status: 'running',
      route_traffic: true,
      failure_reason: null,
      serving_load_proof: {
        loaded: true,
        adapter_id: 'adpt_deployready',
        base_model: 'meta-llama/Llama-3.1-8B-Instruct',
        loaded_at: '2026-07-08T06:31:00.000Z',
        provider_id: 'provider-1',
      },
    });
    expect(verified.started_at).toEqual(expect.any(String));
  });
});

describe('/api/adapters/:adapterId/deployments route', () => {
  test('creates, lists, and reads pending deployments for the authenticated renter', async () => {
    const db = makeDb();
    const app = buildApp(db);
    createAdapter(db, 1, adapterInput());
    createAdapter(db, 2, adapterInput({
      adapter_id: 'adpt_hiddenready',
      storage_key: 'adapters/r2/hidden/adapter.safetensors',
    }));

    const created = await request(app)
      .post('/api/adapters/adpt_deployready/deployments')
      .set('x-test-renter-id', '1')
      .send({
        deployment_id: 'adpl_route001',
        endpoint_id: 'arabic-support-prod',
        serving_load_proof: {
          loaded: true,
          adapter_id: 'adpt_deployready',
          base_model: 'meta-llama/Llama-3.1-8B-Instruct',
        },
      });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      serving_enabled: false,
      next: 'attach_serving_load_proof_internal',
      deployment: {
        deployment_id: 'adpl_route001',
        adapter_id: 'adpt_deployready',
        status: 'pending',
        route_traffic: false,
        serving_load_proof: null,
      },
    });

    const listed = await request(app)
      .get('/api/adapters/adpt_deployready/deployments')
      .set('x-test-renter-id', '1');
    expect(listed.status).toBe(200);
    expect(listed.body.object).toBe('list');
    expect(listed.body.data.map((row) => row.deployment_id)).toEqual(['adpl_route001']);

    const read = await request(app)
      .get('/api/adapters/adpt_deployready/deployments/adpl_route001')
      .set('x-test-renter-id', '1');
    expect(read.status).toBe(200);
    expect(read.body.deployment.deployment_id).toBe('adpl_route001');

    const hidden = await request(app)
      .post('/api/adapters/adpt_hiddenready/deployments')
      .set('x-test-renter-id', '1')
      .send({ deployment_id: 'adpl_hidden01' });
    expect(hidden.status).toBe(404);
  });

  test('returns a stable conflict when adapter is not ready', async () => {
    const db = makeDb();
    createAdapter(db, 1, adapterInput({ adapter_id: 'adpt_notready1', status: 'registered' }));

    const res = await request(buildApp(db))
      .post('/api/adapters/adpt_notready1/deployments')
      .set('x-test-renter-id', '1')
      .send({ deployment_id: 'adpl_notready1' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('adapter_not_ready');
  });
});
