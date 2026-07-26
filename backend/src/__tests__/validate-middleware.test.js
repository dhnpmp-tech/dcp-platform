'use strict';

/**
 * Tests for the Zod request validation middleware and schemas.
 *
 * These tests exercise the validateBody() factory and all four schema files
 * in isolation — no database, no HTTP server.
 */

const { validateBody, formatZodErrors } = require('../middleware/validate');
const { jobSubmitSchema } = require('../schemas/jobs.schema');
const { providerRegisterSchema, providerBenchmarkSchema } = require('../schemas/providers.schema');
const { benchmarkRunSchema, benchmarkSimulateSchema } = require('../schemas/benchmark.schema');
const { renterTopupSchema, renterRegisterSchema } = require('../schemas/topup.schema');

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Invoke validateBody() middleware in a test context.
 * Returns { status, body } on a 400, or { passed: true, parsedBody } on next().
 */
function runMiddleware(schema, inputBody) {
  const middleware = validateBody(schema);
  let result;

  const req = { body: inputBody };
  const res = {
    status(code) {
      this._status = code;
      return this;
    },
    json(payload) {
      result = { status: this._status, body: payload };
      return this;
    },
    _status: 200,
  };
  const next = () => {
    result = { passed: true, parsedBody: req.body };
  };

  middleware(req, res, next);
  return result;
}

// ── validate.js core ──────────────────────────────────────────────────────────

describe('validateBody middleware', () => {
  const simpleSchema = require('zod').z.object({ name: require('zod').z.string() }).strict();

  test('passes valid body and replaces req.body with parsed output', () => {
    const result = runMiddleware(simpleSchema, { name: 'Alice' });
    expect(result.passed).toBe(true);
    expect(result.parsedBody).toEqual({ name: 'Alice' });
  });

  test('returns 400 for missing required field', () => {
    const result = runMiddleware(simpleSchema, {});
    expect(result.status).toBe(400);
    expect(result.body.error).toBe('Validation failed');
    expect(result.body.fields).toBeInstanceOf(Array);
    expect(result.body.fields[0].field).toBe('name');
  });

  test('strips unknown fields in strict mode', () => {
    // strict() on simpleSchema rejects unknown keys
    const result = runMiddleware(simpleSchema, { name: 'Alice', extra: 'x' });
    expect(result.status).toBe(400);
  });

  test('formatZodErrors returns field + message pairs', () => {
    const { z, ZodError } = require('zod');
    const schema = z.object({ age: z.number() });
    const parseResult = schema.safeParse({ age: 'not-a-number' });
    expect(parseResult.success).toBe(false);
    const errors = formatZodErrors(parseResult.error);
    expect(errors[0].field).toBe('age');
    expect(typeof errors[0].message).toBe('string');
  });
});

// ── jobs.schema.js ────────────────────────────────────────────────────────────

describe('jobSubmitSchema', () => {
  const validBody = {
    job_type: 'inference',
    duration_minutes: 10,
  };

  test('accepts a minimal valid body', () => {
    const result = jobSubmitSchema.safeParse(validBody);
    expect(result.success).toBe(true);
  });

  test('accepts full optional fields', () => {
    const result = jobSubmitSchema.safeParse({
      job_type: 'training',
      template_id: 'jupyter-gpu',
      duration_minutes: 60,
      provider_id: 5,
      env_vars: { MY_VAR: 'hello' },
      params: { script_type: 'jupyter', NOTEBOOK_TOKEN: 'abc-123' },
      priority: 'high',
    });
    expect(result.success).toBe(true);
  });

  test('rejects duration_minutes below 0.1', () => {
    const result = runMiddleware(jobSubmitSchema, { ...validBody, duration_minutes: 0 });
    expect(result.status).toBe(400);
    expect(result.body.fields.some((f) => f.field === 'duration_minutes')).toBe(true);
  });

  test('rejects duration_minutes above 1440', () => {
    const result = runMiddleware(jobSubmitSchema, { ...validBody, duration_minutes: 1441 });
    expect(result.status).toBe(400);
  });

  test('rejects unknown top-level fields (strict mode)', () => {
    const result = runMiddleware(jobSubmitSchema, { ...validBody, malicious_field: 'x' });
    expect(result.status).toBe(400);
  });

  test('passes and parsedBody contains only known fields', () => {
    const result = runMiddleware(jobSubmitSchema, validBody);
    expect(result.passed).toBe(true);
    expect(result.parsedBody).toMatchObject({ job_type: 'inference' });
  });
});

