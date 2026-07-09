'use strict';

const { EVALUATOR_RESULT_MANIFEST_VERSION } = require('./evaluatorResultManifest');

const EVALUATOR_ARTIFACT_STORAGE_POLICY_VERSION = 'dcp.evaluator_artifact_storage_policy.v1';
const MAX_STORAGE_KEY_LENGTH = 512;
const ALLOWED_ARTIFACT_KINDS = Object.freeze(['result_manifest']);
const ALLOWED_CONTENT_TYPES = Object.freeze(['application/json']);
const RESULT_MANIFEST_FILENAME = 'result-manifest.json';

class EvaluatorArtifactStoragePolicyError extends Error {
  constructor(message, { code = 'evaluator_artifact_storage_policy_error', details = undefined } = {}) {
    super(message);
    this.name = 'EvaluatorArtifactStoragePolicyError';
    this.code = code;
    this.details = details;
  }
}

function buildEvaluatorArtifactStoragePolicyReadiness(now = new Date()) {
  return {
    object: 'evaluator_artifact_storage_policy_readiness',
    version: EVALUATOR_ARTIFACT_STORAGE_POLICY_VERSION,
    generated_at: now.toISOString(),
    current_mode: 'policy_contract_only',
    endpoints: {
      artifact_storage_readiness: 'GET /api/evals/results/artifacts/readiness',
      result_access_readiness: 'GET /api/evals/results/access/readiness',
      result_writer_readiness: 'GET /api/evals/results/writer/readiness',
      result_manifest_schema: 'GET /api/evals/results/schema',
      worker_readiness: 'GET /api/evals/worker/readiness',
      disabled_result_endpoint: 'GET /api/evals/jobs/:id/results',
      future_result_manifest: 'GET /api/evals/jobs/:id/results',
    },
    storage_policy: {
      policy_available: true,
      production_artifact_store_enabled: false,
      signed_downloads_enabled: false,
      production_writes_enabled: false,
      allowed_artifact_kinds: [...ALLOWED_ARTIFACT_KINDS],
      allowed_content_types: [...ALLOWED_CONTENT_TYPES],
      required_manifest_version: EVALUATOR_RESULT_MANIFEST_VERSION,
      default_key_template: 'eval-results/renter-{renter_id}/{eval_job_id}/result-manifest.json',
      requires_renter_scope: true,
      requires_eval_job_scope: true,
      requires_sha256: true,
      raw_dataset_storage_allowed: false,
      raw_prompt_or_completion_storage_allowed: false,
    },
    validation_policy: {
      max_storage_key_length: MAX_STORAGE_KEY_LENGTH,
      rejects_absolute_keys: true,
      rejects_dot_segments: true,
      rejects_unscoped_renter_keys: true,
      rejects_eval_job_mismatch: true,
      checksum_digest: 'sha256_hex',
    },
    claim_guards: {
      policy_contract_live: true,
      production_artifact_store_enabled: false,
      production_writes_enabled: false,
      signed_downloads_enabled: false,
      exposes_result_endpoint: false,
      stores_raw_customer_dataset: false,
      stores_raw_prompts_or_completions: false,
      bills_eval_jobs: false,
      settles_eval_jobs: false,
      publishes_public_report: false,
      model_ranking_allowed: false,
      arabic_quality_claim_allowed: false,
    },
    next_actions: [
      'Add a production object-store writer only after this policy is enforced by the worker.',
      'Enforce result access authorization before signed result downloads.',
      'Add signed result download smoke only after result endpoint authorization is approved.',
      'Keep public reports gated until artifact checksums, human review, and baseline policy exist.',
    ],
  };
}

function buildEvaluatorResultArtifactStorageKey(input = {}) {
  const renterId = normalizePositiveInteger(input.renter_id ?? input.renterId, 'renter_id');
  const evalJobId = normalizeEvalJobId(input.eval_job_id ?? input.evalJobId);
  return `eval-results/renter-${renterId}/${evalJobId}/${RESULT_MANIFEST_FILENAME}`;
}

