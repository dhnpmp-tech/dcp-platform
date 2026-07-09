'use strict';

const { EVALUATOR_RESULT_ACCESS_POLICY_VERSION } = require('./evaluatorResultAccessPolicy');
const { EVALUATOR_ARTIFACT_STORAGE_POLICY_VERSION } = require('./evaluatorArtifactStoragePolicy');
const { EVALUATOR_RESULT_MANIFEST_VERSION } = require('./evaluatorResultManifest');

const EVALUATOR_RESULT_ENDPOINT_GATE_VERSION = 'dcp.evaluator_result_endpoint_disabled.v1';

function buildEvaluatorResultEndpointDisabledResponse(evalJob = {}, now = new Date()) {
  const evalJobId = String(evalJob.eval_job_id || '').trim();
  const renterId = Number(evalJob.renter_id || 0);
  const resultAvailable = Boolean(evalJob.result_available);
  return {
    object: 'evaluator_result_endpoint_disabled',
    version: EVALUATOR_RESULT_ENDPOINT_GATE_VERSION,
    generated_at: now.toISOString(),
    eval_job_id: evalJobId,
    renter_id: renterId,
    job_status: evalJob.status || null,
    result_available: resultAvailable,
    result_endpoint_live: false,
    signed_downloads_enabled: false,
    download_url_signed: false,
    denial_code: 'evaluator_result_endpoint_disabled',
    message: 'Evaluator result downloads are disabled until worker, artifact, access, and signed-download proofs are complete.',
    endpoints: {
      result_endpoint: 'GET /api/evals/jobs/:id/results',
      signed_download_readiness: 'GET /api/evals/results/downloads/readiness',
      result_access_readiness: 'GET /api/evals/results/access/readiness',
      artifact_storage_readiness: 'GET /api/evals/results/artifacts/readiness',
      result_manifest_schema: 'GET /api/evals/results/schema',
      result_writer_readiness: 'GET /api/evals/results/writer/readiness',
      worker_readiness: 'GET /api/evals/worker/readiness',
    },
    required_contracts: {
      result_access_policy_version: EVALUATOR_RESULT_ACCESS_POLICY_VERSION,
      artifact_storage_policy_version: EVALUATOR_ARTIFACT_STORAGE_POLICY_VERSION,
      result_manifest_version: EVALUATOR_RESULT_MANIFEST_VERSION,
    },
    claim_guards: {
      renter_auth_required: true,
      renter_owner_scope_enforced: true,
      exposes_disabled_result_endpoint: true,
      result_endpoint_live: false,
      exposes_result_manifest: false,
      exposes_artifact_storage_key: false,
      exposes_live_result_endpoint: false,
      signs_download_url: false,
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
      'Add signed download smoke proof before returning result manifests.',
      'Keep result manifests hidden until worker output, artifact policy, and access policy are all enforced.',
      'Keep public reports gated until human review and baseline policy proof exist.',
    ],
  };
}

module.exports = {
  EVALUATOR_RESULT_ENDPOINT_GATE_VERSION,
  buildEvaluatorResultEndpointDisabledResponse,
};
