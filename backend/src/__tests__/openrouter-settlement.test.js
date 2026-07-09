'use strict';

const express = require('express');
const request = require('supertest');
const db = require('../db');
const {
  recordOpenRouterUsage,
  computeDryRunSummary,
  executeOpenRouterSettlement,
} = require('../services/openrouterSettlementService');

const openRouterSettlementRouter = require('../routes/openrouter-settlement');

function cleanTables() {
  try { db.run('DELETE FROM openrouter_settlement_alerts'); } catch (_) {}
  try { db.run('DELETE FROM openrouter_settlement_topups'); } catch (_) {}
  try { db.run('DELETE FROM openrouter_settlement_invoices'); } catch (_) {}
  try { db.run('DELETE FROM openrouter_settlement_items'); } catch (_) {}
  try { db.run('DELETE FROM openrouter_settlements'); } catch (_) {}
  try { db.run('DELETE FROM openrouter_usage_ledger'); } catch (_) {}
}

let seedSeq = 0;

function seedRenterAndProvider() {
  const now = new Date().toISOString();
  const suffix = `${Date.now()}-${++seedSeq}`;
  db.run(
    `INSERT INTO renters (name, email, api_key, balance_halala, status, created_at)
     VALUES (?, ?, ?, ?, 'active', ?)`,
    'OR Renter', `or-renter-${suffix}@dc1.test`, `dc1-renter-${suffix}`, 50000, now
  );
  db.run(
    `INSERT INTO providers (name, email, gpu_model, os, api_key, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'online', ?)`,
    'OR Provider', `or-provider-${suffix}@dc1.test`, 'RTX 4090', 'linux', `dc1-provider-${suffix}`, now
  );
  return {
    renter: db.get('SELECT id FROM renters ORDER BY id DESC LIMIT 1'),
    provider: db.get('SELECT id FROM providers ORDER BY id DESC LIMIT 1'),
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/openrouter', openRouterSettlementRouter);
  return app;
}

beforeEach(() => cleanTables());
afterAll(() => cleanTables());

describe('openrouterSettlementService', () => {
  test('records usage and returns dry-run reconciliation summary', () => {
    const { renter, provider } = seedRenterAndProvider();
    const usage = recordOpenRouterUsage(db._db || db, {
      renterId: renter.id,
      providerId: provider.id,
      model: 'openai/gpt-4o-mini',
      promptTokens: 120,
      completionTokens: 80,
      costHalala: 250,
    });
    expect(usage.settlement_status).toBe('pending');

    const summary = computeDryRunSummary(db._db || db, {});
    expect(summary.usage_count).toBe(1);
    expect(summary.reconciled_halala).toBe(250);
    expect(summary.discrepancy_halala).toBe(0);
    expect(summary.top_renters[0].renter_id).toBe(renter.id);
  });

  test('deduplicates usage writes by request_id', () => {
    const { renter, provider } = seedRenterAndProvider();
    const first = recordOpenRouterUsage(db._db || db, {
      requestId: 'req-fixed-123',
      renterId: renter.id,
      providerId: provider.id,
      model: 'openai/gpt-4o-mini',
      promptTokens: 12,
      completionTokens: 8,
      costHalala: 40,
    });
    const second = recordOpenRouterUsage(db._db || db, {
      requestId: 'req-fixed-123',
      renterId: renter.id,
      providerId: provider.id,
      model: 'openai/gpt-4o-mini',
      promptTokens: 12,
      completionTokens: 8,
      costHalala: 40,
    });

    expect(second.id).toBe(first.id);
    const count = db.get('SELECT COUNT(*) AS n FROM openrouter_usage_ledger WHERE request_id = ?', 'req-fixed-123');
    expect(count.n).toBe(1);
  });

  test('persists request metadata columns for downstream reconciliation reads', () => {
    const { renter, provider } = seedRenterAndProvider();
    const usage = recordOpenRouterUsage(db._db || db, {
      requestId: 'req-metadata-1',
      providerResponseId: 'chatcmpl-metadata-1',
      jobId: 'job-metadata-1',
      requestPath: '/api/vllm/chat/completions',
      renterApiKeyId: 'key-scope-1',
      renterKeyType: 'scoped_key',
      promptCostHalala: 27,
      completionCostHalala: 18,
      tokenRateHalala: 3,
      usdPrompt: '0.072000',
      usdCompletion: '0.048000',
      usdTotal: '0.120000',
      renterId: renter.id,
      providerId: provider.id,
      model: 'meta-llama/Meta-Llama-3-8B-Instruct',
      source: 'api_vllm',
      promptTokens: 9,
      completionTokens: 6,
      costHalala: 45,
    });

    expect(usage.request_id).toBe('req-metadata-1');
    expect(usage.provider_response_id).toBe('chatcmpl-metadata-1');
    expect(usage.job_id).toBe('job-metadata-1');
    expect(usage.request_path).toBe('/api/vllm/chat/completions');
    expect(usage.renter_api_key_id).toBe('key-scope-1');
    expect(usage.renter_key_type).toBe('scoped_key');
    expect(usage.prompt_cost_halala).toBe(27);
    expect(usage.completion_cost_halala).toBe(18);
    expect(usage.token_rate_halala).toBe(3);
    expect(usage.usd_prompt).toBe('0.072000');
    expect(usage.usd_completion).toBe('0.048000');
    expect(usage.usd_total).toBe('0.120000');
    expect(usage.source).toBe('api_vllm');
  });

  test('executes invoice-mode settlement and marks usage settled', () => {
    const { renter, provider } = seedRenterAndProvider();
    recordOpenRouterUsage(db._db || db, {
      renterId: renter.id,
      providerId: provider.id,
      model: 'openai/gpt-4o-mini',
      promptTokens: 100,
      completionTokens: 50,
      costHalala: 300,
    });

    const result = executeOpenRouterSettlement(db._db || db, { mode: 'invoice' });
    expect(result.error).toBeUndefined();
    expect(result.settlement).toBeTruthy();
    expect(result.settlement.status).toBe('completed');
    expect(result.invoice).toBeTruthy();
    expect(result.invoice.amount_halala).toBe(300);

    const remainingPending = db.get(
      `SELECT COUNT(*) AS n FROM openrouter_usage_ledger WHERE settlement_status = 'pending'`
    );
    expect(remainingPending.n).toBe(0);
  });

  test('flags discrepancy with critical alert when expected total mismatches', () => {
    const { renter, provider } = seedRenterAndProvider();
    recordOpenRouterUsage(db._db || db, {
      renterId: renter.id,
      providerId: provider.id,
      model: 'openai/gpt-4o-mini',
      promptTokens: 60,
      completionTokens: 40,
      costHalala: 200,
    });

    const result = executeOpenRouterSettlement(db._db || db, {
      mode: 'auto_topup',
      expectedTotalHalala: 500,
    });
    expect(result.settlement.status).toBe('partial');
    expect(result.settlement.discrepancy_halala).toBe(300);
    expect((result.alerts || []).some((alert) => alert.code === 'SETTLEMENT_DISCREPANCY')).toBe(true);
    expect(result.topup).toBeTruthy();
  });
});

describe('openrouter-settlement admin routes', () => {
  test('runs dry-run and execution endpoints with admin auth', async () => {
    const { renter, provider } = seedRenterAndProvider();
    recordOpenRouterUsage(db._db || db, {
      renterId: renter.id,
      providerId: provider.id,
      model: 'openai/gpt-4o-mini',
      promptTokens: 75,
      completionTokens: 25,
      costHalala: 180,
      usdTotal: '0.999999',
    });

    const app = buildApp();
    const token = process.env.DC1_ADMIN_TOKEN || 'test-admin-token-jest';

    const dryRunRes = await request(app)
      .post('/api/admin/openrouter/settlements/dry-run')
      .set('x-admin-token', token)
      .send({});
    expect(dryRunRes.status).toBe(200);
    expect(dryRunRes.body.summary.usage_count).toBe(1);
    expect(dryRunRes.body.summary.pricing).toEqual({
      currency: 'USD',
      usd_expected_total: expect.any(String),
      usd_reconciled_total: expect.any(String),
      usd_discrepancy_total: expect.any(String),
    });
    expect(typeof dryRunRes.body.summary.pricing.usd_reconciled_total).toBe('string');

    const runRes = await request(app)
      .post('/api/admin/openrouter/settlements/run')
      .set('x-admin-token', token)
      .send({ mode: 'invoice' });
    expect(runRes.status).toBe(200);
    expect(runRes.body.settlement.status).toBe('completed');
    expect(runRes.body.settlement.pricing).toEqual({
      currency: 'USD',
      usd_expected_total: expect.any(String),
      usd_reconciled_total: expect.any(String),
      usd_discrepancy_total: expect.any(String),
    });
    expect(runRes.body.invoice.pricing).toEqual({
      currency: 'USD',
      usd: expect.any(String),
    });
    expect(typeof runRes.body.invoice.pricing.usd).toBe('string');

    const listRes = await request(app)
      .get('/api/admin/openrouter/settlements')
      .set('x-admin-token', token);
    expect(listRes.status).toBe(200);
    expect(listRes.body.count).toBeGreaterThanOrEqual(1);
    expect(listRes.body.settlements[0].pricing).toEqual({
      currency: 'USD',
      usd_expected_total: expect.any(String),
      usd_reconciled_total: expect.any(String),
      usd_discrepancy_total: expect.any(String),
    });

    const detailRes = await request(app)
      .get(`/api/admin/openrouter/settlements/${runRes.body.settlement.id}`)
      .set('x-admin-token', token);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.items[0].pricing).toEqual({
      currency: 'USD',
      usd: '0.999999',
    });
    expect(typeof detailRes.body.items[0].pricing.usd).toBe('string');
  });

  test('rejects access without admin token', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/admin/openrouter/settlements/dry-run').send({});
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Admin token required' });
  });
});
