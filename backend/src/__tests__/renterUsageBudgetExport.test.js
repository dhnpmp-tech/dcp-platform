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
     (id, name, email, api_key, organization, status, balance_halala, total_spent_halala, total_jobs, monthly_spend_cap_halala, created_at)
     VALUES (1, 'Usage Renter', 'usage@dcp.test', 'master-key', 'DCP Test', 'active', 25000, 9000, 4, 5000, ?)`
  ).run(isoDaysAgo(10));
  db.prepare(
    `INSERT INTO renter_api_keys
     (id, renter_id, key, label, scopes, org_id, org_role, created_at)
     VALUES (?, 1, ?, ?, ?, 'org:dcp-test', ?, ?)`
  ).run('key-billing', 'billing-key', 'billing', JSON.stringify(['billing']), 'read-only', isoDaysAgo(3));
  db.prepare(
    `INSERT INTO renter_api_keys
     (id, renter_id, key, label, scopes, org_id, org_role, created_at)
     VALUES (?, 1, ?, ?, ?, 'org:dcp-test', ?, ?)`
  ).run('key-inference', 'inference-key', 'inference', JSON.stringify(['inference']), 'member', isoDaysAgo(2));
  db.prepare(
    `INSERT INTO renter_quota
     (renter_id, daily_jobs_limit, monthly_spend_limit_halala, created_at)
     VALUES (1, 12, 7500, ?)`
  ).run(isoDaysAgo(8));
  db.prepare(
    `INSERT INTO openrouter_usage_ledger
     (id, request_id, provider_response_id, job_id, request_path, renter_id, provider_id, model, source,
      prompt_tokens, completion_tokens, total_tokens, prompt_cost_halala, completion_cost_halala,
      token_rate_halala, cost_halala, currency, settlement_status, settlement_id, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, 'v1', ?, ?, ?, ?, ?, ?, ?, 'SAR', ?, ?, ?)`
  ).run(
    'usage-new',
    'req-new',
    'provider-resp-new',
    'job-v1-new',
    '/v1/chat/completions',
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
    `INSERT INTO jobs
     (id, job_id, renter_id, status, cost_halala, actual_cost_halala, submitted_at, created_at)
     VALUES (1, 'job-compute-1', 1, 'completed', 900, 800, ?, ?)`
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
    expect(res.text.split('\r\n')[0]).toContain('created_at,request_id,model,source');
    expect(res.text).toContain('"req-new"');
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
        per_key_spend_attribution_live: false,
        prompt_cache_discount_applied: false,
      },
    });
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0]).toMatchObject({
      request_id: 'req-new',
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
        per_key_spend_available: false,
        per_key_budgets_available: false,
      },
      claims: {
        v1_account_spend_cap_gate_live: true,
        workspace_usage_export_live: true,
        per_key_spend_attribution_live: false,
        per_key_budgets_enforced: false,
      },
    });
  });
});
