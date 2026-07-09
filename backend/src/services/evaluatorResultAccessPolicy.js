'use strict';

const {
  EVALUATOR_ARTIFACT_STORAGE_POLICY_VERSION,
  validateEvaluatorArtifactStoragePolicy,
} = require('./evaluatorArtifactStoragePolicy');

const EVALUATOR_RESULT_ACCESS_POLICY_VERSION = 'dcp.evaluator_result_access_policy.v1';

class EvaluatorResultAccessPolicyError extends Error {
  constructor(message, { code = 'evaluator_result_access_policy_error', details = undefined } = {}) {
    super(message);
    this.name = 'EvaluatorResultAccessPolicyError';
    this.code = code;
    this.details = details;
  }
}

function buildEvaluatorResultAccessPolicyReadiness(now = new Date()) {
  return {
    object: 'evaluator_result_access_policy_readiness',
    version: EVALUATOR_RESULT_ACCESS_POLICY_VERSION,
    generated_at: now.toISOString(),
    current_mode: 'authorization_policy_contract_only',
    endpoints: {
      result_access_readiness: 'GET /api/evals/results/access/readiness',
      artifact_storage_readiness: 'GET /api/evals/results/artifacts/readiness',
      result_writer_readiness: 'GET /api/evals/results/writer/readiness',
      result_manifest_schema: 'GET /api/evals/results/schema',
      worker_readiness: 'GET /api/evals/worker/readiness',
      disabled_result_endpoint: 'GET /api/evals/jobs/:id/results',
      future_result_manifest: 'GET /api/evals/jobs/:id/results',
    },
    access_policy: {
      policy_available: true,
      result_endpoint_live: false,
      signed_downloads_enabled: false,
      renter_auth_required: true,
      renter_owner_match_required: true,
      result_available_required: true,
      artifact_policy_required: true,
      artifact_policy_version: EVALUATOR_ARTIFACT_STORAGE_POLICY_VERSION,
      checksum_required: true,
      admin_override_enabled: false,
      public_report_access_enabled: false,
    },
    denial_codes: [
      'evaluator_result_endpoint_disabled',
      'evaluator_result_owner_mismatch',
      'evaluator_result_not_available',
      'evaluator_result_artifact_policy_invalid',
    ],
    claim_guards: {
      policy_contract_live: true,
      disabled_result_endpoint_live: true,
      result_endpoint_live: false,
      signed_downloads_enabled: false,
      exposes_result_endpoint: false,
      signs_download_url: false,
      allows_cross_renter_access: false,
      allows_public_report_access: false,
      bills_eval_jobs: false,
      settles_eval_jobs: false,
      publishes_public_report: false,
      model_ranking_allowed: false,
      arabic_quality_claim_allowed: false,
    },
    next_actions: [
      'Add a disabled result endpoint route only after ownership policy and artifact checks are enforced.',
      'Add signed download smoke only after result endpoint authorization and object-store config are approved.',
      'Keep public reports gated until human review and baseline policy exist.',
    ],
  };
}

function evaluateEvaluatorResultAccessPolicy(input = {}) {
  const requestingRenterId = normalizePositiveInteger(
    input.requesting_renter_id ?? input.requestingRenterId,
    'requesting_renter_id'
  );
  const jobRenterId = normalizePositiveInteger(input.job_renter_id ?? input.jobRenterId, 'job_renter_id');
  const evalJobId = normalizeEvalJobId(input.eval_job_id ?? input.evalJobId);
  if (requestingRenterId !== jobRenterId) {
    throwAccessError('requesting renter does not own evaluator job', {
      code: 'evaluator_result_owner_mismatch',
      details: { requesting_renter_id: requestingRenterId, job_renter_id: jobRenterId },
    });
  }
  if (input.result_available !== true) {
    throwAccessError('result artifact is not available for this evaluator job', {
      code: 'evaluator_result_not_available',
      details: { eval_job_id: evalJobId },
    });
  }

  const artifactPolicy = validateEvaluatorArtifactStoragePolicy({
    renter_id: jobRenterId,
    eval_job_id: evalJobId,
    storage_key: input.storage_key ?? input.storageKey,
    checksum_sha256: input.checksum_sha256 ?? input.checksumSha256,
    content_type: input.content_type ?? input.contentType ?? 'application/json',
  });

  return {
    valid: true,
    version: EVALUATOR_RESULT_ACCESS_POLICY_VERSION,
    eval_job_id: evalJobId,
    renter_id: jobRenterId,
    would_authorize_if_endpoint_enabled: true,
    result_endpoint_live: false,
    signed_downloads_enabled: false,
    download_url_signed: false,
    artifact_policy: {
      version: artifactPolicy.version,
      storage_key: artifactPolicy.storage_key,
      checksum_sha256: artifactPolicy.checksum_sha256,
      content_type: artifactPolicy.content_type,
      production_writes_enabled: artifactPolicy.production_writes_enabled,
      signed_downloads_enabled: artifactPolicy.signed_downloads_enabled,
    },
    denial_code_while_disabled: 'evaluator_result_endpoint_disabled',
  };
}

function normalizePositiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throwAccessError(`${field} must be a positive integer`, {
      code: 'invalid_evaluator_result_access_integer',
      details: { field },
    });
  }
  return number;
}

function normalizeEvalJobId(value) {
  const normalized = String(value == null ? '' : value).trim();
  if (!/^evaljob_[A-Za-z0-9_-]{8,70}$/.test(normalized)) {
    throwAccessError('eval_job_id must start with evaljob_ and contain 8-70 URL-safe characters', {
      code: 'invalid_evaluator_result_access_eval_job_id',
      details: { eval_job_id: normalized },
    });
  }
  return normalized;
}

function throwAccessError(message, options = {}) {
  throw new EvaluatorResultAccessPolicyError(message, options);
}

module.exports = {
  EVALUATOR_RESULT_ACCESS_POLICY_VERSION,
  EvaluatorResultAccessPolicyError,
  buildEvaluatorResultAccessPolicyReadiness,
  evaluateEvaluatorResultAccessPolicy,
};