// ── providers.schema.js ───────────────────────────────────────────────────────

describe('providerRegisterSchema', () => {
  const validBody = {
    name: 'Ali',
    email: 'ali@example.com',
    gpu_model: 'RTX 4090',
    os: 'linux',
  };

  test('accepts valid registration', () => {
    const result = runMiddleware(providerRegisterSchema, validBody);
    expect(result.passed).toBe(true);
    expect(result.parsedBody.os).toBe('linux');
  });

  test('accepts and normalizes human-readable os values', () => {
    const ubuntu = runMiddleware(providerRegisterSchema, { ...validBody, os: 'Ubuntu 22.04' });
    expect(ubuntu.passed).toBe(true);
    expect(ubuntu.parsedBody.os).toBe('linux');

    const windows = runMiddleware(providerRegisterSchema, { ...validBody, os: 'Windows 10/11' });
    expect(windows.passed).toBe(true);
    expect(windows.parsedBody.os).toBe('windows');
  });

  test('rejects missing name', () => {
    const { name: _n, ...noName } = validBody;
    const result = runMiddleware(providerRegisterSchema, noName);
    expect(result.status).toBe(400);
    expect(result.body.fields.some((f) => f.field === 'name')).toBe(true);
  });

  test('rejects invalid email', () => {
    const result = runMiddleware(providerRegisterSchema, { ...validBody, email: 'not-an-email' });
    expect(result.status).toBe(400);
    expect(result.body.fields.some((f) => f.field === 'email')).toBe(true);
  });

  test('rejects invalid os value', () => {
    const result = runMiddleware(providerRegisterSchema, { ...validBody, os: 'freebsd' });
    expect(result.status).toBe(400);
    expect(result.body.fields.some((f) => f.field === 'os')).toBe(true);
  });

  test('rejects name shorter than 2 characters', () => {
    const result = runMiddleware(providerRegisterSchema, { ...validBody, name: 'A' });
    expect(result.status).toBe(400);
  });

  test('accepts optional fields', () => {
    const result = runMiddleware(providerRegisterSchema, {
      ...validBody,
      phone: '+966-50-000-0000',
      location: 'Riyadh, SA',
    });
    expect(result.passed).toBe(true);
  });

  test('accepts location_country alias and maps it to location', () => {
    const result = runMiddleware(providerRegisterSchema, {
      ...validBody,
      location_country: 'Saudi Arabia',
    });
    expect(result.passed).toBe(true);
    expect(result.parsedBody.location).toBe('Saudi Arabia');
    expect(result.parsedBody.location_country).toBeUndefined();
  });
});

describe('providerBenchmarkSchema', () => {
  const validBody = {
    gpu_model: 'RTX 4090',
    vram_gb: 24,
    tflops: 660,
    bandwidth_gbps: 1008,
    tokens_per_sec: 5000,
  };

  test('accepts valid benchmark submission', () => {
    const result = runMiddleware(providerBenchmarkSchema, validBody);
    expect(result.passed).toBe(true);
  });

  test('accepts optional tier field', () => {
    const result = runMiddleware(providerBenchmarkSchema, { ...validBody, tier: 'B' });
    expect(result.passed).toBe(true);
  });

  test('rejects invalid tier', () => {
    const result = runMiddleware(providerBenchmarkSchema, { ...validBody, tier: 'D' });
    expect(result.status).toBe(400);
    expect(result.body.fields.some((f) => f.field === 'tier')).toBe(true);
  });

  test('rejects vram_gb below minimum (1)', () => {
    const result = runMiddleware(providerBenchmarkSchema, { ...validBody, vram_gb: 0 });
    expect(result.status).toBe(400);
  });

  test('rejects tflops below minimum (1)', () => {
    const result = runMiddleware(providerBenchmarkSchema, { ...validBody, tflops: 0.5 });
    expect(result.status).toBe(400);
  });

  test('rejects unknown fields', () => {
    const result = runMiddleware(providerBenchmarkSchema, { ...validBody, unknown_field: 'x' });
    expect(result.status).toBe(400);
  });
});

// ── benchmark.schema.js ───────────────────────────────────────────────────────

