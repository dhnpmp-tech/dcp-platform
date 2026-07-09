'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  EVALUATOR_RESULT_MANIFEST_VERSION,
  validateEvaluatorResultManifest,
} = require('./evaluatorResultManifest');

const EVALUATOR_RESULT_WRITER_DRY_RUN_VERSION = 'dcp.evaluator_result_writer_dry_run.v1';
const PROHIBITED_SUMMARY_FIELDS = Object.freeze([
  'raw_dataset',
  'raw_prompts',
  'raw_completions',
  'examples',
  'samples',
  'rows',
]);

class EvaluatorResultWriterDryRunError extends Error {
  constructor(message, { code = 'evaluator_result_writer_dry_run_error', details = undefined } = {}) {
    super(message);
    this.name = 'EvaluatorResultWriterDryRunError';
    this.code = code;
    this.details = details;
  }
}

function buildEvaluatorResultWriterDryRunReadiness(now = new Date()) {
  return {
    object: 'evaluator_result_writer_dry_run_readiness',
    version: EVALUATOR_RESULT_WRITER_DRY_RUN_VERSION,
    generated_at: now.toISOString(),
    current_mode: 'dry_run_temp_artifact_only',
    endpoints: {
      writer_readiness: 'GET /api/evals/results/writer/readiness',
      artifact_storage_readiness: 'GET /api/evals/results/artifacts/readiness',
      result_access_readiness: 'GET /api/evals/results/access/readiness',
      result_manifest_schema: 'GET /api/evals/results/schema',
      worker_readiness: 'GET /api/evals/worker/readiness',
      future_result_manifest: 'GET /api/evals/jobs/:id/results',
    },
    writer: {
      dry_run_available: true,
      production_writer_enabled: false,
      result_endpoint_live: false,
      artifact_store_enabled: false,
      artifact_storage_policy_endpoint: 'GET /api/evals/results/artifacts/readiness',
      result_access_policy_endpoint: 'GET /api/evals/results/access/readiness',
      signed_downloads_enabled: false,
      writes_temp_manifest_only: true,
      summary_hash_required: true,
    },
    manifest_policy: {
      manifest_version: EVALUATOR_RESULT_MANIFEST_VERSION,
      summary_hash_scope: 'canonical_summary_json_without_raw_rows',
      raw_summary_fields_forbidden: [...PROHIBITED_SUMMARY_FIELDS],
      validation_endpoint: 'GET /api/evals/results/schema',
    },
    claim_guards: {
      writes_temp_artifact: true,
      writes_production_artifact: false,
      exposes_result_endpoint: false,
      mutates_eval_job_status: false,
      stores_raw_customer_dataset: false,
      stores_raw_prompts_or_completions: false,
      bills_eval_jobs: false,
      settles_eval_jobs: false,
      publishes_public_report: false,
      model_ranking_allowed: false,
      arabic_quality_claim_allowed: false,
    },
    next_actions: [
      'Enforce the artifact storage policy in a production object-store writer before result writes.',
      'Enforce result access authorization before exposing result downloads.',
      'Replace the simulated worker fixture with a real disabled worker dry-run before enabling queue dispatch.',
      'Add signed download smoke only after result endpoint and artifact checksums are approved.',
    ],
  };
}

function createEvaluatorResultWriterDryRun(input = {}, options = {}) {
  const job = normalizeJob(input.eval_job || input.job || {});
  const summary = normalizeSummary(input.summary || {});
  const scoringHarnessVersion = normalizeRequiredString(
    input.scoring_harness_version || input.scoringHarnessVersion,
    'scoring_harness_version',
    { max: 120 }
  );
  const createdAt = normalizeDate(options.now || input.created_at || new Date());
  const summaryCanonicalJson = canonicalStringify(summary);
  const summarySha256 = sha256Hex(summaryCanonicalJson);
  const manifest = {
    eval_job_id: job.eval_job_id,
    dataset_sha256: job.dataset_sha256,
    scoring_harness_version: scoringHarnessVersion,
    candidate_model: job.candidate_model,
    baseline_models: job.baseline_models,
    metrics: job.metrics,
    summary_sha256: summarySha256,
    created_at: createdAt,
  };
  const validation = validateEvaluatorResultManifest(manifest, {
    eval_job_id: job.eval_job_id,
    dataset_sha256: job.dataset_sha256,
    scoring_harness_version: scoringHarnessVersion,
    candidate_model: job.candidate_model,
    metrics: job.metrics,
  });
  const outputDir = prepareOutputDir(options.outputDir);
  const manifestCanonicalJson = `${canonicalStringify(manifest)}\n`;
  const filename = `${sanitizeFilename(job.eval_job_id)}-result-manifest-dry-run.json`;
  const manifestPath = path.join(outputDir, filename);
  fs.writeFileSync(manifestPath, manifestCanonicalJson, { mode: 0o600 });
  const bytes = Buffer.byteLength(manifestCanonicalJson, 'utf8');

  return {
    object: 'evaluator_result_writer_dry_run',
    version: EVALUATOR_RESULT_WRITER_DRY_RUN_VERSION,
    dry_run: true,
    result_endpoint_live: false,
    production_writer_enabled: false,
    artifact_store_enabled: false,
    manifest: validation.manifest,
    summary_sha256: summarySha256,
    temp_artifact: {
      path: manifestPath,
      bytes,
      sha256: sha256Hex(manifestCanonicalJson),
    },
    production_effects: {
      mutates_eval_job_status: false,
      writes_production_artifact: false,
      stores_raw_customer_dataset: false,
      stores_raw_prompts_or_completions: false,
      bills_eval_jobs: false,
      settles_eval_jobs: false,
      publishes_public_report: false,
    },
    next: 'tenant_artifact_storage_policy_before_production_result_writer',
  };
}

