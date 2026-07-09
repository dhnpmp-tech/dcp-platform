'use strict';

const { buildEvaluatorJobSchema } = require('./evaluatorJobSchema');

const EVALUATOR_RESULT_MANIFEST_VERSION = 'dcp.evaluator_result_manifest.v1';
const RESULT_MANIFEST_REQUIRED_FIELDS = Object.freeze([
  'eval_job_id',
  'dataset_sha256',
  'scoring_harness_version',
  'candidate_model',
  'baseline_models',
  'metrics',
  'summary_sha256',
  'created_at',
]);
const PROHIBITED_RAW_FIELDS = Object.freeze([
  'raw_dataset',
  'raw_prompts',
  'raw_completions',
  'examples',
  'samples',
  'rows',
]);

class EvaluatorResultManifestError extends Error {
  constructor(message, { code = 'evaluator_result_manifest_error', details = undefined } = {}) {
    super(message);
    this.name = 'EvaluatorResultManifestError';
    this.code = code;
    this.details = details;
  }
}

function buildEvaluatorResultManifestContract(now = new Date()) {
  return {
    object: 'evaluator_result_manifest_contract',
    version: EVALUATOR_RESULT_MANIFEST_VERSION,
    generated_at: now.toISOString(),
    current_mode: 'schema_and_checksum_contract_only',
    endpoints: {
      result_manifest_schema: 'GET /api/evals/results/schema',
      result_writer_readiness: 'GET /api/evals/results/writer/readiness',
      worker_readiness: 'GET /api/evals/worker/readiness',
      evaluator_readiness: 'GET /api/evals/readiness',
      job_schema: 'GET /api/evals/jobs/schema',
      future_result_manifest: 'GET /api/evals/jobs/:id/results',
    },
    required_fields: [...RESULT_MANIFEST_REQUIRED_FIELDS],
    checksum_policy: {
      digest: 'sha256_hex',
      dataset_sha256_required: true,
      summary_sha256_required: true,
      summary_sha256_scope: 'canonical_summary_json_without_raw_rows',
      mismatch_behavior: 'block_result_publication',
    },
    manifest_schema: {
      eval_job_id: 'evaljob_<base32>',
      dataset_sha256: '64_char_sha256_hex',
      scoring_harness_version: 'string',
      candidate_model: 'string',
      baseline_models: 'array<string>',
      metrics: 'array<enum>',
      summary_sha256: '64_char_sha256_hex',
      created_at: 'iso8601_timestamp',
    },
    publication_policy: {
      raw_prompt_or_completion_publication_allowed: false,
      raw_dataset_publication_allowed: false,
      public_report_requires_human_review: true,
      signed_downloads_enabled: false,
    },
    claim_guards: {
      result_endpoint_live: false,
      validates_manifest_only: true,
      writes_result_manifest: false,
      stores_raw_customer_dataset: false,
      publishes_raw_customer_dataset: false,
      publishes_public_report: false,
      model_ranking_allowed: false,
      arabic_quality_claim_allowed: false,
      bills_eval_jobs: false,
    },
    next_actions: [
      'Attach approved tenant artifact storage before production result writes.',
      'Add signed result download smoke only after artifact storage policy is approved.',
      'Keep public reports gated until human review and baseline policy proof exist.',
    ],
  };
}

