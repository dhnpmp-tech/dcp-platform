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
  attachAdapterDeploymentLoadProof,
  attachDeploymentLoadProof,
  listAllAdapterDeployments,
  listAdapterDeployments,
  getAdapterDeployment,
  updateDeploymentStatus,
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
    requireAdmin: (req, res, next) => {
      if (req.header('x-admin-token') !== 'admin-test-token') {
        return res.status(401).json({ error: 'Admin token required' });
      }
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

  test('lists all renter deployment records with adapter and status filters', () => {
    const db = makeDb();
    createAdapter(db, 1, adapterInput());
    createAdapter(db, 1, adapterInput({
      adapter_id: 'adpt_secondready',
      storage_key: 'adapters/r1/second/adapter.safetensors',
      checksum_sha256: 'd'.repeat(64),
    }));
    createAdapter(db, 2, adapterInput({
      adapter_id: 'adpt_otherready',
      storage_key: 'adapters/r2/other/adapter.safetensors',
      checksum_sha256: 'e'.repeat(64),
    }));
    createAdapterDeployment(db, 1, {
      deployment_id: 'adpl_ready001',
      adapter_id: 'adpt_deployready',
    });
    createAdapterDeployment(db, 1, {
      deployment_id: 'adpl_ready002',
      adapter_id: 'adpt_secondready',
    });
    createAdapterDeployment(db, 2, {
      deployment_id: 'adpl_hidden01',
      adapter_id: 'adpt_otherready',
    });

    expect(listAllAdapterDeployments(db, 1).deployments.map((row) => row.deployment_id)).toEqual([
      'adpl_ready002',
      'adpl_ready001',
    ]);
    expect(listAllAdapterDeployments(db, 1, { adapter_id: 'adpt_deployready' }).deployments.map((row) => row.deployment_id)).toEqual([
      'adpl_ready001',
    ]);
    expect(listAllAdapterDeployments(db, 1, { status: 'pending' }).deployments).toHaveLength(2);
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
      deployment_id: 'adpl_proof001',
      mode: 'single_adapter_live_merge',
      endpoint_id: 'arabic-support-prod',
      artifact_checksum_sha256: 'c'.repeat(64),
      loaded_at: '2026-07-08T06:30:00.000Z',
      provider_id: 'provider-1',
    });
    expect(mismatched).toMatchObject({
      status: 'degraded',
      route_traffic: false,
      failure_reason: 'serving_load_proof_mismatch',
    });

    const wrongChecksum = attachDeploymentLoadProof(db, 1, 'adpl_proof001', {
      loaded: true,
      adapter_id: 'adpt_deployready',
      base_model: 'meta-llama/Llama-3.1-8B-Instruct',
      deployment_id: 'adpl_proof001',
      mode: 'single_adapter_live_merge',
      endpoint_id: 'arabic-support-prod',
      artifact_checksum_sha256: 'f'.repeat(64),
      loaded_at: '2026-07-08T06:30:30.000Z',
      provider_id: 'provider-1',
    });
    expect(wrongChecksum).toMatchObject({
      status: 'degraded',
      route_traffic: false,
      failure_reason: 'serving_load_proof_mismatch',
    });

    const verified = attachDeploymentLoadProof(db, 1, 'adpl_proof001', {
      loaded: true,
      adapter_id: 'adpt_deployready',
      base_model: 'meta-llama/Llama-3.1-8B-Instruct',
      deployment_id: 'adpl_proof001',
      mode: 'single_adapter_live_merge',
      endpoint_id: 'arabic-support-prod',
      artifact_checksum_sha256: 'c'.repeat(64),
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
        deployment_id: 'adpl_proof001',
        mode: 'single_adapter_live_merge',
        endpoint_id: 'arabic-support-prod',
        artifact_checksum_sha256: 'c'.repeat(64),
        loaded_at: '2026-07-08T06:31:00.000Z',
        provider_id: 'provider-1',
      },
    });
    expect(verified.started_at).toEqual(expect.any(String));
  });

  test('adapter-scoped load proof wrapper refuses to mutate a different adapter deployment', () => {
    const db = makeDb();
    createAdapter(db, 1, adapterInput());
    createAdapterDeployment(db, 1, {
      deployment_id: 'adpl_scoped01',
      adapter_id: 'adpt_deployready',
    });

    expect(() => attachAdapterDeploymentLoadProof(db, 1, 'adpt_wrong0001', 'adpl_scoped01', {
      loaded: true,
      adapter_id: 'adpt_wrong0001',
      base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    })).toThrow(/not found/);

    expect(getAdapterDeployment(db, 1, 'adpl_scoped01')).toMatchObject({
      status: 'pending',
      route_traffic: false,
      serving_load_proof: null,
    });
  });

  test('renter stop clears route traffic and records stopped_at', () => {
    const db = makeDb();
    createAdapter(db, 1, adapterInput());
    createAdapterDeployment(db, 1, {
      deployment_id: 'adpl_stop001',
      adapter_id: 'adpt_deployready',
      endpoint_id: 'arabic-support-prod',
    });
    const running = attachDeploymentLoadProof(db, 1, 'adpl_stop001', {
      loaded: true,
      deployment_id: 'adpl_stop001',
      adapter_id: 'adpt_deployready',
      base_model: 'meta-llama/Llama-3.1-8B-Instruct',
      mode: 'single_adapter_live_merge',
      endpoint_id: 'arabic-support-prod',
      artifact_checksum_sha256: 'c'.repeat(64),
      loaded_at: '2026-07-08T08:31:00.000Z',
    });
    expect(running).toMatchObject({ status: 'running', route_traffic: true });

    const stopped = updateDeploymentStatus(db, 1, 'adpl_stop001', 'stopped');

    expect(stopped).toMatchObject({
      status: 'stopped',
      route_traffic: false,
      failure_reason: null,
      adapter_id: 'adpt_deployready',
    });
    expect(stopped.stopped_at).toEqual(expect.any(String));
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

    const allListed = await request(app)
      .get('/api/adapters/deployments')
      .set('x-test-renter-id', '1');
    expect(allListed.status).toBe(200);
    expect(allListed.body.object).toBe('list');
    expect(allListed.body.data.map((row) => row.deployment_id)).toEqual(['adpl_route001']);

    const filtered = await request(app)
      .get('/api/adapters/deployments?adapter_id=adpt_deployready')
      .set('x-test-renter-id', '1');
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.map((row) => row.deployment_id)).toEqual(['adpl_route001']);

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

  test('admin-only load proof route gates traffic on matching proof', async () => {
    const db = makeDb();
    const app = buildApp(db);
    createAdapter(db, 1, adapterInput());
    createAdapterDeployment(db, 1, {
      deployment_id: 'adpl_routeproof1',
      adapter_id: 'adpt_deployready',
      endpoint_id: 'arabic-support-prod',
    });

    const unauth = await request(app)
      .post('/api/adapters/adpt_deployready/deployments/adpl_routeproof1/load-proof')
      .send({
        renter_id: 1,
        serving_load_proof: {
          loaded: true,
          adapter_id: 'adpt_deployready',
          base_model: 'meta-llama/Llama-3.1-8B-Instruct',
        },
      });
    expect(unauth.status).toBe(401);

    const invalid = await request(app)
      .post('/api/adapters/adpt_deployready/deployments/adpl_routeproof1/load-proof')
      .set('x-admin-token', 'admin-test-token')
      .send({ renter_id: 1 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('invalid_load_proof');

    const mismatched = await request(app)
      .post('/api/adapters/adpt_deployready/deployments/adpl_routeproof1/load-proof')
      .set('x-admin-token', 'admin-test-token')
      .send({
        renter_id: 1,
        serving_load_proof: {
          loaded: true,
          deployment_id: 'adpl_routeproof1',
          adapter_id: 'adpt_other001',
          base_model: 'meta-llama/Llama-3.1-8B-Instruct',
          mode: 'single_adapter_live_merge',
          endpoint_id: 'arabic-support-prod',
          artifact_checksum_sha256: 'c'.repeat(64),
          loaded_at: '2026-07-08T08:30:00.000Z',
        },
      });
    expect(mismatched.status).toBe(200);
    expect(mismatched.body).toMatchObject({
      serving_enabled: false,
      next: 'retry_vllm_load_proof_before_routing',
      deployment: {
        status: 'degraded',
        route_traffic: false,
        failure_reason: 'serving_load_proof_mismatch',
      },
    });

    const verified = await request(app)
      .post('/api/adapters/adpt_deployready/deployments/adpl_routeproof1/load-proof')
      .set('x-admin-token', 'admin-test-token')
      .send({
        renter_id: 1,
        serving_load_proof: {
          loaded: true,
          deployment_id: 'adpl_routeproof1',
          adapter_id: 'adpt_deployready',
          base_model: 'meta-llama/Llama-3.1-8B-Instruct',
          mode: 'single_adapter_live_merge',
          endpoint_id: 'arabic-support-prod',
          artifact_checksum_sha256: 'c'.repeat(64),
          loaded_at: '2026-07-08T08:31:00.000Z',
        },
      });
    expect(verified.status).toBe(200);
    expect(verified.body).toMatchObject({
      serving_enabled: true,
      next: 'route_traffic_allowed_by_load_proof',
      deployment: {
        status: 'running',
        route_traffic: true,
        failure_reason: null,
        serving_load_proof: {
          loaded: true,
          deployment_id: 'adpl_routeproof1',
          adapter_id: 'adpt_deployready',
          base_model: 'meta-llama/Llama-3.1-8B-Instruct',
          mode: 'single_adapter_live_merge',
          endpoint_id: 'arabic-support-prod',
          artifact_checksum_sha256: 'c'.repeat(64),
        },
      },
    });
  });

  test('renter can stop their deployment intent without load-proof privileges', async () => {
    const db = makeDb();
    const app = buildApp(db);
    createAdapter(db, 1, adapterInput());
    createAdapter(db, 2, adapterInput({
      adapter_id: 'adpt_hiddenready',
      storage_key: 'adapters/r2/hidden/adapter.safetensors',
      checksum_sha256: 'e'.repeat(64),
    }));
    createAdapterDeployment(db, 1, {
      deployment_id: 'adpl_renterstop',
      adapter_id: 'adpt_deployready',
      endpoint_id: 'arabic-support-prod',
    });
    attachDeploymentLoadProof(db, 1, 'adpl_renterstop', {
      loaded: true,
      deployment_id: 'adpl_renterstop',
      adapter_id: 'adpt_deployready',
      base_model: 'meta-llama/Llama-3.1-8B-Instruct',
      mode: 'single_adapter_live_merge',
      endpoint_id: 'arabic-support-prod',
      artifact_checksum_sha256: 'c'.repeat(64),
      loaded_at: '2026-07-08T08:31:00.000Z',
    });
    createAdapterDeployment(db, 2, {
      deployment_id: 'adpl_hiddenstop',
      adapter_id: 'adpt_hiddenready',
    });

    const stopped = await request(app)
      .post('/api/adapters/adpt_deployready/deployments/adpl_renterstop/stop')
      .set('x-test-renter-id', '1');

    expect(stopped.status).toBe(200);
    expect(stopped.body).toMatchObject({
      serving_enabled: false,
      next: 'deployment_stopped_by_renter',
      deployment: {
        deployment_id: 'adpl_renterstop',
        adapter_id: 'adpt_deployready',
        status: 'stopped',
        route_traffic: false,
        failure_reason: null,
      },
    });
    expect(stopped.body.deployment.stopped_at).toEqual(expect.any(String));

    const hidden = await request(app)
      .post('/api/adapters/adpt_hiddenready/deployments/adpl_hiddenstop/stop')
      .set('x-test-renter-id', '1');
    expect(hidden.status).toBe(404);
    expect(hidden.body.code).toBe('deployment_not_found');
  });
});
