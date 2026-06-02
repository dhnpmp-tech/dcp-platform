'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../services/moyasarPaymentRefundService', () => ({
  refundPayment: jest.fn(),
}));

const db = require('../db');
const { refundPayment } = require('../services/moyasarPaymentRefundService');
const paymentsRouter = require('../routes/payments');
const payoutsRouter = require('../routes/payouts');
const { requireAdminRbac } = require('../middleware/adminAuth');

const ADMIN_TOKEN = 'test-admin-token-refunds';
const RENTER_KEY = 'dcp_renter_refund_key';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/payments', paymentsRouter);
  app.use('/api', payoutsRouter);
  return app;
}

function buildProductionMountedApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', requireAdminRbac);
  app.use('/api/payments', paymentsRouter);
  app.use('/api', payoutsRouter);
  return app;
}

function waitForAutomaticAudit() {
  return new Promise((resolve) => setImmediate(resolve));
}

function resetTables() {
  for (const table of ['payment_refund_requests', 'payments', 'renters', 'admin_audit_log']) {
    try { db.run(`DELETE FROM ${table}`); } catch (_) {}
  }
}

function seedRenter({ balanceHalala = 10000 } = {}) {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO renters
       (id, name, email, api_key, status, balance_halala, created_at, updated_at)
     VALUES (1, 'Refund Renter', 'refund-renter@example.com', ?, 'active', ?, ?, ?)`,
    RENTER_KEY, balanceHalala, now, now
  );
}

function seedPayment({
  paymentId = 'pay_refund_1',
  moyasarId = 'moyasar-pay-1',
  status = 'paid',
  amountHalala = 5000,
} = {}) {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO payments
       (payment_id, moyasar_id, renter_id, amount_sar, amount_halala, status,
        source_type, payment_method, description, created_at, confirmed_at)
     VALUES (?, ?, 1, ?, ?, ?, 'creditcard', 'creditcard', 'Test top-up', ?, ?)`,
    paymentId,
    moyasarId,
    amountHalala / 100,
    amountHalala,
    status,
    now,
    status === 'paid' ? now : null
  );
}

function seedRefundRequest({
  id = 'rfr_test_1',
  paymentId = 'pay_refund_1',
  amountHalala = 2500,
  status = 'pending',
} = {}) {
  db.run(
    `INSERT INTO payment_refund_requests
       (id, payment_id, renter_id, amount_halala, reason, status, requested_at)
     VALUES (?, ?, 1, ?, 'Mistaken top-up amount', ?, ?)`,
    id,
    paymentId,
    amountHalala,
    status,
    new Date().toISOString()
  );
}

