'use strict';

process.env.DC1_DB_PATH = ':memory:';
process.env.DISABLE_RATE_LIMIT = '1';

const express = require('express');
const request = require('supertest');

const mockSendOtp = jest.fn(() => Promise.resolve({ success: true }));

jest.mock('../services/auth-otp', () => ({
  sendOtp: (...args) => mockSendOtp(...args),
  verifyOtp: jest.fn(),
  verifyMagicToken: jest.fn(),
}));

jest.mock('../services/analyticsService', () => ({
  renter: {
    signupComplete: jest.fn(() => Promise.resolve()),
    login: jest.fn(() => Promise.resolve()),
  },
  provider: {},
}));

jest.mock('../services/conversionFunnelService', () => ({
  trackStage: jest.fn(() => Promise.resolve()),
}));

const db = require('../db');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/renters', require('../routes/renters'));
  return app;
}

function cleanDb() {
  try { db.run('DELETE FROM conversion_funnel_events'); } catch (_) {}
  try { db.run('DELETE FROM otp_codes'); } catch (_) {}
  try { db.run('DELETE FROM renters'); } catch (_) {}
}

describe('POST /api/renters/register signup profile fields', () => {
  const app = makeApp();

  beforeEach(() => {
    cleanDb();
    mockSendOtp.mockClear();
  });

  afterAll(() => {
    cleanDb();
    try { db.close?.(); } catch (_) {}
  });

  test('persists legal, billing, use-case, and expected-volume fields on pending signup', async () => {
    const email = `billing-profile-${Date.now()}@dc1.test`;
    const payload = {
      name: 'Sara Account Owner',
      email,
      organization: 'DCP Pilot Workspace',
      legal_entity_name: 'DCP Pilot Trading LLC',
      commercial_registration_number: '1010123456',
      billing_address: 'King Fahd Road, Riyadh 12271, Saudi Arabia',
      vat_number: '310000000000003',
      use_case: 'Arabic customer support',
      expected_monthly_volume: '1M-10M tokens/month',
      phone: '+966500000000',
    };

    const res = await request(app).post('/api/renters/register').send(payload);
    expect(res.status).toBe(202);
    expect(res.body.next).toBe('check_email');
    expect(mockSendOtp).toHaveBeenCalledWith(email, { requestedRole: 'renter' });

    const row = db.get(
      `SELECT organization,
              legal_entity_name,
              commercial_registration_number,
              billing_address,
              vat_number,
              use_case,
              expected_monthly_volume,
              phone,
              status,
              balance_halala
         FROM renters
        WHERE LOWER(email) = LOWER(?)`,
      email
    );

    expect(row).toMatchObject({
      organization: payload.organization,
      legal_entity_name: payload.legal_entity_name,
      commercial_registration_number: payload.commercial_registration_number,
      billing_address: payload.billing_address,
      vat_number: payload.vat_number,
      use_case: payload.use_case,
      expected_monthly_volume: payload.expected_monthly_volume,
      phone: payload.phone,
      status: 'pending',
      balance_halala: 0,
    });
  });

  test('refreshes signup profile fields when a pending renter resubmits', async () => {
    const email = `billing-refresh-${Date.now()}@dc1.test`;
    const initial = await request(app).post('/api/renters/register').send({
      name: 'Original Owner',
      email,
      legalEntityName: 'Original Entity LLC',
      expectedMonthlyVolume: '<100K tokens/month',
    });
    expect(initial.status).toBe(202);

    const updated = await request(app).post('/api/renters/register').send({
      name: 'Updated Owner',
      email,
      legal_entity_name: 'Updated Entity LLC',
      commercial_registration_number: '1010999999',
      billing_address: 'Olaya Street, Riyadh',
      vat_number: '310000000000099',
      use_case: 'Batch document analysis',
      expected_monthly_volume: '10M+ tokens/month',
      phone: '+966511111111',
    });
    expect(updated.status).toBe(202);

    const row = db.get(
      `SELECT name,
              legal_entity_name,
              commercial_registration_number,
              billing_address,
              vat_number,
              use_case,
              expected_monthly_volume,
              phone,
              status
         FROM renters
        WHERE LOWER(email) = LOWER(?)`,
      email
    );

    expect(row).toMatchObject({
      name: 'Updated Owner',
      legal_entity_name: 'Updated Entity LLC',
      commercial_registration_number: '1010999999',
      billing_address: 'Olaya Street, Riyadh',
      vat_number: '310000000000099',
      use_case: 'Batch document analysis',
      expected_monthly_volume: '10M+ tokens/month',
      phone: '+966511111111',
      status: 'pending',
    });
    expect(mockSendOtp).toHaveBeenCalledTimes(2);
  });
});
