'use strict';

process.env.NODE_ENV = 'test';

const Database = require('better-sqlite3');
const express = require('express');
const request = require('supertest');

jest.mock('../db', () => {
  function flat(params) {
    if (params.length === 1 && Array.isArray(params[0])) return params[0];
    return params.reduce((acc, value) => (Array.isArray(value) ? acc.concat(value) : acc.concat([value])), []);
  }
  return {
    get run() { return (sql, ...params) => global.__testDb.prepare(sql).run(...flat(params)); },
    get get() { return (sql, ...params) => global.__testDb.prepare(sql).get(...flat(params)); },
    get all() { return (sql, ...params) => global.__testDb.prepare(sql).all(...flat(params)); },
    get prepare() { return (sql) => global.__testDb.prepare(sql); },
    get _db() { return global.__testDb; },
    close: () => {},
  };
});

jest.mock('../services/emailService', () => ({
  sendDataExportReady: jest.fn(),
}));

jest.mock('../routes/jobs', () => ({
  COST_RATES: {},
}));

const rentersRouter = require('../routes/renters');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/renters', rentersRouter);
  return app;
}

function buildDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE renters (
      id INTEGER PRIMARY KEY,
      name TEXT,
      email TEXT,
      api_key TEXT UNIQUE,
      organization TEXT,
      status TEXT DEFAULT 'active',
      balance_halala INTEGER DEFAULT 0,
      trial_grant_halala INTEGER DEFAULT 0,
      total_spent_halala INTEGER DEFAULT 0,
      total_jobs INTEGER DEFAULT 0,
      monthly_spend_cap_halala INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE renter_api_keys (
      id TEXT PRIMARY KEY,
      renter_id INTEGER NOT NULL,
      key TEXT NOT NULL UNIQUE,
      label TEXT,
      scopes TEXT NOT NULL DEFAULT '["inference"]',
      org_id TEXT,
      org_role TEXT NOT NULL DEFAULT 'member',
      monthly_spend_cap_halala INTEGER DEFAULT 0,
      expires_at TEXT,
      revoked_at TEXT,
      last_used_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE openrouter_usage_ledger (
      id TEXT PRIMARY KEY,
      request_id TEXT,
      provider_response_id TEXT,
      job_id TEXT,
      request_path TEXT,
      renter_api_key_id TEXT,
      renter_key_type TEXT,
      renter_id INTEGER NOT NULL,
      provider_id INTEGER,
      model TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'v1',
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      prompt_cost_halala INTEGER NOT NULL DEFAULT 0,
      completion_cost_halala INTEGER NOT NULL DEFAULT 0,
      token_rate_halala INTEGER,
      cost_halala INTEGER NOT NULL,
      usd_prompt TEXT,
      usd_completion TEXT,
      usd_total TEXT,
      currency TEXT NOT NULL DEFAULT 'SAR',
      settlement_status TEXT NOT NULL DEFAULT 'pending',
      settlement_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE jobs (
      id INTEGER PRIMARY KEY,
      job_id TEXT UNIQUE,
      renter_id INTEGER,
      provider_id INTEGER,
      job_type TEXT,
      status TEXT,
      cost_halala INTEGER DEFAULT 0,
      actual_cost_halala INTEGER,
      submitted_at TEXT,
      created_at TEXT
    );

    CREATE TABLE billing_records (
      id INTEGER PRIMARY KEY,
      job_id TEXT,
      gross_cost_halala INTEGER
    );

    CREATE TABLE providers (
      id INTEGER PRIMARY KEY,
      is_burst INTEGER DEFAULT 0,
      supply_tier TEXT
    );

    CREATE TABLE payments (
      id INTEGER PRIMARY KEY,
      renter_id INTEGER NOT NULL,
      amount_halala INTEGER NOT NULL,
      status TEXT NOT NULL,
      refund_amount_halala INTEGER
    );

    CREATE TABLE renter_quota (
      id INTEGER PRIMARY KEY,
      renter_id INTEGER NOT NULL UNIQUE,
      daily_jobs_limit INTEGER NOT NULL DEFAULT 100,
      monthly_spend_limit_halala INTEGER NOT NULL DEFAULT 10000,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
  `);
  return db;
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function seedAccount(db) {
  db.prepare(
    `INSERT INTO renters
     (id, name, email, api_key, organization, status, balance_halala, trial_grant_halala, total_spent_halala, total_jobs, monthly_spend_cap_halala, created_at)
     VALUES (1, 'Usage Renter', 'usage@dcp.test', 'master-key', 'DCP Test', 'active', 25000, 2000, 9000, 4, 5000, ?)`
  ).run(isoDaysAgo(10));
  db.prepare(
    `INSERT INTO renter_api_keys
     (id, renter_id, key, label, scopes, org_id, org_role, monthly_spend_cap_halala, created_at)
     VALUES (?, 1, ?, ?, ?, 'org:dcp-test', ?, ?, ?)`
  ).run('key-billing', 'billing-key', 'billing', JSON.stringify(['billing']), 'read-only', 0, isoDaysAgo(3));
  db.prepare(
    `INSERT INTO renter_api_keys
     (id, renter_id, key, label, scopes, org_id, org_role, monthly_spend_cap_halala, created_at)
     VALUES (?, 1, ?, ?, ?, 'org:dcp-test', ?, ?, ?)`
  ).run('key-inference', 'inference-key', 'inference', JSON.stringify(['inference']), 'member', 1000, isoDaysAgo(2));
  db.prepare(
    `INSERT INTO renter_quota
     (renter_id, daily_jobs_limit, monthly_spend_limit_halala, created_at)
     VALUES (1, 12, 7500, ?)`
  ).run(isoDaysAgo(8));
  db.prepare(
    `INSERT INTO openrouter_usage_ledger
     (id, request_id, provider_response_id, job_id, request_path, renter_api_key_id, renter_key_type,
      renter_id, provider_id, model, source,
      prompt_tokens, completion_tokens, total_tokens, prompt_cost_halala, completion_cost_halala,
      token_rate_halala, cost_halala, currency, settlement_status, settlement_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'v1', ?, ?, ?, ?, ?, ?, ?, 'SAR', ?, ?, ?)`
  ).run(
    'usage-new',
    'req-new',
    'provider-resp-new',
    'job-v1-new',
    '/v1/chat/completions',
    'key-inference',
    'scoped_key',
    44,
    'ALLaM-AI/ALLaM-7B-Instruct-preview',
    120,
    30,
    150,
    240,
    60,
    2,
    300,
    'settled',
    'settle-new',
    isoDaysAgo(2)
  );
  db.prepare(
    `INSERT INTO openrouter_usage_ledger
     (id, request_id, renter_id, model, source, prompt_tokens, completion_tokens, total_tokens,
      prompt_cost_halala, completion_cost_halala, cost_halala, currency, settlement_status, created_at)
     VALUES ('usage-old', 'req-old', 1, 'old-model', 'v1', 50, 10, 60, 100, 20, 120, 'SAR', 'settled', ?)`
  ).run(isoDaysAgo(45));
  db.prepare(
    `INSERT INTO providers (id, is_burst, supply_tier)
     VALUES (44, 0, 'provider'), (45, 1, 'on_demand')`
  ).run();
  db.prepare(
    `INSERT INTO payments (renter_id, amount_halala, status)
     VALUES (1, 5000, 'paid')`
  ).run();
  db.prepare(
    `INSERT INTO jobs
     (id, job_id, renter_id, provider_id, job_type, status, cost_halala, actual_cost_halala, submitted_at, created_at)
     VALUES (10, 'job-on-demand-running', 1, 45, 'interactive_pod', 'running', 1200, NULL, ?, ?)`
  ).run(isoDaysAgo(1), isoDaysAgo(1));
  db.prepare(
    `INSERT INTO jobs
     (id, job_id, renter_id, provider_id, job_type, status, cost_halala, actual_cost_halala, submitted_at, created_at)
     VALUES (1, 'job-compute-1', 1, 44, 'batch', 'completed', 900, 800, ?, ?)`
  ).run(isoDaysAgo(4), isoDaysAgo(4));
  db.prepare(
    `INSERT INTO billing_records
     (job_id, gross_cost_halala)
     VALUES ('job-compute-1', 1200)`
  ).run();
}

describe('renter usage export and budget status', () => {
  beforeEach(() => {
    global.__testDb = buildDb();
    seedAccount(global.__testDb);
  });

  afterEach(() => {
    global.__testDb.close();
  });

  test('exports v1 usage as scoped CSV without query-string credentials', async () => {
    const res = await request(buildApp())
      .get('/api/renters/me/usage/export?format=csv&period=30d')
      .set('x-renter-key', 'master-key');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toContain('dcp-v1-usage-30d.csv');
    expect(res.text.split('\r\n')[0]).toContain('created_at,request_id,renter_api_key_id,renter_key_type,model,source');
    expect(res.text).toContain('"req-new"');
    expect(res.text).toContain('"key-inference"');
    expect(res.text).toContain('"ALLaM-AI/ALLaM-7B-Instruct-preview"');
    expect(res.text).not.toContain('req-old');
  });

  test('exports v1 usage as JSON for billing-scoped keys', async () => {
    const res = await request(buildApp())
      .get('/api/renters/me/usage/export?format=json&period=30d')
      .set('x-renter-key', 'billing-key');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      object: 'renter_usage_export',
      version: 'dcp.renter_usage_export.v1',
      period: '30d',
      renter: { id: 1, org_id: 'org:dcp-test' },
      totals: {
        total_requests: 1,
        total_tokens: 150,
        total_cost_halala: 300,
        total_cost_sar: 3,
      },
      claims: {
        per_key_spend_attribution_live: true,
        prompt_cache_discount_applied: false,
      },
    });
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0]).toMatchObject({
      request_id: 'req-new',
      renter_api_key_id: 'key-inference',
      renter_key_type: 'scoped_key',
      cost_halala: 300,
      cost_sar: 3,
      settlement_status: 'settled',
    });
  });

  test('rejects inference-only keys from usage export and budget data', async () => {
    const exportRes = await request(buildApp())
      .get('/api/renters/me/usage/export?format=json&period=30d')
      .set('x-renter-key', 'inference-key');
    const budgetRes = await request(buildApp())
      .get('/api/renters/me/budget-status?period=30d')
      .set('x-renter-key', 'inference-key');

    expect(exportRes.status).toBe(403);
    expect(budgetRes.status).toBe(403);
  });

  test('reports account cap, renter quota, key counts, and blocked per-key budget claims', async () => {
    const res = await request(buildApp())
      .get('/api/renters/me/budget-status?period=30d')
      .set('x-renter-key', 'billing-key');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      object: 'renter_budget_status',
      version: 'dcp.renter_budget_status.v1',
      period: '30d',
      renter: {
        id: 1,
        org_id: 'org:dcp-test',
        balance_halala: 25000,
      },
      v1_inference: {
        requests: 1,
        spend_halala: 300,
        monthly_spend_cap_halala: 5000,
        remaining_cap_halala: 4700,
        cap_utilization_pct: 6,
      },
      jobs: {
        completed: 1,
        spend_halala: 1200,
      },
      quota: {
        source: 'renter_quota',
        daily_jobs_limit: 12,
        monthly_spend_limit_halala: 7500,
      },
      api_keys: {
        total: 2,
        active: 2,
        billing: 1,
        inference: 1,
        budgeted: 1,
        monthly_spend_cap_halala: 1000,
        attributed_requests_30d: 1,
        attributed_spend_30d_halala: 300,
        per_key_spend_available: true,
        per_key_budgets_available: true,
      },
      team_usage_readiness: {
        object: 'team_usage_readiness',
        version: 'dcp.team_usage_readiness.v1',
        current_mode: 'scoped_key_controls_only',
        live_controls: {
          account_v1_spend_cap: true,
          workspace_usage_export: true,
          scoped_key_spend_attribution: true,
          scoped_key_budget_caps: true,
        },
        gated_controls: {
          team_member_rollups: true,
          team_member_budget_enforcement: true,
          org_member_identity_required: true,
        },
        counts: {
          active_keys: 2,
          budgeted_keys: 1,
          attributed_requests_30d: 1,
          attributed_spend_30d_halala: 300,
          attributed_spend_30d_sar: 3,
        },
        claim_guards: {
          creates_team_members: false,
          mutates_usage: false,
          mutates_budgets: false,
          changes_billing: false,
          dispatches_inference: false,
          exposes_key_secret: false,
          claims_team_member_rollups_live: false,
        },
      },
      claims: {
        v1_account_spend_cap_gate_live: true,
        workspace_usage_export_live: true,
        per_key_spend_attribution_live: true,
        per_key_budgets_enforced: true,
      },
    });
  });

  test('reports minimum-balance readiness without changing money or creating work', async () => {
    const res = await request(buildApp())
      .get('/api/renters/me/minimum-balances?period=30d')
      .set('x-renter-key', 'billing-key');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      object: 'minimum_balance_readiness',
      version: 'dcp.minimum_balance_readiness.v1',
      current_mode: 'read_only_policy_contract',
      account: {
        balance_halala: 25000,
        trial_grant_halala: 2000,
        paid_funding_halala: 5000,
        on_demand_committed_halala: 1200,
        paid_available_halala: 3800,
        v1_monthly_spend_cap_halala: 5000,
        v1_remaining_cap_halala: 4700,
      },
      credit_policy: {
        current_mode: 'grant_credit_provenance_plus_paid_credit_gate',
        source_contract: 'GET /api/pods/trial-routing/readiness',
        explicit_trial_account_tag_live: false,
        derived_trial_account_state: 'trial_grant_active',
        trial_credit_source: 'renters.trial_grant_halala',
        trial_grant_halala: 2000,
        paid_available_halala: 3800,
        trial_credit_unlocks_high_demand: false,
        high_demand_requires_paid_credit: true,
      },
      trial_classification: {
        current_mode: 'derived_from_credit_provenance',
        explicit_trial_account_tag_live: false,
        analytics_lifecycle_tag_live: false,
        derived_account_state: 'trial_grant_active',
        has_trial_grant: true,
        trial_grant_halala: 2000,
        paid_available_halala: 3800,
        trial_credit_capacity_class: 'dcp_native_and_community_gpu_pool',
        high_demand_capacity_class: 'paid_credit_only',
        mutates_account_classification: false,
      },
      rails: {
        v1_inference: {
          status: 'live_estimate_preflight',
          minimum_type: 'estimated_request_cost',
          enforcement_live: true,
        },
        gpu_pods_on_demand_supply: {
          status: 'live_paid_credit_preflight',
          minimum_type: 'quoted_pod_cost_paid_credit',
          paid_available_halala: 3800,
          enforcement_live: true,
        },
        batch_inference: {
          status: 'contract_only',
          enforcement_live: false,
        },
        lora_training: {
          status: 'metadata_and_artifact_proof_only',
          enforcement_live: false,
        },
        evaluators: {
          status: 'readiness_contract_only',
          enforcement_live: false,
        },
      },
      claim_guards: {
        mutates_balance: false,
        creates_payment: false,
        creates_pod: false,
        dispatches_inference: false,
        creates_batch: false,
        creates_lora_training_job: false,
        creates_adapter_deployment: false,
        creates_eval_job: false,
        enables_discount: false,
        changes_enforcement: false,
        changes_trial_accounting: false,
        changes_account_classification: false,
        changes_paid_credit_policy: false,
      },
    });
    expect(res.body.endpoints.readiness).toBe('GET /api/renters/me/minimum-balances');
  });

  test('lists scoped keys with attributed 30d spend and request counts', async () => {
    const res = await request(buildApp())
      .get('/api/renters/me/keys')
      .set('x-renter-key', 'master-key');

    expect(res.status).toBe(200);
    const inferenceKey = res.body.keys.find((key) => key.id === 'key-inference');
    const billingKey = res.body.keys.find((key) => key.id === 'key-billing');
    expect(inferenceKey).toMatchObject({
      spend_attribution_available: true,
      monthly_spend_cap_halala: 1000,
      monthly_spend_cap_sar: 10,
      monthly_spend_cap_unlimited: false,
      requests_30d: 1,
      spend_30d_halala: 300,
      spend_30d_sar: 3,
    });
    expect(billingKey).toMatchObject({
      spend_attribution_available: true,
      monthly_spend_cap_halala: 0,
      monthly_spend_cap_sar: 0,
      monthly_spend_cap_unlimited: true,
      requests_30d: 0,
      spend_30d_halala: 0,
      spend_30d_sar: 0,
    });
  });

  test('reports usage rollups by scoped key for workspace usage views', async () => {
    const res = await request(buildApp())
      .get('/api/renters/me/usage/by-key?period=30d')
      .set('x-renter-key', 'billing-key');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      object: 'renter_usage_by_key',
      version: 'dcp.renter_usage_by_key.v1',
      period: '30d',
      totals: {
        keys: 2,
        requests: 1,
        spend_halala: 300,
        spend_sar: 3,
      },
      unattributed: {
        requests: 0,
        spend_halala: 0,
      },
      claims: {
        per_key_spend_attribution_live: true,
        per_key_budgets_enforced: true,
        team_member_rollups_live: false,
      },
      team_usage_readiness: {
        object: 'team_usage_readiness',
        current_mode: 'scoped_key_controls_only',
        live_controls: {
          workspace_usage_export: true,
          scoped_key_spend_attribution: true,
          scoped_key_budget_caps: true,
        },
        gated_controls: {
          team_member_rollups: true,
          team_member_budget_enforcement: true,
        },
        counts: {
          active_keys: 2,
          budgeted_keys: 1,
          attributed_requests_30d: 1,
          attributed_spend_30d_halala: 300,
          rollup_rows: 2,
          unattributed_requests_30d: 0,
        },
        claim_guards: {
          creates_team_members: false,
          mutates_usage: false,
          mutates_budgets: false,
          changes_billing: false,
          dispatches_inference: false,
          exposes_key_secret: false,
          claims_team_member_rollups_live: false,
        },
      },
    });
    const inferenceKey = res.body.rows.find((row) => row.id === 'key-inference');
    const billingKey = res.body.rows.find((row) => row.id === 'key-billing');
    expect(inferenceKey).toMatchObject({
      label: 'inference',
      scopes: ['inference'],
      requests: 1,
      total_tokens: 150,
      spend_halala: 300,
      spend_sar: 3,
      monthly_spend_cap_halala: 1000,
      monthly_spend_cap_unlimited: false,
    });
    expect(billingKey).toMatchObject({
      label: 'billing',
      scopes: ['billing'],
      requests: 0,
      spend_halala: 0,
      monthly_spend_cap_unlimited: true,
    });
  });

  test('updates a scoped key monthly budget with master/admin access', async () => {
    const res = await request(buildApp())
      .put('/api/renters/me/keys/key-inference/budget')
      .set('x-renter-key', 'master-key')
      .send({ monthly_spend_cap_sar: 25.5 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      id: 'key-inference',
      monthly_spend_cap_halala: 2550,
      monthly_spend_cap_sar: 25.5,
      monthly_spend_cap_unlimited: false,
      per_key_budgets_enforced: true,
    });
    const row = global.__testDb.prepare('SELECT monthly_spend_cap_halala FROM renter_api_keys WHERE id = ?').get('key-inference');
    expect(row.monthly_spend_cap_halala).toBe(2550);
  });
});