describe('payment refund request queue', () => {
  let app;

  beforeAll(() => {
    process.env.DC1_ADMIN_TOKEN = ADMIN_TOKEN;
  });

  beforeEach(() => {
    delete process.env.MOYASAR_SECRET_KEY;
    refundPayment.mockReset();
    resetTables();
    seedRenter();
    seedPayment();
    app = buildApp();
  });

  afterAll(() => {
    delete process.env.DC1_ADMIN_TOKEN;
  });

  test('renter creates a pending refund request for their paid payment', async () => {
    const res = await request(app)
      .post('/api/payments/pay_refund_1/refund-request')
      .set('x-renter-key', RENTER_KEY)
      .send({ reason: 'Mistaken amount, please refund unused balance.' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      payment_id: 'pay_refund_1',
      amount_halala: 5000,
      status: 'pending',
    });

    const row = db.get('SELECT * FROM payment_refund_requests WHERE id = ?', res.body.request_id);
    expect(row.reason).toBe('Mistaken amount, please refund unused balance.');
    expect(row.renter_id).toBe(1);
  });

  test('renter cannot open a duplicate pending request for the same payment', async () => {
    seedRefundRequest();

    const res = await request(app)
      .post('/api/payments/pay_refund_1/refund-request')
      .set('x-renter-key', RENTER_KEY)
      .send({ reason: 'Second request' });

    expect(res.status).toBe(409);
    expect(res.body.request_id).toBe('rfr_test_1');
  });

  test('admin approves a request and records an internal refund when Moyasar is unavailable', async () => {
    seedRefundRequest({ amountHalala: 2500 });

    const res = await request(app)
      .post('/api/admin/payments/refund-requests/rfr_test_1/approve')
      .set('x-admin-token', ADMIN_TOKEN)
      .send({ admin_note: 'Unused balance refund approved' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      request_id: 'rfr_test_1',
      payment_id: 'pay_refund_1',
      refunded_halala: 2500,
      channel: 'manual',
    });
    expect(refundPayment).not.toHaveBeenCalled();

    const payment = db.get('SELECT status, refund_amount_halala FROM payments WHERE payment_id = ?', 'pay_refund_1');
    const renter = db.get('SELECT balance_halala FROM renters WHERE id = 1');
    const requestRow = db.get('SELECT status, admin_note FROM payment_refund_requests WHERE id = ?', 'rfr_test_1');
    expect(payment.status).toBe('refunded');
    expect(payment.refund_amount_halala).toBe(2500);
    expect(renter.balance_halala).toBe(7500);
    expect(requestRow.status).toBe('approved');
    expect(requestRow.admin_note).toBe('Unused balance refund approved');
  });

  test('admin approval calls Moyasar when a configured Moyasar payment id exists', async () => {
    process.env.MOYASAR_SECRET_KEY = 'sk_test_refunds';
    refundPayment.mockResolvedValue({ id: 'refund_123', status: 'refunded' });
    seedRefundRequest({ amountHalala: 3000 });

    const res = await request(app)
      .post('/api/admin/payments/refund-requests/rfr_test_1/approve')
      .set('x-admin-token', ADMIN_TOKEN)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.channel).toBe('moyasar');
    expect(refundPayment).toHaveBeenCalledWith({
      paymentId: 'moyasar-pay-1',
      amountHalala: 3000,
    });

    const requestRow = db.get('SELECT status, moyasar_refund_id FROM payment_refund_requests WHERE id = ?', 'rfr_test_1');
    expect(requestRow.status).toBe('approved');
    expect(requestRow.moyasar_refund_id).toBe('refund_123');
  });

  test('admin rejects a pending request without changing payment or renter balance', async () => {
    seedRefundRequest({ amountHalala: 2500 });

    const res = await request(app)
      .post('/api/admin/payments/refund-requests/rfr_test_1/reject')
      .set('x-admin-token', ADMIN_TOKEN)
      .send({ reason: 'Consumed compute is not refundable' });

    expect(res.status).toBe(200);
    const payment = db.get('SELECT status, refund_amount_halala FROM payments WHERE payment_id = ?', 'pay_refund_1');
    const renter = db.get('SELECT balance_halala FROM renters WHERE id = 1');
    const requestRow = db.get('SELECT status, admin_note FROM payment_refund_requests WHERE id = ?', 'rfr_test_1');
    expect(payment.status).toBe('paid');
    expect(payment.refund_amount_halala).toBeNull();
    expect(renter.balance_halala).toBe(10000);
    expect(requestRow.status).toBe('rejected');
    expect(requestRow.admin_note).toBe('Consumed compute is not refundable');
  });

  test('production mount order writes exactly one explicit audit row on approve', async () => {
    app = buildProductionMountedApp();
    seedRefundRequest({ amountHalala: 2500 });

    const res = await request(app)
      .post('/api/admin/payments/refund-requests/rfr_test_1/approve')
      .set('x-admin-token', ADMIN_TOKEN)
      .send({ admin_note: 'Approved after renter review' });

    expect(res.status).toBe(200);
    await waitForAutomaticAudit();

    const rows = db.all(
      `SELECT action, target_type, target_id
         FROM admin_audit_log
        WHERE target_id = ?
        ORDER BY id`,
      'rfr_test_1'
    );
    expect(rows).toEqual([{
      action: 'payment_refund_approved',
      target_type: 'payment_refund_request',
      target_id: 'rfr_test_1',
    }]);
  });

  test('production mount order writes exactly one explicit audit row on reject', async () => {
    app = buildProductionMountedApp();
    seedRefundRequest({ amountHalala: 2500 });

    const res = await request(app)
      .post('/api/admin/payments/refund-requests/rfr_test_1/reject')
      .set('x-admin-token', ADMIN_TOKEN)
      .send({ reason: 'Payment already consumed by usage' });

    expect(res.status).toBe(200);
    await waitForAutomaticAudit();

    const rows = db.all(
      `SELECT action, target_type, target_id
         FROM admin_audit_log
        WHERE target_id = ?
        ORDER BY id`,
      'rfr_test_1'
    );
    expect(rows).toEqual([{
      action: 'payment_refund_rejected',
      target_type: 'payment_refund_request',
      target_id: 'rfr_test_1',
    }]);
  });
});