function validateEvaluatorResultManifest(manifest, expected = {}) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throwManifestError('Result manifest must be an object', {
      code: 'invalid_manifest_object',
    });
  }
  for (const field of RESULT_MANIFEST_REQUIRED_FIELDS) {
    if (!(field in manifest)) {
      throwManifestError('Result manifest is missing a required field', {
        code: 'missing_result_manifest_field',
        details: { field },
      });
    }
  }
  for (const field of PROHIBITED_RAW_FIELDS) {
    if (field in manifest) {
      throwManifestError('Result manifest must not include raw customer data fields', {
        code: 'raw_customer_data_field_forbidden',
        details: { field },
      });
    }
  }

  const schema = buildEvaluatorJobSchema(new Date('2026-07-09T00:00:00.000Z'));
  const allowedMetrics = new Set(schema.request_schema.fields.metrics.allowed_values);
  const normalized = {
    eval_job_id: normalizeEvalJobId(manifest.eval_job_id),
    dataset_sha256: normalizeSha256(manifest.dataset_sha256, 'dataset_sha256'),
    scoring_harness_version: normalizeRequiredString(manifest.scoring_harness_version, 'scoring_harness_version', { max: 120 }),
    candidate_model: normalizeRequiredString(manifest.candidate_model, 'candidate_model', { max: 200 }),
    baseline_models: normalizeStringArray(manifest.baseline_models, 'baseline_models', { max: 12, itemMax: 200 }),
    metrics: normalizeStringArray(manifest.metrics, 'metrics', { min: 1, max: 12, itemMax: 80 }),
    summary_sha256: normalizeSha256(manifest.summary_sha256, 'summary_sha256'),
    created_at: normalizeIsoTimestamp(manifest.created_at, 'created_at'),
  };
  const unsupportedMetrics = normalized.metrics.filter((metric) => !allowedMetrics.has(metric));
  if (unsupportedMetrics.length > 0) {
    throwManifestError('Result manifest includes unsupported metrics', {
      code: 'unsupported_result_manifest_metric',
      details: { metrics: unsupportedMetrics, allowed_values: [...allowedMetrics] },
    });
  }

  assertExpected(normalized, expected, 'eval_job_id');
  assertExpected(normalized, expected, 'dataset_sha256');
  assertExpected(normalized, expected, 'scoring_harness_version');
  assertExpected(normalized, expected, 'candidate_model');
  if (Array.isArray(expected.metrics)) {
    const expectedMetrics = expected.metrics.join('\u0000');
    if (normalized.metrics.join('\u0000') !== expectedMetrics) {
      throwManifestError('Result manifest metrics do not match expected job metrics', {
        code: 'result_manifest_metrics_mismatch',
        details: { expected: expected.metrics, actual: normalized.metrics },
      });
    }
  }

  return {
    valid: true,
    version: EVALUATOR_RESULT_MANIFEST_VERSION,
    manifest: normalized,
    raw_publication_allowed: false,
    public_report_allowed: false,
  };
}

function assertExpected(normalized, expected, field) {
  if (expected[field] == null) return;
  if (normalized[field] !== expected[field]) {
    throwManifestError('Result manifest does not match expected job metadata', {
      code: 'result_manifest_expected_field_mismatch',
      details: { field, expected: expected[field], actual: normalized[field] },
    });
  }
}

function normalizeEvalJobId(value) {
  const normalized = normalizeRequiredString(value, 'eval_job_id', { max: 80 });
  if (!/^evaljob_[A-Za-z0-9_-]{8,70}$/.test(normalized)) {
    throwManifestError('eval_job_id must start with evaljob_ and contain 8-70 URL-safe characters', {
      code: 'invalid_result_manifest_eval_job_id',
      details: { eval_job_id: normalized },
    });
  }
  return normalized;
}

function normalizeSha256(value, field) {
  const normalized = normalizeRequiredString(value, field, { max: 64 }).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throwManifestError(`${field} must be a 64-character SHA-256 hex digest`, {
      code: 'invalid_result_manifest_sha256',
      details: { field },
    });
  }
  return normalized;
}

function normalizeRequiredString(value, field, { max }) {
  const normalized = String(value == null ? '' : value).trim();
  if (!normalized) {
    throwManifestError(`${field} is required`, {
      code: 'missing_result_manifest_field',
      details: { field },
    });
  }
  if (normalized.length > max) {
    throwManifestError(`${field} exceeds maximum length`, {
      code: 'result_manifest_field_too_long',
      details: { field, max },
    });
  }
  return normalized;
}

function normalizeStringArray(value, field, { min = 0, max, itemMax }) {
  if (!Array.isArray(value)) {
    throwManifestError(`${field} must be an array`, {
      code: 'invalid_result_manifest_array',
      details: { field },
    });
  }
  if (value.length < min || value.length > max) {
    throwManifestError(`${field} length is outside allowed bounds`, {
      code: 'result_manifest_array_length_out_of_bounds',
      details: { field, min, max },
    });
  }
  return value.map((item, index) => normalizeRequiredString(item, `${field}[${index}]`, { max: itemMax }));
}

function normalizeIsoTimestamp(value, field) {
  const normalized = normalizeRequiredString(value, field, { max: 80 });
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) {
    throwManifestError(`${field} must be an ISO timestamp`, {
      code: 'invalid_result_manifest_timestamp',
      details: { field },
    });
  }
  return new Date(ms).toISOString();
}

function throwManifestError(message, options = {}) {
  throw new EvaluatorResultManifestError(message, options);
}

module.exports = {
  EVALUATOR_RESULT_MANIFEST_VERSION,
  RESULT_MANIFEST_REQUIRED_FIELDS,
  EvaluatorResultManifestError,
  buildEvaluatorResultManifestContract,
  validateEvaluatorResultManifest,
};