describe('benchmarkRunSchema', () => {
  test('accepts valid run request', () => {
    const result = runMiddleware(benchmarkRunSchema, { provider_id: 'prov-123', benchmark_type: 'quick' });
    expect(result.passed).toBe(true);
  });

  test('rejects invalid benchmark_type', () => {
    const result = runMiddleware(benchmarkRunSchema, { provider_id: 'p1', benchmark_type: 'turbo' });
    expect(result.status).toBe(400);
    expect(result.body.fields.some((f) => f.field === 'benchmark_type')).toBe(true);
  });

  test('rejects missing provider_id', () => {
    const result = runMiddleware(benchmarkRunSchema, { benchmark_type: 'standard' });
    expect(result.status).toBe(400);
  });
});

describe('benchmarkSimulateSchema', () => {
  test('accepts minimal simulate request', () => {
    const result = runMiddleware(benchmarkSimulateSchema, { provider_id: 'p1' });
    expect(result.passed).toBe(true);
  });

  test('accepts full optional fields', () => {
    const result = runMiddleware(benchmarkSimulateSchema, {
      provider_id: 'p1',
      benchmark_type: 'full',
      score_gflops: 1200,
      temp_max_celsius: 75,
      vram_used_mib: 8192,
      latency_ms: 12,
    });
    expect(result.passed).toBe(true);
  });
});

// ── topup.schema.js ───────────────────────────────────────────────────────────

describe('renterTopupSchema', () => {
  test('accepts amount_halala only', () => {
    const result = runMiddleware(renterTopupSchema, { amount_halala: 5000 });
    expect(result.passed).toBe(true);
  });

  test('accepts amount_sar only', () => {
    const result = runMiddleware(renterTopupSchema, { amount_sar: 50.5 });
    expect(result.passed).toBe(true);
  });

  test('rejects when neither amount is provided', () => {
    const result = runMiddleware(renterTopupSchema, {});
    expect(result.status).toBe(400);
  });

  test('rejects amount_halala above max (100000)', () => {
    const result = runMiddleware(renterTopupSchema, { amount_halala: 100001 });
    expect(result.status).toBe(400);
  });

  test('rejects amount_halala below min (1)', () => {
    const result = runMiddleware(renterTopupSchema, { amount_halala: 0 });
    expect(result.status).toBe(400);
  });

  test('rejects amount_sar below min (0.01)', () => {
    const result = runMiddleware(renterTopupSchema, { amount_sar: 0 });
    expect(result.status).toBe(400);
  });

  test('rejects non-integer amount_halala', () => {
    const result = runMiddleware(renterTopupSchema, { amount_halala: 50.5 });
    expect(result.status).toBe(400);
  });
});

describe('renterRegisterSchema', () => {
  const validBody = { name: 'Sara', email: 'sara@example.com' };

  test('accepts minimal valid body', () => {
    const result = runMiddleware(renterRegisterSchema, validBody);
    expect(result.passed).toBe(true);
  });

  test('accepts full optional fields', () => {
    const result = runMiddleware(renterRegisterSchema, {
      ...validBody,
      organization: 'KFUPM',
      use_case: 'Arabic NLP research',
      phone: '+966-50-111-2222',
      legal_entity_name: 'King Fahd University of Petroleum and Minerals',
      commercial_registration_number: '1010123456',
      billing_address: 'Dhahran 31261, Saudi Arabia',
      vat_number: '310000000000003',
      expected_monthly_volume: '1M-10M tokens/month',
    });
    expect(result.passed).toBe(true);
  });

  test('accepts legacy useCase alias', () => {
    const result = runMiddleware(renterRegisterSchema, { ...validBody, useCase: 'inference' });
    expect(result.passed).toBe(true);
  });

  test('rejects missing email', () => {
    const { email: _e, ...noEmail } = validBody;
    const result = runMiddleware(renterRegisterSchema, noEmail);
    expect(result.status).toBe(400);
    expect(result.body.fields.some((f) => f.field === 'email')).toBe(true);
  });

  test('rejects invalid email', () => {
    const result = runMiddleware(renterRegisterSchema, { ...validBody, email: 'bad' });
    expect(result.status).toBe(400);
  });

  test('rejects name shorter than 2 chars', () => {
    const result = runMiddleware(renterRegisterSchema, { ...validBody, name: 'X' });
    expect(result.status).toBe(400);
  });
});