function normalizeJob(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throwDryRunError('eval_job is required', {
      code: 'missing_eval_job',
    });
  }
  const dataset = value.dataset && typeof value.dataset === 'object' ? value.dataset : {};
  return {
    eval_job_id: normalizeRequiredString(value.eval_job_id, 'eval_job_id', { max: 80 }),
    dataset_sha256: normalizeRequiredString(dataset.sha256 || value.dataset_sha256, 'dataset.sha256', { max: 64 }).toLowerCase(),
    candidate_model: normalizeRequiredString(value.candidate_model, 'candidate_model', { max: 200 }),
    baseline_models: normalizeStringArray(value.baseline_models || [], 'baseline_models', { max: 12, itemMax: 200 }),
    metrics: normalizeStringArray(value.metrics, 'metrics', { min: 1, max: 12, itemMax: 80 }),
  };
}

function normalizeSummary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throwDryRunError('summary must be an object', {
      code: 'invalid_summary_object',
    });
  }
  rejectProhibitedSummaryFields(value);
  return value;
}

function rejectProhibitedSummaryFields(value, trail = []) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectProhibitedSummaryFields(item, [...trail, String(index)]));
    return;
  }
  for (const key of Object.keys(value)) {
    if (PROHIBITED_SUMMARY_FIELDS.includes(key)) {
      throwDryRunError('summary must not include raw customer data fields', {
        code: 'raw_summary_field_forbidden',
        details: { field: key, path: [...trail, key].join('.') },
      });
    }
    rejectProhibitedSummaryFields(value[key], [...trail, key]);
  }
}

function normalizeStringArray(value, field, { min = 0, max, itemMax }) {
  if (!Array.isArray(value)) {
    throwDryRunError(`${field} must be an array`, {
      code: 'invalid_dry_run_array',
      details: { field },
    });
  }
  if (value.length < min || value.length > max) {
    throwDryRunError(`${field} length is outside allowed bounds`, {
      code: 'dry_run_array_length_out_of_bounds',
      details: { field, min, max },
    });
  }
  return value.map((item, index) => normalizeRequiredString(item, `${field}[${index}]`, { max: itemMax }));
}

function normalizeRequiredString(value, field, { max }) {
  const normalized = String(value == null ? '' : value).trim();
  if (!normalized) {
    throwDryRunError(`${field} is required`, {
      code: 'missing_dry_run_field',
      details: { field },
    });
  }
  if (normalized.length > max) {
    throwDryRunError(`${field} exceeds maximum length`, {
      code: 'dry_run_field_too_long',
      details: { field, max },
    });
  }
  return normalized;
}

function normalizeDate(value) {
  if (value instanceof Date) return value.toISOString();
  const ms = Date.parse(String(value));
  if (!Number.isFinite(ms)) {
    throwDryRunError('created_at must be an ISO timestamp', {
      code: 'invalid_dry_run_timestamp',
    });
  }
  return new Date(ms).toISOString();
}

function prepareOutputDir(outputDir) {
  const target = outputDir
    ? path.resolve(outputDir)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'dcp-evaluator-result-writer-dry-run-'));
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  return target;
}

function sanitizeFilename(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'eval-result';
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((acc, key) => {
    acc[key] = canonicalize(value[key]);
    return acc;
  }, {});
}

function throwDryRunError(message, options = {}) {
  throw new EvaluatorResultWriterDryRunError(message, options);
}

module.exports = {
  EVALUATOR_RESULT_WRITER_DRY_RUN_VERSION,
  EvaluatorResultWriterDryRunError,
  buildEvaluatorResultWriterDryRunReadiness,
  canonicalStringify,
  createEvaluatorResultWriterDryRun,
};
