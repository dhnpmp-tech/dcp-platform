'use strict';

const {
  EVALUATOR_WORKER_DRY_RUN_FIXTURE_VERSION,
  buildEvaluatorWorkerDryRunFixtureContract,
} = require('./evaluatorWorkerDryRunFixture');

const EVALUATOR_WORKER_GATE_VERSION = 'dcp.evaluator_worker_gate.v1';

function buildEvaluatorWorkerGate(now = new Date()) {
  const dryRunFixture = buildEvaluatorWorkerDryRunFixtureContract(now);
  return {
    object: 'evaluator_worker_gate',
    version: EVALUATOR_WORKER_GATE_VERSION,
    generated_at: now.toISOString(),
    current_mode: 'worker_disabled_by_default',
    endpoints: {
      worker_readiness: 'GET /api/evals/worker/readiness',
      evaluator_readiness: 'GET /api/evals/readiness',
      job_schema: 'GET /api/evals/jobs/schema',
      result_manifest_schema: 'GET /api/evals/results/schema',
      result_writer_readiness: 'GET /api/evals/results/writer/readiness',
      artifact_storage_readiness: 'GET /api/evals/results/artifacts/readiness',
      result_access_readiness: 'GET /api/evals/results/access/readiness',
      signed_download_readiness: 'GET /api/evals/results/downloads/readiness',
      metadata_jobs: 'POST/GET /api/evals/jobs',
      disabled_result_endpoint: 'GET /api/evals/jobs/:id/results',
      future_result_manifest: 'GET /api/evals/jobs/:id/results',
    },
    worker: {
      enabled: false,
      queue_dispatch_enabled: false,
      queue_name: null,
      result_writer_enabled: false,
      billing_hook_enabled: false,
      dry_run_fixture_available: true,
      dry_run_fixture_version: EVALUATOR_WORKER_DRY_RUN_FIXTURE_VERSION,
      dry_run_fixture_command: dryRunFixture.command,
      env_enable_var: 'DCP_EVALUATOR_WORKER_ENABLE',
      enablement_requires: [
        'dedicated worker binary or script with dry-run mode',
        'result manifest checksum contract',
        'tenant-scoped artifact storage key policy',
        'minimum-balance preflight and failed-run refund policy',
        'golden dataset fixture and fixed scoring harness version',
        'production smoke principal with explicit eval budget',
      ],
    },
    job_status_policy: {
      metadata_create_status: 'draft',
      api_can_queue_jobs: false,
      api_can_start_jobs: false,
      running_status_external_mutation_allowed: false,
      allowed_runtime_statuses_while_disabled: ['draft', 'blocked', 'cancelled'],
    },
    result_policy: {
      endpoint_live: false,
      disabled_endpoint: 'GET /api/evals/jobs/:id/results',
      schema_endpoint: 'GET /api/evals/results/schema',
      writer_readiness_endpoint: 'GET /api/evals/results/writer/readiness',
      artifact_storage_readiness_endpoint: 'GET /api/evals/results/artifacts/readiness',
      result_access_readiness_endpoint: 'GET /api/evals/results/access/readiness',
      signed_download_readiness_endpoint: 'GET /api/evals/results/downloads/readiness',
      dry_run_fixture_command: dryRunFixture.command,
      manifest_required_before_enablement: true,
      manifest_required_fields: [
        'eval_job_id',
        'dataset_sha256',
        'scoring_harness_version',
        'candidate_model',
        'baseline_models',
        'metrics',
        'summary_sha256',
        'created_at',
      ],
      raw_prompt_or_completion_publication_allowed: false,
      signed_downloads_enabled: false,
    },
    dry_run_fixture: dryRunFixture,
    claim_guards: {
      creates_eval_job: false,
      mutates_eval_job_status: false,
      queues_eval_job: false,
      starts_worker: false,
      writes_result_manifest: false,
      stores_raw_customer_dataset: false,
      bills_eval_jobs: false,
      settles_eval_jobs: false,
      publishes_public_report: false,
      model_ranking_allowed: false,
      arabic_quality_claim_allowed: false,
    },
    next_actions: [
      'Replace the simulated worker fixture with a real disabled worker dry-run before any job leaves draft status.',
      'Enforce tenant artifact storage policy before any result endpoint becomes live.',
      'Enforce renter ownership result access policy before signed downloads become live.',
      'Add billing/refund proof before any evaluator budget is charged.',
    ],
  };
}

module.exports = {
  EVALUATOR_WORKER_GATE_VERSION,
  buildEvaluatorWorkerGate,
};
