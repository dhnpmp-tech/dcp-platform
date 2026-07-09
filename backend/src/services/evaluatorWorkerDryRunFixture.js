'use strict';

const {
  EVALUATOR_RESULT_WRITER_DRY_RUN_VERSION,
  createEvaluatorResultWriterDryRun,
} = require('./evaluatorResultWriterDryRun');

const EVALUATOR_WORKER_DRY_RUN_FIXTURE_VERSION = 'dcp.evaluator_worker_dry_run_fixture.v1';

class EvaluatorWorkerDryRunFixtureError extends Error {
  constructor(message, { code = 'evaluator_worker_dry_run_fixture_error', details = undefined } = {}) {
    super(message);
    this.name = 'EvaluatorWorkerDryRunFixtureError';
    this.code = code;
    this.details = details;
  }
}

function buildEvaluatorWorkerDryRunFixtureContract(now = new Date()) {
  return {
    object: 'evaluator_worker_dry_run_fixture_contract',
    version: EVALUATOR_WORKER_DRY_RUN_FIXTURE_VERSION,
    generated_at: now.toISOString(),
    current_mode: 'simulated_queue_fixture_only',
    command: 'npm run proof:evaluator-worker-dry-run-fixture',
    source: {
      eval_job_status: 'draft',
      dispatches_real_queue: false,
      starts_runtime_worker: false,
      mutates_eval_job_status: false,
    },
    result_writer: {
      version: EVALUATOR_RESULT_WRITER_DRY_RUN_VERSION,
      readiness_endpoint: 'GET /api/evals/results/writer/readiness',
      mode: 'dry_run_temp_artifact_only',
      writes_temp_manifest_only: true,
      writes_production_artifact: false,
    },
    claim_guards: {
      queues_eval_job: false,
      starts_worker: false,
      mutates_eval_job_status: false,
      writes_result_manifest_to_database: false,
      writes_production_artifact: false,
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
      'Enforce the approved tenant artifact storage policy before production result writes.',
      'Add signed result download smoke only after artifact checksums and auth policy are approved.',
      'Keep queue dispatch disabled until this fixture is replaced by a real worker dry-run with rollback evidence.',
    ],
  };
}

function createEvaluatorWorkerDryRunFixture(input = {}, options = {}) {
  const job = normalizeDraftJob(input.eval_job || input.job || {});
  const scoringHarnessVersion = normalizeRequiredString(
    input.scoring_harness_version || input.scoringHarnessVersion,
    'scoring_harness_version',
    { max: 120 }
  );
  const generatedAt = normalizeDate(options.now || input.generated_at || new Date());
  const dryRun = createEvaluatorResultWriterDryRun({
    eval_job: job,
    scoring_harness_version: scoringHarnessVersion,
    summary: input.summary || {},
  }, {
    now: generatedAt,
    outputDir: options.outputDir,
  });

  return {
    object: 'evaluator_worker_dry_run_fixture',
    version: EVALUATOR_WORKER_DRY_RUN_FIXTURE_VERSION,
    generated_at: generatedAt,
    current_mode: 'simulated_queue_fixture_only',
    worker_enabled: false,
    queue_dispatch_enabled: false,
    runtime_worker_started: false,
    billing_hook_enabled: false,
    queue_item: {
      simulated: true,
      source_eval_job_id: job.eval_job_id,
      source_status: job.status,
      dispatches_real_queue: false,
    },
    job_status: {
      before: job.status,
      after: job.status,
      mutates_status: false,
      database_write_expected: false,
    },
    result_writer: {
      version: EVALUATOR_RESULT_WRITER_DRY_RUN_VERSION,
      dry_run: true,
      result_endpoint_live: false,
      production_writer_enabled: false,
      artifact_store_enabled: false,
      temp_artifact: dryRun.temp_artifact,
      summary_sha256: dryRun.summary_sha256,
      manifest: dryRun.manifest,
    },
    production_effects: {
      queues_eval_job: false,
      starts_worker: false,
      mutates_eval_job_status: false,
      writes_result_manifest_to_database: false,
      writes_production_artifact: false,
      exposes_result_endpoint: false,
      stores_raw_customer_dataset: false,
      stores_raw_prompts_or_completions: false,
      bills_eval_jobs: false,
      settles_eval_jobs: false,
      publishes_public_report: false,
    },
    next: 'tenant_artifact_storage_policy_before_production_result_writer',
  };
}

function normalizeDraftJob(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throwFixtureError('eval_job is required', {
      code: 'missing_eval_job',
    });
  }
  const status = normalizeRequiredString(value.status || 'draft', 'eval_job.status', { max: 40 });
  if (status !== 'draft') {
    throwFixtureError('worker dry-run fixture only accepts draft metadata jobs', {
      code: 'worker_dry_run_requires_draft_job',
      details: { status },
    });
  }
  return {
    ...value,
    status,
  };
}

function normalizeRequiredString(value, field, { max }) {
  const normalized = String(value == null ? '' : value).trim();
  if (!normalized) {
    throwFixtureError(`${field} is required`, {
      code: 'missing_worker_fixture_field',
      details: { field },
    });
  }
  if (normalized.length > max) {
    throwFixtureError(`${field} exceeds maximum length`, {
      code: 'worker_fixture_field_too_long',
      details: { field, max },
    });
  }
  return normalized;
}

function normalizeDate(value) {
  if (value instanceof Date) return value.toISOString();
  const ms = Date.parse(String(value));
  if (!Number.isFinite(ms)) {
    throwFixtureError('generated_at must be an ISO timestamp', {
      code: 'invalid_worker_fixture_timestamp',
    });
  }
  return new Date(ms).toISOString();
}

function throwFixtureError(message, options = {}) {
  throw new EvaluatorWorkerDryRunFixtureError(message, options);
}

module.exports = {
  EVALUATOR_WORKER_DRY_RUN_FIXTURE_VERSION,
  EvaluatorWorkerDryRunFixtureError,
  buildEvaluatorWorkerDryRunFixtureContract,
  createEvaluatorWorkerDryRunFixture,
};
