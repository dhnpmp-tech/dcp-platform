'use strict';

const {
  EVALUATOR_RESULT_ACCESS_POLICY_VERSION,
  evaluateEvaluatorResultAccessPolicy,
} = require('./evaluatorResultAccessPolicy');

const EVALUATOR_SIGNED_DOWNLOAD_POLICY_VERSION = 'dcp.evaluator_signed_download_policy.v1';
const MIN_EXPIRY_SECONDS = 60;
const MAX_EXPIRY_SECONDS = 900;
const DEFAULT_EXPIRY_SECONDS = 300;

class EvaluatorSignedDownloadPolicyError extends Error {
  constructor(message, { code = 'evaluator_signed_download_policy_error', details = undefined } = {}) {
    super(message);
    this.name = 'EvaluatorSignedDownloadPolicyError';
    this.code = code;
    this.details = details;
  }
}

function buildEvaluatorSignedDownloadPolicyReadiness(now = new Date()) {
  return {
    object: 'evaluator_signed_download_policy_readiness',
    version: EVALUATOR_SIGNED_DOWNLOAD_POLICY_VERSION,
    generated_at: now.toISOString(),
    current_mode: 'signed_download_policy_contract_only',
    endpoints: {
      signed_download_readiness: 'GET /api/evals/results/downloads/readiness',
      result_access_readiness: 'GET /api/evals/results/access/readiness',
      artifact_storage_readiness: 'GET /api/evals/results/artifacts/readiness',
      disabled_result_endpoint: 'GET /api/evals/jobs/:id/results',
      result_manifest_schema: 'GET /api/evals/results/schema',
      result_writer_readiness: 'GET /api/evals/results/writer/readiness',
      worker_readiness: 'GET /api/evals/worker/readiness',
    },
    signing_policy: {
      policy_available: true,
      signed_downloads_enabled: false,
      result_endpoint_live: false,
      requires_result_access_policy: true,
      result_access_policy_version: EVALUATOR_RESULT_ACCESS_POLICY_VERSION,
      requires_artifact_policy: true,
      requires_checksum: true,
      requires_content_type: 'application/json',
      min_expiry_seconds: MIN_EXPIRY_SECONDS,
      max_expiry_seconds: MAX_EXPIRY_SECONDS,
      default_expiry_seconds: DEFAULT_EXPIRY_SECONDS,
      exposes_object_store_bucket: false,
      exposes_storage_key: false,
      exposes_signed_url: false,
    },
    denial_codes: [
      'evaluator_signed_downloads_disabled',
      'evaluator_result_endpoint_disabled',
      'evaluator_result_owner_mismatch',
      'evaluator_result_not_available',
      'evaluator_artifact_storage_key_scope_invalid',
      'invalid_evaluator_signed_download_expiry',
    ],
    claim_guards: {
      policy_contract_live: true,
      signed_downloads_enabled: false,
      result_endpoint_live: false,
      disabled_result_endpoint_live: true,
      signs_download_url: false,
      exposes_signed_url: false,
      exposes_object_store_bucket: false,
      exposes_artifact_storage_key: false,
      writes_production_artifact: false,
      mutates_eval_job_status: false,
      queues_eval_job: false,
      starts_worker: false,
      bills_eval_jobs: false,
      settles_eval_jobs: false,
      publishes_public_report: false,
      model_ranking_allowed: false,
      arabic_quality_claim_allowed: false,
    },
    next_actions: [
      'Add object-store configuration only after production artifact writer proof exists.',
      'Add opt-in signed-download smoke with a funded smoke principal and expiring URL assertion.',
      'Keep result endpoint disabled until signed download smoke and audit logging are approved.',
    ],
  };
}

function evaluateEvaluatorSignedDownloadPolicy(input = {}) {
  const expirySeconds = normalizeExpirySeconds(input.expires_in_seconds ?? input.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS);
  const access = evaluateEvaluatorResultAccessPolicy(input);
  return {
    valid: true,
    version: EVALUATOR_SIGNED_DOWNLOAD_POLICY_VERSION,
    eval_job_id: access.eval_job_id,
    renter_id: access.renter_id,
    would_sign_if_enabled: true,
    expires_in_seconds: expirySeconds,
    signed_downloads_enabled: false,
    result_endpoint_live: false,
    download_url_signed: false,
    exposes_signed_url: false,
    exposes_artifact_storage_key: false,
    result_access_policy: {
      version: access.version,
      would_authorize_if_endpoint_enabled: access.would_authorize_if_endpoint_enabled,
      denial_code_while_disabled: access.denial_code_while_disabled,
    },
    artifact_policy: {
      version: access.artifact_policy.version,
      checksum_sha256: access.artifact_policy.checksum_sha256,
      content_type: access.artifact_policy.content_type,
      production_writes_enabled: access.artifact_policy.production_writes_enabled,
      signed_downloads_enabled: access.artifact_policy.signed_downloads_enabled,
    },
    denial_code_while_disabled: 'evaluator_signed_downloads_disabled',
  };
}

function normalizeExpirySeconds(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < MIN_EXPIRY_SECONDS || number > MAX_EXPIRY_SECONDS) {
    throw new EvaluatorSignedDownloadPolicyError('expires_in_seconds must be between 60 and 900 seconds', {
      code: 'invalid_evaluator_signed_download_expiry',
      details: {
        min: MIN_EXPIRY_SECONDS,
        max: MAX_EXPIRY_SECONDS,
      },
    });
  }
  return number;
}

module.exports = {
  EVALUATOR_SIGNED_DOWNLOAD_POLICY_VERSION,
  EvaluatorSignedDownloadPolicyError,
  buildEvaluatorSignedDownloadPolicyReadiness,
  evaluateEvaluatorSignedDownloadPolicy,
};