function validateEvaluatorArtifactStoragePolicy(input = {}) {
  const renterId = normalizePositiveInteger(input.renter_id ?? input.renterId, 'renter_id');
  const evalJobId = normalizeEvalJobId(input.eval_job_id ?? input.evalJobId);
  const artifactKind = normalizeEnum(input.artifact_kind ?? input.artifactKind ?? 'result_manifest', 'artifact_kind', ALLOWED_ARTIFACT_KINDS);
  const contentType = normalizeEnum(input.content_type ?? input.contentType ?? 'application/json', 'content_type', ALLOWED_CONTENT_TYPES);
  const checksumSha256 = normalizeSha256(input.checksum_sha256 ?? input.checksumSha256, 'checksum_sha256');
  const storageKey = normalizeStorageKey(input.storage_key ?? input.storageKey ?? buildEvaluatorResultArtifactStorageKey({
    renter_id: renterId,
    eval_job_id: evalJobId,
  }));
  const requiredPrefix = `eval-results/renter-${renterId}/${evalJobId}/`;
  if (!storageKey.startsWith(requiredPrefix)) {
    throwPolicyError('storage_key must be scoped to the renter and evaluator job', {
      code: 'evaluator_artifact_storage_key_scope_invalid',
      details: { required_prefix: requiredPrefix, storage_key: storageKey },
    });
  }
  if (artifactKind === 'result_manifest' && storageKey !== `${requiredPrefix}${RESULT_MANIFEST_FILENAME}`) {
    throwPolicyError('result_manifest artifacts must use the approved manifest filename', {
      code: 'evaluator_artifact_filename_invalid',
      details: { expected: `${requiredPrefix}${RESULT_MANIFEST_FILENAME}`, storage_key: storageKey },
    });
  }

  return {
    valid: true,
    version: EVALUATOR_ARTIFACT_STORAGE_POLICY_VERSION,
    artifact_kind: artifactKind,
    renter_id: renterId,
    eval_job_id: evalJobId,
    storage_key: storageKey,
    checksum_sha256: checksumSha256,
    content_type: contentType,
    required_prefix: requiredPrefix,
    production_artifact_store_enabled: false,
    production_writes_enabled: false,
    signed_downloads_enabled: false,
    raw_storage_allowed: false,
    result_endpoint_live: false,
  };
}

function normalizePositiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throwPolicyError(`${field} must be a positive integer`, {
      code: 'invalid_evaluator_artifact_integer',
      details: { field },
    });
  }
  return number;
}

function normalizeEvalJobId(value) {
  const normalized = normalizeRequiredString(value, 'eval_job_id', { max: 80 });
  if (!/^evaljob_[A-Za-z0-9_-]{8,70}$/.test(normalized)) {
    throwPolicyError('eval_job_id must start with evaljob_ and contain 8-70 URL-safe characters', {
      code: 'invalid_evaluator_artifact_eval_job_id',
      details: { eval_job_id: normalized },
    });
  }
  return normalized;
}

function normalizeStorageKey(value) {
  const key = normalizeRequiredString(value, 'storage_key', { max: MAX_STORAGE_KEY_LENGTH }).replace(/^\/+/, '');
  if (!key || key.includes('\0')) {
    throwPolicyError('storage_key is invalid', {
      code: 'invalid_evaluator_artifact_storage_key',
      details: { max_length: MAX_STORAGE_KEY_LENGTH },
    });
  }
  const segments = key.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..' || segment === '')) {
    throwPolicyError('storage_key must be a relative object key without dot segments', {
      code: 'invalid_evaluator_artifact_storage_key',
    });
  }
  return key;
}

function normalizeSha256(value, field) {
  const checksum = normalizeRequiredString(value, field, { max: 64 }).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(checksum)) {
    throwPolicyError(`${field} must be a 64-character SHA-256 hex digest`, {
      code: 'invalid_evaluator_artifact_checksum',
      details: { field },
    });
  }
  return checksum;
}

function normalizeEnum(value, field, allowedValues) {
  const normalized = normalizeRequiredString(value, field, { max: 80 });
  if (!allowedValues.includes(normalized)) {
    throwPolicyError(`${field} is not allowed`, {
      code: 'unsupported_evaluator_artifact_value',
      details: { field, value: normalized, allowed_values: [...allowedValues] },
    });
  }
  return normalized;
}

function normalizeRequiredString(value, field, { max }) {
  const normalized = String(value == null ? '' : value).trim();
  if (!normalized) {
    throwPolicyError(`${field} is required`, {
      code: 'missing_evaluator_artifact_field',
      details: { field },
    });
  }
  if (normalized.length > max) {
    throwPolicyError(`${field} exceeds maximum length`, {
      code: 'evaluator_artifact_field_too_long',
      details: { field, max },
    });
  }
  return normalized;
}

function throwPolicyError(message, options = {}) {
  throw new EvaluatorArtifactStoragePolicyError(message, options);
}

module.exports = {
  EVALUATOR_ARTIFACT_STORAGE_POLICY_VERSION,
  EvaluatorArtifactStoragePolicyError,
  buildEvaluatorArtifactStoragePolicyReadiness,
  buildEvaluatorResultArtifactStorageKey,
  validateEvaluatorArtifactStoragePolicy,
};
