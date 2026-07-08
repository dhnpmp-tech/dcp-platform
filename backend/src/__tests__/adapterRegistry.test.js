'use strict';

const Database = require('better-sqlite3');
const express = require('express');
const request = require('supertest');
const {
  ensureAdapterRegistrySchema,
  createAdapter,
  getAdapter,
  listAdapters,
  updateAdapterStatus,
} = require('../services/adapterRegistry');
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
  return raw;
}

function adapterInput(overrides = {}) {
  return {
    adapter_id: `adpt_${Math.random().toString(36).slice(2, 12).padEnd(10, 'a')}`,
    name: 'Arabic Support Adapter',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    storage_key: 'adapters/r1/arabic-support/adapter.safetensors',
    checksum_sha256: 'a'.repeat(64),
    rank: 16,
    metadata: {
      recipe: 'qlora-sft',
      train_rows: 1200,
      source: 'workspace',
    },
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

describe('adapter registry schema and service', () => {
  test('schema creation is idempotent and includes deployment timestamps', () => {
    const db = makeDb();

    expect(() => ensureAdapterRegistrySchema(db)).not.toThrow();
    const columns = db.prepare('PRAGMA table_info(adapter_registry)').all().map((row) => row.name);

    expect(columns).toEqual(expect.arrayContaining([
      'adapter_id',
      'renter_id',
      'base_model',
      'storage_key',
      'checksum_sha256',
      'rank',
      'metadata_json',
      'status',
      'created_at',
      'updated_at',
      'deployed_at',
    ]));
  });

  test('registers, lists, and fetches adapter metadata for one renter', () => {
    const db = makeDb();
    const created = createAdapter(db, 1, adapterInput({ adapter_id: 'adpt_arabic01' }));

    expect(created).toMatchObject({
      adapter_id: 'adpt_arabic01',
      renter_id: 1,
      status: 'registered',
      base_model: 'meta-llama/Llama-3.1-8B-Instruct',
      storage_key: 'adapters/r1/arabic-support/adapter.safetensors',
      checksum_sha256: 'a'.repeat(64),
      rank: 16,
      deployed_at: null,
      metadata: {
        recipe: 'qlora-sft',
        train_rows: 1200,
        source: 'workspace',
      },
    });

    expect(getAdapter(db, 1, 'adpt_arabic01')).toMatchObject({ adapter_id: 'adpt_arabic01' });
    expect(listAdapters(db, 1).adapters.map((adapter) => adapter.adapter_id)).toEqual(['adpt_arabic01']);
  });

  test('keeps tenant boundaries when listing and reading adapters', () => {
    const db = makeDb();
    createAdapter(db, 1, adapterInput({ adapter_id: 'adpt_renter01', storage_key: 'adapters/r1/a.safetensors' }));
    createAdapter(db, 2, adapterInput({ adapter_id: 'adpt_renter02', storage_key: 'adapters/r2/a.safetensors' }));

    expect(listAdapters(db, 1).adapters.map((adapter) => adapter.adapter_id)).toEqual(['adpt_renter01']);
    expect(getAdapter(db, 1, 'adpt_renter02')).toBeNull();
  });

  test('rejects unsafe object keys and invalid checksums before insert', () => {
    const db = makeDb();

    expect(() => createAdapter(db, 1, adapterInput({
      adapter_id: 'adpt_badkey01',
      storage_key: '../adapter.safetensors',
    }))).toThrow(/storage_key/);

    expect(() => createAdapter(db, 1, adapterInput({
      adapter_id: 'adpt_badsha01',
      checksum_sha256: 'not-a-sha',
    }))).toThrow(/checksum_sha256/);

    expect(listAdapters(db, 1).adapters).toHaveLength(0);
  });

  test('returns a conflict for duplicate adapter ids', () => {
    const db = makeDb();
    createAdapter(db, 1, adapterInput({ adapter_id: 'adpt_dupe0001' }));

    expect(() => createAdapter(db, 1, adapterInput({ adapter_id: 'adpt_dupe0001' }))).toThrow(/already exists/);
  });

  test('deployment timestamp only appears after an explicit deployed status update', () => {
    const db = makeDb();
    createAdapter(db, 1, adapterInput({ adapter_id: 'adpt_status01' }));

    const ready = updateAdapterStatus(db, 1, 'adpt_status01', 'ready');
    expect(ready.status).toBe('ready');
    expect(ready.deployed_at).toBeNull();

    const deployed = updateAdapterStatus(db, 1, 'adpt_status01', 'deployed');
    expect(deployed.status).toBe('deployed');
    expect(deployed.deployed_at).toEqual(expect.any(String));
  });
});

describe('/api/adapters route', () => {
  test('creates and lists adapters for the authenticated renter only', async () => {
    const db = makeDb();
    const app = buildApp(db);
    createAdapter(db, 2, adapterInput({ adapter_id: 'adpt_hidden02', storage_key: 'adapters/r2/hidden.safetensors' }));

    const created = await request(app)
      .post('/api/adapters')
      .set('x-test-renter-id', '1')
      .send(adapterInput({ adapter_id: 'adpt_route001' }));

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      deployment_enabled: false,
      next: 'validate_adapter_or_create_lora_training_job',
      adapter: {
        adapter_id: 'adpt_route001',
        renter_id: 1,
        status: 'registered',
      },
    });

    const listed = await request(app).get('/api/adapters').set('x-test-renter-id', '1');
    expect(listed.status).toBe(200);
    expect(listed.body.object).toBe('list');
    expect(listed.body.data.map((adapter) => adapter.adapter_id)).toEqual(['adpt_route001']);

    const hidden = await request(app).get('/api/adapters/adpt_hidden02').set('x-test-renter-id', '1');
    expect(hidden.status).toBe(404);
  });

  test('does not allow deployment lifecycle states from the public register endpoint', async () => {
    const res = await request(buildApp(makeDb()))
      .post('/api/adapters')
      .send(adapterInput({ adapter_id: 'adpt_deploy01', status: 'deployed' }));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_initial_status');
  });

  test('has no deploy route in the registry foundation slice', async () => {
    const res = await request(buildApp(makeDb()))
      .post('/api/adapters/adpt_missing1/deploy')
      .send({});

    expect(res.status).toBe(404);
  });
});
