/**
 * Integration tests for /api/templates routes.
 * Covers: GET /api/templates, GET /api/templates/:id, POST /api/templates/:id/deploy
 */

const Database = require('better-sqlite3');
const express = require('express');
const request = require('supertest');
const fs = require('fs');
const os = require('os');
const path = require('path');

let app;
let manifestPath;

// ── DB mock shared across test and module ────────────────────────────────────
// flatParams is defined inside the factory via hoisting (function declaration after return)
jest.mock('../db', () => {
  return {
    get run() { return (sql, ...params) => global.__testDb.prepare(sql).run(...flatParams(params)); },
    get get() { return (sql, ...params) => global.__testDb.prepare(sql).get(...flatParams(params)); },
    get all() { return (sql, ...params) => global.__testDb.prepare(sql).all(...flatParams(params)); },
    get prepare() { return (sql) => global.__testDb.prepare(sql); },
    get _db() { return global.__testDb; },
    close: () => {},
  };

  // eslint-disable-next-line no-unreachable
  function flatParams(params) {
    if (params.length === 1 && Array.isArray(params[0])) return params[0];
    return params.reduce((acc, p) => (Array.isArray(p) ? acc.concat(p) : acc.concat([p])), []);
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function buildDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS renters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      api_key TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'active',
      balance_halala INTEGER DEFAULT 0,
      total_jobs INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'active',
      api_key TEXT,
      gpu_model TEXT,
      vram_gb INTEGER,
      gpu_vram_mib INTEGER,
      last_heartbeat DATETIME
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL UNIQUE,
      provider_id INTEGER,
      renter_id INTEGER NOT NULL,
      job_type TEXT NOT NULL,
      model TEXT,
      status TEXT DEFAULT 'pending',
      submitted_at DATETIME,
      duration_minutes REAL,
      cost_halala INTEGER,
      gpu_requirements TEXT,
      container_spec TEXT,
      task_spec TEXT,
      task_spec_hmac TEXT,
      max_duration_seconds INTEGER,
      timeout_at DATETIME,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      priority INTEGER DEFAULT 2,
      pricing_class TEXT DEFAULT 'standard',
      prewarm_requested INTEGER DEFAULT 0,
      workspace_volume_name TEXT,
      checkpoint_enabled INTEGER DEFAULT 0,
      template_id TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS quota_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      renter_id INTEGER,
      job_id TEXT,
      check_type TEXT,
      allowed INTEGER,
      limit_value REAL,
      current_value REAL,
      requested_value REAL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return db;
}

function insertRenter(db, { apiKey = 'test-renter-key', balanceHalala = 100000 } = {}) {
  db.prepare(
    `INSERT INTO renters (email, api_key, status, balance_halala) VALUES (?, ?, 'active', ?)`
  ).run(`renter-${Date.now()}@test.com`, apiKey, balanceHalala);
}

function insertProvider(db, { vramGb = 24, heartbeatOffsetMs = -60 * 1000 } = {}) {
  const lastHeartbeat = new Date(Date.now() + heartbeatOffsetMs).toISOString();
  db.prepare(
    `INSERT INTO providers (name, email, status, gpu_model, vram_gb, gpu_vram_mib, last_heartbeat)
     VALUES (?, ?, 'active', ?, ?, ?, ?)`
  ).run('TestProvider', `provider-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`, 'RTX 4090', vramGb, vramGb * 1024, lastHeartbeat);
}

function insertActiveJobForProvider(db, { providerId, renterId = 1, status = 'running' } = {}) {
  db.prepare(
    `INSERT INTO jobs (job_id, provider_id, renter_id, job_type, model, status, submitted_at, duration_minutes, cost_halala, created_at)
     VALUES (?, ?, ?, 'llm-inference', 'meta-llama/Meta-Llama-3-8B-Instruct', ?, ?, 60, 100, ?)`
  ).run(`job-active-${Date.now()}-${Math.random().toString(36).slice(2)}`, providerId, renterId, status, new Date().toISOString(), new Date().toISOString());
}

// ── Setup / teardown ─────────────────────────────────────────────────────────
beforeEach(() => {
  global.__testDb = buildDb();
  manifestPath = path.join(os.tmpdir(), `instant-tier-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify({
    images: [
      {
        name: 'instant-allam-7b-instruct',
        templates: ['allam-7b-instruct'],
        published_refs: {
          mutable: 'docker.io/dc1/instant-allam-7b-instruct:latest',
          immutable: 'docker.io/dc1/instant-allam-7b-instruct:sha-test',
          canonical: 'docker.io/dc1/instant-allam-7b-instruct@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      },
      {
        name: 'instant-falcon-h1-arabic-7b',
        templates: ['falcon-h1-arabic-7b'],
        published_refs: {
          mutable: 'docker.io/dc1/instant-falcon-h1-arabic-7b:latest',
          immutable: 'docker.io/dc1/instant-falcon-h1-arabic-7b:sha-test',
          canonical: 'docker.io/dc1/instant-falcon-h1-arabic-7b@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        },
      },
      {
        name: 'instant-jais-13b-chat',
        templates: ['jais-13b-chat'],
        published_refs: {
          mutable: 'docker.io/dc1/instant-jais-13b-chat:latest',
          immutable: 'docker.io/dc1/instant-jais-13b-chat:sha-test',
          canonical: 'docker.io/dc1/instant-jais-13b-chat@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        },
      },
    ],
  }), 'utf8');
  process.env.DISABLE_RATE_LIMIT = '1';
  process.env.INSTANT_TIER_MANIFEST_PATH = manifestPath;

  const routerPath = require.resolve('../routes/templates');
  delete require.cache[routerPath];

  const authPath = require.resolve('../middleware/auth');
  delete require.cache[authPath];

  const templatesRouter = require('../routes/templates');
  app = express();
  app.use(express.json());
  app.use('/api/templates', templatesRouter);
});

afterEach(() => {
  delete process.env.DISABLE_RATE_LIMIT;
  delete process.env.INSTANT_TIER_MANIFEST_PATH;
  delete process.env.DCP_TEMPLATES_DIR;
  if (manifestPath && fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
  try { global.__testDb.close(); } catch {}
});

describe('GET /api/templates', () => {
  it('returns templates array with count', async () => {
    const res = await request(app).get('/api/templates');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.templates)).toBe(true);
    expect(typeof res.body.count).toBe('number');
    expect(res.body.count).toBe(res.body.templates.length);
  });

  it('returns at least 1 template (docker-templates/ exists in repo)', async () => {
    const res = await request(app).get('/api/templates');
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThan(0);
  });

  it('all returned templates have pricing info', async () => {
    const res = await request(app).get('/api/templates');
    expect(res.status).toBe(200);
    for (const t of res.body.templates) {
      expect(typeof t.estimated_price_sar_per_hour).toBe('number');
      expect(t.estimated_price_sar_per_hour).toBeGreaterThan(0);
    }
  });

  it('strips approved_images from list response', async () => {
    const res = await request(app).get('/api/templates');
    expect(res.status).toBe(200);
    for (const t of res.body.templates) {
      expect(t.approved_images).toBeUndefined();
    }
  });

  it('filters by category=llm', async () => {
    const res = await request(app).get('/api/templates?category=llm');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.templates)).toBe(true);
    for (const t of res.body.templates) {
      const tags = t.tags || [];
      const llmTags = ['llm', 'inference', 'chat', 'instruct', 'arabic'];
      expect(tags.some(tag => llmTags.includes(tag))).toBe(true);
    }
  });

  it('filters by tag', async () => {
    const res = await request(app).get('/api/templates?tag=arabic');
    expect(res.status).toBe(200);
    for (const t of res.body.templates) {
      expect(t.tags).toContain('arabic');
    }
  });

  it('includes instant-tier manifest refs in whitelist response', async () => {
    const res = await request(app).get('/api/templates/whitelist');
    expect(res.status).toBe(200);
    expect(res.body.approved_images).toContain('docker.io/dc1/instant-allam-7b-instruct@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(res.body.approved_images).toContain('docker.io/dc1/instant-falcon-h1-arabic-7b@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    expect(res.body.approved_images).toContain('docker.io/dc1/instant-jais-13b-chat@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc');
  });
});

describe('GET /api/templates/catalog', () => {
  it('returns the pod-launch product templates required by the renter console', async () => {
    const res = await request(app).get('/api/templates/catalog');
    expect(res.status).toBe(200);
    expect(res.body.contract).toBe('dcp.template_catalog.v1');
    expect(res.body.version).toBe('2026-04-02');
    expect(Array.isArray(res.body.templates)).toBe(true);
    expect(res.body.count).toBe(res.body.templates.length);

    const byId = new Map(res.body.templates.map((template) => [template.id, template]));
    const requiredIds = [
      'pytorch-single-gpu',
      'lora-finetune',
      'qlora-finetune',
      'vllm-serve',
      'arabic-embeddings',
      'arabic-reranker',
      'whisper-large-v3',
    ];

    for (const id of requiredIds) {
      const template = byId.get(id);
      expect(template).toBeTruthy();
      expect(typeof template.model_name).toBe('string');
      expect(template.model_name.length).toBeGreaterThan(0);
      expect(template.min_vram_gb).toBeGreaterThan(0);
      expect(template.deploy_defaults).toEqual(expect.objectContaining({
        duration_minutes: expect.any(Number),
        pricing_class: expect.any(String),
        job_type: expect.any(String),
      }));
      expect(template.deploy_defaults.duration_minutes).toBeGreaterThan(0);
    }
  });

  it('exposes workflow contracts for LoRA dry-runs and pod-local vLLM serving', async () => {
    const res = await request(app).get('/api/templates/catalog');
    expect(res.status).toBe(200);

    const byId = new Map(res.body.templates.map((template) => [template.id, template]));
    for (const id of ['lora-finetune', 'qlora-finetune']) {
      const template = byId.get(id);
      expect(template.workflow_contract).toEqual(expect.objectContaining({
        version: 'dcp.template_workflow.v1',
        mode: id === 'qlora-finetune' ? 'qlora_dry_run' : 'lora_dry_run',
        workspace_mount: '/workspace',
        dataset: expect.objectContaining({
          required: true,
          env_var: 'DATASET_PATH',
          default_path: '/workspace/datasets/train.jsonl',
          validation_endpoint: 'POST /api/lora/datasets/validate',
          raw_rows_stored: false,
        }),
        adapter_artifact: expect.objectContaining({
          checksum_required: true,
        }),
        claim_guards: expect.objectContaining({
          catalog_launches_pod: false,
          catalog_mutates_balance: false,
          managed_training_enabled: false,
          public_endpoint_route_enabled: false,
          adapter_billing_enabled: false,
          exposes_provider_or_vendor: false,
          requires_gpu_host_proof: true,
        }),
      }));
      expect(template.workflow_contract.adapter_artifact.output_dir).toMatch(/^\/workspace\/adapters\//);
      expect(template.workflow_contract.adapter_artifact.required_files).toEqual(
        expect.arrayContaining(['adapter.safetensors', 'model-card.json']),
      );
    }

    const vllm = byId.get('vllm-serve');
    expect(vllm.workflow_contract).toEqual(expect.objectContaining({
      version: 'dcp.template_workflow.v1',
      mode: 'pod_local_openai_compatible',
      workspace_mount: '/workspace',
      endpoint: expect.objectContaining({
        scope: 'pod_local',
        openai_base_url: expect.stringMatching(/\/v1$/),
        public_route_enabled: false,
        adapter_load_proof_required: true,
      }),
      claim_guards: expect.objectContaining({
        catalog_launches_pod: false,
        catalog_mutates_balance: false,
        managed_training_enabled: false,
        public_endpoint_route_enabled: false,
        adapter_billing_enabled: false,
        exposes_provider_or_vendor: false,
        requires_gpu_host_proof: true,
      }),
    }));
  });

  it('fails closed when the configured template directory is missing', async () => {
    process.env.DCP_TEMPLATES_DIR = path.join(os.tmpdir(), `dcp-missing-templates-${Date.now()}`);
    const res = await request(app).get('/api/templates/catalog');
    expect(res.status).toBe(500);
    expect(res.body.contract).toBe('dcp.template_catalog.v1');
    expect(res.body.error).toMatch(/validation failed/i);
    expect(res.body.details.join('\n')).toMatch(/Template directory not found/i);
  });
});

describe('GET /api/templates/:id', () => {
  it('returns a known template by id', async () => {
    const res = await request(app).get('/api/templates/llama3-8b');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('llama3-8b');
    expect(res.body.min_vram_gb).toBeGreaterThan(0);
    expect(res.body.estimated_price_sar_per_hour).toBeGreaterThan(0);
  });

  it('returns 404 for unknown template', async () => {
    const res = await request(app).get('/api/templates/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns falcon-h1-arabic-7b by id', async () => {
    const res = await request(app).get('/api/templates/falcon-h1-arabic-7b');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('falcon-h1-arabic-7b');
    expect(res.body.params?.model).toBe('tiiuae/Falcon-H1-7B-Instruct');
  });
});

describe('POST /api/templates/:id/deploy', () => {
  const RENTER_KEY = 'renter-api-key-test';

  it('returns 401 when no renter key is provided', async () => {
    const res = await request(app).post('/api/templates/llama3-8b/deploy').send({ duration_minutes: 60 });
    expect(res.status).toBe(401);
  });

  it('returns 403 for an invalid renter key', async () => {
    const res = await request(app)
      .post('/api/templates/llama3-8b/deploy')
      .set('x-renter-key', 'bad-key')
      .send({ duration_minutes: 60 });
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown template', async () => {
    insertRenter(global.__testDb, { apiKey: RENTER_KEY, balanceHalala: 100000 });
    const res = await request(app)
      .post('/api/templates/ghost-template/deploy')
      .set('x-renter-key', RENTER_KEY)
      .send({ duration_minutes: 60 });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('uses manifest canonical image ref for ALLaM instant-tier template deploys', async () => {
    insertRenter(global.__testDb, { apiKey: RENTER_KEY, balanceHalala: 100000 });
    insertProvider(global.__testDb, { vramGb: 24 });

    const res = await request(app)
      .post('/api/templates/allam-7b-instruct/deploy')
      .set('x-renter-key', RENTER_KEY)
      .send({ duration_minutes: 30 });

    expect(res.status).toBe(201);
    const job = global.__testDb.prepare(`SELECT container_spec FROM jobs WHERE job_id = ?`).get(res.body.jobId);
    const parsedSpec = JSON.parse(job.container_spec);
    expect(parsedSpec.image_override).toBe('docker.io/dc1/instant-allam-7b-instruct@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('uses manifest canonical image ref for Falcon instant-tier template deploys', async () => {
    insertRenter(global.__testDb, { apiKey: RENTER_KEY, balanceHalala: 100000 });
    insertProvider(global.__testDb, { vramGb: 24 });

    const res = await request(app)
      .post('/api/templates/falcon-h1-arabic-7b/deploy')
      .set('x-renter-key', RENTER_KEY)
      .send({ duration_minutes: 30 });

    expect(res.status).toBe(201);
    const job = global.__testDb.prepare(`SELECT container_spec FROM jobs WHERE job_id = ?`).get(res.body.jobId);
    const parsedSpec = JSON.parse(job.container_spec);
    expect(parsedSpec.image_override).toBe('docker.io/dc1/instant-falcon-h1-arabic-7b@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  });

  it('uses manifest canonical image ref for JAIS instant-tier template deploys', async () => {
    insertRenter(global.__testDb, { apiKey: RENTER_KEY, balanceHalala: 100000 });
    insertProvider(global.__testDb, { vramGb: 32 });

    const res = await request(app)
      .post('/api/templates/jais-13b-chat/deploy')
      .set('x-renter-key', RENTER_KEY)
      .send({ duration_minutes: 30 });

    expect(res.status).toBe(201);
    const job = global.__testDb.prepare(`SELECT container_spec FROM jobs WHERE job_id = ?`).get(res.body.jobId);
    const parsedSpec = JSON.parse(job.container_spec);
    expect(parsedSpec.image_override).toBe('docker.io/dc1/instant-jais-13b-chat@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc');
  });
});
